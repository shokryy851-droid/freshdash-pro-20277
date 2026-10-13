import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter } from 'react-router';
import { LoadingState } from '@/ui/States';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { AppShell } from './AppShell';

const CatalogPage = lazy(() => import('@/features/catalog/CatalogPage').then((m) => ({ default: m.CatalogPage })));
const CheckoutPage = lazy(() => import('@/features/orders/CheckoutPage').then((m) => ({ default: m.CheckoutPage })));
const OrdersPage = lazy(() => import('@/features/orders/OrdersPage').then((m) => ({ default: m.OrdersPage })));
const AccountPage = lazy(() => import('./AccountPage').then((m) => ({ default: m.AccountPage })));
const LoginPage = lazy(() => import('@/features/auth/LoginPage').then((m) => ({ default: m.LoginPage })));

const page = (node: ReactNode) => <Suspense fallback={<LoadingState />}>{node}</Suspense>;

export const router = createBrowserRouter([
  { path: '/login', element: page(<LoginPage />) },
  {
    element: <AppShell />,
    children: [
      { index: true, element: page(<CatalogPage />) }, // guests may browse the catalog
      { path: 'cart', element: page(<RequireAuth><CheckoutPage /></RequireAuth>) },
      { path: 'orders', element: page(<RequireAuth><OrdersPage /></RequireAuth>) },
      { path: 'account', element: page(<RequireAuth><AccountPage /></RequireAuth>) }
    ]
  }
]);
