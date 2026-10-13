import { supabase } from '@/lib/supabase';
import { unwrap } from '@/lib/errors';
import { env } from '@/lib/env';

export interface CatalogCategory {
  id: string;
  name: string;
  icon: string | null;
}

export interface CatalogProduct {
  id: string;
  name: string;
  price: number;
  pack_label: string | null;
  image_path: string | null;
  category_id: string;
  stock_on_hand: number;
  track_stock: boolean;
  unit: { name: string } | null;
}

const PAGE_SIZE = 30;

export async function fetchCategories(): Promise<CatalogCategory[]> {
  const res = await supabase.from('categories').select('id, name, icon').eq('is_active', true).order('sort_order');
  return unwrap(res) as unknown as CatalogCategory[];
}

/** Server-side filtering + pagination; never downloads the whole catalog. */
export async function fetchProducts(params: { categoryId?: string; search?: string; page: number }) {
  let q = supabase
    .from('products')
    .select('id, name, price, pack_label, image_path, category_id, stock_on_hand, track_stock, unit:units(name)', { count: 'exact' })
    .eq('is_visible', true)
    .is('deleted_at', null)
    .order('name')
    .range(params.page * PAGE_SIZE, params.page * PAGE_SIZE + PAGE_SIZE - 1);
  if (params.categoryId) q = q.eq('category_id', params.categoryId);
  if (params.search?.trim()) q = q.ilike('name', `%${params.search.trim().replace(/[%_]/g, '')}%`);
  const res = await q;
  const rows = unwrap(res) as unknown as CatalogProduct[];
  return { rows, total: res.count ?? rows.length, pageSize: PAGE_SIZE };
}

export const productImageUrl = (path: string | null): string | null =>
  path ? `${env.VITE_SUPABASE_URL}/storage/v1/object/public/product-images/${encodeURI(path)}` : null;
