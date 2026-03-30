'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { Employee, Shift, Store, Vacation } from '@/types/database';
import { calculateEmployeeHours } from '@/lib/hoursCalculator';
import { formatDate, formatWorkHoursDisplay, isDateInVacation } from '@/lib/utils';
import { t } from '@/lib/translations';
import PlannerCell, { type PlannerAssignment } from '@/components/PlannerCell';
import { resolveStoreColor, storeTextColor } from '@/lib/storeColors';

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

type EmployeeStoreGroup = {
  key: string;
  label: string;
  rowBgColor: string;
  headerBgColor: string;
  headerTextColor: string;
  employees: Employee[];
};

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace(/^#/, '');
  if (h.length === 3) {
    return {
      r: parseInt(h[0]! + h[0]!, 16),
      g: parseInt(h[1]! + h[1]!, 16),
      b: parseInt(h[2]! + h[2]!, 16),
    };
  }
  if (h.length === 6) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  return null;
}

function mixWithWhite(hex: string, amount: number, fallback = '#f5f5f5'): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return fallback;
  const a = Math.max(0, Math.min(1, amount));
  const r = Math.round(rgb.r + (255 - rgb.r) * a);
  const g = Math.round(rgb.g + (255 - rgb.g) * a);
  const b = Math.round(rgb.b + (255 - rgb.b) * a);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

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

function getHoursForAssignment(assignment: AssignmentWithStore | undefined, shift: Shift | undefined): number {
  if (!assignment || !shift) return 0;
  return calculateEmployeeHours({
    date: assignment.date,
    assignment_type: assignment.assignment_type,
    custom_start_time: assignment.custom_start_time,
    custom_end_time: assignment.custom_end_time,
    custom_break_minutes: assignment.custom_break_minutes,
    shift,
  });
}

function calculateWeeklyHours(
  employeeId: string,
  weekDays: Date[],
  assignmentByKey: Map<string, AssignmentWithStore>,
  shifts: Shift[]
): number {
  return weekDays.reduce((total, day) => {
    const dateStr = formatDate(day);
    const assignment = assignmentByKey.get(`${employeeId}:${dateStr}`);
    const shift = assignment?.shift_id ? shiftById(shifts, assignment.shift_id) : undefined;
    return total + getHoursForAssignment(assignment, shift);
  }, 0);
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
  const employeeStoreGroups = useMemo<EmployeeStoreGroup[]>(() => {
    const byName = (a: Employee, b: Employee) => a.name.localeCompare(b.name);
    const toGroupPalette = (baseColor: string) => ({
      // Use opaque pastel shades so sticky cells never look transparent while scrolling.
      rowBgColor: mixWithWhite(baseColor, 0.82, '#f5f5f5'),
      headerBgColor: mixWithWhite(baseColor, 0.72, '#ececec'),
      headerTextColor: storeTextColor(baseColor),
    });
    if (forceStoreId) {
      const forcedLabel = storeMap.get(forceStoreId)?.name ?? t.employeeStore;
      const baseColor = resolveStoreColor(storeMap.get(forceStoreId)?.color ?? '#f5f5f5');
      return [
        {
          key: `store:${forceStoreId}`,
          label: forcedLabel,
          ...toGroupPalette(baseColor),
          employees: [...employees].sort(byName),
        },
      ];
    }

    const grouped = new Map<string, Employee[]>();
    for (const employee of employees) {
      const storeId = employee.store_id ?? '';
      if (!grouped.has(storeId)) grouped.set(storeId, []);
      grouped.get(storeId)!.push(employee);
    }
    for (const group of grouped.values()) group.sort(byName);

    const assignedStoreIds = stores
      .map((s) => s.id)
      .filter((storeId) => grouped.has(storeId) && (grouped.get(storeId)?.length ?? 0) > 0);

    const out: EmployeeStoreGroup[] = assignedStoreIds.map((storeId) => {
      const baseColor = resolveStoreColor(storeMap.get(storeId)?.color ?? '#f5f5f5');
      return {
        key: `store:${storeId}`,
        label: storeMap.get(storeId)?.name ?? storeId,
        ...toGroupPalette(baseColor),
        employees: grouped.get(storeId)!,
      };
    });

    const unassigned = grouped.get('') ?? [];
    if (unassigned.length > 0) {
      out.push({
        key: 'store:unassigned',
        label: t.unassignedStore,
        ...toGroupPalette('#f5f5f5'),
        employees: unassigned,
      });
    }
    return out;
  }, [employees, forceStoreId, storeMap, stores]);

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
              {employeeStoreGroups.flatMap((group) => {
                const groupHeader = (
                  <tr key={`${group.key}-header`}>
                    <th
                      colSpan={1 + days.length + (printWeeklyTotals ? weekSegments.length : 0)}
                      className="sticky left-0 z-40 border border-gray-200 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide"
                      style={{
                        backgroundColor: group.headerBgColor,
                        color: group.headerTextColor,
                        backgroundClip: 'padding-box',
                      }}
                    >
                      {group.label}
                    </th>
                  </tr>
                );
                const rows = group.employees.map((employee) => (
                  <tr key={employee.id} style={{ backgroundColor: group.rowBgColor }}>
                  <th
                    scope="row"
                    className="sticky left-0 z-30 whitespace-nowrap border border-gray-200 border-r border-gray-200 px-2 py-1.5 text-left text-[13px] font-semibold text-gray-900"
                    style={{
                      backgroundColor: group.rowBgColor,
                      backgroundClip: 'padding-box',
                    }}
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
                    const employeeMonthTotal = weekSegments.reduce(
                      (sum, seg) => sum + calculateWeeklyHours(employee.id, seg.days, assignmentByKey, shifts),
                      0
                    );

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
                      const cellHours = getHoursForAssignment(assignment, shift);
                      weekTotal += cellHours;

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
                          rowBackgroundColor={group.rowBgColor}
                          onActivate={() => {
                            if (!readOnly && !isVacation && !isUnavailable) setEditingKey(cellKey);
                          }}
                          onSaved={onAssignmentsUpdated}
                          onCloseCellEdit={() => setEditingKey(null)}
                        />
                      );
                    });

                    if (printWeeklyTotals && si < weekSegments.length - 1) {
                      chunk.push(
                        <td
                          key={`${employee.id}-wsum-${seg.weekYear}-${seg.weekNumber}-${si}`}
                          className="border border-gray-200 bg-gray-100 px-2 py-1 text-right text-[11px] font-semibold tabular-nums text-gray-800"
                        >
                          {formatWorkHoursDisplay(weekTotal)}
                        </td>
                      );
                    }
                    if (printWeeklyTotals && si === weekSegments.length - 1) {
                      chunk.push(
                        <td
                          key={`${employee.id}-msum`}
                          className="border border-gray-200 bg-blue-50 px-2 py-1 text-right text-[11px] font-bold tabular-nums text-blue-900"
                        >
                          {formatWorkHoursDisplay(employeeMonthTotal)}
                        </td>
                      );
                    }
                    return chunk;
                  });
                  })()}
                </tr>
                ));
                return [groupHeader, ...rows];
              })}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </div>
  );
}
