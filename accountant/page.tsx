'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ExcelJS from 'exceljs';
import AuthGuard from '@/components/AuthGuard';
import Layout from '@/components/Layout';
import { supabase } from '@/lib/supabaseClient';
import {
  getAllEmployeesHoursInPeriod,
  getEmployeeMonthlyHourTotals,
  type PlannerShiftAssignmentRow,
} from '@/lib/hoursCalculator';
import { PLANNER_ASSIGNMENTS_CHANGED } from '@/lib/plannerEvents';
import { formatDate, formatErrorMessage, monthsFirstOfMonthInRange, parseYmdLocal } from '@/lib/utils';
import { HoursCalculation, Employee, Vacation } from '@/types/database';
import { t } from '@/lib/translations';
import { getCurrentAuthProfile } from '@/lib/authProfile';

type RpcRow = {
  normal_hours: number;
  night_hours: number;
  sunday_hours: number;
  total_hours: number;
};

function formatPeriodLabel(startYmd: string, endYmd: string): string {
  const s = parseYmdLocal(startYmd);
  const e = parseYmdLocal(endYmd);
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
  return `${s.toLocaleDateString('de-DE', opts)} – ${e.toLocaleDateString('de-DE', opts)}`;
}

function formatPeriodLabelCsv(startYmd: string, endYmd: string): string {
  const s = parseYmdLocal(startYmd);
  const e = parseYmdLocal(endYmd);
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
  return `${s.toLocaleDateString('de-DE', opts)}–${e.toLocaleDateString('de-DE', opts)}`;
}

export default function AccountantPage() {
  const [hoursData, setHoursData] = useState<HoursCalculation[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(1);
    return formatDate(date);
  });
  const [endDate, setEndDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() + 1, 0);
    return formatDate(date);
  });
  const [companyName, setCompanyName] = useState('');

  const periodLabel = useMemo(
    () => formatPeriodLabel(startDate, endDate),
    [startDate, endDate],
  );

  const rangeInvalid = parseYmdLocal(endDate) < parseYmdLocal(startDate);

  const calculateHoursSummary = useCallback(async () => {
    setLoading(true);
    try {
      if (rangeInvalid) {
        setHoursData([]);
        return;
      }

      const [employeesRes, assignRes, vacRes] = await Promise.all([
        supabase.from('employees').select('*').order('name'),
        supabase
          .from('shift_assignments')
          .select('employee_id, date, assignment_type, custom_start_time, custom_end_time, custom_break_minutes, shift_id, store_id, shift:shifts(*)')
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('vacations')
          .select('*')
          .lte('start_date', endDate)
          .gte('end_date', startDate),
      ]);

      if (employeesRes.error) throw employeesRes.error;
      if (assignRes.error) throw assignRes.error;
      if (vacRes.error) throw vacRes.error;

      const list = (employeesRes.data || []) as Employee[];
      const assignments = (assignRes.data || []) as unknown as PlannerShiftAssignmentRow[];
      const vacations = (vacRes.data || []) as Vacation[];

      const rows = getAllEmployeesHoursInPeriod(
        list.map((e) => ({ id: e.id, name: e.name })),
        startDate,
        endDate,
        assignments,
        vacations,
      );

      setHoursData(rows);

      if (process.env.NODE_ENV === 'development' && list.length > 0) {
        const months = monthsFirstOfMonthInRange(startDate, endDate);
        if (months.length > 0) {
          const emp = list[0]!;
          const m = months[0]!;
          const ours = getEmployeeMonthlyHourTotals(emp.id, m, assignments, vacations);
          const oursEff = ours.total_hours;
          const { data, error } = await supabase.rpc('calculate_employee_hours', {
            p_employee_id: emp.id,
            p_month: m,
          });
          if (!error && data != null) {
            const rpc = (Array.isArray(data) ? data[0] : data) as RpcRow | null | undefined;
            if (rpc) {
              const rpcEff = Number(rpc.total_hours) || 0;
              if (Math.abs(rpcEff - oursEff) > 0.05) {
                console.warn('[hours] Effective hours mismatch: planner vs RPC (sample)', {
                  employeeId: emp.id,
                  month: m,
                  rpcEff,
                  oursEff,
                });
              }
            }
          }
        }
      }
    } catch (error: unknown) {
      const msg = formatErrorMessage(error);
      console.error('Error calculating hours:', msg, error);
      alert('Error calculating hours: ' + msg);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, rangeInvalid]);

  useEffect(() => {
    void calculateHoursSummary();
  }, [calculateHoursSummary]);

  useEffect(() => {
    const loadCompanyName = async () => {
      const profile = await getCurrentAuthProfile();
      setCompanyName(profile?.company_name ?? '');
    };
    void loadCompanyName();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      void calculateHoursSummary();
    };
    window.addEventListener(PLANNER_ASSIGNMENTS_CHANGED, handler);
    return () => window.removeEventListener(PLANNER_ASSIGNMENTS_CHANGED, handler);
  }, [calculateHoursSummary]);

  const formatHours = (hours: number): string => hours.toFixed(2);

  const formatDays = (n: number): string => {
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(2);
  };

  const handleExportExcel = async () => {
    const headers = [
      'Mitarbeiter',
      'Effektive Arbeitsstunden (h)',
      'Nacht Anteil Info (h)',
      'Sonntag Anteil Info (h)',
      'Urlaub (Tage)',
      'Krankheit (Tage)',
      'Auswertungszeitraum',
    ];
    const period = formatPeriodLabelCsv(startDate, endDate);
    const sumNight = hoursData.reduce((s, d) => s + d.night_hours, 0);
    const sumSun = hoursData.reduce((s, d) => s + d.sunday_hours, 0);
    const sumTot = hoursData.reduce((s, d) => s + d.total_hours, 0);
    const sumVac = hoursData.reduce((s, d) => s + d.vacation_days, 0);
    const sumSick = hoursData.reduce((s, d) => s + d.sick_days, 0);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'App Accountant Export';
    const ws = wb.addWorksheet('Accountant');

    ws.addRow(headers);
    for (const d of hoursData) {
      ws.addRow([
        d.employee_name,
        Number(formatHours(d.total_hours)),
        Number(formatHours(d.night_hours)),
        Number(formatHours(d.sunday_hours)),
        Number(formatDays(d.vacation_days)),
        Number(formatDays(d.sick_days)),
        period,
      ]);
    }
    ws.addRow([
      'Summe',
      Number(formatHours(sumTot)),
      Number(formatHours(sumNight)),
      Number(formatHours(sumSun)),
      Number(formatDays(sumVac)),
      Number(formatDays(sumSick)),
      period,
    ]);

    ws.columns = [
      { width: 24 },
      { width: 30 },
      { width: 24 },
      { width: 26 },
      { width: 16 },
      { width: 18 },
      { width: 24 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.height = 22;
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'left' };

    const lastRowIndex = ws.lastRow?.number ?? 1;
    const totalRow = ws.getRow(lastRowIndex);
    totalRow.font = { bold: true };

    const border: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      left: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      right: { style: 'thin', color: { argb: 'FFFFFFFF' } },
    };

    // Header filter + freeze, so the table behaves like the reference.
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: 7 },
    };
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    for (let rowIdx = 2; rowIdx <= lastRowIndex; rowIdx += 1) {
      const row = ws.getRow(rowIdx);
      for (let colIdx = 2; colIdx <= 6; colIdx += 1) {
        const cell = row.getCell(colIdx);
        cell.alignment = { horizontal: 'right' };
        if (colIdx <= 4) {
          cell.numFmt = '0.00';
        } else {
          cell.numFmt = '0.##';
        }
      }
    }

    for (let rowIdx = 1; rowIdx <= lastRowIndex; rowIdx += 1) {
      for (let colIdx = 1; colIdx <= 7; colIdx += 1) {
        const cell = ws.getRow(rowIdx).getCell(colIdx);
        cell.border = border as ExcelJS.Borders;
        if (rowIdx === 1) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF1F4E78' },
          };
          continue;
        }
        if (rowIdx === lastRowIndex) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFB8CCE4' },
          };
        } else {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: rowIdx % 2 === 0 ? 'FFDCE6F1' : 'FFC5D9F1' },
          };
        }
      }
    }

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plan-export.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
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
      <Layout>
        <div className="space-y-6 print:space-y-4">
          <div className="hidden print:block border-b border-gray-300 pb-2 text-center">
            <p className="text-sm font-semibold text-gray-700">
              {companyName ? `Firma: ${companyName}` : 'Firma: -'}
            </p>
          </div>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between print:break-inside-avoid">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{t.accountantViewTitle}</h1>
              <p className="mt-2 max-w-3xl text-sm text-gray-600">{t.accountantPayrollSubtitle}</p>
              <p className="mt-1 text-sm font-medium text-gray-800">
                {t.accountantPeriodLabel}: {periodLabel}
              </p>
              {rangeInvalid && (
                <p className="mt-2 text-sm text-red-600">{t.endDateAfterStartDate}</p>
              )}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t.startDate}</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-md border-2 border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 print:hidden"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t.endDate}</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-md border-2 border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 print:hidden"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  void handleExportExcel();
                }}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 print:hidden"
              >
                {t.accountantExportCsv}
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg bg-white shadow print:shadow-none">
            <table className="min-w-full divide-y divide-gray-200 text-sm print:text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    rowSpan={2}
                    className="border-b border-gray-200 px-4 py-3 text-left align-bottom text-xs font-semibold uppercase tracking-wide text-gray-600"
                  >
                    {t.employee}
                  </th>
                  <th
                    colSpan={3}
                    scope="colgroup"
                    className="border-b border-gray-200 px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-700"
                  >
                    {t.accountantCategoryHours}
                  </th>
                  <th
                    colSpan={2}
                    scope="colgroup"
                    className="border-b border-gray-200 px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-700"
                  >
                    {t.accountantCategoryAbsences}
                  </th>
                </tr>
                <tr>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-700">{t.effectiveWorkHours}</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">{t.nightHoursInfo}</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">{t.sundayHoursInfo}</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">{t.vacationDays}</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">{t.sickDays}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {hoursData.map((data, index) => (
                  <tr key={data.employee_id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">{data.employee_name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                      {formatHours(data.total_hours)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-800">
                      {formatHours(data.night_hours)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-800">
                      {formatHours(data.sunday_hours)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-800">
                      {formatDays(data.vacation_days)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-800">
                      {formatDays(data.sick_days)}
                    </td>
                  </tr>
                ))}
                {hoursData.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                      {t.noDataAvailable}
                    </td>
                  </tr>
                )}
              </tbody>
              {hoursData.length > 0 && (
                <tfoot className="border-t-2 border-gray-300 bg-gray-100">
                  <tr>
                    <td className="whitespace-nowrap px-4 py-3 font-bold text-gray-900">{t.total}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-bold text-gray-900">
                      {formatHours(hoursData.reduce((sum, data) => sum + data.total_hours, 0))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-bold text-gray-900">
                      {formatHours(hoursData.reduce((sum, data) => sum + data.night_hours, 0))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-bold text-gray-900">
                      {formatHours(hoursData.reduce((sum, data) => sum + data.sunday_hours, 0))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-bold text-gray-900">
                      {formatDays(hoursData.reduce((sum, data) => sum + data.vacation_days, 0))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-bold text-gray-900">
                      {formatDays(hoursData.reduce((sum, data) => sum + data.sick_days, 0))}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </Layout>
    </AuthGuard>
  );
}
