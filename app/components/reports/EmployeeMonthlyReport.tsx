'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { calculateHours, formatDate, formatErrorMessage } from '@/lib/utils';
import type { Employee, Shift, ShiftAssignment, Store } from '@/types/database';

type AssignmentRow = ShiftAssignment & {
  custom_start_time?: string | null;
  custom_end_time?: string | null;
  shift: Shift | null;
  store: Store | null;
};

type RowView = {
  id: string;
  date: string;
  storeName: string;
  shiftName: string;
  startTime: string;
  endTime: string;
  workedHours: number;
};

function formatClock(value: string): string {
  const part = value.split(':').slice(0, 2);
  if (part.length < 2) return value;
  return `${part[0]!.padStart(2, '0')}:${part[1]!.padStart(2, '0')}`;
}

function effectiveTime(base: string, custom: string | null | undefined): string {
  if (custom == null || String(custom).trim() === '') return base;
  return String(custom).split(':').slice(0, 2).join(':');
}

function yearOptions(anchor: number): number[] {
  const list: number[] = [];
  for (let y = anchor - 3; y <= anchor + 3; y++) list.push(y);
  return list;
}

const MONTHS = [
  'Januar',
  'Februar',
  'Maerz',
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

export default function EmployeeMonthlyReport() {
  const now = new Date();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rows, setRows] = useState<RowView[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromDate = useMemo(() => formatDate(new Date(selectedYear, selectedMonth, 1)), [selectedYear, selectedMonth]);
  const toDate = useMemo(() => formatDate(new Date(selectedYear, selectedMonth + 1, 0)), [selectedYear, selectedMonth]);

  const loadEmployees = useCallback(async () => {
    setLoadingEmployees(true);
    setError(null);
    try {
      const { data, error } = await supabase.from('employees').select('*').order('name', { ascending: true });
      if (error) throw error;
      const list = (data || []) as Employee[];
      setEmployees(list);
      if (list.length > 0) {
        setSelectedEmployeeId((prev) => prev || list[0]!.id);
      }
    } catch (e: unknown) {
      setError(formatErrorMessage(e));
      setEmployees([]);
    } finally {
      setLoadingEmployees(false);
    }
  }, []);

  const loadAssignments = useCallback(async () => {
    if (!selectedEmployeeId) {
      setRows([]);
      return;
    }

    setLoadingRows(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from('shift_assignments')
        .select('*, shift:shifts(*), store:stores(*)')
        .eq('employee_id', selectedEmployeeId)
        .gte('date', fromDate)
        .lte('date', toDate)
        .order('date', { ascending: true });

      if (error) throw error;

      const mapped = ((data || []) as AssignmentRow[]).map((a) => {
        const shift = a.shift;
        const start = shift ? effectiveTime(shift.start_time, a.custom_start_time) : '';
        const end = shift ? effectiveTime(shift.end_time, a.custom_end_time) : '';
        const worked = shift ? calculateHours(start, end, Number(shift.break_minutes ?? 0)) : 0;

        return {
          id: a.id,
          date: a.date,
          storeName: a.store?.name ?? '-',
          shiftName: a.shift?.name ?? '-',
          startTime: start ? formatClock(start) : '-',
          endTime: end ? formatClock(end) : '-',
          workedHours: worked,
        } satisfies RowView;
      });

      setRows(mapped);
    } catch (e: unknown) {
      setError(formatErrorMessage(e));
      setRows([]);
    } finally {
      setLoadingRows(false);
    }
  }, [selectedEmployeeId, fromDate, toDate]);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    if (loadingEmployees) return;
    void loadAssignments();
  }, [loadingEmployees, loadAssignments]);

  const totalShifts = rows.length;
  const totalWorkedHours = useMemo(
    () => rows.reduce((sum, row) => sum + row.workedHours, 0),
    [rows]
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900">Monthly Employee Report</h1>
        <p className="text-sm text-gray-600">Read-only monthly view of worked shifts and hours.</p>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-600">Employee</span>
          <select
            value={selectedEmployeeId}
            onChange={(e) => setSelectedEmployeeId(e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            disabled={loadingEmployees || employees.length === 0}
          >
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-600">Month</span>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          >
            {MONTHS.map((label, index) => (
              <option key={label} value={index}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-600">Year</span>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          >
            {yearOptions(now.getFullYear()).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
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
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">Date</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">Store Name</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">Shift Name</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-600">Start Time</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-600">End Time</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-600">Worked Hours</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loadingRows ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">Loading...</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">No shifts for selected employee/month.</td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={row.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-900">{row.date}</td>
                  <td className="px-3 py-2 text-gray-800">{row.storeName}</td>
                  <td className="px-3 py-2 text-gray-800">{row.shiftName}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">{row.startTime}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">{row.endTime}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-900">{row.workedHours.toFixed(2)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot className="border-t-2 border-gray-300 bg-gray-100">
            <tr>
              <td colSpan={3} className="px-3 py-2 text-sm font-semibold text-gray-800">
                Total shifts: <span className="tabular-nums">{totalShifts}</span>
              </td>
              <td colSpan={3} className="px-3 py-2 text-right text-sm font-semibold text-gray-800">
                Total worked hours: <span className="tabular-nums">{totalWorkedHours.toFixed(2)}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
}

