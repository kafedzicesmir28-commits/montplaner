import type { MetricField, MonthKey, PlannerData } from './plannerTypes';
import { MONTH_KEYS, round1, sumMetricForMonth, getMonthBemerkung, sumBemerkungYear } from './plannerTypes';

export type RowTotals = {
  geleistete: number;
  nacht: number;
  sonntag: number;
  krank: number;
  ferien: number;
  bemerkung: string;
};

export function computeMonthRowTotals(
  data: PlannerData,
  monthKey: MonthKey,
  empId: string
): RowTotals {
  const payload = data.months[monthKey]?.[empId];
  return {
    geleistete: sumMetricForMonth(payload, 'geleistete'),
    nacht: sumMetricForMonth(payload, 'nacht'),
    sonntag: sumMetricForMonth(payload, 'sonntag'),
    krank: sumMetricForMonth(payload, 'krank'),
    ferien: sumMetricForMonth(payload, 'ferien'),
    bemerkung: getMonthBemerkung(payload),
  };
}

export function computeYearTotals(data: PlannerData, empId: string): RowTotals {
  let geleistete = 0;
  let nacht = 0;
  let sonntag = 0;
  let krank = 0;
  let ferien = 0;
  for (const mk of MONTH_KEYS) {
    const row = computeMonthRowTotals(data, mk, empId);
    geleistete += row.geleistete;
    nacht += row.nacht;
    sonntag += row.sonntag;
    krank += row.krank;
    ferien += row.ferien;
  }
  return {
    geleistete: round1(geleistete),
    nacht: round1(nacht),
    sonntag: round1(sonntag),
    krank: round1(krank),
    ferien: round1(ferien),
    bemerkung: sumBemerkungYear(data, empId, MONTH_KEYS),
  };
}

export function computeYearTotalsMap(
  data: PlannerData,
  employeeIds: string[]
): Record<string, RowTotals> {
  const out: Record<string, RowTotals> = {};
  for (const id of employeeIds) {
    out[id] = computeYearTotals(data, id);
  }
  return out;
}

/** Map metric field to RowTotals key (for totals display). */
export function metricFieldToRowKey(field: MetricField): keyof Omit<RowTotals, 'bemerkung'> {
  return field;
}
