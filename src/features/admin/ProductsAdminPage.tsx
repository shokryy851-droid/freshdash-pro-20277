import { useDeferredValue, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { formatMoney, formatQty } from '@/lib/format';
import { userMessage } from '@/lib/errors';
import { Button } from '@/ui/Button';
import { Card, Field, InlineError, Select, TextInput } from '@/ui/Field';
import { EmptyState, ErrorState, LoadingState } from '@/ui/States';
import { productImageUrl } from '@/features/catalog/api';
import {
  adjustStock,
  archiveProduct,
  createCategory,
  createUnit,
  fetchAdminProducts,
  fetchAllCategories,
  fetchUnits,
  saveProduct,
  uploadProductImage,
  type AdminProduct
} from './api';

const productSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category_id: z.string().uuid(),
  unit_id: z.string().uuid(),
  price: z.coerce.number().min(0).max(100_000_000),
  pack_label: z.string().trim().max(40).transform((v) => v || null),
  low_stock_at: z.coerce.number().min(0),
  is_visible: z.boolean()
});

function ProductForm({ product, onDone }: { product: AdminProduct | null; onDone: () => void }) {
  const qc = useQueryClient();
  const categories = useQuery({ queryKey: ['admin-categories'], queryFn: fetchAllCategories });
  const units = useQuery({ queryKey: ['units'], queryFn: fetchUnits });
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async (form: FormData) => {
      const parsed = productSchema.safeParse({
        name: form.get('name'),
        category_id: form.get('category_id'),
        unit_id: form.get('unit_id'),
        price: form.get('price'),
        pack_label: String(form.get('pack_label') ?? ''),
        low_stock_at: form.get('low_stock_at') || 0,
        is_visible: form.get('is_visible') === 'on'
      });
      if (!parsed.success) throw new Error('validation');
      const id = await saveProduct(product?.id ?? null, parsed.data);
      const file = form.get('image');
      if (file instanceof File && file.size > 0) await uploadProductImage(id, file);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-products'] });
      void qc.invalidateQueries({ queryKey: ['products'] });
      onDone();
    },
    onError: (e) => setError(e instanceof Error && e.message === 'validation' ? 'تحقق من الحقول المطلوبة والأرقام.' : userMessage(e))
  });

  const addLookup = async (kind: 'category' | 'unit') => {
    const name = window.prompt(kind === 'category' ? 'اسم الفئة الجديدة' : 'اسم الوحدة الجديدة (مثل: كرتون)');
    if (!name?.trim()) return;
    try {
      await (kind === 'category' ? createCategory(name) : createUnit(name));
      await qc.invalidateQueries({ queryKey: [kind === 'category' ? 'admin-categories' : 'units'] });
    } catch (e) {
      setError(userMessage(e));
    }
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    save.mutate(new FormData(e.currentTarget));
  };

  return (
    <Card>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <h2 className="font-bold">{product ? `تعديل: ${product.name}` : 'منتج جديد'}</h2>
        <Field label="اسم المنتج">
          <TextInput name="name" required maxLength={120} defaultValue={product?.name} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الفئة">
            <Select name="category_id" required defaultValue={product?.category_id ?? ''}>
              <option value="" disabled>اختر…</option>
              {(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="الوحدة">
            <Select name="unit_id" required defaultValue={product?.unit_id ?? ''}>
              <option value="" disabled>اختر…</option>
              {(units.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
        </div>
        <div className="flex gap-2 text-sm">
          <button type="button" className="font-semibold text-brand-600" onClick={() => void addLookup('category')}>+ فئة</button>
          <button type="button" className="font-semibold text-brand-600" onClick={() => void addLookup('unit')}>+ وحدة</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="السعر (ر.ي)">
            <TextInput name="price" type="number" inputMode="decimal" min={0} step="0.01" required defaultValue={product?.price} />
          </Field>
          <Field label="وصف العبوة (مثل: 30 كيلو)">
            <TextInput name="pack_label" maxLength={40} defaultValue={product?.pack_label ?? ''} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="حد التنبيه للمخزون">
            <TextInput name="low_stock_at" type="number" inputMode="decimal" min={0} step="0.001" defaultValue={product?.low_stock_at ?? 0} />
          </Field>
          <Field label="صورة (اختياري)">
            <TextInput name="image" type="file" accept="image/png,image/jpeg,image/webp" className="py-2" />
          </Field>
        </div>
        <label className="flex min-h-11 items-center gap-3">
          <input name="is_visible" type="checkbox" defaultChecked={product?.is_visible ?? true} className="size-5 accent-brand-600" />
          ظاهر للعملاء
        </label>
        <InlineError message={error} />
        <div className="flex gap-2">
          <Button type="submit" loading={save.isPending} className="flex-1">حفظ</Button>
          <Button type="button" variant="secondary" onClick={onDone}>إلغاء</Button>
        </div>
      </form>
    </Card>
  );
}

function ProductRow({ p, onEdit }: { p: AdminProduct; onEdit: () => void }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const low = p.track_stock && p.stock_on_hand <= p.low_stock_at;
  const img = productImageUrl(p.image_path);

  const stock = useMutation({
    mutationFn: ({ qty, type, reason }: { qty: number; type: 'adjustment' | 'damage'; reason: string }) => adjustStock(p.id, qty, type, reason),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-products'] }),
    onError: (e) => setError(userMessage(e))
  });
  const archive = useMutation({
    mutationFn: () => archiveProduct(p.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-products'] }),
    onError: (e) => setError(userMessage(e))
  });

  const onStock = (type: 'adjustment' | 'damage') => {
    const raw = window.prompt(type === 'adjustment' ? 'الكمية المضافة (+) أو المخصومة (−)' : 'كمية التالف');
    if (!raw) return;
    const n = Number(raw.replace(',', '.'));
    if (!Number.isFinite(n) || n === 0) return setError('أدخل رقماً صحيحاً غير صفري.');
    const reason = window.prompt('السبب') ?? '';
    if (!reason.trim()) return setError('السبب مطلوب.');
    setError(null);
    stock.mutate({ qty: type === 'damage' ? -Math.abs(n) : n, type, reason });
  };

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-brand-50">
          {img ? <img src={img} alt="" loading="lazy" className="size-full object-cover" /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{p.name} {p.is_visible ? null : <span className="text-xs text-muted">(مخفي)</span>}</p>
          <p className="text-sm text-muted">{formatMoney(p.price)}{p.pack_label ? ` • ${p.pack_label}` : ''}</p>
          <p className={`text-sm font-semibold ${low ? 'text-danger' : 'text-brand-600'}`}>
            المخزون: {formatQty(p.stock_on_hand)}{low ? ' — منخفض' : ''}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Button variant="secondary" onClick={onEdit}>تعديل</Button>
        <Button variant="secondary" loading={stock.isPending} onClick={() => onStock('adjustment')}>تعديل مخزون</Button>
        <Button variant="secondary" disabled={stock.isPending} onClick={() => onStock('damage')}>تالف</Button>
        <Button
          variant="ghost"
          loading={archive.isPending}
          onClick={() => window.confirm(`أرشفة "${p.name}"؟ سيختفي من الكتالوج.`) && archive.mutate()}
        >
          أرشفة
        </Button>
      </div>
      <InlineError message={error} />
    </Card>
  );
}

export function ProductsAdminPage() {
  const [search, setSearch] = useState('');
  const term = useDeferredValue(search);
  const [editing, setEditing] = useState<AdminProduct | null | 'new'>(null);
  const products = useQuery({ queryKey: ['admin-products', term], queryFn: () => fetchAdminProducts(term) });

  return (
    <section className="flex flex-col gap-3 p-4">
      <div className="flex gap-2">
        <TextInput type="search" placeholder="بحث عن منتج…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button onClick={() => setEditing('new')} className="shrink-0">+ منتج</Button>
      </div>
      {editing ? (
        <ProductForm key={editing === 'new' ? 'new' : editing.id} product={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
      ) : null}
      {products.isPending ? <LoadingState /> : products.isError ? (
        <ErrorState error={products.error} onRetry={() => void products.refetch()} />
      ) : products.data.length === 0 ? (
        <EmptyState title="لا توجد منتجات" hint="أضف أول منتج بالزر أعلاه." />
      ) : (
        products.data.map((p) => <ProductRow key={p.id} p={p} onEdit={() => setEditing(p)} />)
      )}
    </section>
  );
}
