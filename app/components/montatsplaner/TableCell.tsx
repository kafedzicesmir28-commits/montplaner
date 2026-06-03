'use client';

import styles from './montatsplaner.module.css';

type DataCellProps = {
  value: number;
};

export function DataCell({ value }: DataCellProps) {
  return (
    <td className={`${styles.cell} ${styles.dataCell}`}>
      {value.toFixed(1)}
    </td>
  );
}

type BemerkungCellProps = {
  text: string;
};

export function BemerkungCell({ text }: BemerkungCellProps) {
  return (
    <td className={`${styles.cell} ${styles.dataCell} ${styles.bemerkungCell}`}>
      {text || ''}
    </td>
  );
}
