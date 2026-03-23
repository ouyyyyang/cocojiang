import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { delimiter, join } from "node:path";
import { homedir } from "node:os";
import type { AppConfig } from "./config.js";
import { getLocalVisionModelSpec } from "./model-catalog.js";
import type {
  LocalRuntimeAction,
  LocalRuntimeJobRecord,
  LocalRuntimeModelRef,
  LocalRuntimeSlug,
  LocalRuntimeStatusPayload,
  LocalRuntimeStatusRecord
} from "./types.js";
import { nowIso, pathExists, toErrorMessage } from "./utils.js";

type RuntimeOperationInput = {
  runtime: LocalRuntimeSlug;
  action: LocalRuntimeAction;
  modelSlug?: string;
  identifier?: string;
};

export interface LocalRuntimeManagerLike {
  getStatus(): Promise<LocalRuntimeStatusPayload>;
  getJob(jobId: string): Promise<LocalRuntimeJobRecord | null>;
  runOperation(input: RuntimeOperationInput): Promise<LocalRuntimeJobRecord>;
  close(): Promise<void>;
}

export class LocalRuntimeManager implements LocalRuntimeManagerLike {
  private readonly jobs = new Map<string, LocalRuntimeJobRecord>();
  private readonly serverProcesses = new Map<LocalRuntimeSlug, ChildProcess>();

  constructor(private readonly config: Pick<AppConfig, "workspaceRoot" | "lmStudioBin" | "ollamaBin" | "lmStudioHost" | "ollamaHost">) {}

  async getStatus(): Promise<LocalRuntimeStatusPayload> {
    const [lmstudio, ollama] = await Promise.all([
      this.collectLmStudioStatus(),
      this.collectOllamaStatus()
    ]);

    return {
      runtimes: {
        lmstudio,
        ollama
      },
      jobs: this.listRecentJobs()
    };
  }

  async getJob(jobId: string): Promise<LocalRuntimeJobRecord | null> {
    return this.jobs.get(jobId) ?? null;
  }

  async runOperation(input: RuntimeOperationInput): Promise<LocalRuntimeJobRecord> {
    const job = this.createJob(input);
    void this.executeOperation(job).catch((error) => {
      this.failJob(job.id, toErrorMessage(error));
    });
    return job;
  }

  async close(): Promise<void> {
    for (const child of this.serverProcesses.values()) {
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
    }

    this.serverProcesses.clear();
  }

  private async executeOperation(job: LocalRuntimeJobRecord): Promise<void> {
    switch (job.runtime) {
      case "lmstudio":
        await this.executeLmStudioOperation(job);
        return;
      case "ollama":
        await this.executeOllamaOperation(job);
        return;
    }
  }

  private async executeLmStudioOperation(job: LocalRuntimeJobRecord): Promise<void> {
    const binaryPath = await this.resolveExecutable("lmstudio");
    if (!binaryPath) {
      throw new Error("没有检测到 LM Studio CLI。请先安装并至少启动一次 LM Studio。");
    }

    if (job.action === "start_server") {
      await this.startManagedServer(job, binaryPath, ["server", "start"], this.config.lmStudioHost);
      return;
    }

    if (job.action === "download_model") {
      const target = resolveManagedModel(job.modelSlug);
      await this.runTrackedCommand(job, binaryPath, ["get", "--mlx", target.lmStudioQuery]);
      return;
    }

    if (job.action === "load_model") {
      const target = resolveManagedModel(job.modelSlug);
      const downloadedModels = await this.listLmStudioModels(binaryPath);
      const modelKey = resolveLmStudioModelKey(target, downloadedModels);

      if (!modelKey) {
        throw new Error(`还没有找到可加载的 ${target.displayName}。请先下载当前模型。`);
      }

      await this.runTrackedCommand(job, binaryPath, ["load", modelKey, "--identifier", job.identifier || target.slug]);
      return;
    }

    if (job.action === "unload_model") {
      const target = resolveManagedModel(job.modelSlug);
      await this.runTrackedCommand(job, binaryPath, ["unload", job.identifier || target.slug]);
      return;
    }

    throw new Error(`LM Studio 不支持操作 ${job.action}`);
  }

  private async executeOllamaOperation(job: LocalRuntimeJobRecord): Promise<void> {
    const binaryPath = await this.resolveExecutable("ollama");
    if (!binaryPath) {
      throw new Error("没有检测到 Ollama CLI。请先安装 Ollama。");
    }

    if (job.action === "start_server") {
      await this.startManagedServer(job, binaryPath, ["serve"], this.config.ollamaHost);
      return;
    }

    const target = resolveManagedModel(job.modelSlug);

    if (job.action === "download_model") {
      await this.runTrackedCommand(job, binaryPath, ["pull", target.ollamaModel]);
      return;
    }

    if (job.action === "unload_model") {
      await this.runTrackedCommand(job, binaryPath, ["stop", job.identifier || target.ollamaModel]);
      return;
    }

    if (job.action === "remove_model") {
      await this.runTrackedCommand(job, binaryPath, ["rm", target.ollamaModel]);
      return;
    }

    throw new Error(`Ollama 不支持操作 ${job.action}`);
  }

  private async collectLmStudioStatus(): Promise<LocalRuntimeStatusRecord> {
    const executablePath = await this.resolveExecutable("lmstudio");
    const appPath = await findFirstExisting([
      "/Applications/LM Studio.app",
      join(homedir(), "Applications", "LM Studio.app")
    ]);
    const serverRunning = await canReachJsonEndpoint(`${this.config.lmStudioHost}/v1/models`);
    const downloadedModels = executablePath ? await this.listLmStudioModels(executablePath) : [];
    const loadedModels = executablePath ? await this.listLmStudioLoadedModels(executablePath) : [];

    return {
      slug: "lmstudio",
      displayName: "LM Studio (MLX)",
      installed: Boolean(executablePath || appPath),
      cliAvailable: Boolean(executablePath),
      executablePath,
      appDetected: Boolean(appPath),
      appPath,
      installUrl: "https://lmstudio.ai/",
      serverHost: this.config.lmStudioHost,
      serverRunning,
      modelsDirHint: "默认由 LM Studio 管理，通常位于 ~/.lmstudio/models；如果你在 My Models 改过目录，以 LM Studio 当前配置为准。",
      supportsManagedDelete: false,
      downloadedModels,
      loadedModels,
      notes: [
        "Screen Pilot 不接管 LM Studio 安装包，只负责检测、下载当前模型、启动 server、加载和卸载。",
        "LM Studio 的模型目录由它自己管理，v1 不做文件级硬删除。"
      ]
    };
  }

  private async collectOllamaStatus(): Promise<LocalRuntimeStatusRecord> {
    const executablePath = await this.resolveExecutable("ollama");
    const appPath = await findFirstExisting([
      "/Applications/Ollama.app",
      join(homedir(), "Applications", "Ollama.app")
    ]);
    const serverRunning = await canReachJsonEndpoint(`${this.config.ollamaHost}/api/tags`);
    const downloadedModels = serverRunning ? await this.listOllamaDownloadedModels() : [];
    const loadedModels = serverRunning ? await this.listOllamaLoadedModels() : [];
    const modelsDirectory = process.env.OLLAMA_MODELS?.trim() || join(homedir(), ".ollama", "models");

    return {
      slug: "ollama",
      displayName: "本地 Ollama",
      installed: Boolean(executablePath || appPath),
      cliAvailable: Boolean(executablePath),
      executablePath,
      appDetected: Boolean(appPath),
      appPath,
      installUrl: "https://ollama.com/download",
      serverHost: this.config.ollamaHost,
      serverRunning,
      modelsDirHint: `由 Ollama 管理，当前使用 ${modelsDirectory}。如果你改了 OLLAMA_MODELS，这里会跟随环境变量。`,
      supportsManagedDelete: true,
      downloadedModels,
      loadedModels,
      notes: [
        "Screen Pilot 不接管 Ollama 安装包，只负责检测、拉取当前模型、启动 server、停止和删除当前模型。",
        "Ollama 的模型文件由 runtime 自己管理，删除操作走 `ollama rm`。"
      ]
    };
  }

  private async resolveExecutable(runtime: LocalRuntimeSlug): Promise<string | null> {
    const envPath = process.env.PATH || "";
    const candidates =
      runtime === "lmstudio"
        ? [this.config.lmStudioBin, join(homedir(), ".lmstudio", "bin", "lms"), "lms"]
        : [
            this.config.ollamaBin,
            "/Applications/Ollama.app/Contents/Resources/ollama",
            join(homedir(), "Applications", "Ollama.app", "Contents", "Resources", "ollama"),
            "ollama"
          ];

    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }

      const resolved = await resolveExecutablePath(candidate, envPath);
      if (resolved) {
        return resolved;
      }
    }

    return null;
  }

  private async listLmStudioModels(binaryPath: string): Promise<LocalRuntimeModelRef[]> {
    try {
      const output = await this.runCommandForOutput(binaryPath, ["ls", "--json"]);
      return parseLmStudioModelRefs(output.stdout);
    } catch {
      return [];
    }
  }

  private async listLmStudioLoadedModels(binaryPath: string): Promise<LocalRuntimeModelRef[]> {
    try {
      const output = await this.runCommandForOutput(binaryPath, ["ps", "--json"]);
      return parseLmStudioModelRefs(output.stdout);
    } catch {
      return [];
    }
  }

  private async listOllamaDownloadedModels(): Promise<LocalRuntimeModelRef[]> {
    const payload = await fetchJsonWithTimeout(`${this.config.ollamaHost}/api/tags`);
    return parseOllamaModelRefs(payload);
  }

  private async listOllamaLoadedModels(): Promise<LocalRuntimeModelRef[]> {
    const payload = await fetchJsonWithTimeout(`${this.config.ollamaHost}/api/ps`);
    return parseOllamaModelRefs(payload);
  }

  private async startManagedServer(
    job: LocalRuntimeJobRecord,
    binaryPath: string,
    args: string[],
    host: string
  ): Promise<void> {
    if (await canReachJsonEndpoint(runtimeHealthProbeUrl(job.runtime, host))) {
      this.completeJob(job.id, `已检测到 ${runtimeDisplayName(job.runtime)} server 正在运行。`);
      return;
    }

    if (this.serverProcesses.has(job.runtime)) {
      this.completeJob(job.id, `${runtimeDisplayName(job.runtime)} server 已由当前 agent 管理启动。`);
      return;
    }

    this.appendJobLog(job.id, `$ ${binaryPath} ${args.join(" ")}`);

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let stderrOutput = "";

      const child = spawn(binaryPath, args, {
        cwd: this.config.workspaceRoot,
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env
      });

      this.serverProcesses.set(job.runtime, child);
      attachJobStream(child.stdout, (line) => this.appendJobLog(job.id, line));
      attachJobStream(child.stderr, (line) => {
        stderrOutput = stderrOutput ? `${stderrOutput}\n${line}` : line;
        this.appendJobLog(job.id, line);
      });

      child.on("error", (error) => {
        if (settled) {
          return;
        }
        settled = true;
        this.serverProcesses.delete(job.runtime);
        reject(error);
      });

      child.on("close", (code) => {
        this.serverProcesses.delete(job.runtime);
        if (settled) {
          return;
        }
        if (code !== 0) {
          settled = true;
          reject(new Error(stderrOutput.trim() || `${runtimeDisplayName(job.runtime)} server exited with code ${code}`));
        }
      });

      void waitForHost(runtimeHealthProbeUrl(job.runtime, host), 10_000)
        .then((ready) => {
          if (settled) {
            return;
          }

          if (ready) {
            settled = true;
            resolve();
            return;
          }

          settled = true;
          resolve();
        })
        .catch((error) => {
          if (settled) {
            return;
          }
          settled = true;
          reject(error);
        });
    });

    this.completeJob(job.id, `${runtimeDisplayName(job.runtime)} server 启动命令已提交。若状态仍显示离线，请稍等几秒后刷新。`);
  }

  private async runTrackedCommand(job: LocalRuntimeJobRecord, binaryPath: string, args: string[]): Promise<void> {
    this.appendJobLog(job.id, `$ ${binaryPath} ${args.join(" ")}`);

    await new Promise<void>((resolve, reject) => {
      let stderrOutput = "";
      const child = spawn(binaryPath, args, {
        cwd: this.config.workspaceRoot,
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env
      });

      attachJobStream(child.stdout, (line) => this.appendJobLog(job.id, line));
      attachJobStream(child.stderr, (line) => {
        stderrOutput = stderrOutput ? `${stderrOutput}\n${line}` : line;
        this.appendJobLog(job.id, line);
      });

      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(stderrOutput.trim() || `Command exited with code ${code}`));
      });
    });

    this.completeJob(job.id, runtimeActionSuccessMessage(job));
  }

  private async runCommandForOutput(binaryPath: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
    return await new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      const child = spawn(binaryPath, args, {
        cwd: this.config.workspaceRoot,
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env
      });

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
      });

      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }

        reject(new Error(stderr.trim() || `Command exited with code ${code}`));
      });
    });
  }

  private createJob(input: RuntimeOperationInput): LocalRuntimeJobRecord {
    const createdAt = nowIso();
    const job: LocalRuntimeJobRecord = {
      id: randomUUID(),
      runtime: input.runtime,
      action: input.action,
      modelSlug: input.modelSlug,
      identifier: input.identifier,
      status: "running",
      summary: `${runtimeDisplayName(input.runtime)} 正在处理 ${describeAction(input.action)}。`,
      createdAt,
      updatedAt: createdAt,
      logs: []
    };

    this.jobs.set(job.id, job);
    this.pruneJobs();
    return job;
  }

  private completeJob(jobId: string, summary: string): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }

    job.status = "done";
    job.summary = summary;
    job.updatedAt = nowIso();
  }

  private failJob(jobId: string, message: string): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }

    job.status = "error";
    job.summary = message;
    job.error = message;
    job.updatedAt = nowIso();
  }

  private appendJobLog(jobId: string, line: string): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    job.logs.push(trimmed);
    if (job.logs.length > 80) {
      job.logs.splice(0, job.logs.length - 80);
    }
    job.updatedAt = nowIso();
  }

  private listRecentJobs(): LocalRuntimeJobRecord[] {
    return Array.from(this.jobs.values())
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 12);
  }

  private pruneJobs(): void {
    const sorted = Array.from(this.jobs.values()).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    for (const job of sorted.slice(24)) {
      this.jobs.delete(job.id);
    }
  }
}

export function parseLmStudioModelRefs(raw: string): LocalRuntimeModelRef[] {
  try {
    return parseLmStudioModelRefsValue(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

export function parseLmStudioModelRefsValue(value: unknown): LocalRuntimeModelRef[] {
  const entries = extractArrayValue(value);
  return entries
    .map((entry) => normalizeLmStudioEntry(entry))
    .filter((entry): entry is LocalRuntimeModelRef => Boolean(entry));
}

export function parseOllamaModelRefs(value: unknown): LocalRuntimeModelRef[] {
  const entries = extractArrayValue(value, ["models", "items"]);
  return entries
    .map((entry) => normalizeOllamaEntry(entry))
    .filter((entry): entry is LocalRuntimeModelRef => Boolean(entry));
}

function normalizeLmStudioEntry(entry: unknown): LocalRuntimeModelRef | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }

  const candidate = entry as Record<string, unknown>;
  const id = firstString(candidate, ["modelKey", "key", "identifier", "id", "path", "modelPath"]);
  if (!id) {
    return null;
  }

  return {
    id,
    label: firstString(candidate, ["displayName", "name", "modelName", "path", "identifier"]) || id,
    identifier: firstString(candidate, ["identifier", "loadedAs"]) || undefined
  };
}

function normalizeOllamaEntry(entry: unknown): LocalRuntimeModelRef | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }

  const candidate = entry as Record<string, unknown>;
  const id = firstString(candidate, ["name", "model", "id"]);
  if (!id) {
    return null;
  }

  return {
    id,
    label: firstString(candidate, ["name", "model"]) || id,
    identifier: firstString(candidate, ["model"]) || undefined
  };
}

function extractArrayValue(value: unknown, nestedKeys = ["models", "items", "data"]): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const candidate = value as Record<string, unknown>;
  for (const key of nestedKeys) {
    if (Array.isArray(candidate[key])) {
      return candidate[key] as unknown[];
    }
  }

  return [];
}

function firstString(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function resolveManagedModel(modelSlug: string | undefined) {
  const spec = getLocalVisionModelSpec(modelSlug || "qwen3-vl:8b");
  if (!spec) {
    throw new Error(`当前还没有为模型 ${modelSlug || "-"} 配置下载和加载规则。`);
  }

  return spec;
}

function resolveLmStudioModelKey(
  target: ReturnType<typeof resolveManagedModel>,
  downloadedModels: LocalRuntimeModelRef[]
): string | null {
  const candidates = [target.lmStudioQuery, target.slug.replaceAll(":", "-"), target.displayName]
    .map((value) => value.toLowerCase());

  const match = downloadedModels.find((model) => {
    const haystack = `${model.id} ${model.label} ${model.identifier || ""}`.toLowerCase();
    return candidates.some((candidate) => haystack.includes(candidate));
  });

  return match?.id || null;
}

async function resolveExecutablePath(candidate: string, envPath: string): Promise<string | null> {
  if (candidate.includes("/") || candidate.startsWith(".")) {
    return (await pathExists(candidate)) ? candidate : null;
  }

  for (const segment of envPath.split(delimiter)) {
    const trimmed = segment.trim();
    if (!trimmed) {
      continue;
    }

    const resolved = join(trimmed, candidate);
    if (await pathExists(resolved)) {
      return resolved;
    }
  }

  return null;
}

async function findFirstExisting(paths: string[]): Promise<string | null> {
  for (const path of paths) {
    if (await pathExists(path)) {
      return path;
    }
  }

  return null;
}

function runtimeHealthProbeUrl(runtime: LocalRuntimeSlug, host: string): string {
  return runtime === "lmstudio" ? `${host}/v1/models` : `${host}/api/tags`;
}

async function canReachJsonEndpoint(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: timeoutSignal(1_500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function fetchJsonWithTimeout(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: timeoutSignal(2_500) });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return await response.json();
}

async function waitForHost(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await canReachJsonEndpoint(url)) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return false;
}

function timeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

function attachJobStream(stream: NodeJS.ReadableStream | null | undefined, onLine: (line: string) => void): void {
  if (!stream) {
    return;
  }

  let buffer = "";

  stream.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    buffer = consumeLineBuffer(buffer, onLine);
  });

  stream.on("end", () => {
    const remaining = buffer.trim();
    if (remaining) {
      onLine(remaining);
    }
  });
}

function consumeLineBuffer(buffer: string, onLine: (line: string) => void): string {
  while (true) {
    const newlineIndex = buffer.search(/[\r\n]/);
    if (newlineIndex === -1) {
      return buffer;
    }

    const line = buffer.slice(0, newlineIndex).trim();
    const separatorLength = buffer[newlineIndex] === "\r" && buffer[newlineIndex + 1] === "\n" ? 2 : 1;
    buffer = buffer.slice(newlineIndex + separatorLength);

    if (line) {
      onLine(line);
    }
  }
}

function runtimeDisplayName(runtime: LocalRuntimeSlug): string {
  return runtime === "lmstudio" ? "LM Studio" : "Ollama";
}

function describeAction(action: LocalRuntimeAction): string {
  switch (action) {
    case "start_server":
      return "启动 server";
    case "download_model":
      return "下载模型";
    case "load_model":
      return "加载模型";
    case "unload_model":
      return "卸载模型";
    case "remove_model":
      return "删除模型";
  }
}

function runtimeActionSuccessMessage(job: LocalRuntimeJobRecord): string {
  const modelSuffix = job.modelSlug ? `：${job.modelSlug}` : "";

  switch (job.action) {
    case "download_model":
      return `${runtimeDisplayName(job.runtime)} 已完成当前模型下载${modelSuffix}。`;
    case "load_model":
      return `${runtimeDisplayName(job.runtime)} 已完成当前模型加载${modelSuffix}。`;
    case "unload_model":
      return `${runtimeDisplayName(job.runtime)} 已完成当前模型卸载${modelSuffix}。`;
    case "remove_model":
      return `${runtimeDisplayName(job.runtime)} 已完成当前模型删除${modelSuffix}。`;
    case "start_server":
      return `${runtimeDisplayName(job.runtime)} server 启动命令已提交。`;
  }
}
