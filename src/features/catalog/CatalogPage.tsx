import { useDeferredValue, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { t } from '@/i18n/ar';
import { Button } from '@/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '@/ui/States';
import { fetchCategories, fetchProducts, type CatalogCategory } from './api';
import { ProductCard } from './ProductCard';

const ALL: { id: string | undefined; name: string; icon: string | null } = { id: undefined, name: t.all, icon: '🛒' };

export function CatalogPage() {
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);

  const categories = useQuery({ queryKey: ['categories'], queryFn: fetchCategories, staleTime: 10 * 60_000 });
  const products = useInfiniteQuery({
    queryKey: ['products', categoryId, deferredSearch],
    queryFn: ({ pageParam }) => fetchProducts({ categoryId, search: deferredSearch, page: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (all.length * last.pageSize < last.total ? all.length : undefined)
  });

  const rows = products.data?.pages.flatMap((p) => p.rows) ?? [];
  const tabs: { id: string | undefined; name: string; icon: string | null }[] = [
    ALL,
    ...(categories.data ?? []).map((c: CatalogCategory) => ({ id: c.id, name: c.name, icon: c.icon }))
  ];

  return (
    <section className="flex flex-col gap-4 p-4">
      <label className="block">
        <span className="sr-only">{t.search}</span>
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.search}
          className="min-h-14 w-full rounded-2xl border border-brand-100 bg-surface px-5 shadow-sm" />
      </label>

      <div role="tablist" aria-label="الفئات" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {tabs.map((c) => {
          const active = c.id === categoryId;
          return (
            <button key={c.id ?? 'all'} role="tab" aria-selected={active} type="button" onClick={() => setCategoryId(c.id)}
              className={`min-h-12 shrink-0 rounded-full px-5 font-semibold ${active ? 'bg-brand-600 text-white' : 'border border-brand-100 bg-surface'}`}>
              {c.icon ? `${c.icon} ` : ''}{c.name}
            </button>
          );
        })}
      </div>

      {products.isPending ? <LoadingState /> : products.isError ? (
        <ErrorState error={products.error} onRetry={() => void products.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="لا توجد منتجات مطابقة" />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {rows.map((p) => <li key={p.id}><ProductCard product={p} /></li>)}
          </ul>
          {products.hasNextPage ? (
            <Button variant="secondary" loading={products.isFetchingNextPage} onClick={() => void products.fetchNextPage()}>
              عرض المزيد
            </Button>
          ) : null}
        </>
      )}
    </section>
  );
}
