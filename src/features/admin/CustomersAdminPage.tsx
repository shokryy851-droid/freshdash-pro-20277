import { useDeferredValue, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { PAYMENT_METHOD_AR } from '@/i18n/ar';
import { formatMoney } from '@/lib/format';
import { newIdempotencyKey } from '@/lib/idempotency';
import { userMessage } from '@/lib/errors';
import type { CustomerRow, PaymentMethod } from '@/types/database';
import { Button } from '@/ui/Button';
import { Card, Field, InlineError, Select, TextInput } from '@/ui/Field';
import { EmptyState, ErrorState, LoadingState } from '@/ui/States';
import { createCustomer, fetchCustomers, recordPayment, type AdminCustomer } from './api';

const TYPE_AR: Record<CustomerRow['type'], string> = {
  restaurant: 'مطعم', hotel: 'فندق', buffet: 'بوفيه', cafe: 'مقهى', shop: 'محل', other: 'أخرى'
};

const customerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().regex(/^\+?[0-9]{7,15}$/),
  type: z.enum(['restaurant', 'hotel', 'buffet', 'cafe', 'shop', 'other']),
  address: z.string().trim().max(300).transform((v) => v || null),
  credit_limit: z.coerce.number().min(0)
});

function NewCustomerForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['customers'] });
      onDone();
    },
    onError: (e) => setError(userMessage(e))
  });

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const parsed = customerSchema.safeParse({
      name: f.get('name'), phone: f.get('phone'), type: f.get('type'),
      address: String(f.get('address') ?? ''), credit_limit: f.get('credit_limit') || 0
    });
    if (!parsed.success) return setError('تحقق من الاسم ورقم الهاتف (أرقام فقط، 7–15 خانة).');
    setError(null);
    create.mutate(parsed.data);
  };

  return (
    <Card>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <h2 className="font-bold">عميل جديد</h2>
        <Field label="اسم المنشأة"><TextInput name="name" required maxLength={120} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الهاتف"><TextInput name="phone" required inputMode="tel" dir="ltr" placeholder="77xxxxxxx" /></Field>
          <Field label="النوع">
            <Select name="type" defaultValue="restaurant">
              {Object.entries(TYPE_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="العنوان"><TextInput name="address" maxLength={300} /></Field>
        <Field label="حد الآجل (ر.ي)"><TextInput name="credit_limit" type="number" inputMode="decimal" min={0} defaultValue={0} /></Field>
        <InlineError message={error} />
        <div className="flex gap-2">
          <Button type="submit" loading={create.isPending} className="flex-1">حفظ</Button>
          <Button type="button" variant="secondary" onClick={onDone}>إلغاء</Button>
        </div>
      </form>
    </Card>
  );
}

function CustomerRowCard({ c }: { c: AdminCustomer }) {
  const qc = useQueryClient();
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef(newIdempotencyKey());

  const pay = useMutation({
    mutationFn: () => recordPayment(c.id, Number(amount), method, keyRef.current),
    onSuccess: () => {
      keyRef.current = newIdempotencyKey();
      setAmount('');
      setPaying(false);
      void qc.invalidateQueries({ queryKey: ['customers'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => setError(userMessage(e))
  });

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold">{c.name}</p>
          <p className="text-sm text-muted">{TYPE_AR[c.type]}{c.address ? ` • ${c.address}` : ''}</p>
          <a href={`tel:${c.phone}`} dir="ltr" className="text-sm font-semibold text-brand-600">{c.phone}</a>
        </div>
        <div className="text-end">
          <p className="text-xs text-muted">المستحق</p>
          <p className={`font-bold tabular-nums ${c.outstanding > 0 ? 'text-danger' : 'text-brand-600'}`}>{formatMoney(c.outstanding)}</p>
        </div>
      </div>
      {paying ? (
        <div className="flex flex-col gap-2 rounded-xl bg-canvas p-3">
          <div className="grid grid-cols-2 gap-2">
            <TextInput aria-label="المبلغ" type="number" inputMode="decimal" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="المبلغ" />
            <Select aria-label="طريقة الدفع" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {(['cash', 'ewallet', 'bank_transfer'] as PaymentMethod[]).map((m) => <option key={m} value={m}>{PAYMENT_METHOD_AR[m]}</option>)}
            </Select>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" loading={pay.isPending} disabled={!(Number(amount) > 0)} onClick={() => { setError(null); pay.mutate(); }}>
              تسجيل الدفعة
            </Button>
            <Button variant="secondary" onClick={() => setPaying(false)}>إلغاء</Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setPaying(true)}>تسجيل دفعة</Button>
      )}
      <InlineError message={error} />
    </Card>
  );
}

export function CustomersAdminPage() {
  const [search, setSearch] = useState('');
  const term = useDeferredValue(search);
  const [adding, setAdding] = useState(false);
  const customers = useQuery({ queryKey: ['customers', term], queryFn: () => fetchCustomers(term) });

  return (
    <section className="flex flex-col gap-3 p-4">
      <div className="flex gap-2">
        <TextInput type="search" placeholder="بحث بالاسم أو الهاتف…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button onClick={() => setAdding(true)} className="shrink-0">+ عميل</Button>
      </div>
      {adding ? <NewCustomerForm onDone={() => setAdding(false)} /> : null}
      {customers.isPending ? <LoadingState /> : customers.isError ? (
        <ErrorState error={customers.error} onRetry={() => void customers.refetch()} />
      ) : customers.data.length === 0 ? (
        <EmptyState title="لا يوجد عملاء" hint="أضف أول عميل بالزر أعلاه." />
      ) : (
        customers.data.map((c) => <CustomerRowCard key={c.id} c={c} />)
      )}
    </section>
  );
}
