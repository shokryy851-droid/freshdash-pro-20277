import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { formatMoney, formatQty } from '@/lib/format';
import { Card } from '@/ui/Field';
import { ErrorState, LoadingState } from '@/ui/States';
import { fetchDashboard } from './api';

function Tile({ label, value, tone = 'default', to }: { label: string; value: string; tone?: 'default' | 'warn' | 'good'; to?: string }) {
  const color = tone === 'warn' ? 'text-danger' : tone === 'good' ? 'text-brand-600' : 'text-ink';
  const body = (
    <Card className="flex h-full flex-col gap-1">
      <span className="text-sm text-muted">{label}</span>
      <span className={`text-2xl font-bold tabular-nums ${color}`}>{value}</span>
    </Card>
  );
  return to ? <Link to={to} className="block">{body}</Link> : body;
}

export function DashboardPage() {
  const q = useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard, refetchInterval: 60_000 });
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;

  return (
    <section className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-bold">ملخص اليوم</h1>
      <div className="grid grid-cols-2 gap-3">
        <Tile label="طلبات اليوم" value={formatQty(d.orders_today)} />
        <Tile label="مبيعات اليوم" value={formatMoney(d.sales_today)} tone="good" />
        <Tile label="بانتظار التأكيد" value={formatQty(d.pending)} tone={d.pending > 0 ? 'warn' : 'default'} to="/admin/orders" />
        <Tile label="قيد التجهيز" value={formatQty(d.in_progress)} to="/admin/orders" />
        <Tile label="في الطريق" value={formatQty(d.out_for_delivery)} />
        <Tile label="سُلّمت اليوم" value={formatQty(d.delivered_today)} tone="good" />
        <Tile label="المحصّل اليوم" value={formatMoney(d.collected_today)} />
        <Tile label="مستحقات العملاء" value={formatMoney(d.outstanding)} tone={d.outstanding > 0 ? 'warn' : 'default'} to="/admin/customers" />
        <Tile label="منتجات منخفضة المخزون" value={formatQty(d.low_stock)} tone={d.low_stock > 0 ? 'warn' : 'default'} to="/admin/products" />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-bold">الأكثر مبيعاً (30 يوماً)</h2>
          {d.top_products.length === 0 ? <p className="text-muted">لا توجد بيانات بعد</p> : (
            <ol className="flex flex-col gap-2">
              {d.top_products.map((p, i) => (
                <li key={p.name} className="flex justify-between">
                  <span>{i + 1}. {p.name}</span>
                  <span className="tabular-nums text-muted">{formatQty(p.qty)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-bold">أفضل العملاء (30 يوماً)</h2>
          {d.top_customers.length === 0 ? <p className="text-muted">لا توجد بيانات بعد</p> : (
            <ol className="flex flex-col gap-2">
              {d.top_customers.map((c, i) => (
                <li key={c.name} className="flex justify-between">
                  <span>{i + 1}. {c.name}</span>
                  <span className="tabular-nums text-muted">{formatMoney(c.total)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </section>
  );
}
