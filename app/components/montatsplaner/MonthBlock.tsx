'use client';

import { useMemo } from 'react';
import styles from './montatsplaner.module.css';
import { EditableCell } from './EditableCell';
import type { HeaderEmployee } from './HeaderRow';
import type { MetricField, MonthKey } from './plannerTypes';
import { usePlanner } from './PlannerStateManager';
import { computeMonthRowTotals, type RowTotals } from './totalsCalculator';

const ROW_DEF = [
  { key: 'geleistete' as const, label: 'geleistete Stunde', rowClass: styles.rowGeleistete },
  { key: 'nacht' as const, label: 'Nacht/h', rowClass: styles.rowSecondary },
  { key: 'sonntag' as const, label: 'Sonntag/h', rowClass: styles.rowSecondary },
  { key: 'krank' as const, label: 'Krankheitstage', rowClass: styles.rowSecondary },
  { key: 'ferien' as const, label: 'bezogene Ferien', rowClass: styles.rowSecondary },
  { key: 'bemerkung' as const, label: 'Bemerkung', rowClass: styles.rowBemerkung },
] as const;

type Props = {
  monthLabel: string;
  monthKey: MonthKey;
  employees: HeaderEmployee[];
};

export function MonthBlock({ monthLabel, monthKey, employees }: Props) {
  const { data, updateMetricTotal, updateBemerkung } = usePlanner();
  const year = data.year;

  const byEmp = useMemo(() => {
    const m: Record<string, RowTotals> = {};
    for (const emp of employees) {
      m[emp.id] = computeMonthRowTotals(data, monthKey, emp.id);
    }
    return m;
  }, [data, monthKey, employees]);

  return (
    <tbody id={`montatsplaner-month-${monthKey}`}>
      {ROW_DEF.map((row, rowIdx) => (
        <tr key={row.key} className={row.rowClass}>
          {rowIdx === 0 ? (
            <td className={`${styles.cell} ${styles.monthCell}`} rowSpan={6}>
              <span className={styles.monthLabel}>{monthLabel}</span>
            </td>
          ) : null}
          <td className={`${styles.cell} ${styles.labelCell}`}>{row.label}</td>
          {employees.map((emp) => {
            const totals = byEmp[emp.id];
            if (row.key === 'bemerkung') {
              return (
                <EditableCell
                  key={emp.id}
                  kind="text"
                  value={totals.bemerkung}
                  onCommit={(text) => updateBemerkung(monthKey, emp.id, text)}
                />
              );
            }
            const metric = row.key as MetricField;
            const v =
              metric === 'geleistete'
                ? totals.geleistete
                : metric === 'nacht'
                  ? totals.nacht
                  : metric === 'sonntag'
                    ? totals.sonntag
                    : metric === 'krank'
                      ? totals.krank
                      : totals.ferien;
            return (
              <EditableCell
                key={emp.id}
                kind="numeric"
                year={year}
                monthKey={monthKey}
                metric={metric}
                value={v}
                onCommit={(total) => updateMetricTotal(monthKey, emp.id, metric, total)}
              />
            );
          })}
        </tr>
      ))}
    </tbody>
  );
}
