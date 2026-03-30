-- Add default store assignment for employees (planner grouping by store).
-- Safe to re-run.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS employees_store_id_idx ON public.employees (store_id);

COMMENT ON COLUMN public.employees.store_id IS
  'Default home store for planner grouping. Shift assignments can still set store per day.';
