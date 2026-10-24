import { EventEmitter } from "node:events";

export type StorageEventType =
  | "storage:object:created"
  | "storage:object:deleted"
  | "storage:object:updated"
  | "storage:bucket:created"
  | "storage:bucket:deleted";

export interface StorageEventPayload {
  userId: string;
  eventType: StorageEventType;
  bucketId: string;
  bucketName: string;
  path?: string;
  size?: number;
  mimeType?: string;
  etag?: string | null;
  timestamp: string;
  metadata?: Record<string, any>;
}

class StorageEventEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(200);
  }

  emitEvent(payload: StorageEventPayload): boolean {
    return this.emit("storage_event", payload);
  }

  onEvent(listener: (payload: StorageEventPayload) => void): () => void {
    this.on("storage_event", listener);
    return () => {
      this.off("storage_event", listener);
    };
  }

  onUserEvent(userId: string, listener: (payload: StorageEventPayload) => void): () => void {
    const wrapped = (payload: StorageEventPayload) => {
      if (payload.userId === userId) {
        listener(payload);
      }
    };
    this.on("storage_event", wrapped);
    return () => {
      this.off("storage_event", wrapped);
    };
  }
}

export const storageEvents = new StorageEventEmitter();
