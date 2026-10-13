import { useEffect, useState } from 'react';
import { listOutbox, onOutboxChange, type OutboxEntry } from '@/lib/outbox';

export function usePendingOutbox(): OutboxEntry[] {
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => {
      listOutbox()
        .then((e) => {
          if (alive) setEntries(e);
        })
        .catch((err: unknown) => console.error('[outbox] list failed', err));
    };
    load();
    const off = onOutboxChange(load);
    return () => {
      alive = false;
      off();
    };
  }, []);
  return entries;
}
