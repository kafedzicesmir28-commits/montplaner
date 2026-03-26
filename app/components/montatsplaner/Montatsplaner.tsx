'use client';



import styles from './montatsplaner.module.css';

import { HeaderRow, type HeaderEmployee } from './HeaderRow';

import { MonthBlock } from './MonthBlock';

import { TotalBlock } from './TotalBlock';

import { MONTH_KEYS } from './plannerTypes';



export type { HeaderEmployee };



const MONTH_LABELS = [

  'Januar',

  'Februar',

  'März',

  'April',

  'Mai',

  'Juni',

  'Juli',

  'August',

  'September',

  'Oktober',

  'November',

  'Dezember',

];



type Props = {

  year: number;

  employees: HeaderEmployee[];

};



export function Montatsplaner({ year, employees }: Props) {

  return (

    <div id="montatsplaner-export-root" className={styles.root}>

      <table className={styles.table}>

        <HeaderRow year={year} employees={employees} />

        {MONTH_LABELS.map((label, idx) => (

          <MonthBlock

            key={MONTH_KEYS[idx]}

            monthLabel={label}

            monthKey={MONTH_KEYS[idx]}

            employees={employees}

          />

        ))}

        <TotalBlock employees={employees} />

      </table>

    </div>

  );

}

