import type { Shift, ShiftAssignment } from '@/types/database';

export type DayAssignmentRow = Pick<
  ShiftAssignment,
  'id' | 'shift_id' | 'store_id' | 'assignment_type' | 'custom_start_time' | 'custom_end_time'
>;

function hhmm(value: string | null | undefined): string | null {
  if (!value) return null;
  const parts = String(value).split(':');
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Minutes from midnight for sorting; overnight end is treated as next day. */
export function assignmentStartMinutes(
  row: DayAssignmentRow,
  shifts: Shift[],
  shiftById?: Map<string, Shift>
): number {
  const map = shiftById ?? new Map(shifts.map((s) => [s.id, s] as const));
  if (!row.shift_id) return 24 * 60 * 2;
  const shift = map.get(row.shift_id);
  if (!shift) return 24 * 60 * 2;
  const start = hhmm(row.custom_start_time) ?? hhmm(shift.start_time);
  if (!start) return 24 * 60 * 2;
  const [h, m] = start.split(':').map(Number);
  return h * 60 + m;
}

export function isShiftAssignmentRow(row: DayAssignmentRow): boolean {
  return (row.assignment_type ?? 'SHIFT') === 'SHIFT' && Boolean(row.shift_id);
}

export function isStatusAssignmentRow(row: DayAssignmentRow): boolean {
  const t = row.assignment_type ?? 'SHIFT';
  return t === 'KRANK' || t === 'FREI' || t === 'FERIEN';
}

/** SHIFT rows for a day, ordered by start time. */
export function sortedShiftAssignments(
  dayAssignments: DayAssignmentRow[],
  shifts: Shift[]
): DayAssignmentRow[] {
  const shiftById = new Map(shifts.map((s) => [s.id, s] as const));
  return dayAssignments
    .filter(isShiftAssignmentRow)
    .slice()
    .sort(
      (a, b) =>
        assignmentStartMinutes(a, shifts, shiftById) - assignmentStartMinutes(b, shifts, shiftById)
    );
}

export function pickCellDisplayAssignments(dayAssignments: DayAssignmentRow[], shifts: Shift[]) {
  const statusAssignment = dayAssignments.find(isStatusAssignmentRow);
  const shiftAssignments = sortedShiftAssignments(dayAssignments, shifts);
  const primaryShift = shiftAssignments[0];
  return { statusAssignment, shiftAssignments, primaryShift };
}
