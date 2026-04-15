-- Multi-tenant + superadmin hardening migration
-- Safe to run on existing databases. Designed to avoid data loss.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) Ensure required base tables exist.
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text,
  role text NOT NULL DEFAULT 'user',
  company_id uuid REFERENCES public.companies (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_company_id_idx ON public.profiles (company_id);

-- 2) Normalize role values.
UPDATE public.profiles
SET role = 'user'
WHERE role = 'admin';

-- Enforce only superadmin|user going forward.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('superadmin', 'user'));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_company_id_required_non_superadmin;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_company_id_required_non_superadmin
  CHECK (role = 'superadmin' OR company_id IS NOT NULL);

-- 3) Ensure company_id exists on tenant tables.
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL;
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL;
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL;
ALTER TABLE public.shift_assignments
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL;
ALTER TABLE public.vacations
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS employees_company_id_idx ON public.employees (company_id);
CREATE INDEX IF NOT EXISTS shifts_company_id_idx ON public.shifts (company_id);
CREATE INDEX IF NOT EXISTS stores_company_id_idx ON public.stores (company_id);
CREATE INDEX IF NOT EXISTS shift_assignments_company_id_idx ON public.shift_assignments (company_id);
CREATE INDEX IF NOT EXISTS vacations_company_id_idx ON public.vacations (company_id);
CREATE INDEX IF NOT EXISTS shift_assignments_company_id_date_idx ON public.shift_assignments (company_id, date);
CREATE INDEX IF NOT EXISTS vacations_company_id_dates_idx ON public.vacations (company_id, start_date, end_date);

-- 4) Create one fallback company for legacy records with missing mapping.
WITH fallback AS (
  INSERT INTO public.companies (name)
  SELECT 'Legacy Company'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.companies WHERE lower(name) = lower('Legacy Company')
  )
  RETURNING id
)
SELECT id
FROM fallback;

-- Resolve fallback company id.
WITH fallback_company AS (
  SELECT id
  FROM public.companies
  WHERE lower(name) = lower('Legacy Company')
  ORDER BY created_at ASC
  LIMIT 1
)
-- Ensure non-superadmin profiles always have a company.
UPDATE public.profiles p
SET company_id = f.id
FROM fallback_company f
WHERE p.role <> 'superadmin'
  AND p.company_id IS NULL;

-- 5) Backfill company_id on domain tables using relational hints first, then fallback.

-- employees: prefer own value, then store mapping, then fallback
UPDATE public.employees e
SET company_id = s.company_id
FROM public.stores s
WHERE e.company_id IS NULL
  AND e.store_id IS NOT NULL
  AND e.store_id = s.id
  AND s.company_id IS NOT NULL;

WITH fallback_company AS (
  SELECT id
  FROM public.companies
  WHERE lower(name) = lower('Legacy Company')
  ORDER BY created_at ASC
  LIMIT 1
)
UPDATE public.employees e
SET company_id = f.id
FROM fallback_company f
WHERE e.company_id IS NULL;

-- stores: fallback for remaining nulls
WITH fallback_company AS (
  SELECT id
  FROM public.companies
  WHERE lower(name) = lower('Legacy Company')
  ORDER BY created_at ASC
  LIMIT 1
)
UPDATE public.stores s
SET company_id = f.id
FROM fallback_company f
WHERE s.company_id IS NULL;

-- shifts: derive from store if available, then fallback
UPDATE public.shifts sh
SET company_id = s.company_id
FROM public.stores s
WHERE sh.company_id IS NULL
  AND sh.store_id IS NOT NULL
  AND sh.store_id = s.id
  AND s.company_id IS NOT NULL;

WITH fallback_company AS (
  SELECT id
  FROM public.companies
  WHERE lower(name) = lower('Legacy Company')
  ORDER BY created_at ASC
  LIMIT 1
)
UPDATE public.shifts sh
SET company_id = f.id
FROM fallback_company f
WHERE sh.company_id IS NULL;

-- vacations: derive from employee then fallback
UPDATE public.vacations v
SET company_id = e.company_id
FROM public.employees e
WHERE v.company_id IS NULL
  AND v.employee_id = e.id
  AND e.company_id IS NOT NULL;

WITH fallback_company AS (
  SELECT id
  FROM public.companies
  WHERE lower(name) = lower('Legacy Company')
  ORDER BY created_at ASC
  LIMIT 1
)
UPDATE public.vacations v
SET company_id = f.id
FROM fallback_company f
WHERE v.company_id IS NULL;

-- shift_assignments: derive from employee/store/shift then fallback
UPDATE public.shift_assignments sa
SET company_id = e.company_id
FROM public.employees e
WHERE sa.company_id IS NULL
  AND sa.employee_id = e.id
  AND e.company_id IS NOT NULL;

UPDATE public.shift_assignments sa
SET company_id = s.company_id
FROM public.stores s
WHERE sa.company_id IS NULL
  AND sa.store_id IS NOT NULL
  AND sa.store_id = s.id
  AND s.company_id IS NOT NULL;

UPDATE public.shift_assignments sa
SET company_id = sh.company_id
FROM public.shifts sh
WHERE sa.company_id IS NULL
  AND sa.shift_id IS NOT NULL
  AND sa.shift_id = sh.id
  AND sh.company_id IS NOT NULL;

WITH fallback_company AS (
  SELECT id
  FROM public.companies
  WHERE lower(name) = lower('Legacy Company')
  ORDER BY created_at ASC
  LIMIT 1
)
UPDATE public.shift_assignments sa
SET company_id = f.id
FROM fallback_company f
WHERE sa.company_id IS NULL;

-- 6) Enforce NOT NULL company ownership on tenant rows.
ALTER TABLE public.employees ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.shifts ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.stores ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.shift_assignments ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.vacations ALTER COLUMN company_id SET NOT NULL;

-- 7) Login logs.
CREATE TABLE IF NOT EXISTS public.login_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  email text,
  login_time timestamptz NOT NULL DEFAULT now(),
  ip text
);

CREATE INDEX IF NOT EXISTS login_logs_user_id_idx ON public.login_logs (user_id);
CREATE INDEX IF NOT EXISTS login_logs_login_time_idx ON public.login_logs (login_time DESC);

-- 8) RLS helpers and strict policies.
CREATE OR REPLACE FUNCTION public.current_user_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.company_id
  FROM public.profiles p
  WHERE p.id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'superadmin'
  )
$$;

-- Protect profile privilege fields from regular users.
CREATE OR REPLACE FUNCTION public.enforce_profile_mutation_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    -- Allow admin/service contexts (SQL editor, migrations, service role).
    RETURN NEW;
  END IF;

  IF public.is_superadmin() THEN
    RETURN NEW;
  END IF;

  IF NEW.id <> auth.uid() THEN
    RAISE EXCEPTION 'Cannot modify other user profile';
  END IF;

  NEW.role := OLD.role;
  NEW.company_id := OLD.company_id;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_mutation_guard ON public.profiles;
CREATE TRIGGER trg_profiles_mutation_guard
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_profile_mutation_guard();

-- Auto-assign tenant company for regular users, preserving existing UX that does not send company_id.
CREATE OR REPLACE FUNCTION public.apply_tenant_company_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  actor_company uuid;
  actor_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.company_id, p.role
  INTO actor_company, actor_role
  FROM public.profiles p
  WHERE p.id = auth.uid()
  LIMIT 1;

  IF actor_role IS NULL THEN
    RAISE EXCEPTION 'Missing profile for current user';
  END IF;

  IF actor_role = 'superadmin' THEN
    RETURN NEW;
  END IF;

  NEW.company_id := actor_company;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employees_apply_company ON public.employees;
CREATE TRIGGER trg_employees_apply_company
BEFORE INSERT OR UPDATE ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.apply_tenant_company_id();

DROP TRIGGER IF EXISTS trg_stores_apply_company ON public.stores;
CREATE TRIGGER trg_stores_apply_company
BEFORE INSERT OR UPDATE ON public.stores
FOR EACH ROW
EXECUTE FUNCTION public.apply_tenant_company_id();

DROP TRIGGER IF EXISTS trg_shifts_apply_company ON public.shifts;
CREATE TRIGGER trg_shifts_apply_company
BEFORE INSERT OR UPDATE ON public.shifts
FOR EACH ROW
EXECUTE FUNCTION public.apply_tenant_company_id();

DROP TRIGGER IF EXISTS trg_shift_assignments_apply_company ON public.shift_assignments;
CREATE TRIGGER trg_shift_assignments_apply_company
BEFORE INSERT OR UPDATE ON public.shift_assignments
FOR EACH ROW
EXECUTE FUNCTION public.apply_tenant_company_id();

DROP TRIGGER IF EXISTS trg_vacations_apply_company ON public.vacations;
CREATE TRIGGER trg_vacations_apply_company
BEFORE INSERT OR UPDATE ON public.vacations
FOR EACH ROW
EXECUTE FUNCTION public.apply_tenant_company_id();

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.employees;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.shifts;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.stores;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.shift_assignments;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.vacations;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.companies;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.profiles;

DROP POLICY IF EXISTS employees_company_isolation ON public.employees;
CREATE POLICY employees_company_isolation ON public.employees
FOR ALL
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_superadmin()
    OR company_id = public.current_user_company_id()
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.is_superadmin()
    OR company_id = public.current_user_company_id()
  )
);

DROP POLICY IF EXISTS shifts_company_isolation ON public.shifts;
CREATE POLICY shifts_company_isolation ON public.shifts
FOR ALL
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_superadmin()
    OR company_id = public.current_user_company_id()
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.is_superadmin()
    OR company_id = public.current_user_company_id()
  )
);

DROP POLICY IF EXISTS stores_company_isolation ON public.stores;
CREATE POLICY stores_company_isolation ON public.stores
FOR ALL
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_superadmin()
    OR company_id = public.current_user_company_id()
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.is_superadmin()
    OR company_id = public.current_user_company_id()
  )
);

DROP POLICY IF EXISTS shift_assignments_company_isolation ON public.shift_assignments;
CREATE POLICY shift_assignments_company_isolation ON public.shift_assignments
FOR ALL
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_superadmin()
    OR company_id = public.current_user_company_id()
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.is_superadmin()
    OR company_id = public.current_user_company_id()
  )
);

DROP POLICY IF EXISTS vacations_company_isolation ON public.vacations;
CREATE POLICY vacations_company_isolation ON public.vacations
FOR ALL
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_superadmin()
    OR company_id = public.current_user_company_id()
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.is_superadmin()
    OR company_id = public.current_user_company_id()
  )
);

DROP POLICY IF EXISTS companies_select_for_members ON public.companies;
CREATE POLICY companies_select_for_members ON public.companies
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_superadmin()
    OR id = public.current_user_company_id()
  )
);

DROP POLICY IF EXISTS companies_manage_superadmin ON public.companies;
CREATE POLICY companies_manage_superadmin ON public.companies
FOR ALL
USING (auth.uid() IS NOT NULL AND public.is_superadmin())
WITH CHECK (auth.uid() IS NOT NULL AND public.is_superadmin());

DROP POLICY IF EXISTS profiles_read_self_or_superadmin ON public.profiles;
CREATE POLICY profiles_read_self_or_superadmin ON public.profiles
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND (
    id = auth.uid()
    OR public.is_superadmin()
  )
);

DROP POLICY IF EXISTS profiles_update_self_or_superadmin ON public.profiles;
CREATE POLICY profiles_update_self_or_superadmin ON public.profiles
FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND (
    id = auth.uid()
    OR public.is_superadmin()
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    id = auth.uid()
    OR public.is_superadmin()
  )
);

DROP POLICY IF EXISTS profiles_insert_superadmin_only ON public.profiles;
CREATE POLICY profiles_insert_superadmin_only ON public.profiles
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND public.is_superadmin());

DROP POLICY IF EXISTS profiles_delete_superadmin_only ON public.profiles;
CREATE POLICY profiles_delete_superadmin_only ON public.profiles
FOR DELETE
USING (auth.uid() IS NOT NULL AND public.is_superadmin());

DROP POLICY IF EXISTS login_logs_insert_self_or_superadmin ON public.login_logs;
CREATE POLICY login_logs_insert_self_or_superadmin ON public.login_logs
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.is_superadmin()
    OR user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS login_logs_read_self_or_superadmin ON public.login_logs;
CREATE POLICY login_logs_read_self_or_superadmin ON public.login_logs
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_superadmin()
    OR user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS login_logs_delete_superadmin_only ON public.login_logs;
CREATE POLICY login_logs_delete_superadmin_only ON public.login_logs
FOR DELETE
USING (auth.uid() IS NOT NULL AND public.is_superadmin());

-- 9) Bootstrap known superadmin account (if auth user exists).
INSERT INTO public.profiles (id, email, role, company_id)
SELECT u.id, u.email, 'superadmin', NULL
FROM auth.users u
WHERE lower(u.email) = lower('kafedzic0@gmail.com')
ON CONFLICT (id) DO UPDATE
SET
  email = EXCLUDED.email,
  role = 'superadmin',
  company_id = NULL;

INSERT INTO public.profiles (id, email, role, company_id)
SELECT u.id, u.email, 'superadmin', NULL
FROM auth.users u
WHERE lower(u.email) = lower('testsuper@gmail.com')
ON CONFLICT (id) DO UPDATE
SET
  email = EXCLUDED.email,
  role = 'superadmin',
  company_id = NULL;
