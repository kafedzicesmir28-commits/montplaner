-- Multi-tenant base (additive only): new tables + nullable company_id on existing tables.
-- If the app returns PGRST205 ("Could not find the table 'public.profiles'"), run this file in Supabase SQL Editor.
-- Safe to re-run (IF NOT EXISTS / IF NOT EXISTS column pattern).
-- "Planner" data in this app lives in shift_assignments (there is no separate planner table).

-- gen_random_uuid() is built-in on PostgreSQL 13+ (Supabase default).

-- ---------------------------------------------------------------------------
-- STEP 1 — companies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- STEP 2 — profiles (superadmin may omit company_id; others must have company)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies (id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('admin', 'user', 'superadmin')),
  email text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT profiles_company_id_required_non_superadmin CHECK (role = 'superadmin' OR company_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS profiles_company_id_idx ON public.profiles (company_id);

-- ---------------------------------------------------------------------------
-- STEP 3 — nullable company_id on main tables (no data / logic changes)
-- ---------------------------------------------------------------------------
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL;

ALTER TABLE public.vacations
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL;

-- Planner grid persistence
ALTER TABLE public.shift_assignments
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL;

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.shift_assignments.company_id IS
  'Tenant scope for planner rows (same as planner UI / shift_assignments).';

CREATE INDEX IF NOT EXISTS employees_company_id_idx ON public.employees (company_id);
CREATE INDEX IF NOT EXISTS vacations_company_id_idx ON public.vacations (company_id);
CREATE INDEX IF NOT EXISTS shift_assignments_company_id_idx ON public.shift_assignments (company_id);
CREATE INDEX IF NOT EXISTS stores_company_id_idx ON public.stores (company_id);
CREATE INDEX IF NOT EXISTS shifts_company_id_idx ON public.shifts (company_id);

-- STEP 2b — existing installs: relax profiles.company_id NOT NULL + same rule as CHECK above
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_company_id_required_non_superadmin;
ALTER TABLE public.profiles
  ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_company_id_required_non_superadmin
  CHECK (role = 'superadmin' OR company_id IS NOT NULL);

-- Match existing public tables: RLS for authenticated users (additive only).
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.companies;
CREATE POLICY "Allow all for authenticated users" ON public.companies
  FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.profiles;
CREATE POLICY "Allow all for authenticated users" ON public.profiles
  FOR ALL USING (auth.uid() IS NOT NULL);
