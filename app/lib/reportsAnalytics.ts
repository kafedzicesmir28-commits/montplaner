import type { AssignmentForHours, EmployeeMonthHourTotals } from '@/lib/hoursCalculator';
import { calculateEmployeeHours } from '@/lib/hoursCalculator';

export type { AssignmentForHours } from '@/lib/hoursCalculator';

/**
 * Billable work hours for one assignment (SHIFT only), matching planner bucket logic.
 * @deprecated Prefer importing `calculateEmployeeHours` from `@/lib/hoursCalculator`.
 */
export function assignmentTotalWorkHours(row: AssignmentForHours): number {
  return calculateEmployeeHours(row);
}

/** Payroll / cost base: effective worked hours only (never normal + night + sunday). */
export function paidWorkHoursFromPlannerTotals(row: EmployeeMonthHourTotals): number {
  return Number(row.total_hours) || 0;
}

/** Prefer `total_hours` (effective). Legacy rows without it: bucket sum equals effective only if buckets partition the shift. */
export function paidWorkHoursFromRpcBuckets(row: {
  total_hours?: number | null;
  normal_hours: number;
  night_hours: number;
  sunday_hours: number;
}): number {
  if (row.total_hours != null && Number.isFinite(Number(row.total_hours))) {
    return Number(row.total_hours) || 0;
  }
  return (
    (Number(row.normal_hours) || 0) +
    (Number(row.night_hours) || 0) +
    (Number(row.sunday_hours) || 0)
  );
}
