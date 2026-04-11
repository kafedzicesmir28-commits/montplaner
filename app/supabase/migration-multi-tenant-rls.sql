-- Phase: RLS isolation by profile.company_id (run in Supabase SQL Editor).
-- Planner rows: public.shift_assignments (no table named "planner").
-- Prerequisite: rows have company_id set (see migration-multi-tenant-default-company.sql).
-- Client must send company_id on INSERT/UPDATE where the app writes these tables.

-- ---------------------------------------------------------------------------
-- STEP 1 — ensure RLS is enabled
-- ---------------------------------------------------------------------------
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- STEP 2 — replace broad policies with company isolation (SELECT/INSERT/UPDATE/DELETE)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.employees;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.vacations;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.shift_assignments;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.stores;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.shifts;

DROP POLICY IF EXISTS "isolation_by_profile_company" ON public.employees;
DROP POLICY IF EXISTS "isolation_by_profile_company" ON public.vacations;
DROP POLICY IF EXISTS "isolation_by_profile_company" ON public.shift_assignments;
DROP POLICY IF EXISTS "isolation_by_profile_company" ON public.stores;
DROP POLICY IF EXISTS "isolation_by_profile_company" ON public.shifts;

CREATE POLICY "isolation_by_profile_company" ON public.employees
  FOR ALL
  USING (
    auth.uid() IS NOT NULL
    AND company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  );

CREATE POLICY "isolation_by_profile_company" ON public.vacations
  FOR ALL
  USING (
    auth.uid() IS NOT NULL
    AND company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  );

CREATE POLICY "isolation_by_profile_company" ON public.shift_assignments
  FOR ALL
  USING (
    auth.uid() IS NOT NULL
    AND company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  );

CREATE POLICY "isolation_by_profile_company" ON public.stores
  FOR ALL
  USING (
    auth.uid() IS NOT NULL
    AND company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  );

CREATE POLICY "isolation_by_profile_company" ON public.shifts
  FOR ALL
  USING (
    auth.uid() IS NOT NULL
    AND company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  );
