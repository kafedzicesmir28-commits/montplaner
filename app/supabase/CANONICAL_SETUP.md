# Canonical DB setup (multi-tenant + superadmin hardening)

This is the only supported migration/setup path for environments that must keep multi-tenant isolation and superadmin security.

## Canonical path

1. Open Supabase SQL Editor.
2. Run `app/supabase/migration-multi-tenant-superadmin.sql` as a single script.
3. Verify the migration by running these checks:

```sql
-- Expected: all counts should be 0
select count(*) as rows_without_company from public.employees where company_id is null
union all
select count(*) from public.shifts where company_id is null
union all
select count(*) from public.stores where company_id is null
union all
select count(*) from public.shift_assignments where company_id is null
union all
select count(*) from public.vacations where company_id is null;

-- Expected: strict company isolation policies exist
select policyname
from pg_policies
where schemaname = 'public'
  and tablename in ('employees', 'stores', 'shifts', 'shift_assignments', 'vacations', 'companies', 'profiles', 'login_logs')
order by tablename, policyname;
```

## Important

- Do not use `schema.sql`, `schema-minimal.sql`, or `sync-schema-safe-no-data-loss.sql` for production or shared environments.
- Those files can reintroduce permissive `Allow all for authenticated users` policies and weaken tenant isolation.
- If you are setting up a fresh production-like database, run only the canonical migration file above.

## Superadmin bootstrap

`migration-multi-tenant-superadmin.sql` currently contains bootstrap inserts for specific emails. Treat this as legacy bootstrap logic and replace it with your own controlled one-time procedure before production rollout.
