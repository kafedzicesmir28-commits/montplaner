'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { MetricField, MonthKey, PlannerData } from './plannerTypes';
import {
  MONTH_KEYS,
  daysInMonth,
  emptyDay,
  loadPlannerFromStorage,
  mergePlannerData,
  metricToDayKey,
  savePlannerToStorage,
  splitTotalAcrossDaysForMetric,
  round1,
} from './plannerTypes';
import { computeYearTotalsMap, type RowTotals } from './totalsCalculator';
import { PLANNER_ASSIGNMENTS_CHANGED } from '@/lib/plannerEvents';
import {
  applyRpcYearToPlannerData,
  fetchRpcHoursForYear,
} from '@/lib/montatsplanerRpcSync';

type PlannerContextValue = {
  data: PlannerData;
  yearTotals: Record<string, RowTotals>;
  updateMetricTotal: (monthKey: MonthKey, empId: string, metric: MetricField, total: number) => void;
  updateBemerkung: (monthKey: MonthKey, empId: string, text: string) => void;
};

const PlannerContext = createContext<PlannerContextValue | null>(null);

type Props = {
  year: number;
  employeeIds: string[];
  /** Stable id for localStorage + RPC scoping (e.g. profiles.company_id). */
  storageTenantKey: string;
  children: ReactNode;
};

function monthIndex(monthKey: MonthKey): number {
  return MONTH_KEYS.indexOf(monthKey);
}

function ensurePayload(data: PlannerData, monthKey: MonthKey, empId: string): PlannerData {
  const m = data.months[monthKey];
  if (m?.[empId]?.days) return data;
  const next = { ...data, months: { ...data.months } };
  const byEmp = { ...(next.months[monthKey] ?? {}) };
  const mi = monthIndex(monthKey);
  const dim = daysInMonth(data.year, mi);
  const days: Record<number, ReturnType<typeof emptyDay>> = {};
  for (let d = 1; d <= dim; d++) days[d] = emptyDay();
  byEmp[empId] = { days };
  next.months[monthKey] = byEmp;
  return next;
}

function applyMetricTotal(
  data: PlannerData,
  monthKey: MonthKey,
  empId: string,
  metric: MetricField,
  total: number
): PlannerData {
  const mi = monthIndex(monthKey);
  const dim = daysInMonth(data.year, mi);
  const split = splitTotalAcrossDaysForMetric(total, dim, metric);
  const dk = metricToDayKey(metric);

  let next = ensurePayload(data, monthKey, empId);
  const month = { ...(next.months[monthKey] ?? {}) };
  const payload = month[empId]!;
  const newDays = { ...payload.days };

  for (let d = 1; d <= dim; d++) {
    const prev = newDays[d] ?? emptyDay();
    const val = split[d - 1] ?? 0;
    newDays[d] = { ...prev, [dk]: round1(val) } as typeof prev;
  }

  month[empId] = { days: newDays };
  next = { ...next, months: { ...next.months, [monthKey]: month } };
  return next;
}

function applyBemerkung(data: PlannerData, monthKey: MonthKey, empId: string, text: string): PlannerData {
  let next = ensurePayload(data, monthKey, empId);
  const month = { ...(next.months[monthKey] ?? {}) };
  const payload = month[empId]!;
  const newDays = { ...payload.days };
  const d1 = newDays[1] ?? emptyDay();
  newDays[1] = { ...d1, bemerkung: text };
  month[empId] = { days: newDays };
  next = { ...next, months: { ...next.months, [monthKey]: month } };
  return next;
}

export function PlannerStateManager({ year, employeeIds, storageTenantKey, children }: Props) {
  const [data, setData] = useState<PlannerData>(() => {
    const saved =
      typeof window !== 'undefined' ? loadPlannerFromStorage(storageTenantKey, year) : null;
    return mergePlannerData(year, employeeIds, saved);
  });

  const employeeIdsKey = employeeIds.join(',');

  useEffect(() => {
    const saved = loadPlannerFromStorage(storageTenantKey, year);
    setData(mergePlannerData(year, employeeIds, saved));
  }, [year, employeeIdsKey, storageTenantKey]);

  const syncFromPlannerRpc = useCallback(async () => {
    if (employeeIds.length === 0) return;
    try {
      const rpc = await fetchRpcHoursForYear(year, employeeIds, storageTenantKey);
      setData((prev) => applyRpcYearToPlannerData(prev, rpc, employeeIds, true));
    } catch (e) {
      console.error('Montatsplaner RPC sync failed:', e);
    }
  }, [year, employeeIds, employeeIdsKey, storageTenantKey]);

  useEffect(() => {
    void syncFromPlannerRpc();
  }, [syncFromPlannerRpc]);

  useEffect(() => {
    const onPlannerChanged = () => {
      void syncFromPlannerRpc();
    };
    window.addEventListener(PLANNER_ASSIGNMENTS_CHANGED, onPlannerChanged);
    return () => window.removeEventListener(PLANNER_ASSIGNMENTS_CHANGED, onPlannerChanged);
  }, [syncFromPlannerRpc]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void syncFromPlannerRpc();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [syncFromPlannerRpc]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void syncFromPlannerRpc();
    }, 60000);
    return () => window.clearInterval(id);
  }, [syncFromPlannerRpc]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      savePlannerToStorage(storageTenantKey, data);
    }, 150);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [data, storageTenantKey]);

  const updateMetricTotal = useCallback(
    (monthKey: MonthKey, empId: string, metric: MetricField, total: number) => {
      setData((prev) => applyMetricTotal(prev, monthKey, empId, metric, total));
    },
    []
  );

  const updateBemerkung = useCallback((monthKey: MonthKey, empId: string, text: string) => {
    setData((prev) => applyBemerkung(prev, monthKey, empId, text));
  }, []);

  const yearTotals = useMemo(
    () => computeYearTotalsMap(data, employeeIds),
    [data, employeeIdsKey]
  );

  const value = useMemo<PlannerContextValue>(
    () => ({
      data,
      yearTotals,
      updateMetricTotal,
      updateBemerkung,
    }),
    [data, yearTotals, updateMetricTotal, updateBemerkung]
  );

  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>;
}

export function usePlanner(): PlannerContextValue {
  const ctx = useContext(PlannerContext);
  if (!ctx) {
    throw new Error('usePlanner must be used within PlannerStateManager');
  }
  return ctx;
}

/** Optional hook when context may be absent (read-only blocks). */
export function usePlannerOptional(): PlannerContextValue | null {
  return useContext(PlannerContext);
}
