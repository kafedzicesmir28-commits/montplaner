-- Planner seed za firmu gdje je zaposlenik "Vaska Grujik"
-- Period: sedmice 14-17 (2026-03-30 do 2026-04-26)
-- Ukljucuje:
-- 1) ciscenje postojecih assignmenta za isti period + zaposlenike
-- 2) insert/upsert assignmenta iz planera sa slika
-- 3) verifikacijske SELECT upite

BEGIN;

WITH target_company AS (
  SELECT e.company_id
  FROM public.employees e
  WHERE LOWER(e.name) LIKE '%vaska%' AND LOWER(e.name) LIKE '%grujik%'
  LIMIT 1
),
store_map AS (
  SELECT
    tc.company_id,
    (
      SELECT s1.id
      FROM public.stores s1
      WHERE s1.company_id = tc.company_id
        AND LOWER(s1.name) LIKE '%schwam%'
      ORDER BY s1.created_at DESC NULLS LAST
      LIMIT 1
    ) AS sw_store_id,
    (
      SELECT s2.id
      FROM public.stores s2
      WHERE s2.company_id = tc.company_id
        AND LOWER(s2.name) LIKE '%sihl%'
      ORDER BY s2.created_at DESC NULLS LAST
      LIMIT 1
    ) AS sc_store_id
  FROM target_company tc
),
ensure_custom_shifts AS (
  INSERT INTO public.shifts (
    company_id, store_id, name, code, start_time, end_time, break_minutes, is_global
  )
  SELECT sm.company_id, sm.sw_store_id, 'PLANER-CUSTOM-SW', 'CUSTOM_SW', '07:00', '14:00', 0, false
  FROM store_map sm
  WHERE sm.sw_store_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.shifts sh
      WHERE sh.company_id = sm.company_id
        AND sh.store_id = sm.sw_store_id
        AND sh.code = 'CUSTOM_SW'
    )
  UNION ALL
  SELECT sm.company_id, sm.sc_store_id, 'PLANER-CUSTOM-SC', 'CUSTOM_SC', '07:30', '14:30', 0, false
  FROM store_map sm
  WHERE sm.sc_store_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.shifts sh
      WHERE sh.company_id = sm.company_id
        AND sh.store_id = sm.sc_store_id
        AND sh.code = 'CUSTOM_SC'
    )
  RETURNING id
),
shift_map AS (
  SELECT
    sm.company_id,
    sm.sw_store_id,
    sm.sc_store_id,
    (
      SELECT sh.id
      FROM public.shifts sh
      WHERE sh.company_id = sm.company_id
        AND sh.store_id = sm.sw_store_id
      ORDER BY (sh.code = 'CUSTOM_SW') DESC, sh.created_at DESC NULLS LAST
      LIMIT 1
    ) AS sw_shift_id,
    (
      SELECT sh.id
      FROM public.shifts sh
      WHERE sh.company_id = sm.company_id
        AND sh.store_id = sm.sc_store_id
      ORDER BY (sh.code = 'CUSTOM_SC') DESC, sh.created_at DESC NULLS LAST
      LIMIT 1
    ) AS sc_shift_id
  FROM store_map sm
),
emp AS (
  SELECT e.id, e.name, e.company_id
  FROM public.employees e
  JOIN target_company tc ON tc.company_id = e.company_id
  WHERE e.name IN (
    'Vaska Grujik',
    'Melanie Walder',
    'Ange Njako',
    'Samanta Domenig',
    'Gerry Graf',
    'Egzona Nuhiji'
  )
),
raw_data(employee_name, work_date, store_code, start_t, end_t) AS (
  VALUES
    -- W14 (30.03-05.04)
    ('Vaska Grujik','2026-03-31','SW','07:00','11:00'),
    ('Vaska Grujik','2026-04-01','SW','07:00','14:00'),
    ('Vaska Grujik','2026-04-02','SW','07:00','14:00'),
    ('Vaska Grujik','2026-03-30','SC','07:00','13:00'),

    ('Melanie Walder','2026-03-30','SC','07:00','14:00'),
    ('Melanie Walder','2026-04-04','SC','07:00','14:00'),

    ('Ange Njako','2026-03-31','SW','14:00','19:00'),
    ('Ange Njako','2026-04-02','SW','14:00','19:10'),
    ('Ange Njako','2026-04-04','SW','14:00','19:10'),

    ('Samanta Domenig','2026-03-30','SW','14:00','19:00'),
    ('Samanta Domenig','2026-04-01','SW','14:00','19:00'),
    ('Samanta Domenig','2026-04-04','SW','13:30','20:15'),

    ('Gerry Graf','2026-03-31','SC','07:30','14:30'),
    ('Gerry Graf','2026-04-01','SC','07:30','14:30'),
    ('Gerry Graf','2026-04-02','SC','07:30','14:30'),
    ('Gerry Graf','2026-04-04','SC','08:30','15:30'),

    ('Egzona Nuhiji','2026-03-30','SC','13:00','20:15'),
    ('Egzona Nuhiji','2026-03-31','SC','14:00','20:15'),
    ('Egzona Nuhiji','2026-04-01','SC','14:00','20:15'),
    ('Egzona Nuhiji','2026-04-02','SC','14:00','20:15'),

    -- W15 (06.04-12.04)
    ('Vaska Grujik','2026-04-06','SW','07:00','14:00'),
    ('Vaska Grujik','2026-04-07','SW','07:00','14:00'),
    ('Vaska Grujik','2026-04-08','SW','07:00','11:00'),
    ('Vaska Grujik','2026-04-09','SW','07:00','11:00'),
    ('Vaska Grujik','2026-04-10','SW','07:00','11:00'),

    ('Melanie Walder','2026-04-07','SC','14:00','19:10'),
    ('Melanie Walder','2026-04-08','SC','14:00','19:10'),
    ('Melanie Walder','2026-04-09','SC','14:00','19:10'),

    ('Ange Njako','2026-04-08','SW','14:00','19:00'),
    ('Ange Njako','2026-04-09','SW','14:00','19:00'),
    ('Ange Njako','2026-04-10','SW','14:15','20:15'),

    ('Samanta Domenig','2026-04-09','SW','14:00','19:00'),
    ('Samanta Domenig','2026-04-10','SW','14:00','19:00'),
    ('Samanta Domenig','2026-04-11','SW','14:15','20:15'),

    ('Gerry Graf','2026-04-06','SC','07:30','14:30'),
    ('Gerry Graf','2026-04-07','SC','07:30','14:30'),
    ('Gerry Graf','2026-04-08','SC','07:30','14:30'),
    ('Gerry Graf','2026-04-09','SC','07:30','14:30'),
    ('Gerry Graf','2026-04-10','SC','07:30','14:30'),

    ('Egzona Nuhiji','2026-04-06','SC','14:15','20:15'),
    ('Egzona Nuhiji','2026-04-07','SC','14:15','20:15'),
    ('Egzona Nuhiji','2026-04-08','SC','14:15','20:15'),
    ('Egzona Nuhiji','2026-04-09','SC','14:15','20:15'),
    ('Egzona Nuhiji','2026-04-10','SC','14:15','20:15'),

    -- W16 (13.04-19.04)
    ('Vaska Grujik','2026-04-14','SW','07:00','14:00'),
    ('Vaska Grujik','2026-04-15','SW','07:00','14:00'),
    ('Vaska Grujik','2026-04-16','SW','07:00','14:00'),
    ('Vaska Grujik','2026-04-17','SW','07:00','11:00'),
    ('Vaska Grujik','2026-04-18','SW','14:00','19:00'),
    ('Vaska Grujik','2026-04-13','SC','07:00','13:00'),

    ('Melanie Walder','2026-04-13','SC','07:00','14:00'),
    ('Melanie Walder','2026-04-17','SC','14:00','19:00'),
    ('Melanie Walder','2026-04-18','SC','14:00','19:00'),

    ('Ange Njako','2026-04-13','SW','14:00','19:00'),
    ('Ange Njako','2026-04-14','SW','14:00','19:00'),
    ('Ange Njako','2026-04-15','SW','14:00','19:00'),

    ('Samanta Domenig','2026-04-16','SW','14:00','19:00'),
    ('Samanta Domenig','2026-04-18','SW','14:15','20:15'),

    ('Gerry Graf','2026-04-14','SC','07:30','14:30'),
    ('Gerry Graf','2026-04-15','SC','07:30','14:30'),
    ('Gerry Graf','2026-04-16','SC','07:30','14:30'),
    ('Gerry Graf','2026-04-17','SC','07:30','14:30'),
    ('Gerry Graf','2026-04-18','SC','08:30','15:30'),

    ('Egzona Nuhiji','2026-04-13','SC','13:00','20:15'),
    ('Egzona Nuhiji','2026-04-14','SC','14:15','20:15'),
    ('Egzona Nuhiji','2026-04-15','SC','14:15','20:15'),
    ('Egzona Nuhiji','2026-04-16','SC','14:15','20:15'),
    ('Egzona Nuhiji','2026-04-18','SC','13:30','20:15'),

    -- W17 (20.04-26.04)
    ('Vaska Grujik','2026-04-21','SW','07:00','14:00'),
    ('Vaska Grujik','2026-04-22','SW','07:00','14:00'),
    ('Vaska Grujik','2026-04-23','SW','07:00','14:00'),
    ('Vaska Grujik','2026-04-24','SW','07:00','11:00'),
    ('Vaska Grujik','2026-04-25','SW','14:00','19:00'),
    ('Vaska Grujik','2026-04-20','SC','07:00','13:00'),

    ('Melanie Walder','2026-04-20','SC','07:00','14:00'),
    ('Melanie Walder','2026-04-24','SC','14:00','19:10'),
    ('Melanie Walder','2026-04-25','SC','14:00','19:10'),

    ('Ange Njako','2026-04-22','SW','08:00','14:00'),
    ('Ange Njako','2026-04-24','SW','14:15','20:15'),
    ('Ange Njako','2026-04-25','SW','15:00','20:15'),

    ('Samanta Domenig','2026-04-20','SW','14:00','19:10'),
    ('Samanta Domenig','2026-04-21','SW','14:00','19:10'),
    ('Samanta Domenig','2026-04-22','SW','14:00','19:00'),
    ('Samanta Domenig','2026-04-23','SW','14:00','19:00'),

    ('Gerry Graf','2026-04-21','SC','07:30','14:30'),
    ('Gerry Graf','2026-04-22','SC','07:30','14:30'),
    ('Gerry Graf','2026-04-23','SC','07:30','14:30'),
    ('Gerry Graf','2026-04-24','SC','07:30','14:30'),
    ('Gerry Graf','2026-04-25','SC','08:30','15:30'),

    ('Egzona Nuhiji','2026-04-20','SC','13:00','20:15'),
    ('Egzona Nuhiji','2026-04-21','SC','14:15','20:15'),
    ('Egzona Nuhiji','2026-04-22','SC','14:15','20:15'),
    ('Egzona Nuhiji','2026-04-23','SC','14:00','20:15')
),
final_rows AS (
  SELECT
    em.company_id,
    em.id AS employee_id,
    rd.work_date::date AS date,
    'SHIFT'::text AS assignment_type,
    CASE WHEN rd.store_code = 'SW' THEN sm.sw_shift_id ELSE sm.sc_shift_id END AS shift_id,
    CASE WHEN rd.store_code = 'SW' THEN sm.sw_store_id ELSE sm.sc_store_id END AS store_id,
    rd.start_t::time AS custom_start_time,
    rd.end_t::time AS custom_end_time,
    0::int AS custom_break_minutes
  FROM raw_data rd
  JOIN emp em ON em.name = rd.employee_name
  JOIN shift_map sm ON sm.company_id = em.company_id
)
DELETE FROM public.shift_assignments sa
USING emp e
WHERE sa.employee_id = e.id
  AND sa.date BETWEEN DATE '2026-03-30' AND DATE '2026-04-26';

WITH target_company AS (
  SELECT e.company_id
  FROM public.employees e
  WHERE LOWER(e.name) LIKE '%vaska%' AND LOWER(e.name) LIKE '%grujik%'
  LIMIT 1
),
store_map AS (
  SELECT
    tc.company_id,
    (
      SELECT s1.id
      FROM public.stores s1
      WHERE s1.company_id = tc.company_id
        AND LOWER(s1.name) LIKE '%schwam%'
      ORDER BY s1.created_at DESC NULLS LAST
      LIMIT 1
    ) AS sw_store_id,
    (
      SELECT s2.id
      FROM public.stores s2
      WHERE s2.company_id = tc.company_id
        AND LOWER(s2.name) LIKE '%sihl%'
      ORDER BY s2.created_at DESC NULLS LAST
      LIMIT 1
    ) AS sc_store_id
  FROM target_company tc
),
shift_map AS (
  SELECT
    sm.company_id,
    sm.sw_store_id,
    sm.sc_store_id,
    (
      SELECT sh.id
      FROM public.shifts sh
      WHERE sh.company_id = sm.company_id
        AND sh.store_id = sm.sw_store_id
      ORDER BY (sh.code = 'CUSTOM_SW') DESC, sh.created_at DESC NULLS LAST
      LIMIT 1
    ) AS sw_shift_id,
    (
      SELECT sh.id
      FROM public.shifts sh
      WHERE sh.company_id = sm.company_id
        AND sh.store_id = sm.sc_store_id
      ORDER BY (sh.code = 'CUSTOM_SC') DESC, sh.created_at DESC NULLS LAST
      LIMIT 1
    ) AS sc_shift_id
  FROM store_map sm
),
emp AS (
  SELECT e.id, e.name, e.company_id
  FROM public.employees e
  JOIN target_company tc ON tc.company_id = e.company_id
  WHERE e.name IN (
    'Vaska Grujik',
    'Melanie Walder',
    'Ange Njako',
    'Samanta Domenig',
    'Gerry Graf',
    'Egzona Nuhiji'
  )
),
raw_data(employee_name, work_date, store_code, start_t, end_t) AS (
  VALUES
    ('Vaska Grujik','2026-03-31','SW','07:00','11:00'),
    ('Vaska Grujik','2026-04-01','SW','07:00','14:00'),
    ('Vaska Grujik','2026-04-02','SW','07:00','14:00'),
    ('Vaska Grujik','2026-03-30','SC','07:00','13:00'),
    ('Melanie Walder','2026-03-30','SC','07:00','14:00'),
    ('Melanie Walder','2026-04-04','SC','07:00','14:00'),
    ('Ange Njako','2026-03-31','SW','14:00','19:00'),
    ('Ange Njako','2026-04-02','SW','14:00','19:10'),
    ('Ange Njako','2026-04-04','SW','14:00','19:10'),
    ('Samanta Domenig','2026-03-30','SW','14:00','19:00'),
    ('Samanta Domenig','2026-04-01','SW','14:00','19:00'),
    ('Samanta Domenig','2026-04-04','SW','13:30','20:15'),
    ('Gerry Graf','2026-03-31','SC','07:30','14:30'),
    ('Gerry Graf','2026-04-01','SC','07:30','14:30'),
    ('Gerry Graf','2026-04-02','SC','07:30','14:30'),
    ('Gerry Graf','2026-04-04','SC','08:30','15:30'),
    ('Egzona Nuhiji','2026-03-30','SC','13:00','20:15'),
    ('Egzona Nuhiji','2026-03-31','SC','14:00','20:15'),
    ('Egzona Nuhiji','2026-04-01','SC','14:00','20:15'),
    ('Egzona Nuhiji','2026-04-02','SC','14:00','20:15'),
    ('Vaska Grujik','2026-04-06','SW','07:00','14:00'),
    ('Vaska Grujik','2026-04-07','SW','07:00','14:00'),
    ('Vaska Grujik','2026-04-08','SW','07:00','11:00'),
    ('Vaska Grujik','2026-04-09','SW','07:00','11:00'),
    ('Vaska Grujik','2026-04-10','SW','07:00','11:00'),
    ('Melanie Walder','2026-04-07','SC','14:00','19:10'),
    ('Melanie Walder','2026-04-08','SC','14:00','19:10'),
    ('Melanie Walder','2026-04-09','SC','14:00','19:10'),
    ('Ange Njako','2026-04-08','SW','14:00','19:00'),
    ('Ange Njako','2026-04-09','SW','14:00','19:00'),
    ('Ange Njako','2026-04-10','SW','14:15','20:15'),
    ('Samanta Domenig','2026-04-09','SW','14:00','19:00'),
    ('Samanta Domenig','2026-04-10','SW','14:00','19:00'),
    ('Samanta Domenig','2026-04-11','SW','14:15','20:15'),
    ('Gerry Graf','2026-04-06','SC','07:30','14:30'),
    ('Gerry Graf','2026-04-07','SC','07:30','14:30'),
    ('Gerry Graf','2026-04-08','SC','07:30','14:30'),
    ('Gerry Graf','2026-04-09','SC','07:30','14:30'),
    ('Gerry Graf','2026-04-10','SC','07:30','14:30'),
    ('Egzona Nuhiji','2026-04-06','SC','14:15','20:15'),
    ('Egzona Nuhiji','2026-04-07','SC','14:15','20:15'),
    ('Egzona Nuhiji','2026-04-08','SC','14:15','20:15'),
    ('Egzona Nuhiji','2026-04-09','SC','14:15','20:15'),
    ('Egzona Nuhiji','2026-04-10','SC','14:15','20:15'),
    ('Vaska Grujik','2026-04-14','SW','07:00','14:00'),
    ('Vaska Grujik','2026-04-15','SW','07:00','14:00'),
    ('Vaska Grujik','2026-04-16','SW','07:00','14:00'),
    ('Vaska Grujik','2026-04-17','SW','07:00','11:00'),
    ('Vaska Grujik','2026-04-18','SW','14:00','19:00'),
    ('Vaska Grujik','2026-04-13','SC','07:00','13:00'),
    ('Melanie Walder','2026-04-13','SC','07:00','14:00'),
    ('Melanie Walder','2026-04-17','SC','14:00','19:00'),
    ('Melanie Walder','2026-04-18','SC','14:00','19:00'),
    ('Ange Njako','2026-04-13','SW','14:00','19:00'),
    ('Ange Njako','2026-04-14','SW','14:00','19:00'),
    ('Ange Njako','2026-04-15','SW','14:00','19:00'),
    ('Samanta Domenig','2026-04-16','SW','14:00','19:00'),
    ('Samanta Domenig','2026-04-18','SW','14:15','20:15'),
    ('Gerry Graf','2026-04-14','SC','07:30','14:30'),
    ('Gerry Graf','2026-04-15','SC','07:30','14:30'),
    ('Gerry Graf','2026-04-16','SC','07:30','14:30'),
    ('Gerry Graf','2026-04-17','SC','07:30','14:30'),
    ('Gerry Graf','2026-04-18','SC','08:30','15:30'),
    ('Egzona Nuhiji','2026-04-13','SC','13:00','20:15'),
    ('Egzona Nuhiji','2026-04-14','SC','14:15','20:15'),
    ('Egzona Nuhiji','2026-04-15','SC','14:15','20:15'),
    ('Egzona Nuhiji','2026-04-16','SC','14:15','20:15'),
    ('Egzona Nuhiji','2026-04-18','SC','13:30','20:15'),
    ('Vaska Grujik','2026-04-21','SW','07:00','14:00'),
    ('Vaska Grujik','2026-04-22','SW','07:00','14:00'),
    ('Vaska Grujik','2026-04-23','SW','07:00','14:00'),
    ('Vaska Grujik','2026-04-24','SW','07:00','11:00'),
    ('Vaska Grujik','2026-04-25','SW','14:00','19:00'),
    ('Vaska Grujik','2026-04-20','SC','07:00','13:00'),
    ('Melanie Walder','2026-04-20','SC','07:00','14:00'),
    ('Melanie Walder','2026-04-24','SC','14:00','19:10'),
    ('Melanie Walder','2026-04-25','SC','14:00','19:10'),
    ('Ange Njako','2026-04-22','SW','08:00','14:00'),
    ('Ange Njako','2026-04-24','SW','14:15','20:15'),
    ('Ange Njako','2026-04-25','SW','15:00','20:15'),
    ('Samanta Domenig','2026-04-20','SW','14:00','19:10'),
    ('Samanta Domenig','2026-04-21','SW','14:00','19:10'),
    ('Samanta Domenig','2026-04-22','SW','14:00','19:00'),
    ('Samanta Domenig','2026-04-23','SW','14:00','19:00'),
    ('Gerry Graf','2026-04-21','SC','07:30','14:30'),
    ('Gerry Graf','2026-04-22','SC','07:30','14:30'),
    ('Gerry Graf','2026-04-23','SC','07:30','14:30'),
    ('Gerry Graf','2026-04-24','SC','07:30','14:30'),
    ('Gerry Graf','2026-04-25','SC','08:30','15:30'),
    ('Egzona Nuhiji','2026-04-20','SC','13:00','20:15'),
    ('Egzona Nuhiji','2026-04-21','SC','14:15','20:15'),
    ('Egzona Nuhiji','2026-04-22','SC','14:15','20:15'),
    ('Egzona Nuhiji','2026-04-23','SC','14:00','20:15')
),
final_rows AS (
  SELECT
    em.company_id,
    em.id AS employee_id,
    rd.work_date::date AS date,
    'SHIFT'::text AS assignment_type,
    CASE WHEN rd.store_code = 'SW' THEN sm.sw_shift_id ELSE sm.sc_shift_id END AS shift_id,
    CASE WHEN rd.store_code = 'SW' THEN sm.sw_store_id ELSE sm.sc_store_id END AS store_id,
    rd.start_t::time AS custom_start_time,
    rd.end_t::time AS custom_end_time,
    0::int AS custom_break_minutes
  FROM raw_data rd
  JOIN emp em ON em.name = rd.employee_name
  JOIN shift_map sm ON sm.company_id = em.company_id
)
INSERT INTO public.shift_assignments (
  company_id,
  employee_id,
  date,
  assignment_type,
  shift_id,
  store_id,
  custom_start_time,
  custom_end_time,
  custom_break_minutes
)
SELECT
  fr.company_id,
  fr.employee_id,
  fr.date,
  fr.assignment_type,
  fr.shift_id,
  fr.store_id,
  fr.custom_start_time,
  fr.custom_end_time,
  fr.custom_break_minutes
FROM final_rows fr
ON CONFLICT (employee_id, date)
DO UPDATE SET
  company_id = EXCLUDED.company_id,
  assignment_type = EXCLUDED.assignment_type,
  shift_id = EXCLUDED.shift_id,
  store_id = EXCLUDED.store_id,
  custom_start_time = EXCLUDED.custom_start_time,
  custom_end_time = EXCLUDED.custom_end_time,
  custom_break_minutes = EXCLUDED.custom_break_minutes;

COMMIT;

-- ---------------------------------------------------------------------
-- VERIFIKACIJA #1: pregled po danu (copy/paste i pokreni nakon inserta)
-- ---------------------------------------------------------------------
SELECT
  e.name AS employee,
  sa.date,
  st.name AS store,
  sa.assignment_type,
  TO_CHAR(sa.custom_start_time, 'HH24:MI') AS start_time,
  TO_CHAR(sa.custom_end_time, 'HH24:MI') AS end_time
FROM public.shift_assignments sa
JOIN public.employees e ON e.id = sa.employee_id
LEFT JOIN public.stores st ON st.id = sa.store_id
WHERE e.name IN (
  'Vaska Grujik',
  'Melanie Walder',
  'Ange Njako',
  'Samanta Domenig',
  'Gerry Graf',
  'Egzona Nuhiji'
)
  AND sa.date BETWEEN DATE '2026-03-30' AND DATE '2026-04-26'
ORDER BY sa.date, e.name;

-- ---------------------------------------------------------------------
-- VERIFIKACIJA #2: broj smjena po zaposleniku u periodu
-- ---------------------------------------------------------------------
SELECT
  e.name AS employee,
  COUNT(*) AS shifts_count
FROM public.shift_assignments sa
JOIN public.employees e ON e.id = sa.employee_id
WHERE e.name IN (
  'Vaska Grujik',
  'Melanie Walder',
  'Ange Njako',
  'Samanta Domenig',
  'Gerry Graf',
  'Egzona Nuhiji'
)
  AND sa.date BETWEEN DATE '2026-03-30' AND DATE '2026-04-26'
GROUP BY e.name
ORDER BY e.name;
