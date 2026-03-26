'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { formatErrorMessage } from '@/lib/utils';
import type { Employee, Store, Vacation } from '@/types/database';

type VacationRow = Vacation & {
  store_id?: string | null;
  notes?: string | null;
  bemerkung?: string | null;
};

function parseYmd(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1);
}

function vacationInclusiveDays(startDate: string, endDate: string): number {
  const start = parseYmd(startDate);
  const end = parseYmd(endDate);
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000);
  return diff + 1;
}

function isActiveToday(startDate: string, endDate: string): boolean {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = parseYmd(startDate);
  const end = parseYmd(endDate);
  return today >= start && today <= end;
}

export default function EmployeeVacationReport() {
  const [employeeId, setEmployeeId] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [storesById, setStoresById] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<VacationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === employeeId) ?? null,
    [employees, employeeId]
  );

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [empRes, storesRes] = await Promise.all([
        supabase.from('employees').select('*').order('name', { ascending: true }),
        supabase.from('stores').select('*').order('name', { ascending: true }),
      ]);

      if (empRes.error) throw empRes.error;
      if (storesRes.error) throw storesRes.error;

      const employeeList = (empRes.data || []) as Employee[];
      setEmployees(employeeList);
      setEmployeeId((prev) => prev || employeeList[0]?.id || '');

      const map: Record<string, string> = {};
      for (const s of (storesRes.data || []) as Store[]) {
        map[s.id] = s.name;
      }
      setStoresById(map);
    } catch (e: unknown) {
      setError(formatErrorMessage(e));
      setEmployees([]);
      setStoresById({});
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRows = useCallback(async () => {
    if (!employeeId) {
      setRows([]);
      return;
    }
    setLoadingRows(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('vacations')
        .select('*')
        .eq('employee_id', employeeId)
        .order('start_date', { ascending: false });

      if (error) throw error;
      setRows((data || []) as VacationRow[]);
    } catch (e: unknown) {
      setError(formatErrorMessage(e));
      setRows([]);
    } finally {
      setLoadingRows(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    if (loading) return;
    void loadRows();
  }, [loading, loadRows]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900">Employee Vacation Report</h1>
        <p className="text-sm text-gray-600">Read-only vacation overview per employee.</p>
      </header>

      <section className="max-w-md">
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-600">
            Employee
          </span>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            disabled={loading || employees.length === 0}
          >
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </label>
        {selectedEmployee ? (
          <p className="mt-2 text-sm text-gray-600">
            Selected: <span className="font-medium text-gray-900">{selectedEmployee.name}</span>
          </p>
        ) : null}
      </section>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <section className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">
                Vacation Start Date
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">
                Vacation End Date
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-600">
                Total Days
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">
                Store
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">
                Notes
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loadingRows ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                  No vacation entries for selected employee.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const active = isActiveToday(row.start_date, row.end_date);
                const notes = row.notes ?? row.bemerkung ?? '-';
                const storeName = row.store_id ? storesById[row.store_id] ?? '-' : '-';
                return (
                  <tr key={row.id} className={active ? 'bg-emerald-50' : ''}>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-900">
                      {row.start_date}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-900">
                      {row.end_date}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                      {vacationInclusiveDays(row.start_date, row.end_date)}
                    </td>
                    <td className="px-3 py-2 text-gray-800">{storeName}</td>
                    <td className="px-3 py-2 text-gray-800">{notes || '-'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

