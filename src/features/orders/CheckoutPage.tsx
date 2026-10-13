import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { t, PAYMENT_METHOD_AR } from '@/i18n/ar';
import { formatMoney, formatQty } from '@/lib/format';
import { newIdempotencyKey } from '@/lib/idempotency';
import { userMessage } from '@/lib/errors';
import { Button } from '@/ui/Button';
import { Field, Select } from '@/ui/Field';
import { EmptyState, ErrorState, LoadingState } from '@/ui/States';
import { hasRole, ORDER_ON_BEHALF_ROLES } from '@/app/roles';
import { useAuth } from '@/features/auth/AuthProvider';
import { cartEstimate, useCart } from '@/features/cart/store';
import { fetchCustomers } from '@/features/admin/api';
import type { PaymentMethod } from '@/types/database';
import { fetchMyCustomer, submitOrder, type MyCustomer } from './api';

const METHODS: PaymentMethod[] = ['cash', 'credit', 'ewallet'];

export function CheckoutPage() {
  const { session, role } = useAuth();
  const onBehalf = hasRole(role, ORDER_ON_BEHALF_ROLES);
  const [pickedId, setPickedId] = useState('');
  const lines = useCart((s) => s.lines);
  const setQuantity = useCart((s) => s.setQuantity);
  const clear = useCart((s) => s.clear);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // One key per checkout intent: double taps and retries reuse it
  const keyRef = useRef<string>(newIdempotencyKey());

  const customer = useQuery({
    queryKey: ['my-customer', session?.user.id],
    enabled: Boolean(session) && !onBehalf,
    queryFn: () => fetchMyCustomer(session!.user.id)
  });
  // Staff taking phone/WhatsApp orders pick the customer explicitly
  const customers = useQuery({ queryKey: ['customers', ''], enabled: onBehalf, queryFn: () => fetchCustomers('') });

  if (lines.length === 0) return <EmptyState title={t.emptyCart} />;
  const source = onBehalf ? customers : customer;
  if (source.isPending) return <LoadingState />;
  if (source.isError) return <ErrorState error={source.error} onRetry={() => void source.refetch()} />;
  const picked = customers.data?.find((c) => c.id === pickedId);
  const me: MyCustomer | null = onBehalf
    ? picked ? { id: picked.id, name: picked.name, address: picked.address } : null
    : (customer.data ?? null);
  if (!me && !onBehalf) {
    return <EmptyState title="حسابك غير مربوط بعميل بعد" hint="تواصل مع الإدارة لتفعيل حساب منشأتك." />;
  }

  async function onSubmit(target: MyCustomer) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const { queued } = await submitOrder(
        {
          customerId: target.id,
          items: lines.map((l) => ({ product_id: l.productId, quantity: l.quantity })),
          paymentMethod: method,
          deliveryAddress: target.address ?? undefined,
          notes: notes.trim() || undefined
        },
        keyRef.current
      );
      clear();
      keyRef.current = newIdempotencyKey();
      await qc.invalidateQueries({ queryKey: ['orders'] });
      navigate('/orders', { state: { queued } });
    } catch (err) {
      setMessage(userMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-bold">السلة</h1>
      {onBehalf ? (
        <Field label="الطلب لصالح العميل">
          <Select value={pickedId} onChange={(e) => setPickedId(e.target.value)}>
            <option value="">— اختر العميل —</option>
            {(customers.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>
            ))}
          </Select>
        </Field>
      ) : null}
      <ul className="flex flex-col gap-2">
        {lines.map((l) => (
          <li key={l.productId} className="flex items-center gap-3 rounded-2xl bg-surface p-4">
            <div className="flex-1">
              <p className="font-semibold">{l.name}</p>
              <p className="text-sm text-muted">{formatMoney(l.unitPrice)} / {l.unitName}</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="إنقاص" onClick={() => setQuantity(l.productId, l.quantity - 1)} className="size-11 rounded-xl border border-brand-100 text-xl">−</button>
              <span className="min-w-10 text-center font-bold" aria-live="polite">{formatQty(l.quantity)}</span>
              <button type="button" aria-label="زيادة" onClick={() => setQuantity(l.productId, l.quantity + 1)} className="size-11 rounded-xl border border-brand-100 text-xl">+</button>
            </div>
          </li>
        ))}
      </ul>

      <fieldset className="flex flex-col gap-2 rounded-2xl bg-surface p-4">
        <legend className="mb-2 font-semibold">طريقة الدفع</legend>
        {METHODS.map((m) => (
          <label key={m} className="flex min-h-11 items-center gap-3">
            <input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} className="size-5 accent-brand-600" />
            {PAYMENT_METHOD_AR[m]}
          </label>
        ))}
      </fieldset>

      <label className="flex flex-col gap-1">
        <span className="font-semibold">ملاحظات</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={2}
          className="rounded-2xl border border-brand-100 bg-surface p-3" />
      </label>

      <div className="rounded-2xl bg-brand-50 p-4">
        <p className="flex justify-between font-bold"><span>{t.estimatedTotal}</span><span>{formatMoney(cartEstimate(lines))}</span></p>
        <p className="mt-1 text-sm text-muted">{t.serverPriceNote}</p>
      </div>

      {message ? <p role="alert" className="text-danger">{message}</p> : null}
      <Button onClick={() => me && void onSubmit(me)} disabled={!me} loading={busy}>{t.checkout}</Button>
    </section>
  );
}
