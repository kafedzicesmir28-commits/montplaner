import type { Shift } from '@/types/database';
import { calculateHourBuckets, effectiveBreakMinutes } from '@/lib/utils';

export type AssignmentForHours = {
  date: string;
  assignment_type?: string | null;
  store_id?: string | null;
  custom_start_time?: string | null;
  custom_end_time?: string | null;
  custom_break_minutes?: number | null;
  shift?: Shift | null;
};

/**
 * Billable work hours for one assignment (SHIFT only), matching planner bucket logic.
 */
export function assignmentTotalWorkHours(row: AssignmentForHours): number {
  const at = row.assignment_type ?? 'SHIFT';
  if (at !== 'SHIFT') return 0;
  const sh = row.shift;
  if (!sh?.start_time || !sh?.end_time) return 0;
  const cs = row.custom_start_time;
  const ce = row.custom_end_time;
  const start =
    cs != null && String(cs).trim() !== ''
      ? String(cs).split(':').slice(0, 2).join(':')
      : sh.start_time;
  const end =
    ce != null && String(ce).trim() !== ''
      ? String(ce).split(':').slice(0, 2).join(':')
      : sh.end_time;
  return calculateHourBuckets(start, end, effectiveBreakMinutes(row, sh), row.date).totalHours;
}

/** Paid work hours from RPC row (normal + night + Sunday; aligns with Buchhalteransicht buckets). */
export function paidWorkHoursFromRpcBuckets(row: {
  normal_hours: number;
  night_hours: number;
  sunday_hours: number;
}): number {
  return (
    (Number(row.normal_hours) || 0) +
    (Number(row.night_hours) || 0) +
    (Number(row.sunday_hours) || 0)
  );
}
