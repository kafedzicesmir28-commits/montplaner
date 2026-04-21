-- MINIMAL SETUP - Copy this entire file to Supabase SQL Editor and run it
-- This creates all required tables for the Employee Shift Planner
-- WARNING: Legacy/minimal path only. Not canonical for multi-tenant + superadmin hardening.
-- Use app/supabase/migration-multi-tenant-superadmin.sql (see CANONICAL_SETUP.md).

-- Step 1: Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Step 2: Create tables
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  employment_start_date DATE,
  birth_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER,
  hourly_rate NUMERIC(12, 2),
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

-- Step 3: Create indexes
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

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS hourly_rate numeric(12, 2);

-- Step 4: Enable Row Level Security
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE vacations ENABLE ROW LEVEL SECURITY;

-- Step 5: Create security policies (drop old ones first)
DROP POLICY IF EXISTS "Allow all for authenticated users" ON employees;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON stores;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON shifts;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON shift_assignments;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON vacations;

CREATE POLICY "Allow all for authenticated users" ON employees
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Allow all for authenticated users" ON stores
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Allow all for authenticated users" ON shifts
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Allow all for authenticated users" ON shift_assignments
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Allow all for authenticated users" ON vacations
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ✅ DONE! You should see "Success. No rows returned" message
-- Now verify tables exist in Table Editor
