'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ExcelJS from 'exceljs';
import AuthGuard from '@/components/AuthGuard';
import Layout from '@/components/Layout';
import { supabase } from '@/lib/supabaseClient';
import {
  assignmentHourBuckets,
  calculateEmployeeHours,
  getEmployeeMonthlyHourTotals,
  type PlannerShiftAssignmentRow,
} from '@/lib/hoursCalculator';
import { calculateHours, formatDate, formatErrorMessage } from '@/lib/utils';
import { PLANNER_ASSIGNMENTS_CHANGED } from '@/lib/plannerEvents';

type EmployeeRow = {
  id: string;
  name: string;
  [key: string]: unknown;
};

type YearOverviewMonth = {
  monthIndex: number;
  label: string;
  sollstunden: number;
  geleistete: number;
  ueberstunden: number;
  nacht: number;
  sonntag: number;
  feiertag: number;
  urlaubMonat: number;
  urlaubGesamt: number;
  resturlaub: number;
};

type AssignmentWithShift = PlannerShiftAssignmentRow & {
  custom_break_minutes?: number | null;
};

const MONTHS = [
  'Januar',
  'Februar',
  'Marz',
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

const DEFAULT_ANNUAL_VACATION_DAYS = 25;
const SENIOR_ANNUAL_VACATION_DAYS = 30;
const SOLLSTUNDEN_PRESETS: Record<number, number[]> = {
  2026: [189.2, 172.0, 189.2, 180.6, 172.0, 189.2, 197.8, 180.6, 189.2, 189.2, 180.6, 189.2],
  2027: [180.6, 172.0, 197.8, 189.2, 180.6, 189.2, 189.2, 189.2, 189.2, 180.6, 189.2, 197.8],
  2028: [180.6, 180.6, 197.8, 172.0, 197.8, 189.2, 180.6, 197.8, 180.6, 189.2, 189.2, 180.6],
  2029: [197.8, 172.0, 189.2, 180.6, 197.8, 180.6, 189.2, 197.8, 172.0, 197.8, 189.2, 180.6],
  2030: [189.2, 172.0, 180.6, 189.2, 189.2, 180.6, 197.8, 189.2, 180.6, 197.8, 180.6, 189.2],
};

function monthStart(year: number, monthIndex: number) {
  return formatDate(new Date(year, monthIndex, 1));
}

function monthEnd(year: number, monthIndex: number) {
  return formatDate(new Date(year, monthIndex + 1, 0));
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function getAnnualVacationEntitlement(employee: EmployeeRow | null, year: number): number {
  if (!employee) return DEFAULT_ANNUAL_VACATION_DAYS;
  const birthDateRaw = employee.birth_date;
  if (typeof birthDateRaw !== 'string' || birthDateRaw.trim() === '') {
    return DEFAULT_ANNUAL_VACATION_DAYS;
  }

  const birthDate = new Date(`${birthDateRaw}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) {
    return DEFAULT_ANNUAL_VACATION_DAYS;
  }

  const endOfYear = new Date(year, 11, 31);
  let age = endOfYear.getFullYear() - birthDate.getFullYear();
  const birthdayPassed =
    endOfYear.getMonth() > birthDate.getMonth() ||
    (endOfYear.getMonth() === birthDate.getMonth() && endOfYear.getDate() >= birthDate.getDate());
  if (!birthdayPassed) age -= 1;

  return age >= 60 ? SENIOR_ANNUAL_VACATION_DAYS : DEFAULT_ANNUAL_VACATION_DAYS;
}

function getPlannedHoursForAssignment(row: AssignmentWithShift): number {
  const assignmentType = row.assignment_type ?? 'SHIFT';
  if (assignmentType !== 'SHIFT' || !row.shift) return 0;
  return calculateHours(row.shift.start_time, row.shift.end_time, row.shift.break_minutes ?? 0);
}

function fmt2(value: number) {
  return value.toFixed(2);
}

export default function JahresuebersichtPage() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [assignments, setAssignments] = useState<AssignmentWithShift[]>([]);
  const [vacations, setVacations] = useState<
    Array<{ id: string; employee_id: string; start_date: string; end_date: string }>
  >([]);
  const [sollstundenOverrides, setSollstundenOverrides] = useState<Record<string, number>>({});
  const [entitlementOverride, setEntitlementOverride] = useState<number | null>(null);

  const selectedEmployee = useMemo(
    () => employees.find((row) => row.id === selectedEmployeeId) ?? null,
    [employees, selectedEmployeeId]
  );

  const entitlement = useMemo(
    () => entitlementOverride ?? getAnnualVacationEntitlement(selectedEmployee, year),
    [entitlementOverride, selectedEmployee, year]
  );

  const sollstundenKeyPrefix = useMemo(
    () => `${selectedEmployeeId || 'none'}:${year}:`,
    [selectedEmployeeId, year]
  );
  const entitlementStorageKey = useMemo(
    () => `jahresuebersicht:entitlement:${selectedEmployeeId || 'none'}:${year}`,
    [selectedEmployeeId, year]
  );

  const loadEmployees = useCallback(async () => {
    const { data, error } = await supabase.from('employees').select('*').order('name');
    if (error) throw error;
    const rows = (data ?? []) as EmployeeRow[];
    setEmployees(rows);
    setSelectedEmployeeId((prev) => prev || rows[0]?.id || '');
  }, []);

  const loadYearData = useCallback(async () => {
    if (!selectedEmployeeId) {
      setAssignments([]);
      setVacations([]);
      return;
    }

    const start = `${year}-01-01`;
    const end = `${year}-12-31`;

    const [assignRes, vacationRes] = await Promise.all([
      supabase
        .from('shift_assignments')
        .select(
          'employee_id, date, assignment_type, custom_start_time, custom_end_time, custom_break_minutes, shift_id, store_id, shift:shifts(*)'
        )
        .eq('employee_id', selectedEmployeeId)
        .gte('date', start)
        .lte('date', end),
      supabase
        .from('vacations')
        .select('id, employee_id, start_date, end_date')
        .eq('employee_id', selectedEmployeeId)
        .lte('start_date', end)
        .gte('end_date', start),
    ]);

    if (assignRes.error) throw assignRes.error;
    if (vacationRes.error) throw vacationRes.error;

    setAssignments((assignRes.data ?? []) as unknown as AssignmentWithShift[]);
    setVacations(
      (vacationRes.data ?? []) as Array<{ id: string; employee_id: string; start_date: string; end_date: string }>
    );
  }, [selectedEmployeeId, year]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadEmployees();
    } catch (e: unknown) {
      setError(formatErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [loadEmployees]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!selectedEmployeeId) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        await loadYearData();
      } catch (e: unknown) {
        if (!cancelled) setError(formatErrorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [selectedEmployeeId, year, loadYearData]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!selectedEmployeeId) return;
    const loaded: Record<string, number> = {};
    for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
      const key = `${sollstundenKeyPrefix}${monthIndex}`;
      const raw = window.localStorage.getItem(`jahresuebersicht:sollstunden:${key}`);
      if (!raw) continue;
      const value = Number(raw);
      if (Number.isFinite(value) && value >= 0) loaded[String(monthIndex)] = value;
    }
    setSollstundenOverrides(loaded);
  }, [selectedEmployeeId, sollstundenKeyPrefix]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!selectedEmployeeId) return;
    const raw = window.localStorage.getItem(entitlementStorageKey);
    if (!raw) {
      setEntitlementOverride(null);
      return;
    }
    const value = Number(raw);
    if (Number.isFinite(value) && value >= 0) {
      setEntitlementOverride(value);
      return;
    }
    setEntitlementOverride(null);
  }, [entitlementStorageKey, selectedEmployeeId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPlannerChange = () => {
      void loadYearData();
    };
    window.addEventListener(PLANNER_ASSIGNMENTS_CHANGED, onPlannerChange);
    return () => window.removeEventListener(PLANNER_ASSIGNMENTS_CHANGED, onPlannerChange);
  }, [loadYearData]);

  const yearRows = useMemo<YearOverviewMonth[]>(() => {
    if (!selectedEmployeeId) return [];
    let cumulativeVacation = 0;
    return Array.from({ length: 12 }, (_, monthIndex) => {
      const first = monthStart(year, monthIndex);
      const last = monthEnd(year, monthIndex);

      const monthAssignments = assignments.filter((row) => row.date >= first && row.date <= last);
      const plannedHours = monthAssignments.reduce((sum, row) => sum + getPlannedHoursForAssignment(row), 0);
      const presetHours = SOLLSTUNDEN_PRESETS[year]?.[monthIndex];
      const overridden = sollstundenOverrides[String(monthIndex)];
      const effectiveSollstunden = overridden ?? presetHours ?? plannedHours;

      const totals = getEmployeeMonthlyHourTotals(
        selectedEmployeeId,
        first,
        assignments as PlannerShiftAssignmentRow[],
        vacations
      );
      const holidayHours = 0;
      cumulativeVacation += totals.vacation_days;

      return {
        monthIndex,
        label: MONTHS[monthIndex]!,
        sollstunden: effectiveSollstunden,
        geleistete: totals.total_hours,
        ueberstunden: totals.total_hours - effectiveSollstunden,
        nacht: totals.night_hours,
        sonntag: totals.sunday_hours,
        feiertag: holidayHours,
        urlaubMonat: totals.vacation_days,
        urlaubGesamt: cumulativeVacation,
        resturlaub: entitlement - cumulativeVacation,
      };
    });
  }, [assignments, entitlement, selectedEmployeeId, vacations, year, sollstundenOverrides]);

  const topMonths = yearRows.slice(0, 6);
  const bottomMonths = yearRows.slice(6, 12);

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    const options: number[] = [];
    for (let y = current - 3; y <= current + 4; y += 1) options.push(y);
    return options;
  }, []);

  const triggerPrint = () => window.print();
  const exportPdf = () => window.print();

  const handleEditSollstunden = (monthIndex: number) => {
    const monthName = MONTHS[monthIndex] ?? `Month ${monthIndex + 1}`;
    const current = yearRows[monthIndex]?.sollstunden ?? 0;
    const raw = window.prompt(`Sollstunden za ${monthName} ${year}:`, String(current));
    if (raw == null) return;
    const normalized = raw.replace(',', '.').trim();
    if (normalized === '') {
      const next = { ...sollstundenOverrides };
      delete next[String(monthIndex)];
      setSollstundenOverrides(next);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(`jahresuebersicht:sollstunden:${sollstundenKeyPrefix}${monthIndex}`);
      }
      return;
    }
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed < 0) {
      window.alert('Unesi validan broj sati (>= 0).');
      return;
    }
    const rounded = Math.round(parsed * 10) / 10;
    setSollstundenOverrides((prev) => ({ ...prev, [String(monthIndex)]: rounded }));
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        `jahresuebersicht:sollstunden:${sollstundenKeyPrefix}${monthIndex}`,
        String(rounded)
      );
    }
  };

  const handleEditEntitlement = () => {
    const current = entitlement;
    const raw = window.prompt(`Ukupni godisnji odmor (dani) za ${year}:`, String(current));
    if (raw == null) return;
    const normalized = raw.replace(',', '.').trim();
    if (normalized === '') {
      setEntitlementOverride(null);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(entitlementStorageKey);
      }
      return;
    }
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed < 0) {
      window.alert('Unesi validan broj dana (>= 0).');
      return;
    }
    const rounded = Math.round(parsed * 10) / 10;
    setEntitlementOverride(rounded);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(entitlementStorageKey, String(rounded));
    }
  };

  const exportExcel = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Jahresuebersicht');
    ws.addRow([`Arbeitszeit Jahresubersicht von ${selectedEmployee?.name ?? '-'} ${year}`]);
    ws.mergeCells('A1:G1');
    ws.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 14 };
    ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D47A1' } };
    ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };

    ws.addRow(['Metrik', ...topMonths.map((m) => m.label)]);
    ws.addRow(['Sollstunden', ...topMonths.map((m) => Number(fmt2(m.sollstunden)))]);
    ws.addRow(['geleistete Std.', ...topMonths.map((m) => Number(fmt2(m.geleistete)))]);
    ws.addRow(['Uberstunden', ...topMonths.map((m) => Number(fmt2(m.ueberstunden)))]);
    ws.addRow(['Nacht', ...topMonths.map((m) => Number(fmt2(m.nacht)))]);
    ws.addRow(['Sonntag', ...topMonths.map((m) => Number(fmt2(m.sonntag)))]);
    ws.addRow(['Feiertag', ...topMonths.map((m) => Number(fmt2(m.feiertag)))]);
    ws.addRow(['genommener Urlaub, monatl.', ...topMonths.map((m) => Number(fmt2(m.urlaubMonat)))]);
    ws.addRow(['genommener Urlaub, gesamt', ...topMonths.map((m) => Number(fmt2(m.urlaubGesamt)))]);
    ws.addRow(['Resturlaub', ...topMonths.map((m) => Number(fmt2(m.resturlaub)))]);

    ws.addRow([]);
    ws.addRow(['Metrik', ...bottomMonths.map((m) => m.label)]);
    ws.addRow(['Sollstunden', ...bottomMonths.map((m) => Number(fmt2(m.sollstunden)))]);
    ws.addRow(['geleistete Std.', ...bottomMonths.map((m) => Number(fmt2(m.geleistete)))]);
    ws.addRow(['Uberstunden', ...bottomMonths.map((m) => Number(fmt2(m.ueberstunden)))]);
    ws.addRow(['Nacht', ...bottomMonths.map((m) => Number(fmt2(m.nacht)))]);
    ws.addRow(['Sonntag', ...bottomMonths.map((m) => Number(fmt2(m.sonntag)))]);
    ws.addRow(['Feiertag', ...bottomMonths.map((m) => Number(fmt2(m.feiertag)))]);
    ws.addRow(['genommener Urlaub, monatl.', ...bottomMonths.map((m) => Number(fmt2(m.urlaubMonat)))]);
    ws.addRow(['genommener Urlaub, gesamt', ...bottomMonths.map((m) => Number(fmt2(m.urlaubGesamt)))]);
    ws.addRow(['Resturlaub', ...bottomMonths.map((m) => Number(fmt2(m.resturlaub)))]);

    ws.columns = [{ width: 34 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }];

    const monthHeaderRows = [2, 13];
    for (const rowNum of monthHeaderRows) {
      const row = ws.getRow(rowNum);
      row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B0000' } };
    }

    for (let r = 3; r <= 22; r += 1) {
      if (r === 12) continue;
      const row = ws.getRow(r);
      for (let c = 1; c <= 7; c += 1) {
        const cell = row.getCell(c);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF59D' } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } },
        };
      }
    }

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jahresuebersicht-${selectedEmployee?.name ?? 'employee'}-${year}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderSection = (months: YearOverviewMonth[]) => (
    <table className="w-full min-w-[980px] border-collapse text-sm">
      <thead>
        <tr>
          <th className="border border-black bg-[#8b0000] px-2 py-2 text-left font-bold text-white"> </th>
          {months.map((month) => (
            <th key={month.monthIndex} className="border border-black bg-[#8b0000] px-2 py-2 text-center font-bold text-white">
              {month.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="border border-black bg-[#c00000] px-2 py-1.5 font-bold text-white">Sollstunden</td>
          {months.map((month) => (
            <td
              key={`soll-${month.monthIndex}`}
              onClick={() => handleEditSollstunden(month.monthIndex)}
              title="Klik za ručni unos Sollstunden"
              className="cursor-pointer border border-black bg-[#fff475] px-2 py-1.5 text-right tabular-nums hover:bg-[#ffe95c]"
            >
              {fmt2(month.sollstunden)}
            </td>
          ))}
        </tr>
        <tr>
          <td className="border border-black bg-[#fff475] px-2 py-1.5 font-semibold">geleistete Std.</td>
          {months.map((month) => (
            <td key={`work-${month.monthIndex}`} className="border border-black bg-[#fff475] px-2 py-1.5 text-right tabular-nums">
              {fmt2(month.geleistete)}
            </td>
          ))}
        </tr>
        <tr>
          <td className="border border-black bg-[#fff475] px-2 py-1.5 font-semibold">Uberstunden</td>
          {months.map((month) => (
            <td key={`ot-${month.monthIndex}`} className="border border-black bg-[#fff475] px-2 py-1.5 text-right tabular-nums">
              {fmt2(month.ueberstunden)}
            </td>
          ))}
        </tr>
        <tr>
          <td className="border border-black bg-[#fff475] px-2 py-1.5 font-semibold">Zuschlage:</td>
          {months.map((month) => (
            <td key={`allow-${month.monthIndex}`} className="border border-black bg-[#fff475] px-2 py-1.5"></td>
          ))}
        </tr>
        <tr>
          <td className="border border-black bg-[#fff475] px-2 py-1.5">Nacht</td>
          {months.map((month) => (
            <td key={`night-${month.monthIndex}`} className="border border-black bg-[#fff475] px-2 py-1.5 text-right tabular-nums">
              {fmt2(month.nacht)}
            </td>
          ))}
        </tr>
        <tr>
          <td className="border border-black bg-[#fff475] px-2 py-1.5">Sonntag</td>
          {months.map((month) => (
            <td key={`sun-${month.monthIndex}`} className="border border-black bg-[#fff475] px-2 py-1.5 text-right tabular-nums">
              {fmt2(month.sonntag)}
            </td>
          ))}
        </tr>
        <tr>
          <td className="border border-black bg-[#fff475] px-2 py-1.5">Feiertag</td>
          {months.map((month) => (
            <td key={`holiday-${month.monthIndex}`} className="border border-black bg-[#fff475] px-2 py-1.5 text-right tabular-nums">
              {fmt2(month.feiertag)}
            </td>
          ))}
        </tr>
        <tr>
          <td className="border border-black bg-[#fff475] px-2 py-1.5">genommener Urlaub, monatl.</td>
          {months.map((month) => (
            <td key={`vac-month-${month.monthIndex}`} className="border border-black bg-[#fff475] px-2 py-1.5 text-right tabular-nums">
              {fmt2(month.urlaubMonat)}
            </td>
          ))}
        </tr>
        <tr>
          <td className="border border-black bg-[#fff475] px-2 py-1.5">genommener Urlaub, gesamt</td>
          {months.map((month) => (
            <td key={`vac-total-${month.monthIndex}`} className="border border-black bg-[#fff475] px-2 py-1.5 text-right tabular-nums">
              {fmt2(month.urlaubGesamt)}
            </td>
          ))}
        </tr>
        <tr>
          <td className="border border-black bg-[#fff475] px-2 py-1.5 font-semibold">Resturlaub</td>
          {months.map((month) => (
            <td
              key={`vac-rest-${month.monthIndex}`}
              onClick={handleEditEntitlement}
              title="Klik za ručni unos ukupnih dana godišnjeg odmora"
              className="cursor-pointer border border-black bg-[#fff475] px-2 py-1.5 text-right tabular-nums hover:bg-[#ffe95c]"
            >
              {fmt2(month.resturlaub)}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );

  return (
    <AuthGuard>
      <Layout>
        <div className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col text-sm text-gray-700">
                <span className="mb-1 font-medium">Employee</span>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="min-w-56 rounded-md border border-gray-300 bg-white px-3 py-2"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col text-sm text-gray-700">
                <span className="mb-1 font-medium">Year</span>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="min-w-32 rounded-md border border-gray-300 bg-white px-3 py-2"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={triggerPrint} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800 hover:bg-gray-50">
                Print
              </button>
              <button type="button" onClick={exportPdf} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800 hover:bg-gray-50">
                Export PDF
              </button>
              <button type="button" onClick={() => void exportExcel()} className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800">
                Export Excel
              </button>
            </div>
          </div>

          {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          {loading ? <p className="text-sm text-gray-600">Loading yearly overview...</p> : null}

          {!loading && !error ? (
            <div className="overflow-x-auto rounded-md border-2 border-black bg-white shadow-sm">
              <div className="border-b-2 border-black bg-[#0d47a1] px-3 py-2 text-center text-lg font-bold text-white">
                Arbeitszeit Jahresubersicht von {selectedEmployee?.name ?? '-'} {year}
              </div>
              {renderSection(topMonths)}
              {renderSection(bottomMonths)}
            </div>
          ) : null}

          <p className="text-xs text-gray-500">
            Hinweis: Feiertag wird aktuell als 0 angezeigt, da keine Feiertagsdatenquelle im bestehenden System vorhanden ist.
          </p>
        </div>
      </Layout>
      <style jsx global>{`
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </AuthGuard>
  );
}
