import { openDB, type IDBPDatabase } from 'idb';
import { toAppError } from './errors';

/**
 * Durable queue of business COMMANDS (not state). Each entry carries its idempotency key,
 * so replaying after a lost response can never create duplicates on the server.
 */
export interface OutboxEntry<P = unknown> {
  id: string; // = idempotency key
  command: string;
  payload: P;
  createdAt: number;
  attempts: number;
  lastError?: string;
  status: 'pending' | 'failed';
}

type Handler = (payload: unknown, idempotencyKey: string) => Promise<unknown>;

const DB_NAME = 'fdp-outbox';
const STORE = 'commands';
let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore(STORE, { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
    }
  });
  return dbPromise;
}

const handlers = new Map<string, Handler>();
const listeners = new Set<() => void>();
let flushing = false;

export function registerCommand(command: string, handler: Handler): void {
  handlers.set(command, handler);
}

export function onOutboxChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
const notify = (): void => listeners.forEach((fn) => fn());

export async function enqueue<P>(command: string, id: string, payload: P): Promise<void> {
  const entry: OutboxEntry<P> = { id, command, payload, createdAt: Date.now(), attempts: 0, status: 'pending' };
  await (await db()).put(STORE, entry);
  notify();
}

export async function listOutbox(): Promise<OutboxEntry[]> {
  const rows: unknown[] = await (await db()).getAllFromIndex(STORE, 'createdAt');
  return rows as OutboxEntry[];
}

export async function discard(id: string): Promise<void> {
  await (await db()).delete(STORE, id);
  notify();
}

/**
 * Send pending commands in creation order. Transport failures stop the flush (retry later);
 * business errors mark the entry 'failed' and keep it visible — nothing disappears silently.
 */
export async function flushOutbox(): Promise<{ sent: number; failed: number }> {
  if (flushing) return { sent: 0, failed: 0 };
  flushing = true;
  let sent = 0;
  let failed = 0;
  try {
    const d = await db();
    for (const entry of await listOutbox()) {
      if (entry.status !== 'pending') continue;
      const handler = handlers.get(entry.command);
      if (!handler) continue;
      try {
        await handler(entry.payload, entry.id);
        await d.delete(STORE, entry.id);
        sent++;
      } catch (raw) {
        const err = toAppError(raw);
        const updated: OutboxEntry = {
          ...entry,
          attempts: entry.attempts + 1,
          lastError: err.code,
          status: err.retryable ? 'pending' : 'failed'
        };
        await d.put(STORE, updated);
        if (err.retryable) break; // still offline — preserve order, retry later
        failed++;
      }
    }
  } finally {
    flushing = false;
    notify();
  }
  return { sent, failed };
}

export function startOutboxSync(): () => void {
  const run = (): void => {
    flushOutbox().catch((e: unknown) => console.error('[outbox] flush failed', e));
  };
  window.addEventListener('online', run);
  const timer = window.setInterval(run, 30_000);
  run();
  return () => {
    window.removeEventListener('online', run);
    window.clearInterval(timer);
  };
}
