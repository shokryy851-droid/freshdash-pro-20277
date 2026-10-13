import { useEffect } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { t } from '@/i18n/ar';
import { startOutboxSync } from '@/lib/outbox';
import { OfflineBanner } from '@/ui/OfflineBanner';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCart } from '@/features/cart/store';
import { useRealtimeInvalidation } from '@/features/notifications/useRealtimeInvalidation';
import '@/features/orders/api'; // registers outbox command handlers
import { hasRole, OFFICE_ROLES } from './roles';

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

const HOME: NavItem = { to: '/', label: t.nav.home, icon: '🏠' };
const CART: NavItem = { to: '/cart', label: t.nav.cart, icon: '🛒' };
const ORDERS: NavItem = { to: '/orders', label: t.nav.orders, icon: '📦' };
const ADMIN: NavItem = { to: '/admin', label: 'الإدارة', icon: '📊' };
const DELIVERIES: NavItem = { to: '/deliveries', label: 'توصيلاتي', icon: '🚚' };
const ACCOUNT: NavItem = { to: '/account', label: t.nav.account, icon: '👤' };

function LeafMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className="size-9 shrink-0 rounded-xl bg-white/15 p-1.5">
      <path d="M7 25C7 14 14 7 26 6c-1 12-8 19-19 19z" fill="#fff" />
      <path d="M8 24 21 11" stroke="#1b5e20" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="25" cy="25" r="3" fill="#f4c24d" />
    </svg>
  );
}

export function AppShell() {
  const { session, role } = useAuth();
  const nav: NavItem[] = hasRole(role, OFFICE_ROLES)
    ? [HOME, ADMIN, CART, ORDERS, ACCOUNT]
    : role === 'driver'
      ? [HOME, DELIVERIES, ORDERS, ACCOUNT]
      : [HOME, CART, ORDERS, ACCOUNT];
  const cartCount = useCart((s) => s.lines.length);
  useRealtimeInvalidation(session?.user.id);
  useEffect(() => (session ? startOutboxSync() : undefined), [session]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <OfflineBanner />
      <header className="flex items-center gap-3 rounded-b-[2rem] bg-brand-600 px-5 pb-6 pt-[max(1.25rem,env(safe-area-inset-top))] text-white">
        <LeafMark />
        <div className="min-w-0 flex-1">
          <Link to="/" className="text-2xl font-bold">{t.appName}</Link>
          <p className="mt-1 truncate text-sm text-white/85">{t.tagline}</p>
        </div>
        {session ? null : (
          <Link to="/login" className="min-h-11 shrink-0 rounded-full bg-white px-4 py-2 text-sm font-bold text-brand-600">
            {t.login}
          </Link>
        )}
      </header>
      <main className="flex-1 pb-24">
        <Outlet />
      </main>
      <nav aria-label="التنقل الرئيسي"
        className="fixed inset-x-0 bottom-0 mx-auto flex max-w-2xl border-t border-brand-100 bg-surface pb-[env(safe-area-inset-bottom)]">
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'}
            className={({ isActive }) => `relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-sm ${isActive ? 'font-bold text-brand-600' : 'text-muted'}`}>
            <span aria-hidden className="text-2xl">{n.icon}</span>
            {n.label}
            {n.to === '/cart' && cartCount > 0 ? (
              <span className="absolute top-2 start-1/2 ms-3 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-xs text-white">
                {cartCount}
              </span>
            ) : null}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
