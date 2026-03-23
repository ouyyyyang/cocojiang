import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { AppConfig } from "./config.js";
import type { CaptureTarget, SessionEvent, SessionRecord, SessionStatus, SessionSummary } from "./types.js";
import { ensureDir, generatePairingToken, nowIso, pathExists, readJsonFile, writeJsonAtomic } from "./utils.js";

export class SessionStore {
  private readonly sessionsDir: string;
  private readonly tokenFilePath: string;
  private readonly updateQueues = new Map<string, Promise<SessionRecord>>();

  constructor(private readonly config: Pick<AppConfig, "sessionsDir" | "tokenFilePath" | "dataDir">) {
    this.sessionsDir = config.sessionsDir;
    this.tokenFilePath = config.tokenFilePath;
  }

  async initialize(pairingTokenEnv?: string): Promise<string> {
    await ensureDir(this.config.dataDir);
    await ensureDir(this.sessionsDir);

    if (pairingTokenEnv) {
      return pairingTokenEnv;
    }

    if (await pathExists(this.tokenFilePath)) {
      return (await fs.readFile(this.tokenFilePath, "utf8")).trim();
    }

    const token = generatePairingToken();
    await fs.writeFile(this.tokenFilePath, `${token}\n`, "utf8");
    return token;
  }

  async createSession(input: {
    question: string;
    captureTarget: CaptureTarget;
    codexModel: string;
  }): Promise<SessionRecord> {
    const id = randomUUID();
    const timestamp = nowIso();

    const record: SessionRecord = {
      id,
      question: input.question,
      captureTarget: input.captureTarget,
      codexModel: input.codexModel,
      status: "queued",
      createdAt: timestamp,
      updatedAt: timestamp,
      imageUrl: `/api/sessions/${id}/image`,
      events: [
        {
          timestamp,
          status: "queued",
          progressMessage: "Request queued"
        }
      ]
    };

    await ensureDir(this.sessionDir(id));
    await writeJsonAtomic(this.sessionFilePath(id), record);
    return record;
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    const path = this.sessionFilePath(id);
    if (!(await pathExists(path))) {
      return null;
    }

    return readJsonFile<SessionRecord>(path);
  }

  async listSessions(): Promise<SessionSummary[]> {
    const entries = await fs.readdir(this.sessionsDir, { withFileTypes: true });
    const sessions: SessionSummary[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      try {
        const session = await this.getSession(entry.name);
        if (!session) {
          continue;
        }

        sessions.push({
          id: session.id,
          question: session.question,
          captureTarget: session.captureTarget,
          codexModel: session.codexModel,
          status: session.status,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          imageUrl: session.imageUrl,
          summary: session.result?.summary,
          error: session.error
        });
      } catch (error) {
        console.warn(`Failed to read session ${entry.name}:`, error);
      }
    }

    return sessions.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async updateSession(
    id: string,
    update: (record: SessionRecord) => void
  ): Promise<SessionRecord> {
    const previous = this.updateQueues.get(id) ?? Promise.resolve(await this.getSessionOrThrow(id));
    const next = previous
      .catch(async () => this.getSessionOrThrow(id))
      .then(async () => {
        const record = await this.getSessionOrThrow(id);
        update(record);
        record.updatedAt = nowIso();
        await writeJsonAtomic(this.sessionFilePath(id), record);
        return record;
      });

    this.updateQueues.set(id, next);

    try {
      return await next;
    } finally {
      if (this.updateQueues.get(id) === next) {
        this.updateQueues.delete(id);
      }
    }
  }

  imageFilePath(id: string): string {
    return join(this.sessionDir(id), "capture.png");
  }

  withStatus(record: SessionRecord, status: SessionStatus, progressMessage?: string, payload?: unknown): void {
    record.status = status;
    const event: SessionEvent = {
      timestamp: nowIso(),
      status,
      progressMessage,
      payload
    };
    record.events.push(event);
  }

  private sessionDir(id: string): string {
    return join(this.sessionsDir, id);
  }

  private sessionFilePath(id: string): string {
    return join(this.sessionDir(id), "session.json");
  }

  private async getSessionOrThrow(id: string): Promise<SessionRecord> {
    const record = await this.getSession(id);
    if (!record) {
      throw new Error(`Session ${id} was not found`);
    }

    return record;
  }
}
