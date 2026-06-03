'use client';

import styles from './montatsplaner.module.css';
import { DataCell, BemerkungCell } from './TableCell';
import type { HeaderEmployee } from './HeaderRow';
import { usePlanner } from './PlannerStateManager';

type Props = {
  employees: HeaderEmployee[];
};

const ROW_DEF = [
  { key: 'geleistete' as const, label: 'geleistete Stunde', rowClass: styles.rowGeleistete },
  { key: 'nacht' as const, label: 'Nacht/h', rowClass: styles.rowSecondary },
  { key: 'sonntag' as const, label: 'Sonntag/h', rowClass: styles.rowSecondary },
  { key: 'krank' as const, label: 'Krankheitstage', rowClass: styles.rowSecondary },
  { key: 'ferien' as const, label: 'bezogene Ferien', rowClass: styles.rowSecondary },
  { key: 'bemerkung' as const, label: 'Bemerkung', rowClass: styles.rowBemerkung },
];

export function TotalBlock({ employees }: Props) {
  const { yearTotals } = usePlanner();

  return (
    <tbody>
      {ROW_DEF.map((row, rowIdx) => (
        <tr key={`total-${row.key}`} className={row.rowClass}>
          {rowIdx === 0 ? (
            <td className={`${styles.cell} ${styles.monthCell}`} rowSpan={6}>
              <span className={styles.monthLabel}>hr Total</span>
            </td>
          ) : null}
          <td className={`${styles.cell} ${styles.labelCell}`}>{row.label}</td>
          {employees.map((emp) => {
            const m = yearTotals[emp.id];
            if (row.key === 'bemerkung') {
              return <BemerkungCell key={emp.id} text={m?.bemerkung ?? ''} />;
            }
            const v =
              row.key === 'geleistete'
                ? m?.geleistete ?? 0
                : row.key === 'nacht'
                  ? m?.nacht ?? 0
                  : row.key === 'sonntag'
                    ? m?.sonntag ?? 0
                    : row.key === 'krank'
                      ? m?.krank ?? 0
                      : m?.ferien ?? 0;
            return <DataCell key={emp.id} value={v} />;
          })}
        </tr>
      ))}
    </tbody>
  );
}
