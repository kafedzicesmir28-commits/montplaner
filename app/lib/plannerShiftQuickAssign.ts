import type { Shift, ShiftAssignment } from '@/types/database';
import { supabase } from '@/lib/supabaseClient';
import { formatErrorMessage } from '@/lib/utils';
import { notifyPlannerAssignmentsChanged } from '@/lib/plannerEvents';

export const PLANNER_BREAK_OPTIONS = [0, 30, 45, 60] as const;

export function snapToPlannerBreakMinutes(raw: number): (typeof PLANNER_BREAK_OPTIONS)[number] {
  const r = Math.max(0, Math.floor(Number(raw) || 0));
  if ((PLANNER_BREAK_OPTIONS as readonly number[]).includes(r)) return r as (typeof PLANNER_BREAK_OPTIONS)[number];
  if (r < 15) return 0;
  if (r < 38) return 30;
  if (r < 53) return 45;
  return 60;
}

export function shiftAllowedForStore(shift: Shift, storeId: string): boolean {
  return !Boolean(shift.is_global) && shift.store_id === storeId;
}

export function shiftsForStore(shifts: Shift[], storeId: string): Shift[] {
  return shifts
    .filter((s) => shiftAllowedForStore(s, storeId))
    .slice()
    .sort((a, b) => {
      const g = Number(Boolean(a.is_global)) - Number(Boolean(b.is_global));
      if (g !== 0) return g;
      return String(a.start_time).localeCompare(String(b.start_time));
    });
}

export type QuickPlannerShiftUpsertParams = {
  employeeId: string;
  dateStr: string;
  shiftId: string;
  storeId: string;
  assignmentId?: string | null;
  breakMinutes: number;
};

type AssignmentWithCustomTimes = Pick<
  ShiftAssignment,
  'id' | 'shift_id' | 'assignment_type' | 'custom_start_time' | 'custom_end_time'
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

function toMinutes(clock: string): number {
  const [h, m] = clock.split(':').map(Number);
  return h * 60 + m;
}

function overlapMinutes(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
}

function rangesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const aStart = toMinutes(startA);
  let aEnd = toMinutes(endA);
  const bStart = toMinutes(startB);
  let bEnd = toMinutes(endB);
  if (aEnd <= aStart) aEnd += 24 * 60;
  if (bEnd <= bStart) bEnd += 24 * 60;
  const bCandidates = [
    [bStart, bEnd],
    [bStart + 24 * 60, bEnd + 24 * 60],
    [bStart - 24 * 60, bEnd - 24 * 60],
  ] as const;
  return bCandidates.some(([s, e]) => overlapMinutes(aStart, aEnd, s, e));
}

export function hasShiftTimeOverlap(
  nextStart: string,
  nextEnd: string,
  dayAssignments: AssignmentWithCustomTimes[],
  shifts: Shift[],
  excludeAssignmentId?: string
): boolean {
  const shiftById = new Map(shifts.map((s) => [s.id, s] as const));
  for (const row of dayAssignments) {
    if (excludeAssignmentId && row.id === excludeAssignmentId) continue;
    if ((row.assignment_type ?? 'SHIFT') !== 'SHIFT') continue;
    if (!row.shift_id) continue;
    const linked = shiftById.get(row.shift_id);
    if (!linked) continue;
    const existingStart = hhmm(row.custom_start_time) ?? hhmm(linked.start_time);
    const existingEnd = hhmm(row.custom_end_time) ?? hhmm(linked.end_time);
    if (!existingStart || !existingEnd) continue;
    if (rangesOverlap(nextStart, nextEnd, existingStart, existingEnd)) return true;
  }
  return false;
}

/**
 * Insert/update a SHIFT assignment with default shift times (same payload as drag → pick shift quick path).
 */
export type InsertPlannerShiftParams = QuickPlannerShiftUpsertParams & {
  dayAssignments: AssignmentWithCustomTimes[];
  shifts: Shift[];
};

/** Insert a new SHIFT row (never updates an existing assignment). */
export async function insertPlannerShift(
  params: InsertPlannerShiftParams
): Promise<{ ok: true } | { ok: false; message: string }> {
  const shift = params.shifts.find((s) => s.id === params.shiftId);
  if (!shift) return { ok: false, message: 'Shift not found.' };
  const nextStart = hhmm(shift.start_time);
  const nextEnd = hhmm(shift.end_time);
  if (!nextStart || !nextEnd) return { ok: false, message: 'Shift has invalid times.' };
  if (hasShiftTimeOverlap(nextStart, nextEnd, params.dayAssignments, params.shifts)) {
    return {
      ok: false,
      message: 'Schicht überschneidet sich mit einer bestehenden Schicht an diesem Tag.',
    };
  }

  const payload = {
    employee_id: params.employeeId,
    date: params.dateStr,
    shift_id: params.shiftId,
    store_id: params.storeId,
    assignment_type: 'SHIFT' as const,
    custom_start_time: null as string | null,
    custom_end_time: null as string | null,
    custom_break_minutes: params.breakMinutes,
  };
  try {
    const { error } = await supabase.from('shift_assignments').insert(payload);
    if (error) throw error;
    notifyPlannerAssignmentsChanged();
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, message: formatErrorMessage(e) };
  }
}

export async function upsertQuickPlannerShift(
  params: QuickPlannerShiftUpsertParams
): Promise<{ ok: true } | { ok: false; message: string }> {
  const payload = {
    employee_id: params.employeeId,
    date: params.dateStr,
    shift_id: params.shiftId,
    store_id: params.storeId,
    assignment_type: 'SHIFT' as const,
    custom_start_time: null as string | null,
    custom_end_time: null as string | null,
    custom_break_minutes: params.breakMinutes,
  };
  try {
    if (params.assignmentId) {
      const { error } = await supabase.from('shift_assignments').update(payload).eq('id', params.assignmentId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('shift_assignments').insert(payload);
      if (error) throw error;
    }
    notifyPlannerAssignmentsChanged();
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, message: formatErrorMessage(e) };
  }
}
