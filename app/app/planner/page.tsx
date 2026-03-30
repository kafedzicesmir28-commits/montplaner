'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Layout from '@/components/Layout';
import { supabase } from '@/lib/supabaseClient';
import { Employee, Store, Shift, ShiftAssignment, Vacation } from '@/types/database';
import { getDaysInMonth, formatDate, getPrintWeekDays } from '@/lib/utils';
import { t } from '@/lib/translations';
import PlannerGrid from '@/components/PlannerGrid';
import { resolveStoreColor, storeTextColor } from '@/lib/storeColors';

type PlannerAssignmentRow = ShiftAssignment & {
  store?: (Store & { color?: string | null }) | null;
  custom_start_time?: string | null;
  custom_end_time?: string | null;
  assignment_type?: 'SHIFT' | 'FREI' | 'KRANK' | 'FERIEN';
};

export default function PlannerPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<PlannerAssignmentRow[]>([]);
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [loading, setLoading] = useState(true);
  const [storesLoaded, setStoresLoaded] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [printWeeks, setPrintWeeks] = useState<0 | 1 | 2>(0);
  const [pendingStoreByKey, setPendingStoreByKey] = useState<Record<string, string>>({});

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const days = getDaysInMonth(year, month);

  const printDays = useMemo(() => {
    if (printWeeks === 0) return [];
    return getPrintWeekDays(days, printWeeks === 1 ? 1 : 2);
  }, [days, printWeeks]);

  useEffect(() => {
    if (printWeeks === 0 || printDays.length === 0) return;
    const id = window.setTimeout(() => window.print(), 150);
    return () => window.clearTimeout(id);
  }, [printWeeks, printDays.length]);

  useEffect(() => {
    const onAfterPrint = () => setPrintWeeks(0);
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
        supabase.from('employees').select('*').order('name'),
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
          .gte('date', formatDate(new Date(year, month, 1)))
          .lte('date', formatDate(new Date(year, month + 1, 0))),
        supabase
          .from('vacations')
          .select('*')
          .lte('start_date', formatDate(new Date(year, month + 1, 0)))
          .gte('end_date', formatDate(new Date(year, month, 1))),
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
              onClick={() => setPrintWeeks(1)}
              className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              {t.printOneWeek}
            </button>
            <button
              type="button"
              onClick={() => setPrintWeeks(2)}
              className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              {t.printTwoWeeks}
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
          />
        </div>

        {printWeeks > 0 && printDays.length > 0 ? (
          <div className="hidden print:block planner-print-area space-y-3">
            <div className="text-center">
              <h1 className="text-lg font-bold text-gray-900">
                {t.monthlyPlanner} — {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                {printWeeks === 1 ? ' (1 Woche / 1 sedmica)' : ' (2 Wochen / 2 sedmice)'}
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
              storesLoaded={storesLoaded}
            />
          </div>
        ) : null}
      </Layout>
    </AuthGuard>
  );
}

