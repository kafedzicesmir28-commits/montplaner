-- Allow multiple shift assignments for the same employee and date.
-- Run once on existing databases.

ALTER TABLE public.shift_assignments
  DROP CONSTRAINT IF EXISTS shift_assignments_employee_id_date_key;

-- Keep read performance for planner/range lookups.
CREATE INDEX IF NOT EXISTS idx_shift_assignments_employee_date
  ON public.shift_assignments (employee_id, date);
