import { beforeEach, describe, expect, it } from 'vitest';
import { cartEstimate, useCart, MAX_QTY } from '@/features/cart/store';

const line = { productId: 'p1', name: 'طماطم', unitName: 'كيلو', unitPrice: 1500 };

describe('cart store', () => {
  beforeEach(() => useCart.getState().clear());

  it('merges repeated adds of the same product', () => {
    useCart.getState().add(line);
    useCart.getState().add(line, 2);
    expect(useCart.getState().lines).toHaveLength(1);
    expect(useCart.getState().lines[0]!.quantity).toBe(3);
  });

  it('removes a line when quantity drops to zero', () => {
    useCart.getState().add(line);
    useCart.getState().setQuantity('p1', 0);
    expect(useCart.getState().lines).toHaveLength(0);
  });

  it('caps quantity at the server limit', () => {
    useCart.getState().add(line, MAX_QTY + 50);
    useCart.getState().add(line, 10);
    expect(useCart.getState().lines[0]!.quantity).toBe(MAX_QTY);
  });

  it('estimates totals with 2-decimal rounding', () => {
    expect(cartEstimate([{ ...line, quantity: 2.5 }])).toBe(3750);
  });
});
