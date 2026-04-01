'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Layout from '@/components/Layout';
import { supabase } from '@/lib/supabaseClient';
import { Employee, Store, Shift, ShiftAssignment, Vacation } from '@/types/database';
import { getDaysInMonth, formatDate } from '@/lib/utils';
import { t } from '@/lib/translations';
import PlannerGrid from '@/components/PlannerGrid';
import { resolveStoreColor, storeTextColor } from '@/lib/storeColors';

type PlannerAssignmentRow = ShiftAssignment & {
  store?: (Store & { color?: string | null }) | null;
  custom_start_time?: string | null;
  custom_end_time?: string | null;
  assignment_type?: 'SHIFT' | 'FREI' | 'KRANK' | 'FERIEN';
};

function startOfISOWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d;
}

function endOfISOWeek(date: Date): Date {
  const d = startOfISOWeek(date);
  d.setDate(d.getDate() + 6);
  return d;
}

function addDays(date: Date, daysToAdd: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + daysToAdd);
  return d;
}

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

function getISOWeekYear(date: Date): number {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  return d.getFullYear();
}

function startOfISOWeekFromYearWeek(weekYear: number, weekNumber: number): Date {
  const jan4 = new Date(weekYear, 0, 4);
  const jan4WeekStart = startOfISOWeek(jan4);
  return addDays(jan4WeekStart, (weekNumber - 1) * 7);
}

function getISOWeeksInYear(year: number): number {
  const dec28 = new Date(year, 11, 28);
  return getISOWeek(dec28);
}

export default function PlannerPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<PlannerAssignmentRow[]>([]);
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [loading, setLoading] = useState(true);
  const [storesLoaded, setStoresLoaded] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [selectedWeekA, setSelectedWeekA] = useState<string>('');
  const [selectedWeekB, setSelectedWeekB] = useState<string>('');
  const [printSelection, setPrintSelection] = useState<{ weekA: string; weekB: string } | null>(null);
  const [printScale, setPrintScale] = useState(1);
  const [pendingStoreByKey, setPendingStoreByKey] = useState<Record<string, string>>({});
  const [savingEmployeeOrder, setSavingEmployeeOrder] = useState(false);
  const printRootRef = useRef<HTMLDivElement>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const days = getDaysInMonth(year, month);

  const activeWeekMeta = useMemo(() => {
    const today = new Date();
    const anchorDate =
      today.getFullYear() === year && today.getMonth() === month
        ? today
        : new Date(year, month, 1);
    return {
      week: getISOWeek(anchorDate),
      weekYear: getISOWeekYear(anchorDate),
    };
  }, [year, month]);

  const printWeekOptions = useMemo(() => {
    const totalWeeks = getISOWeeksInYear(activeWeekMeta.weekYear);
    return Array.from({ length: totalWeeks }, (_, idx) => {
      const week = idx + 1;
      const id = `${activeWeekMeta.weekYear}-W${String(week).padStart(2, '0')}`;
      return { id, label: `KW${week}` };
    });
  }, [activeWeekMeta.weekYear]);

  const defaultWeekSelection = useMemo(() => {
    const totalWeeks = getISOWeeksInYear(activeWeekMeta.weekYear);
    const first = activeWeekMeta.week;
    const second = first < totalWeeks ? first + 1 : Math.max(1, first - 1);
    return {
      weekA: `${activeWeekMeta.weekYear}-W${String(first).padStart(2, '0')}`,
      weekB: `${activeWeekMeta.weekYear}-W${String(second).padStart(2, '0')}`,
    };
  }, [activeWeekMeta.week, activeWeekMeta.weekYear]);

  const printDays = useMemo(() => {
    if (!printSelection) return [];
    const toWeekStart = (weekId: string) => {
      const [weekYearPart, weekPart] = weekId.split('-W');
      const weekYear = Number(weekYearPart);
      const weekNumber = Number(weekPart);
      if (!Number.isFinite(weekYear) || !Number.isFinite(weekNumber)) return null;
      return startOfISOWeekFromYearWeek(weekYear, weekNumber);
    };
    const firstStart = toWeekStart(printSelection.weekA);
    const secondStart = toWeekStart(printSelection.weekB);
    if (!firstStart || !secondStart) return [];
    const firstWeekDays = Array.from({ length: 7 }, (_, idx) => addDays(firstStart, idx));
    const secondWeekDays = Array.from({ length: 7 }, (_, idx) => addDays(secondStart, idx));
    return [...firstWeekDays, ...secondWeekDays];
  }, [printSelection]);

  const selectedWeeksAreValid =
    selectedWeekA !== '' &&
    selectedWeekB !== '' &&
    selectedWeekA !== selectedWeekB &&
    printWeekOptions.some((opt) => opt.id === selectedWeekA) &&
    printWeekOptions.some((opt) => opt.id === selectedWeekB);

  useEffect(() => {
    if (!printSelection || printDays.length === 0) return;
    const id = window.setTimeout(() => {
      const mmToPx = (mm: number) => (mm / 25.4) * 96;
      const pageWidthPx = mmToPx(297); // A4 landscape width
      const pageHeightPx = mmToPx(210); // A4 landscape height
      const marginPx = mmToPx(16); // 8mm each side => 16mm total
      const availableWidth = pageWidthPx - marginPx;
      const availableHeight = pageHeightPx - marginPx;
      const content = printRootRef.current;
      if (content) {
        const contentWidth = Math.max(content.scrollWidth, content.offsetWidth, 1);
        const contentHeight = Math.max(content.scrollHeight, content.offsetHeight, 1);
        const fitScale = Math.min(1, availableWidth / contentWidth, availableHeight / contentHeight);
        setPrintScale(Number.isFinite(fitScale) && fitScale > 0 ? fitScale : 0.85);
      } else {
        setPrintScale(0.85);
      }
      window.scrollTo(0, 0);
      document.body.style.height = 'auto';
      window.setTimeout(() => window.print(), 120);
    }, 120);
    return () => window.clearTimeout(id);
  }, [printSelection, printDays.length]);

  useEffect(() => {
    const onAfterPrint = () => {
      setPrintSelection(null);
      setPrintScale(1);
      document.body.style.height = '';
    };
    window.addEventListener('afterprint', onAfterPrint);
    return () => window.removeEventListener('afterprint', onAfterPrint);
  }, []);

  const pendingStoreStorageKey = useMemo(
    () => `planner-pending-stores:${year}-${String(month + 1).padStart(2, '0')}`,
    [year, month]
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(pendingStoreStorageKey);
      if (!raw) {
        setPendingStoreByKey({});
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, string>;
      setPendingStoreByKey(parsed && typeof parsed === 'object' ? parsed : {});
    } catch {
      setPendingStoreByKey({});
    }
  }, [pendingStoreStorageKey]);

  useEffect(() => {
    localStorage.setItem(pendingStoreStorageKey, JSON.stringify(pendingStoreByKey));
  }, [pendingStoreStorageKey, pendingStoreByKey]);

  const fetchAllData = useCallback(async (options?: { preserveView?: boolean }) => {
    const preserveView = options?.preserveView ?? false;
    if (!preserveView) {
      setLoading(true);
      setStoresLoaded(false);
    }
    try {
      const [employeesRes, storesRes, shiftsRes, assignmentsRes, vacationsRes] = await Promise.all([
        supabase
          .from('employees')
          .select('*')
          .order('sort_order', { ascending: true, nullsFirst: false })
          .order('name', { ascending: true }),
        supabase.from('stores').select('id,name,color').order('name'),
        supabase.from('shifts').select('*').order('start_time'),
        supabase
          .from('shift_assignments')
          .select(`
            *,
            store:stores(
              id,
              name,
              color
            )
          `)
          .gte('date', formatDate(startOfISOWeek(new Date(year, month, 1))))
          .lte('date', formatDate(endOfISOWeek(new Date(year, month + 1, 0)))),
        supabase
          .from('vacations')
          .select('*')
          .lte('start_date', formatDate(endOfISOWeek(new Date(year, month + 1, 0))))
          .gte('end_date', formatDate(startOfISOWeek(new Date(year, month, 1)))),
      ]);

      if (employeesRes.error) throw employeesRes.error;
      if (storesRes.error) throw storesRes.error;
      if (shiftsRes.error) throw shiftsRes.error;
      if (assignmentsRes.error) throw assignmentsRes.error;
      if (vacationsRes.error) throw vacationsRes.error;

      setEmployees(employeesRes.data || []);
      setStores(storesRes.data || []);
      setStoresLoaded(true);
      setShifts(shiftsRes.data || []);
      setAssignments((assignmentsRes.data || []) as PlannerAssignmentRow[]);
      const existingKeys = new Set(
        ((assignmentsRes.data || []) as PlannerAssignmentRow[]).map((a) => `${a.employee_id}:${a.date}`)
      );
      setPendingStoreByKey((prev) => {
        const next: Record<string, string> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (!existingKeys.has(k)) next[k] = v;
        }
        return next;
      });
      setVacations(vacationsRes.data || []);
    } catch (error: any) {
      console.error('Error fetching data:', error.message);
      alert('Error loading data: ' + error.message);
    } finally {
      if (!preserveView) {
        setLoading(false);
      }
    }
  }, [year, month]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const changeMonth = (delta: number) => {
    setCurrentDate(new Date(year, month + delta, 1));
  };

  const handleStoreDrop = useCallback((employeeId: string, dateStr: string, storeId: string | null) => {
    const key = `${employeeId}:${dateStr}`;
    setPendingStoreByKey((prev) => {
      const next: Record<string, string> = {};
      // Keep pending store scoped to one selected day per employee.
      // This prevents implicit carry-over to other days.
      for (const [k, v] of Object.entries(prev)) {
        if (!k.startsWith(`${employeeId}:`)) next[k] = v;
      }
      if (storeId) next[key] = storeId;
      return next;
    });
  }, []);

  const handleStatusDrop = useCallback(async (
    employeeId: string,
    dateStr: string,
    statusType: 'FREI' | 'KRANK' | 'FERIEN'
  ) => {
    try {
      const { error } = await supabase
        .from('shift_assignments')
        .upsert(
          {
            employee_id: employeeId,
            date: dateStr,
            assignment_type: statusType,
            shift_id: null,
            store_id: null,
            custom_start_time: null,
            custom_end_time: null,
          },
          { onConflict: 'employee_id,date' }
        );
      if (error) throw error;
      setPendingStoreByKey((prev) => {
        const next = { ...prev };
        delete next[`${employeeId}:${dateStr}`];
        return next;
      });
      await fetchAllData({ preserveView: true });
    } catch (e: any) {
      console.error('Status drop save failed:', e?.message || e);
    }
  }, [fetchAllData]);

  const swapEmployeePosition = useCallback(async (employeeId: string, newPosition: number) => {
    if (savingEmployeeOrder) return;
    const sorted = [...employees].sort((a, b) => {
      const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER;
      const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name);
    });
    const workerA = sorted.find((w) => w.id === employeeId);
    if (!workerA) return;
    const maxPosition = sorted.length;
    const clampedPosition = Math.max(1, Math.min(newPosition, maxPosition));
    const workerB = sorted[clampedPosition - 1];
    if (!workerB || workerB.id === workerA.id) return;

    const next = sorted.map((w) => ({ ...w }));
    const indexA = next.findIndex((w) => w.id === workerA.id);
    const indexB = next.findIndex((w) => w.id === workerB.id);
    if (indexA < 0 || indexB < 0) return;
    const posA = next[indexA].sort_order ?? indexA + 1;
    const posB = next[indexB].sort_order ?? indexB + 1;
    next[indexA].sort_order = posB;
    next[indexB].sort_order = posA;

    const persistedOrder = [...next].sort((a, b) => {
      const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER;
      const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name);
    });
    setEmployees(persistedOrder);
    setSavingEmployeeOrder(true);
    try {
      const updates = [
        supabase.from('employees').update({ sort_order: posB }).eq('id', workerA.id),
        supabase.from('employees').update({ sort_order: posA }).eq('id', workerB.id),
      ];
      const results = await Promise.all(updates);
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to swap employee positions';
      alert(message);
      await fetchAllData({ preserveView: true });
    } finally {
      setSavingEmployeeOrder(false);
    }
  }, [employees, fetchAllData, savingEmployeeOrder]);

  const openPrintModal = useCallback(() => {
    const base = printSelection ?? defaultWeekSelection;
    setSelectedWeekA(base.weekA);
    setSelectedWeekB(base.weekB);
    setIsPrintModalOpen(true);
  }, [defaultWeekSelection, printSelection]);

  const closePrintModal = useCallback(() => {
    setIsPrintModalOpen(false);
  }, []);

  const confirmPrintSelection = useCallback(() => {
    if (!selectedWeeksAreValid) return;
    setPrintSelection({ weekA: selectedWeekA, weekB: selectedWeekB });
    setIsPrintModalOpen(false);
  }, [selectedWeekA, selectedWeekB, selectedWeeksAreValid]);

  if (loading || !storesLoaded) {
    return (
      <AuthGuard>
        <Layout>
          <div className="text-center">{t.loading}</div>
        </Layout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <Layout
        plannerControls={
          <>
            <h1 className="whitespace-nowrap text-sm font-semibold text-gray-900">{t.monthlyPlanner}</h1>
            <h2 className="whitespace-nowrap text-sm font-semibold text-gray-700">
              {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h2>
            <button
              onClick={() => changeMonth(-1)}
              className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {t.previous}
            </button>
            <button
              onClick={() => changeMonth(1)}
              className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {t.next}
            </button>
            <button
              type="button"
              onClick={openPrintModal}
              className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Print 2 Weeks
            </button>
          </>
        }
      >
        <div className="print:hidden space-y-3 pt-0">

          <div className="sticky top-14 z-[80] rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Stores (drag to a day cell)</div>
                <div className="flex flex-wrap gap-2">
                  {stores.map((store) => (
                    <button
                      key={store.id}
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-store-id', store.id);
                        e.dataTransfer.setData('text/plain', store.id);
                        e.dataTransfer.setData('application/x-planner-item', JSON.stringify({ kind: 'store', id: store.id }));
                        e.dataTransfer.effectAllowed = 'copyMove';
                      }}
                      className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1 text-xs font-semibold hover:opacity-90"
                      style={{
                        backgroundColor: resolveStoreColor(store.color),
                        color: storeTextColor(resolveStoreColor(store.color)),
                      }}
                      title={`Drag ${store.name} to planner cell`}
                    >
                      <span className="h-2 w-2 rounded-full bg-white/80" aria-hidden />
                      {store.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Global Status</div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'FREI', label: 'Frei', bg: '#d1d5db' },
                    { id: 'KRANK', label: 'KR', bg: '#f87171' },
                    { id: 'FERIEN', label: 'FE', bg: '#bbf7d0' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-planner-item', JSON.stringify({ kind: 'status', id: s.id }));
                        e.dataTransfer.effectAllowed = 'copyMove';
                      }}
                      className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-800 hover:opacity-90"
                      style={{ backgroundColor: s.bg }}
                      title={`Drag ${s.label} to planner cell`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <PlannerGrid
            employees={employees}
            days={days}
            assignments={assignments}
            vacations={vacations}
            stores={stores}
            shifts={shifts}
            onAssignmentsUpdated={() => fetchAllData({ preserveView: true })}
            printWeeklyTotals
            lockStoreSelection
            enableStoreDrop
            pendingStoreByKey={pendingStoreByKey}
            onStoreDrop={handleStoreDrop}
            onStatusDrop={handleStatusDrop}
            storesLoaded={storesLoaded}
            savingEmployeeOrder={savingEmployeeOrder}
            onSwapEmployeePosition={swapEmployeePosition}
          />
        </div>

        {isPrintModalOpen ? (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 print:hidden">
            <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-4 shadow-xl">
              <h3 className="text-base font-semibold text-gray-900">Select weeks to print</h3>
              <div className="mt-3 space-y-3">
                <label className="block text-sm font-medium text-gray-700">
                  First week
                  <select
                    value={selectedWeekA}
                    onChange={(e) => setSelectedWeekA(e.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
                  >
                    {printWeekOptions.map((opt) => (
                      <option key={`a-${opt.id}`} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Second week
                  <select
                    value={selectedWeekB}
                    onChange={(e) => setSelectedWeekB(e.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
                  >
                    {printWeekOptions.map((opt) => (
                      <option key={`b-${opt.id}`} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedWeekA === selectedWeekB ? (
                  <p className="text-xs font-medium text-red-600">Please select two different weeks.</p>
                ) : null}
              </div>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closePrintModal}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmPrintSelection}
                  disabled={!selectedWeeksAreValid}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Print
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {printSelection && printDays.length > 0 ? (
          <div
            id="print-scale-wrapper"
            className="hidden print:block"
            style={{
              transform: `scale(${printScale})`,
              transformOrigin: 'top left',
              width: `${100 / Math.max(printScale, 0.01)}%`,
            }}
          >
            <div id="planner-print-root" ref={printRootRef} className="space-y-3">
              <div className="text-center">
                <h1 className="text-lg font-bold text-gray-900">
                  {t.monthlyPlanner} — {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  {' '}
                  ({printSelection.weekA.replace('-', ' ')} + {printSelection.weekB.replace('-', ' ')})
                </h1>
              </div>
              <PlannerGrid
                employees={employees}
                days={printDays}
                assignments={assignments}
                vacations={vacations}
                stores={stores}
                shifts={shifts}
                onAssignmentsUpdated={() => fetchAllData({ preserveView: true })}
                printWeeklyTotals
                readOnly
                storesLoaded={storesLoaded}
              />
            </div>
          </div>
        ) : null}
        <style jsx global>{`
          @media print {
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            body * {
              visibility: hidden !important;
            }

            #planner-print-root,
            #planner-print-root * {
              visibility: visible !important;
            }

            #planner-print-root {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              page-break-before: avoid;
              page-break-after: avoid;
              page-break-inside: avoid;
              break-inside: avoid;
            }

            #planner-print-root .overflow-x-auto {
              overflow: visible !important;
            }

            #planner-print-root table {
              width: 100% !important;
            }

            html,
            body {
              height: auto !important;
              overflow: hidden !important;
            }

            #print-scale-wrapper {
              position: absolute;
              top: 0;
              left: 0;
              transform-origin: top left !important;
            }

            @page {
              size: A4 landscape;
              margin: 8mm;
            }
          }
        `}</style>
      </Layout>
    </AuthGuard>
  );
}

