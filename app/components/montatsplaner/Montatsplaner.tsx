'use client';



import { useEffect, useRef, useState } from 'react';
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
  const topScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const syncingFromRef = useRef<'top' | 'bottom' | null>(null);
  const [tableWidth, setTableWidth] = useState(0);

  useEffect(() => {
    const measure = () => {
      const bottom = bottomScrollRef.current;
      if (!bottom) return;
      setTableWidth(bottom.scrollWidth ?? 0);
    };

    measure();
    const bottom = bottomScrollRef.current;
    if (!bottom) return;

    const ro = new ResizeObserver(() => {
      measure();
    });
    ro.observe(bottom);
    window.addEventListener('resize', measure);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [employees.length, year]);

  useEffect(() => {
    const top = topScrollRef.current;
    const bottom = bottomScrollRef.current;
    if (!top || !bottom) return;

    const syncTop = () => {
      if (syncingFromRef.current === 'bottom') return;
      syncingFromRef.current = 'top';
      bottom.scrollLeft = top.scrollLeft;
      syncingFromRef.current = null;
    };

    const syncBottom = () => {
      if (syncingFromRef.current === 'top') return;
      syncingFromRef.current = 'bottom';
      top.scrollLeft = bottom.scrollLeft;
      syncingFromRef.current = null;
    };

    top.scrollLeft = bottom.scrollLeft;
    top.addEventListener('scroll', syncTop);
    bottom.addEventListener('scroll', syncBottom);

    return () => {
      top.removeEventListener('scroll', syncTop);
      bottom.removeEventListener('scroll', syncBottom);
    };
  }, []);

  return (
    <div id="montatsplaner-export-root" className={styles.root}>
      <div ref={topScrollRef} className={styles.topScroll}>
        <div style={{ width: tableWidth, height: 1 }} aria-hidden />
      </div>
      <div ref={bottomScrollRef} className={styles.bottomScroll}>
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
    </div>
  );
}

