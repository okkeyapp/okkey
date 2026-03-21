import type {
  AppendEventRequest,
  AppendEventResult,
  FetchEventsQuery,
  FetchEventsResult,
} from "../../types/src/index.js";

export interface SyncAdapter {
  fetchEvents(query: FetchEventsQuery): Promise<FetchEventsResult>;
  appendEvent(request: AppendEventRequest): Promise<AppendEventResult>;
}

export interface SyncQueue {
  enqueue(request: AppendEventRequest): Promise<void>;
  drain(adapter: SyncAdapter): Promise<void>;
  size(): Promise<number>;
}
