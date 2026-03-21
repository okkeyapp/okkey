import type { EventLogEntry } from "../../types/src/index.js";

export interface SyncAdapter {
  fetchEvents(vaultId: string, sinceVersion: number): Promise<EventLogEntry[]>;
  pushEvent(vaultId: string, event: EventLogEntry): Promise<void>;
}

export interface SyncQueue {
  enqueue(event: EventLogEntry): Promise<void>;
  drain(): Promise<void>;
}
