import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartLine {
  productId: string;
  name: string;
  unitName: string;
  unitPrice: number; // display estimate only — server re-prices on submit
  quantity: number;
}

interface CartState {
  lines: CartLine[];
  add: (line: Omit<CartLine, 'quantity'>, qty?: number) => void;
  setQuantity: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

export const MAX_QTY = 100_000;

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (line, qty = 1) =>
        set((s) => {
          const existing = s.lines.find((l) => l.productId === line.productId);
          if (existing) {
            return { lines: s.lines.map((l) => (l === existing ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + qty) } : l)) };
          }
          return { lines: [...s.lines, { ...line, quantity: Math.min(MAX_QTY, qty) }] };
        }),
      setQuantity: (productId, qty) =>
        set((s) => ({
          lines:
            qty <= 0
              ? s.lines.filter((l) => l.productId !== productId)
              : s.lines.map((l) => (l.productId === productId ? { ...l, quantity: Math.min(MAX_QTY, qty) } : l))
        })),
      remove: (productId) => set((s) => ({ lines: s.lines.filter((l) => l.productId !== productId) })),
      clear: () => set({ lines: [] })
    }),
    { name: 'fdp-cart', version: 1 }
  )
);

export const cartEstimate = (lines: CartLine[]): number =>
  lines.reduce((sum, l) => sum + Math.round(l.quantity * l.unitPrice * 100) / 100, 0);
