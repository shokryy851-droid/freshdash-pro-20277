import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ORDER_STATUS_AR, PAYMENT_METHOD_AR } from '@/i18n/ar';
import { formatDateTime, formatMoney, formatQty } from '@/lib/format';
import { userMessage } from '@/lib/errors';
import type { OrderStatus } from '@/types/database';
import { Button } from '@/ui/Button';
import { Card, InlineError, Select } from '@/ui/Field';
import { EmptyState, ErrorState, LoadingState } from '@/ui/States';
import { changeOrderStatus } from '@/features/orders/api';
import { assignDriver, fetchBoardOrders, fetchDrivers, NEXT_STATUS, type BoardOrder } from './api';

const FILTERS: (OrderStatus | 'active')[] = ['active', 'pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'];

const ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  confirmed: 'تأكيد',
  preparing: 'بدء التجهيز',
  ready: 'جاهز للتوصيل',
  out_for_delivery: 'خرج للتوصيل',
  delivered: 'تم التسليم',
  failed: 'فشل التسليم',
  cancelled: 'إلغاء'
};

function OrderCard({ order, drivers }: { order: BoardOrder; drivers: { id: string; full_name: string }[] }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['board'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const status = useMutation({
    mutationFn: ({ to, note }: { to: OrderStatus; note?: string }) => changeOrderStatus(order.id, to, note),
    onSuccess: refresh,
    onError: (e) => setError(userMessage(e))
  });
  const assign = useMutation({
    mutationFn: (driverId: string) => assignDriver(order.id, driverId),
    onSuccess: refresh,
    onError: (e) => setError(userMessage(e))
  });

  const onAction = (to: OrderStatus) => {
    setError(null);
    if (to === 'cancelled' || to === 'failed') {
      const note = window.prompt(to === 'cancelled' ? 'سبب الإلغاء؟' : 'سبب فشل التسليم؟');
      if (note === null) return;
      status.mutate({ to, note });
      return;
    }
    status.mutate({ to });
  };

  const canAssign = ['confirmed', 'preparing', 'ready'].includes(order.status);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-bold">#{order.order_no} — {order.customer?.name ?? '—'}</p>
          <p className="text-sm text-muted">
            {formatDateTime(order.created_at)} • {PAYMENT_METHOD_AR[order.payment_method]}
          </p>
          {order.customer?.phone ? (
            <a href={`tel:${order.customer.phone}`} dir="ltr" className="text-sm font-semibold text-brand-600">{order.customer.phone}</a>
          ) : null}
        </div>
        <div className="text-end">
          <span className="rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-600">{ORDER_STATUS_AR[order.status]}</span>
          <p className="mt-2 font-bold tabular-nums">{formatMoney(order.total)}</p>
        </div>
      </div>

      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="text-start text-sm font-semibold text-brand-600">
        {open ? 'إخفاء الأصناف' : `عرض الأصناف (${order.items.length})`}
      </button>
      {open ? (
        <ul className="flex flex-col gap-1 rounded-xl bg-canvas p-3 text-sm">
          {order.items.map((it) => (
            <li key={it.product_name} className="flex justify-between">
              <span>{it.product_name} × {formatQty(it.quantity)} {it.unit_name}</span>
              <span className="tabular-nums">{formatMoney(it.line_total)}</span>
            </li>
          ))}
          {order.delivery_address ? <li className="mt-2 text-muted">📍 {order.delivery_address}</li> : null}
          {order.notes ? <li className="text-muted">📝 {order.notes}</li> : null}
        </ul>
      ) : null}

      {canAssign ? (
        <Select
          aria-label="إسناد سائق"
          value={order.delivery?.driver_id ?? ''}
          disabled={assign.isPending}
          onChange={(e) => e.target.value && assign.mutate(e.target.value)}
        >
          <option value="">— إسناد سائق —</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>{d.full_name || d.id.slice(0, 8)}</option>
          ))}
        </Select>
      ) : null}

      {NEXT_STATUS[order.status].length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {NEXT_STATUS[order.status].map((to) => (
            <Button
              key={to}
              variant={to === 'cancelled' || to === 'failed' ? 'secondary' : 'primary'}
              loading={status.isPending && status.variables?.to === to}
              disabled={status.isPending}
              onClick={() => onAction(to)}
              className="flex-1"
            >
              {ACTION_LABEL[to] ?? ORDER_STATUS_AR[to]}
            </Button>
          ))}
        </div>
      ) : null}
      <InlineError message={error} />
    </Card>
  );
}

export function OrdersBoardPage() {
  const [filter, setFilter] = useState<OrderStatus | 'active'>('active');
  const orders = useQuery({ queryKey: ['board', filter], queryFn: () => fetchBoardOrders(filter), refetchInterval: 30_000 });
  const drivers = useQuery({ queryKey: ['drivers'], queryFn: fetchDrivers, staleTime: 5 * 60_000 });

  return (
    <section className="flex flex-col gap-3 p-4">
      <div role="tablist" aria-label="تصفية الطلبات" className="-mx-4 flex gap-2 overflow-x-auto px-4">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={f === filter}
            onClick={() => setFilter(f)}
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${f === filter ? 'bg-ink text-canvas' : 'border border-brand-100 bg-surface'}`}
          >
            {f === 'active' ? 'النشطة' : ORDER_STATUS_AR[f]}
          </button>
        ))}
      </div>
      {orders.isPending ? <LoadingState /> : orders.isError ? (
        <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />
      ) : orders.data.length === 0 ? (
        <EmptyState title="لا توجد طلبات في هذه الحالة" />
      ) : (
        orders.data.map((o) => <OrderCard key={o.id} order={o} drivers={drivers.data ?? []} />)
      )}
    </section>
  );
}
