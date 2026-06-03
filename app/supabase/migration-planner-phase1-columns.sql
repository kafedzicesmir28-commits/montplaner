-- Run once in Supabase Dashboard → SQL Editor (fixes PGRST204: custom_* not in schema cache)
-- Safe to re-run.

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS color text;

ALTER TABLE public.shift_assignments
  ADD COLUMN IF NOT EXISTS custom_start_time time,
  ADD COLUMN IF NOT EXISTS custom_end_time time;
