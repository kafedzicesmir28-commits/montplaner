import type { Shift } from '@/types/database';
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

/**
 * Insert/update a SHIFT assignment with default shift times (same payload as drag → pick shift quick path).
 */
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
      const { error } = await supabase.from('shift_assignments').upsert(payload, { onConflict: 'employee_id,date' });
      if (error) throw error;
    }
    notifyPlannerAssignmentsChanged();
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, message: formatErrorMessage(e) };
  }
}
