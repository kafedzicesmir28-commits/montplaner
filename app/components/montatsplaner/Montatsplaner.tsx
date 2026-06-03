'use client';



import { useCallback, useEffect, useRef, useState } from 'react';
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
  const printFrameRef = useRef<HTMLDivElement>(null);
  const printSlotRef = useRef<HTMLDivElement>(null);
  const printScaleRef = useRef<HTMLDivElement>(null);
  const syncingFromRef = useRef<'top' | 'bottom' | null>(null);
  const [tableWidth, setTableWidth] = useState(0);

  const applyPrintScale = useCallback(() => {
    const frame = printFrameRef.current;
    const slot = printSlotRef.current;
    const layer = printScaleRef.current;
    if (!frame || !slot || !layer) return;
    const pw = frame.clientWidth;
    const ph = frame.clientHeight;
    const w = layer.scrollWidth;
    const h = layer.scrollHeight;
    const s = pw > 0 && ph > 0 && w > 0 && h > 0 ? Math.min(pw / w, ph / h) : 1;
    layer.style.width = `${w}px`;
    layer.style.height = `${h}px`;
    layer.style.transform = `scale(${s})`;
    layer.style.transformOrigin = '0 0';
    slot.style.width = `${w * s}px`;
    slot.style.height = `${h * s}px`;
  }, []);

  const clearPrintScale = useCallback(() => {
    const slot = printSlotRef.current;
    const layer = printScaleRef.current;
    layer?.style.removeProperty('width');
    layer?.style.removeProperty('height');
    layer?.style.removeProperty('transform');
    layer?.style.removeProperty('transform-origin');
    slot?.style.removeProperty('width');
    slot?.style.removeProperty('height');
  }, []);

  useEffect(() => {
    const onBeforePrint = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(applyPrintScale);
      });
    };
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', clearPrintScale);
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', clearPrintScale);
    };
  }, [applyPrintScale, clearPrintScale]);

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
    <div id="monthsplanner-print-area" className={`${styles.printOuter} ${styles.printPageRoot}`}>
      <div ref={printFrameRef} className={styles.printViewport}>
        <div ref={printSlotRef} className={styles.printScaleSlot}>
          <div ref={printScaleRef} className={styles.printScaleLayer}>
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
          </div>
        </div>
      </div>
    </div>
  );
}

