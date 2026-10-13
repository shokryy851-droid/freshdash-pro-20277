import type { AppRole } from '@/types/database';

/** UI routing only — every permission is enforced again by RLS / RPC in the database. */
export const OFFICE_ROLES: readonly AppRole[] = ['super_admin', 'admin', 'manager', 'sales', 'warehouse', 'viewer'];
export const CATALOG_ROLES: readonly AppRole[] = ['super_admin', 'admin', 'manager'];
export const ORDER_ON_BEHALF_ROLES: readonly AppRole[] = ['super_admin', 'admin', 'manager', 'sales'];

export const hasRole = (role: AppRole | null, allowed: readonly AppRole[]): boolean => role !== null && allowed.includes(role);
