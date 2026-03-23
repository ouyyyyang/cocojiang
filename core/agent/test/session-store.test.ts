import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionStore } from "../src/session-store.js";

test("SessionStore persists pairing token and sessions", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "session-store-"));
  const store = new SessionStore({
    dataDir,
    sessionsDir: join(dataDir, "sessions"),
    tokenFilePath: join(dataDir, "pairing-token.txt")
  });

  const token = await store.initialize();
  assert.ok(token.length > 10);

  const session = await store.createSession({
    question: "What is on screen?",
    captureTarget: "main_display",
    modelProvider: "codex",
    codexModel: "gpt-5.4"
  });

  const updated = await store.updateSession(session.id, (record) => {
    record.error = "failed";
    store.withStatus(record, "error", "Capture failed");
  });

  assert.equal(updated.status, "error");
  assert.equal(updated.error, "failed");
  assert.equal(updated.events.at(-1)?.progressMessage, "Capture failed");

  const listed = await store.listSessions();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, session.id);
  assert.equal(listed[0].modelProvider, "codex");
  assert.equal(listed[0].codexModel, "gpt-5.4");

  const secondStore = new SessionStore({
    dataDir,
    sessionsDir: join(dataDir, "sessions"),
    tokenFilePath: join(dataDir, "pairing-token.txt")
  });
  const tokenAgain = await secondStore.initialize();
  assert.equal(tokenAgain, token);
});
