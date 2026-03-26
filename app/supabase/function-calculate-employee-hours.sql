-- Phase 6: Server-side hours (run entire script in Supabase SQL Editor)
--
-- PostgREST (PGRST202): a single jsonb parameter receives the full RPC JSON body,
-- which matches how supabase-js calls: { p_employee_id, p_month }.
--
-- RPC (unchanged in app): supabase.rpc('calculate_employee_hours', { p_employee_id, p_month })

DROP FUNCTION IF EXISTS public.calculate_employee_hours(date, uuid);
DROP FUNCTION IF EXISTS public.calculate_employee_hours(uuid, date);
DROP FUNCTION IF EXISTS public.calculate_employee_hours(jsonb);

-- Single unnamed jsonb: PostgREST passes the entire RPC JSON body as $1 (see PGRST202 hint).
CREATE OR REPLACE FUNCTION public.calculate_employee_hours(jsonb)
RETURNS TABLE (
  normal_hours numeric,
  night_hours numeric,
  sunday_hours numeric,
  vacation_days integer,
  sick_days integer,
  total_hours numeric
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  p_employee_id uuid := ($1->>'p_employee_id')::uuid;
  p_month date := ($1->>'p_month')::date;
  v_month_start date;
  v_month_end date;
  v_normal numeric := 0;
  v_night numeric := 0;
  v_sunday numeric := 0;
  v_total numeric := 0;
  v_vacation_days int := 0;
  v_sick_days int := 0;
  rec record;
  v_start time;
  v_end time;
  d_start timestamp;
  d_end timestamp;
  raw_minutes int;
  work_minutes int;
  night_minutes int;
  t timestamp;
  mins_from_midnight int;
  dur numeric;
  night_frac numeric;
  shift_hours numeric;
  night_part numeric;
  is_sun boolean;
BEGIN
  IF p_employee_id IS NULL OR p_month IS NULL THEN
    RAISE EXCEPTION 'p_employee_id and p_month are required';
  END IF;

  v_month_start := date_trunc('month', p_month)::date;
  v_month_end := (v_month_start + interval '1 month - 1 day')::date;

  SELECT COALESCE(COUNT(*), 0)::int INTO v_vacation_days
  FROM (
    SELECT gs.day::date AS d
    FROM generate_series(v_month_start, v_month_end, interval '1 day') AS gs(day)
    WHERE EXISTS (
      SELECT 1
      FROM public.vacations v
      WHERE v.employee_id = p_employee_id
        AND gs.day BETWEEN v.start_date AND v.end_date
    )
    UNION
    SELECT sa.date AS d
    FROM public.shift_assignments sa
    WHERE sa.employee_id = p_employee_id
      AND sa.date BETWEEN v_month_start AND v_month_end
      AND COALESCE(sa.assignment_type, 'SHIFT') = 'FERIEN'
  ) u;

  SELECT COALESCE(COUNT(DISTINCT sa.date), 0)::int INTO v_sick_days
  FROM public.shift_assignments sa
  LEFT JOIN public.shifts s ON s.id = sa.shift_id
  WHERE sa.employee_id = p_employee_id
    AND sa.date BETWEEN v_month_start AND v_month_end
    AND (
      COALESCE(sa.assignment_type, 'SHIFT') = 'KRANK'
      OR s.name ~* '(^|[^[:alpha:]])krank([^[:alpha:]]|$)'
    );

  FOR rec IN
    SELECT
      sa.date AS adate,
      sa.custom_start_time,
      sa.custom_end_time,
      s.start_time AS st_start,
      s.end_time AS st_end,
      COALESCE(s.break_minutes, 0)::int AS break_minutes,
      s.name AS shift_name
    FROM public.shift_assignments sa
    INNER JOIN public.shifts s ON s.id = sa.shift_id
    WHERE sa.employee_id = p_employee_id
      AND sa.date BETWEEN v_month_start AND v_month_end
      AND COALESCE(sa.assignment_type, 'SHIFT') = 'SHIFT'
  LOOP
    v_start := COALESCE(NULLIF(rec.custom_start_time::text, '')::time, rec.st_start);
    v_end := COALESCE(NULLIF(rec.custom_end_time::text, '')::time, rec.st_end);

    d_start := rec.adate + v_start::interval;
    IF v_end <= v_start THEN
      d_end := rec.adate + interval '1 day' + v_end::interval;
    ELSE
      d_end := rec.adate + v_end::interval;
    END IF;

    raw_minutes := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (d_end - d_start)) / 60.0))::int;
    work_minutes := GREATEST(0, raw_minutes - rec.break_minutes);

    night_minutes := 0;
    IF raw_minutes > 0 THEN
      t := d_start;
      WHILE t < d_end LOOP
        mins_from_midnight :=
          EXTRACT(HOUR FROM t)::int * 60 + EXTRACT(MINUTE FROM t)::int;
        IF mins_from_midnight >= 20 * 60 OR mins_from_midnight < 6 * 60 THEN
          night_minutes := night_minutes + 1;
        END IF;
        t := t + interval '1 minute';
      END LOOP;
    END IF;

    dur := raw_minutes::numeric;
    IF dur > 0 THEN
      night_frac := night_minutes::numeric / dur;
    ELSE
      night_frac := 0;
    END IF;

    shift_hours := work_minutes::numeric / 60.0;
    night_part := shift_hours * night_frac;

    is_sun := EXTRACT(ISODOW FROM rec.adate::timestamp) = 7;

    v_total := v_total + shift_hours;
    v_night := v_night + night_part;

    IF is_sun THEN
      v_sunday := v_sunday + shift_hours;
    ELSE
      v_normal := v_normal + (shift_hours - night_part);
    END IF;
  END LOOP;

  normal_hours := round(v_normal, 4);
  night_hours := round(v_night, 4);
  sunday_hours := round(v_sunday, 4);
  vacation_days := v_vacation_days;
  sick_days := v_sick_days;
  total_hours := round(v_total, 4);
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.calculate_employee_hours(jsonb) IS
  'Hours for one employee in calendar month. Night = 20:00–06:00. RPC body: {"p_employee_id":"uuid","p_month":"YYYY-MM-DD"}.';

GRANT EXECUTE ON FUNCTION public.calculate_employee_hours(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_employee_hours(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.calculate_employee_hours(jsonb) TO anon;

NOTIFY pgrst, 'reload schema';
