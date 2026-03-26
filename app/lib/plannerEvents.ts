/** Fired after shift assignments are persisted in the planner grid (same tab). */
export const PLANNER_ASSIGNMENTS_CHANGED = 'planner-assignments-changed';

export function notifyPlannerAssignmentsChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PLANNER_ASSIGNMENTS_CHANGED));
}
