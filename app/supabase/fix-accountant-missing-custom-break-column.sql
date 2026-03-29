-- Run this ONCE in Supabase SQL Editor if Buchhalter / RPC fails with:
--   column sa.custom_break_minutes does not exist
--
-- Then re-run: function-calculate-employee-hours.sql (full file)

ALTER TABLE public.shift_assignments
  ADD COLUMN IF NOT EXISTS custom_break_minutes integer;

COMMENT ON COLUMN public.shift_assignments.custom_break_minutes IS
  'Per-day pause override; NULL uses shifts.break_minutes.';

NOTIFY pgrst, 'reload schema';
