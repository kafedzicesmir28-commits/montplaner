-- Fix legacy/broken store triggers that reference NEW.employee_id.
-- Error symptom: "record \"new\" has no field \"employee_id\"" when updating stores.

DO $$
DECLARE
  trg record;
BEGIN
  -- Remove any non-internal trigger on public.stores whose function body references NEW.employee_id.
  FOR trg IN
    SELECT t.tgname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE n.nspname = 'public'
      AND c.relname = 'stores'
      AND NOT t.tgisinternal
      AND pg_get_functiondef(p.oid) ILIKE '%new.employee_id%'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.stores', trg.tgname);
  END LOOP;
END
$$;

-- Canonical tenant-company trigger function (safe for stores).
CREATE OR REPLACE FUNCTION public.apply_tenant_company_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  actor_company uuid;
  actor_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.company_id, p.role
  INTO actor_company, actor_role
  FROM public.profiles p
  WHERE p.id = auth.uid()
  LIMIT 1;

  IF actor_role IS NULL THEN
    RAISE EXCEPTION 'Missing profile for current user';
  END IF;

  IF actor_role = 'superadmin' THEN
    RETURN NEW;
  END IF;

  NEW.company_id := actor_company;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stores_apply_company ON public.stores;
CREATE TRIGGER trg_stores_apply_company
BEFORE INSERT OR UPDATE ON public.stores
FOR EACH ROW
EXECUTE FUNCTION public.apply_tenant_company_id();
