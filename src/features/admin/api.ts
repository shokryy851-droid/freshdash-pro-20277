import { supabase } from '@/lib/supabase';
import { toAppError, unwrap } from '@/lib/errors';
import type { AppRole, CustomerRow, OrderStatus, PaymentMethod } from '@/types/database';

/* ---------- Dashboard ---------- */
export interface DashboardSummary {
  orders_today: number;
  sales_today: number;
  pending: number;
  in_progress: number;
  out_for_delivery: number;
  delivered_today: number;
  collected_today: number;
  outstanding: number;
  low_stock: number;
  top_products: { name: string; qty: number }[];
  top_customers: { name: string; total: number }[];
}

export async function fetchDashboard(): Promise<DashboardSummary> {
  const { data, error } = await supabase.rpc('dashboard_summary');
  if (error) throw toAppError(error);
  return data as unknown as DashboardSummary;
}

/* ---------- Orders board ---------- */
export interface BoardOrder {
  id: string;
  order_no: number;
  status: OrderStatus;
  total: number;
  payment_method: PaymentMethod;
  delivery_address: string | null;
  notes: string | null;
  created_at: string;
  customer: { id: string; name: string; phone: string } | null;
  items: { product_name: string; unit_name: string; quantity: number; line_total: number }[];
  delivery: { driver_id: string | null; status: string } | null;
}

export async function fetchBoardOrders(status: OrderStatus | 'active'): Promise<BoardOrder[]> {
  let q = supabase
    .from('orders')
    .select(
      'id, order_no, status, total, payment_method, delivery_address, notes, created_at,' +
        ' customer:customers(id, name, phone),' +
        ' items:order_items(product_name, unit_name, quantity, line_total),' +
        ' delivery:deliveries(driver_id, status)'
    )
    .order('created_at', { ascending: false })
    .limit(100);
  q = status === 'active' ? q.in('status', ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery']) : q.eq('status', status);
  return unwrap(await q) as unknown as BoardOrder[];
}

/** Allowed next states — mirrors the database state machine (which remains the authority). */
export const NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'failed'],
  delivered: [],
  cancelled: [],
  failed: []
};

export interface StaffMember {
  id: string;
  full_name: string;
  role: AppRole;
}

export async function fetchDrivers(): Promise<StaffMember[]> {
  const res = await supabase.from('profiles').select('id, full_name, role').eq('role', 'driver').eq('is_active', true);
  return unwrap(res) as unknown as StaffMember[];
}

export async function assignDriver(orderId: string, driverId: string): Promise<void> {
  const { error } = await supabase.rpc('assign_delivery', { p_order_id: orderId, p_driver_id: driverId });
  if (error) throw toAppError(error);
}

/* ---------- Products ---------- */
export interface AdminProduct {
  id: string;
  name: string;
  price: number;
  pack_label: string | null;
  image_path: string | null;
  category_id: string;
  unit_id: string;
  stock_on_hand: number;
  low_stock_at: number;
  track_stock: boolean;
  is_visible: boolean;
}

export async function fetchAdminProducts(search: string): Promise<AdminProduct[]> {
  let q = supabase
    .from('products')
    .select('id, name, price, pack_label, image_path, category_id, unit_id, stock_on_hand, low_stock_at, track_stock, is_visible')
    .is('deleted_at', null)
    .order('name')
    .limit(200);
  const term = search.trim().replace(/[%_]/g, '');
  if (term) q = q.ilike('name', `%${term}%`);
  return unwrap(await q) as unknown as AdminProduct[];
}

export async function fetchUnits(): Promise<{ id: string; name: string }[]> {
  return unwrap(await supabase.from('units').select('id, name').order('name')) as unknown as { id: string; name: string }[];
}

export async function fetchAllCategories(): Promise<{ id: string; name: string }[]> {
  const res = await supabase.from('categories').select('id, name').order('sort_order');
  return unwrap(res) as unknown as { id: string; name: string }[];
}

export async function createCategory(name: string): Promise<void> {
  const { error } = await supabase.from('categories').insert({ name: name.trim() });
  if (error) throw toAppError(error);
}

export async function createUnit(name: string): Promise<void> {
  const { error } = await supabase.from('units').insert({ name: name.trim() });
  if (error) throw toAppError(error);
}

export interface ProductInput {
  name: string;
  category_id: string;
  unit_id: string;
  price: number;
  pack_label: string | null;
  low_stock_at: number;
  is_visible: boolean;
}

export async function saveProduct(id: string | null, input: ProductInput): Promise<string> {
  if (id) {
    const { error } = await supabase.from('products').update(input).eq('id', id);
    if (error) throw toAppError(error);
    return id;
  }
  const res = await supabase.from('products').insert(input).select('id').single();
  return (unwrap(res) as unknown as { id: string }).id;
}

export async function archiveProduct(id: string): Promise<void> {
  const { error } = await supabase.from('products').update({ deleted_at: new Date().toISOString(), is_visible: false }).eq('id', id);
  if (error) throw toAppError(error);
}

export async function adjustStock(productId: string, quantity: number, type: 'adjustment' | 'damage', reason: string): Promise<void> {
  const { error } = await supabase.rpc('adjust_stock', { p_product_id: productId, p_quantity: quantity, p_type: type, p_reason: reason });
  if (error) throw toAppError(error);
}

/** Resize to max 800px and re-encode as WebP in the browser, then upload under a server-chosen name. */
export async function uploadProductImage(productId: string, file: File): Promise<void> {
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) throw toAppError({ code: '22023', message: 'invalid image type' });
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/webp', 0.82)
  );
  const path = `products/${productId}-${Date.now()}.webp`;
  const up = await supabase.storage.from('product-images').upload(path, blob, { contentType: 'image/webp', upsert: false });
  if (up.error) throw toAppError(up.error);
  const { error } = await supabase.from('products').update({ image_path: path }).eq('id', productId);
  if (error) throw toAppError(error);
}

/* ---------- Customers & payments ---------- */
export interface AdminCustomer extends Pick<CustomerRow, 'id' | 'name' | 'phone' | 'type' | 'address' | 'credit_limit' | 'is_active'> {
  outstanding: number;
}

export async function fetchCustomers(search: string): Promise<AdminCustomer[]> {
  let q = supabase.from('customers').select('id, name, phone, type, address, credit_limit, is_active').order('name').limit(200);
  const term = search.trim().replace(/[%_,()]/g, '');
  if (term) q = q.or(`name.ilike.%${term}%,phone.ilike.%${term}%`);
  const rows = unwrap(await q) as unknown as Omit<AdminCustomer, 'outstanding'>[];
  if (rows.length === 0) return [];
  const bal = await supabase.from('customer_balances').select('customer_id, outstanding').in('customer_id', rows.map((r) => r.id));
  const balances = unwrap(bal) as unknown as { customer_id: string; outstanding: number }[];
  const byId = new Map(balances.map((b) => [b.customer_id, Number(b.outstanding)]));
  return rows.map((r) => ({ ...r, outstanding: byId.get(r.id) ?? 0 }));
}

export interface CustomerInput {
  name: string;
  phone: string;
  type: CustomerRow['type'];
  address: string | null;
  credit_limit: number;
}

export async function createCustomer(input: CustomerInput): Promise<void> {
  const { error } = await supabase.from('customers').insert(input);
  if (error) throw toAppError(error);
}

export async function recordPayment(customerId: string, amount: number, method: PaymentMethod, key: string, orderId?: string): Promise<void> {
  const { error } = await supabase.rpc('record_payment', {
    p_customer_id: customerId,
    p_amount: amount,
    p_method: method,
    p_idempotency_key: key,
    p_order_id: orderId ?? null
  });
  if (error) throw toAppError(error);
}

/* ---------- Driver ---------- */
export interface DriverDelivery {
  order_id: string;
  status: string;
  order: {
    id: string;
    order_no: number;
    status: OrderStatus;
    total: number;
    payment_method: PaymentMethod;
    delivery_address: string | null;
    customer: { id: string; name: string; phone: string } | null;
  } | null;
}

export async function fetchMyDeliveries(driverId: string): Promise<DriverDelivery[]> {
  const res = await supabase
    .from('deliveries')
    .select('order_id, status, order:orders(id, order_no, status, total, payment_method, delivery_address, customer:customers(id, name, phone))')
    .eq('driver_id', driverId)
    .in('status', ['assigned', 'picked_up'])
    .order('assigned_at', { ascending: true });
  return unwrap(res) as unknown as DriverDelivery[];
}
