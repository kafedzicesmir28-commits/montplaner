-- ============================================================================
-- Sync database with current project schema (NO data removal)
-- ============================================================================
-- WARNING: Legacy sync helper only. Not canonical for multi-tenant + superadmin hardening.
-- Use app/supabase/migration-multi-tenant-superadmin.sql (see CANONICAL_SETUP.md).
-- Safe to re-run in Supabase SQL Editor. Uses IF NOT EXISTS / IF EXISTS /
-- ADD COLUMN IF NOT EXISTS / DROP POLICY IF EXISTS + CREATE POLICY.
--
-- Does NOT: DROP TABLE, TRUNCATE, DELETE rows.
-- Note: DROP POLICY only removes RLS policy objects (not row data).
-- Note: calculate_employee_hours section DROPs old function overloads only.
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Core tables (create only if missing; never drop)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  employment_start_date DATE,
  birth_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_minutes INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS shift_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  UNIQUE(employee_id, date)
);

CREATE TABLE IF NOT EXISTS vacations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_shift_assignments_employee_date ON shift_assignments(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_date ON shift_assignments(date);
CREATE INDEX IF NOT EXISTS idx_vacations_employee ON vacations(employee_id);
CREATE INDEX IF NOT EXISTS idx_vacations_dates ON vacations(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_employees_sort_order ON employees(sort_order, name);

-- Planner Phase 1
ALTER TABLE stores ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE shift_assignments
  ADD COLUMN IF NOT EXISTS custom_start_time time,
  ADD COLUMN IF NOT EXISTS custom_end_time time;

-- Planner Phase 2
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_global boolean NOT NULL DEFAULT false;

-- Planner Phase 3
ALTER TABLE shift_assignments
  ADD COLUMN IF NOT EXISTS assignment_type text NOT NULL DEFAULT 'SHIFT';

ALTER TABLE shift_assignments
  ALTER COLUMN shift_id DROP NOT NULL,
  ALTER COLUMN store_id DROP NOT NULL;

-- Employees Phase 2 columns (idempotent)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS employment_start_date date,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order integer;

UPDATE employees
SET sort_order = src.seq
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name ASC) AS seq
  FROM employees
) AS src
WHERE employees.id = src.id
  AND employees.sort_order IS NULL;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS hourly_rate numeric(12, 2);

-- Default store on employees (from migration-employees-store-id.sql)
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS employees_store_id_idx ON public.employees (store_id);

COMMENT ON COLUMN public.employees.store_id IS
  'Default home store for planner grouping. Shift assignments can still set store per day.';

-- Buchhalter / RPC: per-day break override (from fix-accountant-missing-custom-break-column.sql)
ALTER TABLE public.shift_assignments
  ADD COLUMN IF NOT EXISTS custom_break_minutes integer;

COMMENT ON COLUMN public.shift_assignments.custom_break_minutes IS
  'Per-day pause override; NULL uses shifts.break_minutes.';

-- ---------------------------------------------------------------------------
-- Multi-tenant (from schema.sql tail)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies (id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('admin', 'user', 'superadmin')),
  email text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT profiles_company_id_required_non_superadmin CHECK (role = 'superadmin' OR company_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS profiles_company_id_idx ON public.profiles (company_id);

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL;
ALTER TABLE public.vacations
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL;
ALTER TABLE public.shift_assignments
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL;
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL;
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS employees_company_id_idx ON public.employees (company_id);
CREATE INDEX IF NOT EXISTS vacations_company_id_idx ON public.vacations (company_id);
CREATE INDEX IF NOT EXISTS shift_assignments_company_id_idx ON public.shift_assignments (company_id);
CREATE INDEX IF NOT EXISTS stores_company_id_idx ON public.stores (company_id);
CREATE INDEX IF NOT EXISTS shifts_company_id_idx ON public.shifts (company_id);

-- ---------------------------------------------------------------------------
-- RLS + policies (metadata only)
-- ---------------------------------------------------------------------------
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE vacations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated users" ON employees;
CREATE POLICY "Allow all for authenticated users" ON employees
  FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Allow all for authenticated users" ON stores;
CREATE POLICY "Allow all for authenticated users" ON stores
  FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Allow all for authenticated users" ON shifts;
CREATE POLICY "Allow all for authenticated users" ON shifts
  FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Allow all for authenticated users" ON shift_assignments;
CREATE POLICY "Allow all for authenticated users" ON shift_assignments
  FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Allow all for authenticated users" ON vacations;
CREATE POLICY "Allow all for authenticated users" ON vacations
  FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.companies;
CREATE POLICY "Allow all for authenticated users" ON public.companies
  FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.profiles;
CREATE POLICY "Allow all for authenticated users" ON public.profiles
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ---------------------------------------------------------------------------
-- RPC: calculate_employee_hours (replaces function only; no table data change)
-- From function-calculate-employee-hours.sql
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.calculate_employee_hours(date, uuid);
DROP FUNCTION IF EXISTS public.calculate_employee_hours(uuid, date);
DROP FUNCTION IF EXISTS public.calculate_employee_hours(jsonb);

CREATE OR REPLACE FUNCTION public.calculate_employee_hours(jsonb)
RETURNS TABLE (
  normal_hours numeric,
  night_hours numeric,
  sunday_hours numeric,
  vacation_days integer,
  sick_days integer,
  total_hours numeric
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  p_employee_id uuid := ($1->>'p_employee_id')::uuid;
  p_month date := ($1->>'p_month')::date;
  v_month_start date;
  v_month_end date;
  v_effective numeric := 0;
  v_night numeric := 0;
  v_sunday numeric := 0;
  v_vacation_days int := 0;
  v_sick_days int := 0;
  rec record;
  v_start time;
  v_end time;
  d_start timestamp;
  d_end timestamp;
  raw_minutes int;
  work_minutes int;
  night_minutes int;
  t timestamp;
  mins_from_midnight int;
  dur numeric;
  effective_minutes int;
  sunday_minutes int;
  scale_factor numeric;
  effective_part numeric;
  night_part numeric;
  sunday_part numeric;
  minute_ts timestamp;
  minute_of_day int;
  minute_is_sunday boolean;
BEGIN
  IF p_employee_id IS NULL OR p_month IS NULL THEN
    RAISE EXCEPTION 'p_employee_id and p_month are required';
  END IF;

  v_month_start := date_trunc('month', p_month)::date;
  v_month_end := (v_month_start + interval '1 month - 1 day')::date;

  SELECT COALESCE(COUNT(*), 0)::int INTO v_vacation_days
  FROM (
    SELECT gs.day::date AS d
    FROM generate_series(v_month_start, v_month_end, interval '1 day') AS gs(day)
    WHERE EXISTS (
      SELECT 1
      FROM public.vacations v
      WHERE v.employee_id = p_employee_id
        AND gs.day BETWEEN v.start_date AND v.end_date
    )
    UNION
    SELECT sa.date AS d
    FROM public.shift_assignments sa
    WHERE sa.employee_id = p_employee_id
      AND sa.date BETWEEN v_month_start AND v_month_end
      AND COALESCE(sa.assignment_type, 'SHIFT') = 'FERIEN'
  ) u;

  SELECT COALESCE(COUNT(DISTINCT sa.date), 0)::int INTO v_sick_days
  FROM public.shift_assignments sa
  LEFT JOIN public.shifts s ON s.id = sa.shift_id
  WHERE sa.employee_id = p_employee_id
    AND sa.date BETWEEN v_month_start AND v_month_end
    AND (
      COALESCE(sa.assignment_type, 'SHIFT') = 'KRANK'
      OR s.name ~* '(^|[^[:alpha:]])krank([^[:alpha:]]|$)'
    );

  FOR rec IN
    SELECT
      sa.date AS adate,
      sa.custom_start_time,
      sa.custom_end_time,
      s.start_time AS st_start,
      s.end_time AS st_end,
      COALESCE(sa.custom_break_minutes, s.break_minutes, 0)::int AS break_minutes,
      s.name AS shift_name
    FROM public.shift_assignments sa
    INNER JOIN public.shifts s ON s.id = sa.shift_id
    WHERE sa.employee_id = p_employee_id
      AND sa.date BETWEEN v_month_start AND v_month_end
      AND COALESCE(sa.assignment_type, 'SHIFT') = 'SHIFT'
  LOOP
    v_start := COALESCE(NULLIF(rec.custom_start_time::text, '')::time, rec.st_start);
    v_end := COALESCE(NULLIF(rec.custom_end_time::text, '')::time, rec.st_end);

    d_start := rec.adate + v_start::interval;
    IF v_end <= v_start THEN
      d_end := rec.adate + interval '1 day' + v_end::interval;
    ELSE
      d_end := rec.adate + v_end::interval;
    END IF;

    raw_minutes := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (d_end - d_start)) / 60.0))::int;
    work_minutes := GREATEST(0, raw_minutes - rec.break_minutes);

    night_minutes := 0;
    sunday_minutes := 0;
    effective_minutes := 0;
    IF raw_minutes > 0 THEN
      t := d_start;
      WHILE t < d_end LOOP
        minute_ts := t;
        minute_of_day := EXTRACT(HOUR FROM minute_ts)::int * 60 + EXTRACT(MINUTE FROM minute_ts)::int;
        minute_is_sunday := EXTRACT(ISODOW FROM minute_ts) = 7;
        IF minute_is_sunday THEN
          sunday_minutes := sunday_minutes + 1;
        ELSIF minute_of_day >= 20 * 60 OR minute_of_day < 6 * 60 THEN
          night_minutes := night_minutes + 1;
        ELSE
          effective_minutes := effective_minutes + 1;
        END IF;
        t := t + interval '1 minute';
      END LOOP;
    END IF;

    dur := raw_minutes::numeric;
    scale_factor := CASE WHEN dur > 0 THEN work_minutes::numeric / dur ELSE 0 END;
    effective_part := (effective_minutes::numeric / 60.0) * scale_factor;
    night_part := (night_minutes::numeric / 60.0) * scale_factor;
    sunday_part := (sunday_minutes::numeric / 60.0) * scale_factor;

    v_effective := v_effective + effective_part;
    v_night := v_night + night_part;
    v_sunday := v_sunday + sunday_part;
  END LOOP;

  normal_hours := round(v_effective, 4);
  night_hours := round(v_night, 4);
  sunday_hours := round(v_sunday, 4);
  vacation_days := v_vacation_days;
  sick_days := v_sick_days;
  total_hours := round(v_effective + v_night + v_sunday, 4);
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.calculate_employee_hours(jsonb) IS
  'Hours for one employee in calendar month. Night = 20:00–06:00. RPC body: {"p_employee_id":"uuid","p_month":"YYYY-MM-DD"}.';

GRANT EXECUTE ON FUNCTION public.calculate_employee_hours(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_employee_hours(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.calculate_employee_hours(jsonb) TO anon;

NOTIFY pgrst, 'reload schema';
