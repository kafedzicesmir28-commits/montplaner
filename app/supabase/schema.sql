-- Employee Shift Planning Database Schema
-- Run this SQL in your Supabase SQL Editor
-- WARNING: Not the canonical path for multi-tenant + superadmin hardening.
-- Use app/supabase/migration-multi-tenant-superadmin.sql (see CANONICAL_SETUP.md).

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Employees table
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  employment_start_date DATE,
  birth_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Stores table
CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL
);

-- Shifts table
CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_minutes INTEGER DEFAULT 0
);

-- Shift assignments table
CREATE TABLE IF NOT EXISTS shift_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  UNIQUE(employee_id, date)
);

-- Vacations table
CREATE TABLE IF NOT EXISTS vacations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  CHECK (end_date >= start_date)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_shift_assignments_employee_date ON shift_assignments(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_date ON shift_assignments(date);
CREATE INDEX IF NOT EXISTS idx_vacations_employee ON vacations(employee_id);
CREATE INDEX IF NOT EXISTS idx_vacations_dates ON vacations(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_employees_sort_order ON employees(sort_order, name);

-- Planner Phase 1: store colors + optional per-cell times (idempotent; fixes PGRST204 if missing)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE shift_assignments
  ADD COLUMN IF NOT EXISTS custom_start_time time,
  ADD COLUMN IF NOT EXISTS custom_end_time time;

-- Planner Phase 2: store-dependent shifts + global shifts
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_global boolean NOT NULL DEFAULT false;

-- Planner Phase 3: status assignments independent from shifts/stores
ALTER TABLE shift_assignments
  ADD COLUMN IF NOT EXISTS assignment_type text NOT NULL DEFAULT 'SHIFT';

ALTER TABLE shift_assignments
  ALTER COLUMN shift_id DROP NOT NULL,
  ALTER COLUMN store_id DROP NOT NULL;

-- Employees Phase 2: HR details + active status + manual ordering
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

-- Reports: optional hourly rate for cost estimates
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS hourly_rate numeric(12, 2);

-- Enable Row Level Security (RLS)
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE vacations ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users (adjust based on your auth requirements)
-- For now, allow all operations for authenticated users
-- You can refine these policies based on your specific needs

-- Drop existing policies if they exist (for re-running the script)
DROP POLICY IF EXISTS "Allow all for authenticated users" ON employees;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON stores;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON shifts;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON shift_assignments;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON vacations;

-- Employees policies
CREATE POLICY "Allow all for authenticated users" ON employees
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Stores policies
CREATE POLICY "Allow all for authenticated users" ON stores
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Shifts policies
CREATE POLICY "Allow all for authenticated users" ON shifts
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Shift assignments policies
CREATE POLICY "Allow all for authenticated users" ON shift_assignments
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Vacations policies
CREATE POLICY "Allow all for authenticated users" ON vacations
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ---------------------------------------------------------------------------
-- Multi-tenant: companies + profiles (required by the app; see migration-multi-tenant-base.sql)
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

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.companies;
CREATE POLICY "Allow all for authenticated users" ON public.companies
  FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.profiles;
CREATE POLICY "Allow all for authenticated users" ON public.profiles
  FOR ALL USING (auth.uid() IS NOT NULL);
