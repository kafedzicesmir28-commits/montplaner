'use client';

import styles from './montatsplaner.module.css';

export type HeaderEmployee = { id: string; name: string };

type Props = {
  year: number;
  employees: HeaderEmployee[];
};

export function HeaderRow({ year, employees }: Props) {
  return (
    <thead>
      <tr>
        <th className={`${styles.cell} ${styles.headerCell} ${styles.headerYear}`} scope="col">
          {year}
        </th>
        <th
          className={`${styles.cell} ${styles.headerCell} ${styles.headerLabelSpacer}`}
          scope="col"
          aria-hidden
        />
        {employees.map((e) => (
          <th
            key={e.id}
            className={`${styles.cell} ${styles.headerCell} ${styles.headerEmployee}`}
            scope="col"
          >
            <span className={styles.headerEmployeeInner}>{e.name}</span>
          </th>
        ))}
      </tr>
    </thead>
  );
}
