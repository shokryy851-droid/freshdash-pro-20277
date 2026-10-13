import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter } from 'react-router';
import { EmptyState, LoadingState } from '@/ui/States';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { AppShell } from './AppShell';
import { OFFICE_ROLES, CATALOG_ROLES } from './roles';

const CatalogPage = lazy(() => import('@/features/catalog/CatalogPage').then((m) => ({ default: m.CatalogPage })));
const CheckoutPage = lazy(() => import('@/features/orders/CheckoutPage').then((m) => ({ default: m.CheckoutPage })));
const OrdersPage = lazy(() => import('@/features/orders/OrdersPage').then((m) => ({ default: m.OrdersPage })));
const AccountPage = lazy(() => import('./AccountPage').then((m) => ({ default: m.AccountPage })));
const AdminLayout = lazy(() => import('@/features/admin/AdminLayout').then((m) => ({ default: m.AdminLayout })));
const DashboardPage = lazy(() => import('@/features/admin/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const OrdersBoardPage = lazy(() => import('@/features/admin/OrdersBoardPage').then((m) => ({ default: m.OrdersBoardPage })));
const ProductsAdminPage = lazy(() => import('@/features/admin/ProductsAdminPage').then((m) => ({ default: m.ProductsAdminPage })));
const CustomersAdminPage = lazy(() => import('@/features/admin/CustomersAdminPage').then((m) => ({ default: m.CustomersAdminPage })));
const DriverPage = lazy(() => import('@/features/driver/DriverPage').then((m) => ({ default: m.DriverPage })));
const LoginPage = lazy(() => import('@/features/auth/LoginPage').then((m) => ({ default: m.LoginPage })));

function NotFound() {
  return <EmptyState title="الصفحة غير موجودة" hint="تحقق من الرابط أو عد للرئيسية." />;
}

const page = (node: ReactNode) => <Suspense fallback={<LoadingState />}>{node}</Suspense>;

export const router = createBrowserRouter([
  { path: '/login', element: page(<LoginPage />) },
  {
    element: <AppShell />,
    children: [
      { index: true, element: page(<CatalogPage />) }, // guests may browse the catalog
      { path: 'cart', element: page(<RequireAuth><CheckoutPage /></RequireAuth>) },
      { path: 'orders', element: page(<RequireAuth><OrdersPage /></RequireAuth>) },
      { path: 'account', element: page(<RequireAuth><AccountPage /></RequireAuth>) },
      { path: 'deliveries', element: page(<RequireAuth roles={['driver']}><DriverPage /></RequireAuth>) },
      {
        path: 'admin',
        element: page(<RequireAuth roles={OFFICE_ROLES}><AdminLayout /></RequireAuth>),
        children: [
          { index: true, element: page(<DashboardPage />) },
          { path: 'orders', element: page(<OrdersBoardPage />) },
          { path: 'products', element: page(<RequireAuth roles={CATALOG_ROLES}><ProductsAdminPage /></RequireAuth>) },
          { path: 'customers', element: page(<CustomersAdminPage />) }
        ]
      },
      { path: '*', element: page(<NotFound />) }
    ]
  }
]);
