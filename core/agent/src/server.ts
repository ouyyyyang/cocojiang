import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createAgentServer } from "./app.js";

const pidFilePath = process.env.SCREEN_PILOT_PID_FILE || join(process.cwd(), "runtime", "agent", "agent.pid");
const portFilePath = process.env.SCREEN_PILOT_PORT_FILE || join(process.cwd(), "runtime", "agent", "agent.port");

const isProcessAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const readTrackedPid = async () => {
  try {
    const raw = (await readFile(pidFilePath, "utf8")).trim();
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
};

const ensureSingleInstance = async () => {
  const trackedPid = await readTrackedPid();
  if (!trackedPid || trackedPid === process.pid) {
    return;
  }

  if (!isProcessAlive(trackedPid)) {
    return;
  }

  console.error(`Another Screen Pilot agent is already running with PID ${trackedPid}.`);
  process.exit(1);
};

const persistRuntimeFiles = async (port: number) => {
  await mkdir(dirname(pidFilePath), { recursive: true });
  await writeFile(pidFilePath, `${process.pid}\n`, "utf8");
  await writeFile(portFilePath, `${port}\n`, "utf8");
};

const cleanupRuntimeFiles = async () => {
  const trackedFiles = [pidFilePath, portFilePath];

  await Promise.allSettled(
    trackedFiles.map(async (filePath) => {
      await rm(filePath, { force: true });
    })
  );
};

let shutdownPromise: Promise<void> | null = null;

const shutdown = async () => {
  if (shutdownPromise) {
    return await shutdownPromise;
  }

  shutdownPromise = (async () => {
    await agent.close();
    await cleanupRuntimeFiles();
  })();

  try {
    await shutdownPromise;
  } finally {
    process.exit(0);
  }
};

await ensureSingleInstance();

const agent = await createAgentServer({
  onShutdownRequested: () => {
    void shutdown();
  }
});
const { port, urls } = await agent.start();
await persistRuntimeFiles(port);

console.log(`${agent.config.serviceName} is listening on port ${port}`);
console.log(`Pairing token: ${agent.pairingToken}`);
console.log(`Desktop console: http://127.0.0.1:${port}/mac`);
console.log("Phone pages:");
for (const url of urls) {
  console.log(`- ${url}`);
}

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});
