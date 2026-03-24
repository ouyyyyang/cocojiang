import { randomBytes, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname } from "node:path";
import type { IncomingMessage } from "node:http";

export async function ensureDir(path: string): Promise<void> {
  await fs.mkdir(path, { recursive: true });
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T>(path: string): Promise<T> {
  const raw = await fs.readFile(path, "utf8");
  return JSON.parse(raw) as T;
}

export async function readTextFile(path: string): Promise<string> {
  return await fs.readFile(path, "utf8");
}

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await ensureDir(dirname(path));
  const tempPath = `${path}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  await fs.writeFile(tempPath, serialized, "utf8");
  await fs.rename(tempPath, path);
}

export async function writeTextAtomic(path: string, value: string): Promise<void> {
  await ensureDir(dirname(path));
  const tempPath = `${path}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await fs.writeFile(tempPath, value, "utf8");
  await fs.rename(tempPath, path);
}

export function generatePairingToken(): string {
  return randomBytes(18).toString("base64url");
}

export function safeTokenEqual(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export function getLocalIpv4Addresses(): string[] {
  const interfaces = networkInterfaces();
  const addresses = new Set<string>();

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.add(entry.address);
      }
    }
  }

  return Array.from(addresses).sort();
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export async function readJsonBody<T>(request: IncomingMessage, maxBytes = 1_000_000): Promise<T> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;

    if (total > maxBytes) {
      throw new Error(`Request body exceeds ${maxBytes} bytes`);
    }

    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {} as T;
  }

  return JSON.parse(raw) as T;
}

export function jsonResponse(statusCode: number, payload: unknown): {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
} {
  return {
    statusCode,
    body: `${JSON.stringify(payload)}\n`,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  };
}

export function textResponse(statusCode: number, body: string, contentType = "text/plain; charset=utf-8"): {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
} {
  return {
    statusCode,
    body,
    headers: {
      "content-type": contentType,
      "cache-control": "no-store"
    }
  };
}

export function nowIso(): string {
  return new Date().toISOString();
}
