import type { HoursCalculation, Shift, ShiftAssignment, Vacation } from '@/types/database';
import {
  calculateHourBuckets,
  calculateHours,
  effectiveBreakMinutes,
  formatDate,
  isDateInVacation,
  monthsFirstOfMonthInRange,
  parseYmdLocal,
} from '@/lib/utils';

/** Minimal row shape for worked-hours math (planner / reports). */
export type AssignmentForHours = {
  date: string;
  assignment_type?: string | null;
  store_id?: string | null;
  custom_start_time?: string | null;
  custom_end_time?: string | null;
  custom_break_minutes?: number | null;
  shift?: Shift | null;
};

/** Row with employee id for month / range aggregation. */
export type PlannerShiftAssignmentRow = AssignmentForHours &
  Pick<ShiftAssignment, 'employee_id' | 'date' | 'assignment_type'>;

export type EmployeeMonthHourTotals = {
  /** Informational: daytime (non-night, non-Sunday) bucket hours — not added to `total_hours`. */
  normal_hours: number;
  /** Informational: night-window bucket hours — not added to `total_hours`. */
  night_hours: number;
  /** Informational: Sunday bucket hours — not added to `total_hours`. */
  sunday_hours: number;
  vacation_days: number;
  sick_days: number;
  /** Efektiv: sum of (shift duration − pause) only — sole value for totals / payroll base. */
  total_hours: number;
};

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function lastDayOfMonthYmd(firstOfMonthYmd: string): string {
  const d = parseYmdLocal(firstOfMonthYmd);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return formatDate(last);
}

/** Match SQL `s.name ~* '(^|[^[:alpha:]])krank([^[:alpha:]]|$)'` closely in JS. */
export function isKrankShiftName(shiftName: string): boolean {
  return /(^|[^A-Za-z\u00C0-\u024F])krank([^A-Za-z\u00C0-\u024F]|$)/i.test(shiftName);
}

export function assignmentResolvedTimes(row: AssignmentForHours): { start: string; end: string } | null {
  const at = row.assignment_type ?? 'SHIFT';
  if (at !== 'SHIFT') return null;
  const sh = row.shift;
  if (!sh?.start_time || !sh?.end_time) return null;
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
  return { start, end };
}

/** Single-assignment buckets; SHIFT with valid shift only. */
export function assignmentHourBuckets(row: AssignmentForHours) {
  const times = assignmentResolvedTimes(row);
  if (!times) {
    return { totalHours: 0, effectiveHours: 0, nightHours: 0, sundayHours: 0 };
  }
  const sh = row.shift;
  if (!sh) {
    return { totalHours: 0, effectiveHours: 0, nightHours: 0, sundayHours: 0 };
  }
  return calculateHourBuckets(times.start, times.end, effectiveBreakMinutes(row, sh), row.date);
}

/** Effective worked hours for one SHIFT assignment: duration − break only (not bucket sums). */
export function calculateEmployeeHours(row: AssignmentForHours): number {
  const times = assignmentResolvedTimes(row);
  if (!times) return 0;
  const sh = row.shift;
  if (!sh) return 0;
  return calculateHours(times.start, times.end, effectiveBreakMinutes(row, sh));
}

export function sumWorkedHoursForAssignments(rows: AssignmentForHours[]): number {
  return rows.reduce((t, r) => t + calculateEmployeeHours(r), 0);
}

function countVacationDaysInMonth(
  employeeId: string,
  monthFirstYmd: string,
  monthEndYmd: string,
  vacations: Vacation[],
  assignments: PlannerShiftAssignmentRow[]
): number {
  const days = new Set<string>();
  const start = parseYmdLocal(monthFirstYmd);
  const end = parseYmdLocal(monthEndYmd);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const ymd = formatDate(d);
    const inTable = vacations.some(
      (v) => v.employee_id === employeeId && isDateInVacation(ymd, v.start_date, v.end_date)
    );
    if (inTable) days.add(ymd);
  }
  for (const a of assignments) {
    if (a.employee_id !== employeeId) continue;
    if ((a.assignment_type ?? 'SHIFT') !== 'FERIEN') continue;
    if (a.date < monthFirstYmd || a.date > monthEndYmd) continue;
    days.add(a.date);
  }
  return days.size;
}

function countSickDaysInMonth(
  employeeId: string,
  monthFirstYmd: string,
  monthEndYmd: string,
  assignments: PlannerShiftAssignmentRow[]
): number {
  const days = new Set<string>();
  for (const a of assignments) {
    if (a.employee_id !== employeeId) continue;
    if (a.date < monthFirstYmd || a.date > monthEndYmd) continue;
    const at = a.assignment_type ?? 'SHIFT';
    if (at === 'KRANK') {
      days.add(a.date);
      continue;
    }
    const name = a.shift?.name;
    if (name && isKrankShiftName(name)) days.add(a.date);
  }
  return days.size;
}

/** One employee, one calendar month — from planner assignments + vacations (same rules as legacy RPC). */
export function getEmployeeMonthlyHourTotals(
  employeeId: string,
  monthFirstYmd: string,
  allAssignments: PlannerShiftAssignmentRow[],
  vacations: Vacation[]
): EmployeeMonthHourTotals {
  const monthEndYmd = lastDayOfMonthYmd(monthFirstYmd);
  let normal = 0;
  let night = 0;
  let sunday = 0;
  let total = 0;

  for (const a of allAssignments) {
    if (a.employee_id !== employeeId) continue;
    if (a.date < monthFirstYmd || a.date > monthEndYmd) continue;
    if ((a.assignment_type ?? 'SHIFT') !== 'SHIFT') continue;
    const b = assignmentHourBuckets(a);
    normal += b.effectiveHours;
    night += b.nightHours;
    sunday += b.sundayHours;
    total += calculateEmployeeHours(a);
  }

  return {
    normal_hours: round4(normal),
    night_hours: round4(night),
    sunday_hours: round4(sunday),
    total_hours: round4(total),
    vacation_days: countVacationDaysInMonth(employeeId, monthFirstYmd, monthEndYmd, vacations, allAssignments),
    sick_days: countSickDaysInMonth(employeeId, monthFirstYmd, monthEndYmd, allAssignments),
  };
}

export function aggregateEmployeeHoursAcrossMonths(
  employeeId: string,
  monthFirstYmdList: string[],
  allAssignments: PlannerShiftAssignmentRow[],
  vacations: Vacation[]
): EmployeeMonthHourTotals {
  let normal_hours = 0;
  let night_hours = 0;
  let sunday_hours = 0;
  let total_hours = 0;
  let vacation_days = 0;
  let sick_days = 0;
  for (const m of monthFirstYmdList) {
    const row = getEmployeeMonthlyHourTotals(employeeId, m, allAssignments, vacations);
    normal_hours += row.normal_hours;
    night_hours += row.night_hours;
    sunday_hours += row.sunday_hours;
    total_hours += row.total_hours;
    vacation_days += row.vacation_days;
    sick_days += row.sick_days;
  }
  return {
    normal_hours: round4(normal_hours),
    night_hours: round4(night_hours),
    sunday_hours: round4(sunday_hours),
    total_hours: round4(total_hours),
    vacation_days,
    sick_days,
  };
}

/** Buchhaltung / summary table: one row per employee over `startDate`–`endDate` (by calendar months in range). */
export function getAllEmployeesHoursInPeriod(
  employees: { id: string; name: string }[],
  startDate: string,
  endDate: string,
  allAssignments: PlannerShiftAssignmentRow[],
  vacations: Vacation[]
): HoursCalculation[] {
  const months = monthsFirstOfMonthInRange(startDate, endDate);
  return employees.map((emp) => {
    const agg = aggregateEmployeeHoursAcrossMonths(emp.id, months, allAssignments, vacations);
    return {
      employee_id: emp.id,
      employee_name: emp.name,
      ...agg,
    };
  });
}
