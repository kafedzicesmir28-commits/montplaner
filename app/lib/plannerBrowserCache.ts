/** Prefixes for planner drafts in localStorage (see plannerTypes + planner page). */
const MONTATS_LEGACY = 'montatsplaner_planner_v1_';
const MONTATS_V2 = 'montatsplaner_planner_v2_';
const PENDING_STORES = 'planner-pending-stores';

/**
 * Remove tenant-specific planner caches so switching accounts never reuses another
 * user's pending UI state or old v1 global keys.
 */
export function clearPlannerBrowserCache(): void {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (
        k.startsWith(MONTATS_LEGACY) ||
        k.startsWith(MONTATS_V2) ||
        k.startsWith(PENDING_STORES)
      ) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
