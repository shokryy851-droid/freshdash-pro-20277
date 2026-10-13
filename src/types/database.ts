/**
 * Hand-written subset of the schema in supabase/migrations.
 * REPLACE with generated types once the DB is live:  npm run db:types
 * (type aliases, not interfaces: supabase-js requires index-signature-compatible rows)
 */
export type AppRole = 'super_admin' | 'admin' | 'manager' | 'sales' | 'warehouse' | 'driver' | 'viewer' | 'customer';
export type OrderStatus =
  | 'pending' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'failed';
export type PaymentMethod = 'cash' | 'credit' | 'ewallet' | 'bank_transfer';

type Table<R> = { Row: R; Insert: Partial<R>; Update: Partial<R>; Relationships: [] };

export type ProfileRow = {
  id: string; full_name: string; phone: string | null; role: AppRole; is_active: boolean;
  created_at: string; updated_at: string;
};
export type CategoryRow = {
  id: string; name: string; icon: string | null; sort_order: number; is_active: boolean;
  created_at: string; updated_at: string;
};
export type UnitRow = { id: string; name: string; created_at: string };
export type ProductRow = {
  id: string; name: string; description: string | null; category_id: string; unit_id: string;
  pack_label: string | null; price: number; image_path: string | null; track_stock: boolean;
  stock_on_hand: number; low_stock_at: number; is_visible: boolean; deleted_at: string | null;
  created_by: string | null; created_at: string; updated_at: string;
};
export type CustomerRow = {
  id: string; profile_id: string | null; name: string; phone: string;
  type: 'restaurant' | 'hotel' | 'buffet' | 'cafe' | 'shop' | 'other';
  address: string | null; credit_limit: number; notes: string | null; is_active: boolean;
  created_by: string | null; created_at: string; updated_at: string;
};
export type OrderRow = {
  id: string; order_no: number; customer_id: string; status: OrderStatus; subtotal: number; discount: number;
  total: number; payment_method: PaymentMethod; delivery_address: string | null; scheduled_for: string | null;
  notes: string | null; cancel_reason: string | null; idempotency_key: string; created_by: string | null;
  updated_by: string | null; created_at: string; updated_at: string;
};
export type OrderItemRow = {
  id: string; order_id: string; product_id: string; product_name: string; unit_name: string;
  quantity: number; unit_price: number; line_total: number;
};
export type NotificationRow = {
  id: string; recipient_id: string; type: string; title: string; body: string | null;
  entity_type: string | null; entity_id: string | null; dedupe_key: string | null;
  read_at: string | null; created_at: string;
};

export type DeliveryStatus = 'unassigned' | 'assigned' | 'picked_up' | 'delivered' | 'failed';
export type DeliveryRow = {
  id: string; order_id: string; driver_id: string | null; status: DeliveryStatus;
  assigned_at: string | null; delivered_at: string | null; failure_note: string | null; updated_at: string;
};
export type PaymentRow = {
  id: string; customer_id: string; order_id: string | null; amount: number; method: PaymentMethod;
  reference: string | null; idempotency_key: string; received_by: string | null; created_at: string;
};
export type CustomerBalanceRow = { customer_id: string; total_billed: number; total_paid: number; outstanding: number };

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow>;
      categories: Table<CategoryRow>;
      units: Table<UnitRow>;
      products: Table<ProductRow>;
      customers: Table<CustomerRow>;
      orders: Table<OrderRow>;
      order_items: Table<OrderItemRow>;
      notifications: Table<NotificationRow>;
      deliveries: Table<DeliveryRow>;
      payments: Table<PaymentRow>;
    };
    Views: { customer_balances: { Row: CustomerBalanceRow; Relationships: [] } };
    Functions: {
      create_order: {
        Args: {
          p_customer_id: string;
          p_items: { product_id: string; quantity: number }[];
          p_payment_method: PaymentMethod;
          p_idempotency_key: string;
          p_delivery_address?: string | null;
          p_notes?: string | null;
          p_scheduled_for?: string | null;
        };
        Returns: OrderRow;
      };
      change_order_status: {
        Args: { p_order_id: string; p_to: OrderStatus; p_note?: string | null };
        Returns: OrderRow;
      };
      assign_delivery: { Args: { p_order_id: string; p_driver_id: string }; Returns: DeliveryRow };
      record_payment: {
        Args: {
          p_customer_id: string; p_amount: number; p_method: PaymentMethod; p_idempotency_key: string;
          p_order_id?: string | null; p_reference?: string | null;
        };
        Returns: PaymentRow;
      };
      adjust_stock: {
        Args: { p_product_id: string; p_quantity: number; p_type: 'adjustment' | 'damage'; p_reason: string };
        Returns: undefined;
      };
      dashboard_summary: { Args: Record<string, never>; Returns: unknown };
    };
    Enums: { app_role: AppRole; order_status: OrderStatus; payment_method: PaymentMethod };
    CompositeTypes: { [_ in never]: never };
  };
};
