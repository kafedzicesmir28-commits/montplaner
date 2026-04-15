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
import { getCurrentAuthProfile } from '@/lib/authProfile';

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

/** Advance ISO week by `delta` (may cross ISO week-year boundaries). */
function addISOWeek(weekYear: number, weekNumber: number, delta: number): { weekYear: number; weekNumber: number } {
  let y = weekYear;
  let w = weekNumber + delta;
  while (w < 1) {
    y -= 1;
    w += getISOWeeksInYear(y);
  }
  for (;;) {
    const max = getISOWeeksInYear(y);
    if (w <= max) break;
    w -= max;
    y += 1;
  }
  return { weekYear: y, weekNumber: w };
}

function formatWeekId(weekYear: number, weekNumber: number): string {
  return `${weekYear}-W${String(weekNumber).padStart(2, '0')}`;
}

type PlannerPrintWeekCount = 1 | 2 | 3;

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
  const [selectedStartWeek, setSelectedStartWeek] = useState<string>('');
  const [selectedPrintWeekCount, setSelectedPrintWeekCount] = useState<PlannerPrintWeekCount>(1);
  const [printSelection, setPrintSelection] = useState<{
    startWeek: string;
    weekCount: PlannerPrintWeekCount;
  } | null>(null);
  const [printScale, setPrintScale] = useState(1);
  const [pendingStoreByKey, setPendingStoreByKey] = useState<Record<string, string>>({});
  const [savingEmployeeOrder, setSavingEmployeeOrder] = useState(false);
  const [companyName, setCompanyName] = useState<string>('');
  /** Unscaled content (title + grid); used to compute fit-to-page scale. */
  const printRootRef = useRef<HTMLDivElement>(null);
  const printScaleWrapperRef = useRef<HTMLDivElement>(null);

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

  const defaultStartWeekId = useMemo(
    () => formatWeekId(activeWeekMeta.weekYear, activeWeekMeta.week),
    [activeWeekMeta.week, activeWeekMeta.weekYear]
  );

  const printDays = useMemo(() => {
    if (!printSelection) return [];
    const [weekYearPart, weekPart] = printSelection.startWeek.split('-W');
    const weekYear = Number(weekYearPart);
    const weekNumber = Number(weekPart);
    if (!Number.isFinite(weekYear) || !Number.isFinite(weekNumber)) return [];
    const days: Date[] = [];
    for (let w = 0; w < printSelection.weekCount; w++) {
      const { weekYear: wy, weekNumber: wn } = addISOWeek(weekYear, weekNumber, w);
      const weekStart = startOfISOWeekFromYearWeek(wy, wn);
      for (let d = 0; d < 7; d++) {
        days.push(addDays(weekStart, d));
      }
    }
    return days;
  }, [printSelection]);

  const selectedPrintIsValid =
    selectedStartWeek !== '' && printWeekOptions.some((opt) => opt.id === selectedStartWeek);

  useEffect(() => {
    const loadCompanyName = async () => {
      const profile = await getCurrentAuthProfile();
      setCompanyName(profile?.company_name ?? '');
    };
    void loadCompanyName();
  }, []);

  useEffect(() => {
    if (!printSelection || printDays.length === 0) return;
    let cancelled = false;
    let printTimer: number | undefined;

    const runPrint = () => {
      if (cancelled) return;
      const mmToPx = (mm: number) => (mm / 25.4) * 96;
      const marginMm = 8;
      const pageWidthPx = mmToPx(297);
      const pageHeightPx = mmToPx(210);
      const marginPx = mmToPx(marginMm);
      const availableWidth = pageWidthPx - 2 * marginPx;
      const availableHeight = pageHeightPx - 2 * marginPx;
      const content = printRootRef.current;
      const wrapper = printScaleWrapperRef.current;
      const safety = 0.985;
      let fit = 0.85;
      if (content && wrapper) {
        const contentWidth = Math.max(content.scrollWidth, content.offsetWidth, 1);
        const contentHeight = Math.max(content.scrollHeight, content.offsetHeight, 1);
        const fitScale = Math.min(
          1,
          (availableWidth * safety) / contentWidth,
          (availableHeight * safety) / contentHeight
        );
        fit = Number.isFinite(fitScale) && fitScale > 0 ? fitScale : 0.85;
        wrapper.style.transform = `scale(${fit})`;
        wrapper.style.transformOrigin = 'top left';
        wrapper.style.width = `${100 / Math.max(fit, 0.01)}%`;
        setPrintScale(fit);
      } else {
        setPrintScale(fit);
      }
      window.scrollTo(0, 0);
      document.body.style.height = 'auto';
      document.documentElement.style.height = 'auto';
      printTimer = window.setTimeout(() => {
        if (!cancelled) window.print();
      }, 50);
    };

    let rafNested = 0;
    const raf1 = window.requestAnimationFrame(() => {
      rafNested = window.requestAnimationFrame(runPrint);
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(rafNested);
      if (printTimer !== undefined) window.clearTimeout(printTimer);
    };
  }, [printSelection, printDays.length]);

  useEffect(() => {
    const onAfterPrint = () => {
      setPrintSelection(null);
      setPrintScale(1);
      document.body.style.height = '';
      document.documentElement.style.height = '';
      const wrapper = printScaleWrapperRef.current;
      if (wrapper) {
        wrapper.style.transform = '';
        wrapper.style.transformOrigin = '';
        wrapper.style.width = '';
      }
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
      const anchorDate =
        new Date().getFullYear() === year && new Date().getMonth() === month
          ? new Date()
          : new Date(year, month, 1);
      const planWeekYear = getISOWeekYear(anchorDate);
      const plannerRangeStart = startOfISOWeekFromYearWeek(planWeekYear, 1);
      const plannerLastWeekStart = startOfISOWeekFromYearWeek(planWeekYear, getISOWeeksInYear(planWeekYear));
      // Buffer after ISO year end so multi-week prints near year boundary still load shifts.
      const plannerRangeEnd = addDays(plannerLastWeekStart, 6 + 21);
      const rangeStartStr = formatDate(plannerRangeStart);
      const rangeEndStr = formatDate(plannerRangeEnd);

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
          .gte('date', rangeStartStr)
          .lte('date', rangeEndStr),
        supabase
          .from('vacations')
          .select('*')
          .lte('start_date', rangeEndStr)
          .gte('end_date', rangeStartStr),
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

  useEffect(() => {
    const onStoresUpdated = () => {
      void fetchAllData({ preserveView: true });
    };
    window.addEventListener('stores:colors-updated', onStoresUpdated as EventListener);
    return () => window.removeEventListener('stores:colors-updated', onStoresUpdated as EventListener);
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
    } catch (e: unknown) {
      console.error('Status drop save failed:', e);
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
    if (printSelection) {
      setSelectedStartWeek(printSelection.startWeek);
      setSelectedPrintWeekCount(printSelection.weekCount);
    } else {
      setSelectedStartWeek(defaultStartWeekId);
      setSelectedPrintWeekCount(1);
    }
    setIsPrintModalOpen(true);
  }, [defaultStartWeekId, printSelection]);

  const closePrintModal = useCallback(() => {
    setIsPrintModalOpen(false);
  }, []);

  const confirmPrintSelection = useCallback(() => {
    if (!selectedPrintIsValid) return;
    setPrintSelection({ startWeek: selectedStartWeek, weekCount: selectedPrintWeekCount });
    setIsPrintModalOpen(false);
  }, [selectedPrintIsValid, selectedPrintWeekCount, selectedStartWeek]);

  const printTitleWeekLabels = useMemo(() => {
    if (!printSelection) return [];
    const [weekYearPart, weekPart] = printSelection.startWeek.split('-W');
    const weekYear = Number(weekYearPart);
    const weekNumber = Number(weekPart);
    if (!Number.isFinite(weekYear) || !Number.isFinite(weekNumber)) return [];
    return Array.from({ length: printSelection.weekCount }, (_, i) => {
      const { weekYear: wy, weekNumber: wn } = addISOWeek(weekYear, weekNumber, i);
      return `KW${wn} ${wy}`;
    });
  }, [printSelection]);

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
              Print weeks
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
              <h3 className="text-base font-semibold text-gray-900">Print planner</h3>
              <p className="mt-1 text-xs text-gray-600">
                Choose how many consecutive weeks to include and the first calendar week (ISO). Default is one week.
              </p>
              <div className="mt-3 space-y-3">
                <fieldset>
                  <legend className="text-sm font-medium text-gray-700">Number of weeks</legend>
                  <div className="mt-2 flex flex-wrap gap-3">
                    {([1, 2, 3] as const).map((n) => (
                      <label key={n} className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-800">
                        <input
                          type="radio"
                          name="print-week-count"
                          checked={selectedPrintWeekCount === n}
                          onChange={() => setSelectedPrintWeekCount(n)}
                          className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>{n === 1 ? '1 week' : `${n} weeks`}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="block text-sm font-medium text-gray-700">
                  First week (start)
                  <select
                    value={selectedStartWeek}
                    onChange={(e) => setSelectedStartWeek(e.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
                  >
                    {printWeekOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label} ({opt.id.replace('-', ' ')})
                      </option>
                    ))}
                  </select>
                </label>
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
                  disabled={!selectedPrintIsValid}
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
            id="planner-print-area"
            className="planner-print-area invisible pointer-events-none fixed top-0 left-[-9999px] z-[-1] w-max max-w-none overflow-visible print:visible print:pointer-events-auto print:static print:left-auto print:z-auto print:w-auto print:max-w-none"
          >
            <div
              id="print-scale-wrapper"
              ref={printScaleWrapperRef}
              style={{
                transform: `scale(${printScale})`,
                transformOrigin: 'top left',
                width: `${100 / Math.max(printScale, 0.01)}%`,
              }}
            >
              <div ref={printRootRef} className="space-y-2">
                <div className="text-center print:px-0">
                  <p className="planner-print-company text-sm font-semibold text-gray-700">
                    {companyName ? `Firma: ${companyName}` : 'Firma: -'}
                  </p>
                  <h1 className="planner-print-title text-lg font-bold leading-tight text-gray-900">
                    {t.monthlyPlanner} — {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    {' — '}
                    {printTitleWeekLabels.join(', ')}
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
          </div>
        ) : null}
        <style jsx global>{`
          @media print {
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            html {
              width: 100%;
              height: auto !important;
              min-height: 0 !important;
              margin: 0 !important;
              padding: 0 !important;
            }

            body * {
              visibility: hidden !important;
            }

            #planner-print-area,
            #planner-print-area * {
              visibility: visible !important;
            }

            body > div.min-h-screen {
              min-height: 0 !important;
              background: #fff !important;
            }

            body > div.min-h-screen > main {
              margin: 0 !important;
              padding: 0 !important;
              max-width: none !important;
            }

            #planner-print-area {
              margin: 0 !important;
              padding: 0 !important;
              position: relative !important;
              left: auto !important;
              top: auto !important;
              width: 100% !important;
              max-width: none !important;
              page-break-before: avoid !important;
              page-break-after: avoid !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }

            #print-scale-wrapper {
              margin: 0 !important;
              padding: 0 !important;
              page-break-before: avoid !important;
              page-break-after: avoid !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              transform-origin: top left !important;
            }

            #planner-print-area .overflow-x-auto {
              overflow: visible !important;
            }

            #planner-print-area table {
              width: 100% !important;
              font-size: clamp(8px, 1.75mm, 11px) !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }

            /* Larger than base table text; big numerics for readability after fit-to-page scale(). */
            #planner-print-area table .planner-cell-hours {
              font-size: clamp(17px, 3.35mm, 26px) !important;
              line-height: 1.12 !important;
            }

            #planner-print-area table .planner-cell-numeric,
            #planner-print-area table .planner-header-daynum,
            #planner-print-area table .planner-pos-input-num {
              font-size: clamp(16px, 3.05mm, 23px) !important;
              line-height: 1.12 !important;
            }

            /* Mitarbeiter column: avoid collapsed width + tiny inherited text; allow wrap on paper. */
            #planner-print-area table thead th.planner-print-employee-header-cell {
              min-width: 24mm !important;
              max-width: 48mm !important;
              width: auto !important;
              white-space: normal !important;
              word-break: break-word !important;
              font-size: clamp(10px, 2mm, 13px) !important;
              line-height: 1.25 !important;
            }

            #planner-print-area table tbody th.planner-print-employee-name-cell {
              min-width: 24mm !important;
              max-width: 48mm !important;
              width: auto !important;
              white-space: normal !important;
              word-break: break-word !important;
              overflow: visible !important;
              vertical-align: middle !important;
            }

            #planner-print-area table tbody th.planner-print-employee-name-cell a,
            #planner-print-area table tbody th.planner-print-employee-name-cell span {
              font-size: clamp(13px, 2.7mm, 17px) !important;
              line-height: 1.3 !important;
              letter-spacing: 0 !important;
              white-space: normal !important;
              word-break: break-word !important;
            }

            #planner-print-area table tbody th.planner-print-employee-name-cell a {
              text-decoration: none !important;
              color: inherit !important;
            }

            #planner-print-area thead,
            #planner-print-area tbody,
            #planner-print-area tr {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }

            .planner-print-title {
              font-size: clamp(10px, 2.2mm, 14px) !important;
              margin: 0 0 6px !important;
            }

            .planner-print-company {
              font-size: clamp(9px, 1.9mm, 12px) !important;
              margin: 0 0 2px !important;
            }

            #planner-print-area table th,
            #planner-print-area table td {
              padding: 0.12rem 0.28rem !important;
            }

            html,
            body {
              height: auto !important;
              min-height: 0 !important;
              overflow: visible !important;
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

