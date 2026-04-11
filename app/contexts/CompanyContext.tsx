'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { ProfileRole } from '@/lib/tenantProfile';

export type CompanyContextValue = {
  /** Null for superadmins without a tenant; required for admin/user CRUD + RLS-backed data. */
  companyId: string | null;
  role: ProfileRole;
};

const CompanyContext = createContext<CompanyContextValue | null>(null);

export function CompanyProvider({
  companyId,
  role,
  children,
}: {
  companyId: string | null;
  role: ProfileRole;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ companyId, role }), [companyId, role]);
  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany(): CompanyContextValue {
  const ctx = useContext(CompanyContext);
  if (!ctx) {
    throw new Error('useCompany must be used within CompanyProvider (authenticated app).');
  }
  return ctx;
}
