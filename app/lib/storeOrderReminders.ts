import type { Store } from '@/types/database';

/** Logistics reminder codes shown on planner cells. */
export type ReminderCode = 'BF' | 'L' | 'B' | 'LB';

export type LogisticsMarkerGroup = 'fresh' | 'normal';

export type ReminderMarker = {
  code: ReminderCode;
  title: string;
  bgColor: string;
  textColor: string;
  group: LogisticsMarkerGroup;
};

export const REMINDER_CODES_ORDER: ReminderCode[] = ['BF', 'L', 'B', 'LB'];

export const REMINDER_DEFS: Record<ReminderCode, ReminderMarker> = {
  BF: {
    code: 'BF',
    title: 'Bestellung Frische',
    bgColor: '#059669',
    textColor: '#ecfdf5',
    group: 'fresh',
  },
  L: {
    code: 'L',
    title: 'Lieferung Frische',
    bgColor: '#0d9488',
    textColor: '#f0fdfa',
    group: 'fresh',
  },
  B: {
    code: 'B',
    title: 'Bestellung',
    bgColor: '#1d4ed8',
    textColor: '#eff6ff',
    group: 'normal',
  },
  LB: {
    code: 'LB',
    title: 'Lieferung Bestellung',
    bgColor: '#7c3aed',
    textColor: '#f5f3ff',
    group: 'normal',
  },
};

export type StoreLogisticsDisplay = {
  storeId: string;
  storeName: string;
  markers: ReminderMarker[];
};

function normalizeDays(days: number[] | null | undefined): Set<number> {
  return new Set(
    (days ?? [])
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
  );
}

export function sortReminderMarkers(markers: ReminderMarker[]): ReminderMarker[] {
  const order = new Map(REMINDER_CODES_ORDER.map((code, i) => [code, i]));
  return [...markers].sort((a, b) => (order.get(a.code) ?? 99) - (order.get(b.code) ?? 99));
}

/** Weekday 0=Sun … 6=Sat from YYYY-MM-DD (local). */
export function weekdayFromDateStr(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).getDay();
}

export function storeShortName(name: string | null | undefined, maxLen = 12): string {
  const n = (name ?? '').trim();
  if (!n) return '—';
  if (n.length <= maxLen) return n;
  return `${n.slice(0, maxLen - 1)}…`;
}

export function logisticsMarkerTooltip(storeName: string, marker: ReminderMarker): string {
  return `${storeName} · ${marker.title}`;
}

/** Planner markers for a store on a given weekday (0=Sun … 6=Sat). */
export function reminderMarkersForStore(store: Store | null | undefined, weekday: number): ReminderMarker[] {
  if (!store) return [];
  const freshOrderDays = normalizeDays(store.fresh_order_days);
  const freshDeliveryDays = normalizeDays(store.fresh_delivery_days);
  const orderDays = normalizeDays(store.order_days);
  const deliveryDays = normalizeDays(store.delivery_days);
  const result: ReminderMarker[] = [];
  if (freshOrderDays.has(weekday)) result.push(REMINDER_DEFS.BF);
  if (freshDeliveryDays.has(weekday)) result.push(REMINDER_DEFS.L);
  if (orderDays.has(weekday)) result.push(REMINDER_DEFS.B);
  if (deliveryDays.has(weekday)) result.push(REMINDER_DEFS.LB);
  return sortReminderMarkers(result);
}

/** Markers for one store only (shift block, pending drop, or forceStore context). */
export function logisticsDisplayForStore(
  storeId: string | null | undefined,
  storesById: Map<string, Store>,
  weekday: number
): StoreLogisticsDisplay | null {
  if (!storeId) return null;
  const store = storesById.get(storeId);
  if (!store) return null;
  return {
    storeId: store.id,
    storeName: store.name?.trim() || '—',
    markers: reminderMarkersForStore(store, weekday),
  };
}

export type LogisticsCellOverlayOptions = {
  /** Store monthly planner: logistics for this store on the weekday. */
  forceStoreId?: string;
  /** Pending store drop preview before assignment is saved. */
  pendingStoreId?: string;
};

/**
 * Cell-level overlay markers: only single-store contexts (never unions assignment stores).
 * Use per-shift blocks for multi-store days.
 */
export function logisticsOverlayForCell(
  storesById: Map<string, Store>,
  weekday: number,
  options?: LogisticsCellOverlayOptions
): StoreLogisticsDisplay | null {
  const storeId = options?.pendingStoreId ?? options?.forceStoreId;
  if (!storeId) return null;
  return logisticsDisplayForStore(storeId, storesById, weekday);
}
