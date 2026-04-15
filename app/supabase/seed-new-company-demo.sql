-- Demo seed for quick multi-tenant testing in a NEW company
-- Inserts:
-- - 1 company
-- - 3 stores
-- - 6 shifts
-- - 10 employees
-- - sample shift assignments for next 7 days
--
-- Safe to run multiple times: uses existence checks by (company_id + name/code/date).

BEGIN;

WITH target_company AS (
  INSERT INTO public.companies (name)
  SELECT 'Demo Firma Test'
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE lower(c.name) = lower('Demo Firma Test')
  )
  RETURNING id
),
company_ref AS (
  SELECT id FROM target_company
  UNION ALL
  SELECT c.id
  FROM public.companies c
  WHERE lower(c.name) = lower('Demo Firma Test')
  LIMIT 1
)
INSERT INTO public.stores (name, color, company_id)
SELECT s.name, s.color, cr.id
FROM company_ref cr
CROSS JOIN (
  VALUES
    ('Demo Centar', '#2563eb'),
    ('Demo Jug', '#16a34a'),
    ('Demo Sjever', '#f59e0b')
) AS s(name, color)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.stores st
  WHERE st.company_id = cr.id
    AND lower(st.name) = lower(s.name)
);

WITH company_ref AS (
  SELECT c.id
  FROM public.companies c
  WHERE lower(c.name) = lower('Demo Firma Test')
  LIMIT 1
),
store_ref AS (
  SELECT s.id, s.name
  FROM public.stores s
  JOIN company_ref c ON c.id = s.company_id
)
INSERT INTO public.shifts (name, code, start_time, end_time, break_minutes, store_id, is_global, company_id)
SELECT sh.name, sh.code, sh.start_time, sh.end_time, sh.break_minutes, sr.id, false, c.id
FROM company_ref c
JOIN store_ref sr ON TRUE
JOIN (
  VALUES
    ('Jutarnja', 'JUT', '06:00'::time, '14:00'::time, 30),
    ('Medju', 'MED', '10:00'::time, '18:00'::time, 30),
    ('Popodnevna', 'POP', '14:00'::time, '22:00'::time, 30),
    ('Nocna', 'NOC', '22:00'::time, '06:00'::time, 45),
    ('Kratka 1', 'KR1', '08:00'::time, '12:00'::time, 15),
    ('Kratka 2', 'KR2', '12:00'::time, '16:00'::time, 15)
) AS sh(name, code, start_time, end_time, break_minutes) ON TRUE
WHERE (
  (sh.code IN ('JUT', 'POP') AND sr.name = 'Demo Centar')
  OR (sh.code IN ('MED', 'KR1') AND sr.name = 'Demo Jug')
  OR (sh.code IN ('NOC', 'KR2') AND sr.name = 'Demo Sjever')
)
AND NOT EXISTS (
  SELECT 1
  FROM public.shifts sx
  WHERE sx.company_id = c.id
    AND sx.store_id = sr.id
    AND sx.code = sh.code
);

WITH company_ref AS (
  SELECT c.id
  FROM public.companies c
  WHERE lower(c.name) = lower('Demo Firma Test')
  LIMIT 1
),
store_ref AS (
  SELECT s.id, s.name
  FROM public.stores s
  JOIN company_ref c ON c.id = s.company_id
),
demo_employees AS (
  SELECT *
  FROM (
    VALUES
      ('Amar Hadzic', 'Demo Centar', 1),
      ('Lejla Kopic', 'Demo Centar', 2),
      ('Haris Nurkic', 'Demo Centar', 3),
      ('Mina Alic', 'Demo Jug', 4),
      ('Nedim Turcin', 'Demo Jug', 5),
      ('Sara Basic', 'Demo Jug', 6),
      ('Amina Salihovic', 'Demo Sjever', 7),
      ('Adnan Krvavac', 'Demo Sjever', 8),
      ('Ena Hodzic', 'Demo Sjever', 9),
      ('Kerim Zunic', 'Demo Centar', 10)
  ) AS e(name, store_name, sort_order)
)
INSERT INTO public.employees (
  name,
  employment_start_date,
  birth_date,
  is_active,
  sort_order,
  hourly_rate,
  store_id,
  company_id
)
SELECT
  de.name,
  CURRENT_DATE - ((de.sort_order * 7) || ' days')::interval,
  DATE '1990-01-01' + ((de.sort_order * 430) || ' days')::interval,
  true,
  de.sort_order,
  12 + de.sort_order,
  sr.id,
  c.id
FROM company_ref c
JOIN demo_employees de ON TRUE
JOIN store_ref sr ON lower(sr.name) = lower(de.store_name)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.employees ex
  WHERE ex.company_id = c.id
    AND lower(ex.name) = lower(de.name)
);

-- Optional: sample assignments for first 5 employees in next 7 days
WITH company_ref AS (
  SELECT c.id
  FROM public.companies c
  WHERE lower(c.name) = lower('Demo Firma Test')
  LIMIT 1
),
emps AS (
  SELECT e.id, e.name, e.store_id, row_number() OVER (ORDER BY e.sort_order NULLS LAST, e.name) AS rn
  FROM public.employees e
  JOIN company_ref c ON c.id = e.company_id
  ORDER BY e.sort_order NULLS LAST, e.name
  LIMIT 5
),
days AS (
  SELECT generate_series(CURRENT_DATE, CURRENT_DATE + INTERVAL '6 days', INTERVAL '1 day')::date AS d
),
shift_pick AS (
  SELECT s.id, s.store_id, s.code
  FROM public.shifts s
  JOIN company_ref c ON c.id = s.company_id
  WHERE s.code IN ('JUT', 'POP', 'MED', 'NOC', 'KR1', 'KR2')
),
to_insert AS (
  SELECT
    e.id AS employee_id,
    d.d AS date,
    sp.id AS shift_id,
    e.store_id AS store_id
  FROM emps e
  JOIN days d ON TRUE
  JOIN LATERAL (
    SELECT sp2.id
    FROM shift_pick sp2
    WHERE sp2.store_id = e.store_id
    ORDER BY
      CASE ((extract(dow FROM d.d)::int + e.rn) % 3)
        WHEN 0 THEN CASE WHEN sp2.code IN ('JUT', 'MED', 'KR1') THEN 0 ELSE 1 END
        WHEN 1 THEN CASE WHEN sp2.code IN ('POP', 'KR2') THEN 0 ELSE 1 END
        ELSE CASE WHEN sp2.code = 'NOC' THEN 0 ELSE 1 END
      END,
      sp2.code
    LIMIT 1
  ) sp ON TRUE
)
INSERT INTO public.shift_assignments (employee_id, date, shift_id, store_id, company_id)
SELECT t.employee_id, t.date, t.shift_id, t.store_id, c.id
FROM to_insert t
JOIN company_ref c ON TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM public.shift_assignments sa
  WHERE sa.company_id = c.id
    AND sa.employee_id = t.employee_id
    AND sa.date = t.date
);

COMMIT;
