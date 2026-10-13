import { describe, expect, it } from 'vitest';
import { AppError, toAppError, unwrap } from '@/lib/errors';

describe('toAppError', () => {
  it.each([
    [{ code: '42501', message: 'forbidden' }, 'forbidden'],
    [{ code: '28000', message: 'not_authenticated' }, 'not_authenticated'],
    [{ code: 'P0001', message: 'insufficient_stock' }, 'insufficient_stock'],
    [{ code: 'P0002', message: 'product_unavailable' }, 'product_unavailable'],
    [{ code: '22023', message: 'invalid_transition pending -> delivered' }, 'invalid_transition'],
    [{ code: '23505', message: 'duplicate key' }, 'conflict'],
    [new TypeError('Failed to fetch'), 'network'],
    [{ message: 'something odd' }, 'unknown']
  ])('maps %o -> %s', (input, code) => {
    expect(toAppError(input).code).toBe(code);
  });

  it('only network errors are retryable', () => {
    expect(new AppError('network', '').retryable).toBe(true);
    expect(new AppError('insufficient_stock', '').retryable).toBe(false);
  });
});

describe('unwrap', () => {
  it('throws instead of returning empty data on DB error', () => {
    expect(() => unwrap({ data: null, error: { code: '42501', message: 'x' } })).toThrow(AppError);
  });
  it('returns data when present (including empty arrays)', () => {
    expect(unwrap({ data: [], error: null })).toEqual([]);
  });
});
