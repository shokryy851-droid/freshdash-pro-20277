import { useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ORDER_STATUS_AR, t } from '@/i18n/ar';
import { formatDateTime, formatMoney } from '@/lib/format';
import { EmptyState, ErrorState, LoadingState } from '@/ui/States';
import { usePendingOutbox } from './usePendingOutbox';
import { fetchOrders } from './api';

export function OrdersPage() {
  const location = useLocation();
  const queued = (location.state as { queued?: boolean } | null)?.queued;
  const pending = usePendingOutbox();
  const orders = useQuery({ queryKey: ['orders', 0], queryFn: () => fetchOrders(0) });
  const list = orders.data ?? [];

  return (
    <section className="flex flex-col gap-3 p-4">
      <h1 className="text-xl font-bold">الطلبات</h1>
      {queued || pending.length > 0 ? (
        <div role="status" className="rounded-2xl bg-accent-400/30 p-4 font-semibold">
          {t.pendingSync}: {pending.filter((p) => p.status === 'pending').length}
          {pending.some((p) => p.status === 'failed') ? ' — يوجد طلب رُفض، راجع السلة' : ''}
        </div>
      ) : null}
      {orders.isPending ? <LoadingState /> : orders.isError ? (
        <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState title="لا توجد طلبات بعد" />
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((o) => (
            <li key={o.id} className="rounded-2xl bg-surface p-4">
              <div className="flex justify-between">
                <span className="font-bold">#{o.order_no}</span>
                <span className="rounded-full bg-brand-50 px-3 text-sm text-brand-600">{ORDER_STATUS_AR[o.status]}</span>
              </div>
              <div className="mt-2 flex justify-between text-sm text-muted">
                <span>{formatDateTime(o.created_at)}</span>
                <span className="font-semibold text-ink">{formatMoney(o.total)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
