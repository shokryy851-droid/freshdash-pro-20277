import { memo } from 'react';
import { formatMoney } from '@/lib/format';
import { t } from '@/i18n/ar';
import { useCart } from '@/features/cart/store';
import { productImageUrl, type CatalogProduct } from './api';

export const ProductCard = memo(function ProductCard({ product }: { product: CatalogProduct }) {
  const add = useCart((s) => s.add);
  const outOfStock = product.track_stock && product.stock_on_hand <= 0;
  const img = productImageUrl(product.image_path);

  return (
    <article className="flex overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-sm">
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="text-lg font-bold">{product.name}</h3>
        {product.pack_label ? (
          <span className="w-fit rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-600">{product.pack_label}</span>
        ) : null}
        <p className="mt-auto text-xl font-bold">
          {formatMoney(product.price)}
          {product.unit ? <span className="text-sm font-normal text-muted"> / {product.unit.name}</span> : null}
        </p>
        {outOfStock ? <span className="text-sm font-semibold text-danger">نفدت الكمية</span> : null}
      </div>
      <div className="relative w-36 shrink-0 bg-brand-50">
        {img ? <img src={img} alt={product.name} loading="lazy" decoding="async" width={144} height={144} className="size-full object-cover" /> : null}
        <button
          type="button"
          onClick={() => add({ productId: product.id, name: product.name, unitPrice: product.price, unitName: product.unit?.name ?? '' })}
          disabled={outOfStock}
          aria-label={`${t.addToCart}: ${product.name}`}
          className="absolute bottom-3 start-3 grid size-12 place-items-center rounded-2xl bg-brand-600 text-2xl text-white shadow-lg active:scale-95 disabled:bg-muted"
        >
          +
        </button>
      </div>
    </article>
  );
});
