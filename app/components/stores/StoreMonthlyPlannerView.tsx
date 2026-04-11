'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PlannerGrid from '@/components/PlannerGrid';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/lib/supabaseClient';
import type { Employee, Shift, ShiftAssignment, Store, Vacation } from '@/types/database';
import { formatDate, formatErrorMessage, getDaysInMonth } from '@/lib/utils';
import { t } from '@/lib/translations';
import { resolveStoreColor, storeTextColor } from '@/lib/storeColors';

type StoreRow = Store & { color?: string | null };
type PlannerAssignmentRow = ShiftAssignment & {
  store?: StoreRow | null;
  custom_start_time?: string | null;
  custom_end_time?: string | null;
};

function headerStyle(color: string | null | undefined): { backgroundColor: string; color: string } {
  const bg = resolveStoreColor(color);
  return { backgroundColor: bg, color: storeTextColor(bg) };
}

export default function StoreMonthlyPlannerView({ storeId }: { storeId: string }) {
  const { companyId } = useCompany();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<PlannerAssignmentRow[]>([]);
  const [unavailableDayKeys, setUnavailableDayKeys] = useState<string[]>([]);
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);

  const selectedStore = useMemo(
    () => stores.find((s) => s.id === storeId) ?? null,
    [stores, storeId]
  );

  const selectedStoreAccent = useMemo(() => headerStyle(selectedStore?.color), [selectedStore?.color]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!companyId) {
        setEmployees([]);
        setStores([]);
        setShifts([]);
        setAssignments([]);
        setUnavailableDayKeys([]);
        setVacations([]);
        return;
      }

      const monthStart = formatDate(new Date(year, month, 1));
      const monthEnd = formatDate(new Date(year, month + 1, 0));

      const [employeesRes, storesRes, shiftsRes, assignmentsRes, allAssignmentsRes, vacationsRes] = await Promise.all([
        supabase.from('employees').select('*').eq('company_id', companyId).order('name'),
        supabase.from('stores').select('id,name,color').eq('company_id', companyId).order('name'),
        supabase.from('shifts').select('*').eq('company_id', companyId).order('start_time'),
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
          .eq('company_id', companyId)
          .eq('store_id', storeId)
          .gte('date', monthStart)
          .lte('date', monthEnd),
        supabase
          .from('shift_assignments')
          .select('employee_id,date,store_id,assignment_type')
          .eq('company_id', companyId)
          .gte('date', monthStart)
          .lte('date', monthEnd),
        supabase
          .from('vacations')
          .select('*')
          .eq('company_id', companyId)
          .lte('start_date', monthEnd)
          .gte('end_date', monthStart),
      ]);

      if (employeesRes.error) throw employeesRes.error;
      if (storesRes.error) throw storesRes.error;
      if (shiftsRes.error) throw shiftsRes.error;
      if (assignmentsRes.error) throw assignmentsRes.error;
      if (allAssignmentsRes.error) throw allAssignmentsRes.error;
      if (vacationsRes.error) throw vacationsRes.error;

      const assignmentRows = (assignmentsRes.data || []) as PlannerAssignmentRow[];
      const allRows = (allAssignmentsRes.data || []) as Pick<
        ShiftAssignment,
        'employee_id' | 'date' | 'store_id' | 'assignment_type'
      >[];
      const activeEmployeeIds = new Set(assignmentRows.map((a) => a.employee_id));
      const employeeRows = ((employeesRes.data || []) as Employee[]).filter((e) => activeEmployeeIds.has(e.id));
      const thisStoreKeys = new Set(assignmentRows.map((a) => `${a.employee_id}:${a.date}`));
      const unavailableKeys = allRows
        .map((a) => `${a.employee_id}:${a.date}`)
        .filter((k) => !thisStoreKeys.has(k));

      setEmployees(employeeRows);
      setStores((storesRes.data || []) as StoreRow[]);
      setShifts((shiftsRes.data || []) as Shift[]);
      setAssignments(assignmentRows);
      setUnavailableDayKeys(unavailableKeys);
      setVacations((vacationsRes.data || []) as Vacation[]);
    } catch (e: unknown) {
      setError(formatErrorMessage(e));
      setEmployees([]);
      setStores([]);
      setShifts([]);
      setAssignments([]);
      setUnavailableDayKeys([]);
      setVacations([]);
    } finally {
      setLoading(false);
    }
  }, [storeId, year, month, companyId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const changeMonth = (delta: number) => {
    setCurrentDate(new Date(year, month + delta, 1));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div
          className="rounded-md border border-gray-400 px-4 py-3 shadow-sm"
          style={{ backgroundColor: selectedStoreAccent.backgroundColor, color: selectedStoreAccent.color }}
        >
          <h1 className="text-xl font-bold">Store Monthly Overview</h1>
          <p className="text-sm font-semibold">
            {selectedStore ? selectedStore.name : 'Store'}
          </p>
        </div>

        <div className="flex items-center space-x-4">
          <button
            type="button"
            onClick={() => changeMonth(-1)}
            className="rounded-md bg-gray-200 px-4 py-2 hover:bg-gray-300 text-gray-700"
          >
            {t.previous}
          </button>
          <h2 className="text-xl font-semibold text-gray-900">
            {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h2>
          <button
            type="button"
            onClick={() => changeMonth(1)}
            className="rounded-md bg-gray-200 px-4 py-2 hover:bg-gray-300 text-gray-700"
          >
            {t.next}
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="text-center text-gray-600">{t.loading}</div>
      ) : employees.length === 0 ? (
        <div className="rounded border border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-600">
          No assignments for this store in the selected month.
        </div>
      ) : (
        <PlannerGrid
          employees={employees}
          days={days}
          assignments={assignments}
          vacations={vacations}
          stores={stores}
          shifts={shifts}
          onAssignmentsUpdated={fetchAll}
          employeeProfileBasePath="/reports/employees"
          forceStoreId={storeId}
          lockStoreSelection
          hideUnassignedStorePreview
          unavailableDayKeys={unavailableDayKeys}
        />
      )}
    </div>
  );
}


