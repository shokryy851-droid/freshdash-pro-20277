import { NavLink, Outlet } from 'react-router';

const TABS = [
  { to: '/admin', label: 'لوحة التحكم', end: true },
  { to: '/admin/orders', label: 'الطلبات', end: false },
  { to: '/admin/products', label: 'المنتجات', end: false },
  { to: '/admin/customers', label: 'العملاء', end: false }
] as const;

export function AdminLayout() {
  return (
    <div className="flex flex-col">
      <nav aria-label="أقسام الإدارة" className="sticky top-0 z-10 flex gap-2 overflow-x-auto bg-canvas/95 px-4 py-3 backdrop-blur">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `min-h-11 shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${isActive ? 'bg-brand-600 text-white' : 'border border-brand-100 bg-surface'}`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
