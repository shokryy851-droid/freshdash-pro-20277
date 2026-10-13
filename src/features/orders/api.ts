import { supabase } from '@/lib/supabase';
import { AppError, toAppError, unwrap, type AppErrorCode } from '@/lib/errors';
import { discard, enqueue, flushOutbox, listOutbox, registerCommand } from '@/lib/outbox';
import type { OrderRow, OrderStatus, PaymentMethod } from '@/types/database';

export interface CreateOrderInput {
  customerId: string;
  items: { product_id: string; quantity: number }[];
  paymentMethod: PaymentMethod;
  deliveryAddress?: string;
  notes?: string;
}

async function rpcCreateOrder(input: CreateOrderInput, idempotencyKey: string): Promise<OrderRow> {
  const { data, error } = await supabase.rpc('create_order', {
    p_customer_id: input.customerId,
    p_items: input.items,
    p_payment_method: input.paymentMethod,
    p_idempotency_key: idempotencyKey,
    p_delivery_address: input.deliveryAddress ?? null,
    p_notes: input.notes ?? null
  });
  if (error) throw toAppError(error);
  return data as unknown as OrderRow;
}

registerCommand('create_order', (payload, key) => rpcCreateOrder(payload as CreateOrderInput, key));

/**
 * Persist the command FIRST, then try to send. If the network drops mid-request the command
 * survives in IndexedDB and is replayed with the same key — the server returns the same order.
 */
export async function submitOrder(input: CreateOrderInput, idempotencyKey: string): Promise<{ queued: boolean }> {
  await enqueue('create_order', idempotencyKey, input);
  await flushOutbox();
  const mine = (await listOutbox()).find((e) => e.id === idempotencyKey);
  if (!mine) return { queued: false }; // delivered and confirmed by the server
  if (mine.status === 'failed') {
    // Business rejection (e.g. insufficient stock): surface it, keep the cart, drop the command
    await discard(idempotencyKey);
    throw new AppError((mine.lastError as AppErrorCode | undefined) ?? 'unknown', 'order rejected');
  }
  return { queued: true }; // offline — will be replayed with the same key
}

export interface MyCustomer {
  id: string;
  name: string;
  address: string | null;
}

export async function fetchMyCustomer(userId: string): Promise<MyCustomer | null> {
  const res = await supabase.from('customers').select('id, name, address').eq('profile_id', userId).maybeSingle();
  if (res.error) throw toAppError(res.error);
  return (res.data as unknown as MyCustomer | null) ?? null; // null = no customer record linked (a real, distinct state)
}

export interface OrderListItem {
  id: string;
  order_no: number;
  status: OrderStatus;
  total: number;
  payment_method: PaymentMethod;
  created_at: string;
  customer: { name: string } | null;
}

export async function fetchOrders(page: number, pageSize = 20): Promise<OrderListItem[]> {
  const res = await supabase
    .from('orders')
    .select('id, order_no, status, total, payment_method, created_at, customer:customers(name)')
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  // Embedded relation typing becomes exact once types are generated (npm run db:types)
  return unwrap(res) as unknown as OrderListItem[];
}

export async function changeOrderStatus(orderId: string, to: OrderStatus, note?: string): Promise<OrderRow> {
  const { data, error } = await supabase.rpc('change_order_status', { p_order_id: orderId, p_to: to, p_note: note ?? null });
  if (error) throw toAppError(error);
  return data as unknown as OrderRow;
}
