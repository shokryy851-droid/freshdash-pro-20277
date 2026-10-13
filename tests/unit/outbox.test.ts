import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { enqueue, flushOutbox, listOutbox, registerCommand } from '@/lib/outbox';

describe('outbox', () => {
  it('replays a command with the SAME idempotency key after a network failure', async () => {
    const seenKeys: string[] = [];
    let online = false;
    registerCommand('test_cmd', async (_payload, key) => {
      seenKeys.push(key);
      if (!online) throw new TypeError('Failed to fetch');
    });

    await enqueue('test_cmd', 'key-123', { a: 1 });
    await flushOutbox(); // offline -> stays pending
    expect((await listOutbox()).map((e) => e.status)).toEqual(['pending']);

    online = true;
    const res = await flushOutbox();
    expect(res.sent).toBe(1);
    expect(await listOutbox()).toHaveLength(0);
    expect(seenKeys).toEqual(['key-123', 'key-123']);
  });

  it('keeps business rejections visible as failed (never silently dropped)', async () => {
    registerCommand('reject_cmd', async () => {
      throw { code: 'P0001', message: 'insufficient_stock' };
    });
    await enqueue('reject_cmd', 'key-456', {});
    const res = await flushOutbox();
    expect(res.failed).toBe(1);
    const entry = (await listOutbox()).find((e) => e.id === 'key-456');
    expect(entry?.status).toBe('failed');
    expect(entry?.lastError).toBe('insufficient_stock');
  });
});
