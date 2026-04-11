-- Phase: migrate existing rows to default company (preserves all rows; only fills NULL company_id).
-- Run once in Supabase SQL Editor after migration-multi-tenant-base.sql.
-- If INSERT fails on unknown column "email", run migration-profiles-email.sql first.
-- Planner rows live in public.shift_assignments (no separate "planner" table).

DO $$
DECLARE
  default_company_id uuid;
  admin_user_id uuid;
BEGIN
  -- STEP 1 — default company (reuse if name already exists)
  SELECT c.id
  INTO default_company_id
  FROM public.companies c
  WHERE c.name = 'Default Company'
  ORDER BY c.created_at ASC
  LIMIT 1;

  IF default_company_id IS NULL THEN
    INSERT INTO public.companies (name)
    VALUES ('Default Company')
    RETURNING id INTO default_company_id;
  END IF;

  -- STEP 2 — link admin@gmail.com to that company
  SELECT u.id
  INTO admin_user_id
  FROM auth.users u
  WHERE lower(u.email) = lower('admin@gmail.com')
  LIMIT 1;

  IF admin_user_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, company_id, role, created_at, email)
    VALUES (
      admin_user_id,
      default_company_id,
      'admin',
      now(),
      (SELECT u.email FROM auth.users u WHERE u.id = admin_user_id)
    )
    ON CONFLICT (id) DO UPDATE SET
      company_id = EXCLUDED.company_id,
      role = EXCLUDED.role,
      email = COALESCE(public.profiles.email, EXCLUDED.email),
      created_at = public.profiles.created_at;
  ELSE
    RAISE WARNING 'No auth.users row for admin@gmail.com — profile not created. Data backfill still runs.';
  END IF;

  -- STEP 3 — assign tenant only where still NULL (never overwrites a chosen company)
  UPDATE public.employees SET company_id = default_company_id WHERE company_id IS NULL;
  UPDATE public.vacations SET company_id = default_company_id WHERE company_id IS NULL;
  UPDATE public.shift_assignments SET company_id = default_company_id WHERE company_id IS NULL;
  UPDATE public.stores SET company_id = default_company_id WHERE company_id IS NULL;
  UPDATE public.shifts SET company_id = default_company_id WHERE company_id IS NULL;

  RAISE NOTICE 'default_company_id=% admin_user_id=%', default_company_id, admin_user_id;
END $$;
