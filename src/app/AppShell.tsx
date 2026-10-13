import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router';
import { t } from '@/i18n/ar';
import { startOutboxSync } from '@/lib/outbox';
import { OfflineBanner } from '@/ui/OfflineBanner';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCart } from '@/features/cart/store';
import { useRealtimeInvalidation } from '@/features/notifications/useRealtimeInvalidation';
import '@/features/orders/api'; // registers outbox command handlers

const NAV = [
  { to: '/', label: t.nav.home, icon: '🏠' },
  { to: '/cart', label: t.nav.cart, icon: '🛒' },
  { to: '/orders', label: t.nav.orders, icon: '📦' },
  { to: '/account', label: t.nav.account, icon: '👤' }
] as const;

export function AppShell() {
  const { session } = useAuth();
  const cartCount = useCart((s) => s.lines.length);
  useRealtimeInvalidation(session?.user.id);
  useEffect(() => (session ? startOutboxSync() : undefined), [session]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <OfflineBanner />
      <header className="rounded-b-[2rem] bg-brand-600 px-5 pb-6 pt-5 text-white">
        <p className="text-2xl font-bold">{t.appName}</p>
        <p className="mt-1 text-sm text-white/85">{t.tagline}</p>
      </header>
      <main className="flex-1 pb-24">
        <Outlet />
      </main>
      <nav aria-label="التنقل الرئيسي"
        className="fixed inset-x-0 bottom-0 mx-auto flex max-w-2xl border-t border-brand-100 bg-surface pb-[env(safe-area-inset-bottom)]">
        {NAV.map((n) => (
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
