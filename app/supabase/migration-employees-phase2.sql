-- Employees Phase 2 migration
-- Adds employment dates, active status, and manual ordering support.

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

CREATE INDEX IF NOT EXISTS idx_employees_sort_order ON employees(sort_order, name);
