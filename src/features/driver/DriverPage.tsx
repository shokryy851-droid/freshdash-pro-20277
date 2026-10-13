import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PAYMENT_METHOD_AR } from '@/i18n/ar';
import { formatMoney } from '@/lib/format';
import { newIdempotencyKey } from '@/lib/idempotency';
import { userMessage } from '@/lib/errors';
import type { OrderStatus } from '@/types/database';
import { Button } from '@/ui/Button';
import { Card, InlineError } from '@/ui/Field';
import { EmptyState, ErrorState, LoadingState } from '@/ui/States';
import { useAuth } from '@/features/auth/AuthProvider';
import { changeOrderStatus } from '@/features/orders/api';
import { fetchMyDeliveries, recordPayment, type DriverDelivery } from '@/features/admin/api';

function DeliveryCard({ d }: { d: DriverDelivery }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [collected, setCollected] = useState(false);
  const keyRef = useRef(newIdempotencyKey());
  const order = d.order;

  const move = useMutation({
    mutationFn: ({ to, note }: { to: OrderStatus; note?: string }) => changeOrderStatus(order!.id, to, note),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['my-deliveries'] }),
    onError: (e) => setError(userMessage(e))
  });
  const collect = useMutation({
    mutationFn: () => recordPayment(order!.customer!.id, order!.total, 'cash', keyRef.current, order!.id),
    onSuccess: () => setCollected(true),
    onError: (e) => setError(userMessage(e))
  });

  if (!order) return null;
  const mapsUrl = order.delivery_address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.delivery_address + ' صنعاء')}` : null;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex justify-between gap-2">
        <div>
          <p className="text-lg font-bold">#{order.order_no} — {order.customer?.name}</p>
          <p className="text-sm text-muted">{PAYMENT_METHOD_AR[order.payment_method]}</p>
        </div>
        <p className="text-lg font-bold tabular-nums">{formatMoney(order.total)}</p>
      </div>
      <div className="flex flex-wrap gap-2 text-sm font-semibold">
        {order.customer?.phone ? <a className="rounded-full bg-brand-50 px-3 py-2 text-brand-600" href={`tel:${order.customer.phone}`}>📞 اتصال</a> : null}
        {mapsUrl ? <a className="rounded-full bg-brand-50 px-3 py-2 text-brand-600" href={mapsUrl} target="_blank" rel="noreferrer">📍 الخريطة</a> : null}
      </div>
      {order.status === 'confirmed' || order.status === 'preparing' ? (
        <p className="rounded-xl bg-canvas p-3 text-sm text-muted">بانتظار تجهيز الطلب في المستودع…</p>
      ) : null}
      {order.status === 'ready' ? (
        <Button loading={move.isPending} onClick={() => move.mutate({ to: 'out_for_delivery' })}>استلمت الطلب — في الطريق</Button>
      ) : null}
      {order.status === 'out_for_delivery' ? (
        <div className="grid grid-cols-2 gap-2">
          <Button loading={move.isPending && move.variables?.to === 'delivered'} disabled={move.isPending} onClick={() => move.mutate({ to: 'delivered' })}>تم التسليم</Button>
          <Button
            variant="secondary"
            disabled={move.isPending}
            onClick={() => {
              const note = window.prompt('سبب فشل التسليم؟');
              if (note !== null) move.mutate({ to: 'failed', note });
            }}
          >
            فشل التسليم
          </Button>
        </div>
      ) : null}
      {order.payment_method === 'cash' && order.customer ? (
        collected ? <p className="text-sm font-semibold text-brand-600">✓ تم تسجيل التحصيل</p> : (
          <Button variant="secondary" loading={collect.isPending} onClick={() => { setError(null); collect.mutate(); }}>
            تحصيل نقدي {formatMoney(order.total)}
          </Button>
        )
      ) : null}
      <InlineError message={error} />
    </Card>
  );
}

export function DriverPage() {
  const { session } = useAuth();
  const q = useQuery({
    queryKey: ['my-deliveries', session?.user.id],
    enabled: Boolean(session),
    queryFn: () => fetchMyDeliveries(session!.user.id),
    refetchInterval: 30_000
  });

  return (
    <section className="flex flex-col gap-3 p-4">
      <h1 className="text-xl font-bold">توصيلاتي</h1>
      {q.isPending ? <LoadingState /> : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState title="لا توجد توصيلات مسندة لك الآن" />
      ) : (
        q.data.map((d) => <DeliveryCard key={d.order_id} d={d} />)
      )}
    </section>
  );
}
