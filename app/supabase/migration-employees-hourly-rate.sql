-- Optional hourly rate for reports / cost estimates (EUR or your local unit in UI).
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS hourly_rate numeric(12, 2);

COMMENT ON COLUMN employees.hourly_rate IS 'Optional gross hourly rate for estimated payroll in reports.';
