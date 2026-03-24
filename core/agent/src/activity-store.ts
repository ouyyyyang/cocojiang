import { randomUUID } from "node:crypto";
import type { ActivityRecord, ClientSource, SessionStatus } from "./types.js";
import { nowIso } from "./utils.js";

export class ActivityStore {
  private readonly activities: ActivityRecord[] = [];

  list(limit = 40): ActivityRecord[] {
    return this.activities.slice(0, limit);
  }

  record(input: {
    source: ClientSource;
    action: ActivityRecord["action"];
    message: string;
    sessionId?: string;
    status?: SessionStatus;
    question?: string;
  }): ActivityRecord {
    const activity: ActivityRecord = {
      id: randomUUID(),
      timestamp: nowIso(),
      source: input.source,
      action: input.action,
      sessionId: input.sessionId,
      status: input.status,
      message: input.message,
      question: input.question
    };

    this.activities.unshift(activity);
    if (this.activities.length > 120) {
      this.activities.length = 120;
    }

    return activity;
  }
}
