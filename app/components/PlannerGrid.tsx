'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { Employee, Shift, Store, Vacation } from '@/types/database';
import { calculateHourBuckets, formatDate, isDateInVacation } from '@/lib/utils';
import { t } from '@/lib/translations';
import PlannerCell, { type PlannerAssignment } from '@/components/PlannerCell';

type StoreRow = Store & { color?: string | null };
type AssignmentWithStore = PlannerAssignment & { store?: StoreRow | null };

export type PlannerGridProps = {
  employees: Employee[];
  days: Date[];
  assignments: AssignmentWithStore[];
  vacations: Vacation[];
  stores: StoreRow[];
  shifts: Shift[];
  onAssignmentsUpdated: () => void | Promise<void>;
  readOnly?: boolean;
  employeeProfileBasePath?: string;
  printWeeklyTotals?: boolean;
  forceStoreId?: string;
  lockStoreSelection?: boolean;
  enableStoreDrop?: boolean;
  pendingStoreByKey?: Record<string, string>;
  hideUnassignedStorePreview?: boolean;
  unavailableDayKeys?: string[];
  onStoreDrop?: (employeeId: string, dateStr: string, storeId: string | null) => void;
  onStatusDrop?: (employeeId: string, dateStr: string, statusType: 'FREI' | 'KRANK' | 'FERIEN') => void;
  storesLoaded?: boolean;
};

function isVacationDay(vacations: Vacation[], employeeId: string, date: string): boolean {
  return vacations.some((v) => {
    if (v.employee_id !== employeeId) return false;
    return isDateInVacation(date, v.start_date, v.end_date);
  });
}

function shiftById(shifts: Shift[], id: string): Shift | undefined {
  return shifts.find((s) => s.id === id);
}

/** ISO 8601 week number (Mon–Sun), local calendar date. */
function getISOWeek(date: Date): number {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    )
  );
}

/** ISO week-year (may differ from calendar year in late Dec / early Jan). */
function getISOWeekYear(date: Date): number {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  return d.getFullYear();
}

type WeekSegment = {
  weekNumber: number;
  weekYear: number;
  days: Date[];
};

function segmentDaysByISOWeek(days: Date[]): WeekSegment[] {
  const segments: WeekSegment[] = [];
  for (const day of days) {
    const weekNumber = getISOWeek(day);
    const weekYear = getISOWeekYear(day);
    const last = segments[segments.length - 1];
    if (last && last.weekNumber === weekNumber && last.weekYear === weekYear) {
      last.days.push(day);
    } else {
      segments.push({ weekNumber, weekYear, days: [day] });
    }
  }
  return segments;
}

export default function PlannerGrid({
  employees,
  days,
  assignments,
  vacations,
  stores,
  shifts,
  onAssignmentsUpdated,
  readOnly = false,
  employeeProfileBasePath,
  printWeeklyTotals = false,
  forceStoreId,
  lockStoreSelection = false,
  enableStoreDrop = false,
  pendingStoreByKey,
  hideUnassignedStorePreview = false,
  unavailableDayKeys,
  onStoreDrop,
  onStatusDrop,
  storesLoaded = true,
}: PlannerGridProps) {
  const weekSegments = useMemo(() => segmentDaysByISOWeek(days), [days]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const syncingFromRef = useRef<'top' | 'bottom' | null>(null);
  const [tableWidth, setTableWidth] = useState(0);
  const storeMap = useMemo(() => {
    const map = new Map<string, StoreRow>();
    for (const store of stores) {
      map.set(store.id, store);
    }
    return map;
  }, [stores]);
  const assignmentByKey = useMemo(() => {
    const map = new Map<string, AssignmentWithStore>();
    for (const assignment of assignments) {
      map.set(`${assignment.employee_id}:${assignment.date}`, assignment);
    }
    return map;
  }, [assignments]);
  const unavailableDayKeySet = useMemo(
    () => new Set(unavailableDayKeys ?? []),
    [unavailableDayKeys]
  );

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (!editingKey) return;
      const root = gridRef.current;
      if (root && !root.contains(e.target as Node)) {
        setEditingKey(null);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [editingKey]);

  const monthAnchor = days.length ? formatDate(days[0]!) : '';
  useEffect(() => {
    setEditingKey(null);
  }, [monthAnchor]);

  useEffect(() => {
    const measure = () => {
      const bottom = bottomScrollRef.current;
      if (!bottom) return;
      const nextWidth = bottom.scrollWidth ?? 0;
      setTableWidth(nextWidth);
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
  }, [days, employees, assignments, stores, shifts, vacations, printWeeklyTotals]);

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

  const getHoursForCell = (assignment: AssignmentWithStore | undefined, shift: Shift | undefined): number => {
    if (assignment?.assignment_type && assignment.assignment_type !== 'SHIFT') return 0;
    if (!assignment || !shift) return 0;
    const start = assignment.custom_start_time
      ? String(assignment.custom_start_time).split(':').slice(0, 2).join(':')
      : shift.start_time;
    const end = assignment.custom_end_time
      ? String(assignment.custom_end_time).split(':').slice(0, 2).join(':')
      : shift.end_time;
    return calculateHourBuckets(start, end, Number(shift.break_minutes ?? 0), assignment.date).effectiveHours;
  };

  if (!storesLoaded) return null;

  return (
    <div ref={gridRef} className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div ref={topScrollRef} className="overflow-x-auto">
        <div style={{ width: tableWidth, height: 1 }} aria-hidden />
      </div>
      <div ref={bottomScrollRef} className="overflow-x-auto">
        <div className="inline-block min-w-full align-middle">
          <div className="bg-white">
          <table
            className="min-w-full border-collapse text-gray-900"
            style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
          >
            <thead>
              <tr className="bg-[#f8fafc]">
                <th
                  scope="col"
                  rowSpan={2}
                  className="sticky left-0 top-0 z-30 border border-gray-200 border-r border-gray-200 bg-white px-2 py-1.5 align-middle text-left text-[11px] font-bold uppercase tracking-wide text-gray-700"
                >
                  {t.employee}
                </th>
                {weekSegments.map((seg, si) => (
                  <Fragment key={`kw-${seg.weekYear}-W${seg.weekNumber}-${formatDate(seg.days[0]!)}`}>
                    <th
                      scope="colgroup"
                      colSpan={seg.days.length}
                      className={`sticky top-0 z-20 border border-gray-200 px-0.5 py-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-gray-700 ${
                        si % 2 === 0 ? 'bg-[#eef2f7]' : 'bg-[#e9eef5]'
                      }`}
                      title={`KW ${seg.weekNumber} (${seg.weekYear})`}
                    >
                      KW {seg.weekNumber}
                    </th>
                    {printWeeklyTotals && si < weekSegments.length - 1 ? (
                      <th
                        scope="col"
                        rowSpan={2}
                        className="sticky top-0 z-20 border border-gray-200 bg-gray-100 px-1 py-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-gray-700"
                      >
                        Total
                      </th>
                    ) : null}
                    {printWeeklyTotals && si === weekSegments.length - 1 ? (
                      <th
                        scope="col"
                        rowSpan={2}
                        className="sticky top-0 z-20 border border-gray-200 bg-blue-50 px-1 py-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-blue-900"
                      >
                        Month
                      </th>
                    ) : null}
                  </Fragment>
                ))}
              </tr>
              <tr className="bg-[#f8fafc]">
                {weekSegments.map((seg, segIdx) => (
                  <Fragment key={`hdr-${seg.weekYear}-W${seg.weekNumber}-${formatDate(seg.days[0]!)}`}>
                    {seg.days.map((day) => (
                      <th
                        key={day.toISOString()}
                        scope="col"
                        className={`sticky top-[28px] z-20 border border-gray-200 px-0.5 py-1.5 text-center text-[11px] font-bold uppercase text-gray-700 ${
                          segIdx % 2 === 0 ? 'bg-[#f8fafc]' : 'bg-[#f3f6fb]'
                        }`}
                      >
                        <div>{day.getDate()}</div>
                        <div className="font-semibold text-gray-500">
                          {day.toLocaleDateString('en-US', { weekday: 'short' })}
                        </div>
                      </th>
                    ))}
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map((employee, rowIdx) => (
                <tr key={employee.id} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <th
                    scope="row"
                    className="sticky left-0 z-20 whitespace-nowrap border border-gray-200 border-r border-gray-200 bg-white px-2 py-1.5 text-left text-[13px] font-semibold text-gray-900"
                  >
                    {employeeProfileBasePath ? (
                      <Link
                        href={`${employeeProfileBasePath}/${employee.id}`}
                        className="underline decoration-gray-400 underline-offset-2 hover:decoration-gray-700"
                      >
                        {employee.name}
                      </Link>
                    ) : (
                      employee.name
                    )}
                  </th>
                  {(() => {
                    const employeeMonthTotal = weekSegments.reduce((sum, seg) => {
                      return (
                        sum +
                        seg.days.reduce((segSum, day) => {
                          const dateStr = formatDate(day);
                          const assignment = assignmentByKey.get(`${employee.id}:${dateStr}`);
                          const shift = assignment?.shift_id ? shiftById(shifts, assignment.shift_id) : undefined;
                          return segSum + getHoursForCell(assignment, shift);
                        }, 0)
                      );
                    }, 0);

                    return weekSegments.flatMap((seg, si) => {
                    let weekTotal = 0;
                    const chunk = seg.days.map((day) => {
                      const dateStr = formatDate(day);
                      const assignment = assignmentByKey.get(`${employee.id}:${dateStr}`);
                      const isVacation = isVacationDay(vacations, employee.id, dateStr);
                      const relationalStore = assignment?.store as StoreRow | StoreRow[] | null | undefined;
                      const resolvedRelationalStore = Array.isArray(relationalStore)
                        ? relationalStore[0]
                        : relationalStore;
                      const store =
                        resolvedRelationalStore ??
                        (assignment?.store_id ? storeMap.get(assignment.store_id) : undefined);
                      const shift = assignment?.shift_id ? shiftById(shifts, assignment.shift_id) : undefined;
                      if (!isVacation) {
                        const cellHours = getHoursForCell(assignment, shift);
                        weekTotal += cellHours;
                      }

                      const cellKey = `${employee.id}:${dateStr}`;
                      const isUnavailable = unavailableDayKeySet.has(cellKey);
                      return (
                        <PlannerCell
                          key={`${employee.id}-${dateStr}`}
                          employeeId={employee.id}
                          dateStr={dateStr}
                          isVacation={isVacation}
                          vacationLabel={t.plannerVacation}
                          assignment={assignment}
                          store={store}
                          shift={shift}
                          shifts={shifts}
                          stores={stores}
                          forceStoreId={forceStoreId}
                          lockStoreSelection={lockStoreSelection}
                          enableStoreDrop={enableStoreDrop}
                          pendingStoreId={pendingStoreByKey?.[cellKey]}
                          hideUnassignedStorePreview={hideUnassignedStorePreview}
                          isUnavailable={isUnavailable}
                          onStoreDrop={onStoreDrop}
                          onStatusDrop={onStatusDrop}
                          isEditing={!readOnly && !isVacation && !isUnavailable && editingKey === cellKey}
                          readOnly={readOnly}
                          onActivate={() => {
                            if (!readOnly && !isVacation && !isUnavailable) setEditingKey(cellKey);
                          }}
                          onSaved={onAssignmentsUpdated}
                        />
                      );
                    });

                    if (printWeeklyTotals && si < weekSegments.length - 1) {
                      chunk.push(
                        <td
                          key={`${employee.id}-wsum-${seg.weekYear}-${seg.weekNumber}-${si}`}
                          className="border border-gray-200 bg-gray-100 px-2 py-1 text-right text-[11px] font-semibold tabular-nums text-gray-800"
                        >
                          {weekTotal.toFixed(1)}h
                        </td>
                      );
                    }
                    if (printWeeklyTotals && si === weekSegments.length - 1) {
                      chunk.push(
                        <td
                          key={`${employee.id}-msum`}
                          className="border border-gray-200 bg-blue-50 px-2 py-1 text-right text-[11px] font-bold tabular-nums text-blue-900"
                        >
                          {employeeMonthTotal.toFixed(1)}h
                        </td>
                      );
                    }
                    return chunk;
                  });
                  })()}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </div>
  );
}
