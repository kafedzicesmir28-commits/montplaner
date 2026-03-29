'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Layout from '@/components/Layout';
import { supabase } from '@/lib/supabaseClient';
import { formatDate, formatErrorMessage, monthsFirstOfMonthInRange, parseYmdLocal } from '@/lib/utils';
import { HoursCalculation, Employee } from '@/types/database';
import { t } from '@/lib/translations';

type RpcRow = {
  normal_hours: number;
  night_hours: number;
  sunday_hours: number;
  vacation_days: number;
  sick_days: number;
  total_hours: number;
};

function formatPeriodLabel(startYmd: string, endYmd: string): string {
  const s = parseYmdLocal(startYmd);
  const e = parseYmdLocal(endYmd);
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
  return `${s.toLocaleDateString('de-DE', opts)} – ${e.toLocaleDateString('de-DE', opts)}`;
}

function downloadCsv(filename: string, content: string) {
  const bom = '\uFEFF';
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeCsvCell(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
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

      const { data: employees, error: employeesError } = await supabase
        .from('employees')
        .select('*')
        .order('name');

      if (employeesError) throw employeesError;

      const list = (employees || []) as Employee[];
      const months = monthsFirstOfMonthInRange(startDate, endDate);

      const rows: HoursCalculation[] = [];

      for (const employee of list) {
        let normal_hours = 0;
        let night_hours = 0;
        let sunday_hours = 0;
        let total_hours = 0;
        let vacation_days = 0;
        let sick_days = 0;

        for (const pMonth of months) {
          const { data, error } = await supabase.rpc('calculate_employee_hours', {
            p_employee_id: employee.id,
            p_month: pMonth,
          });

          if (error) throw error;

          const rpc = (Array.isArray(data) ? data[0] : data) as RpcRow | null | undefined;
          if (!rpc) continue;

          normal_hours += Number(rpc.normal_hours) || 0;
          night_hours += Number(rpc.night_hours) || 0;
          sunday_hours += Number(rpc.sunday_hours) || 0;
          total_hours += Number(rpc.total_hours) || 0;
          vacation_days += Number(rpc.vacation_days) || 0;
          sick_days += Number(rpc.sick_days) || 0;
        }

        rows.push({
          employee_id: employee.id,
          employee_name: employee.name,
          normal_hours,
          night_hours,
          sunday_hours,
          total_hours,
          vacation_days,
          sick_days,
        });
      }

      setHoursData(rows);
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

  const formatHours = (hours: number): string => hours.toFixed(2);

  const formatDays = (n: number): string => {
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(2);
  };

  const handleExportCsv = () => {
    const headers = [
      'Mitarbeiter',
      'Normalstunden (h)',
      'Nachtstunden (h)',
      'Sonntagsstunden (h)',
      'Stunden gesamt (h)',
      'Urlaub (Tage)',
      'Krankheit (Tage)',
      'Auswertungszeitraum',
    ];
    const period = formatPeriodLabel(startDate, endDate);
    const lines = [
      headers.map(escapeCsvCell).join(';'),
      ...hoursData.map((d) =>
        [
          d.employee_name,
          formatHours(d.normal_hours),
          formatHours(d.night_hours),
          formatHours(d.sunday_hours),
          formatHours(d.total_hours),
          formatDays(d.vacation_days),
          formatDays(d.sick_days),
          period,
        ]
          .map((c) => escapeCsvCell(String(c)))
          .join(';'),
      ),
    ];
    if (hoursData.length > 0) {
      const sumNormal = hoursData.reduce((s, d) => s + d.normal_hours, 0);
      const sumNight = hoursData.reduce((s, d) => s + d.night_hours, 0);
      const sumSun = hoursData.reduce((s, d) => s + d.sunday_hours, 0);
      const sumTot = hoursData.reduce((s, d) => s + d.total_hours, 0);
      const sumVac = hoursData.reduce((s, d) => s + d.vacation_days, 0);
      const sumSick = hoursData.reduce((s, d) => s + d.sick_days, 0);
      lines.push(
        [
          t.total,
          formatHours(sumNormal),
          formatHours(sumNight),
          formatHours(sumSun),
          formatHours(sumTot),
          formatDays(sumVac),
          formatDays(sumSick),
          period,
        ]
          .map((c) => escapeCsvCell(String(c)))
          .join(';'),
      );
    }
    const safePeriod = period.replace(/\s/g, '_').replace(/[.]/g, '');
    downloadCsv(`buchhaltung_${safePeriod}.csv`, lines.join('\r\n'));
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
                onClick={handleExportCsv}
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
                    colSpan={4}
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
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">{t.normalHours}</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">{t.nightHours}</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">{t.sundayHours}</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">{t.totalHours}</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">{t.vacationDays}</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">{t.sickDays}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {hoursData.map((data, index) => (
                  <tr key={data.employee_id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">{data.employee_name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-800">
                      {formatHours(data.normal_hours)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-800">
                      {formatHours(data.night_hours)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-800">
                      {formatHours(data.sunday_hours)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                      {formatHours(data.total_hours)}
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
                    <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
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
                      {formatHours(hoursData.reduce((sum, data) => sum + data.normal_hours, 0))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-bold text-gray-900">
                      {formatHours(hoursData.reduce((sum, data) => sum + data.night_hours, 0))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-bold text-gray-900">
                      {formatHours(hoursData.reduce((sum, data) => sum + data.sunday_hours, 0))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-bold text-gray-900">
                      {formatHours(hoursData.reduce((sum, data) => sum + data.total_hours, 0))}
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
