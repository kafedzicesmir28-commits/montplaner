'use client';

import { useCallback, useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Layout from '@/components/Layout';
import { supabase } from '@/lib/supabaseClient';
import { formatErrorMessage } from '@/lib/utils';
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

export default function AccountantPage() {
  const [hoursData, setHoursData] = useState<HoursCalculation[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(1);
    return date.toISOString().split('T')[0];

  });
  const [endDate, setEndDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    date.setDate(0);
    return date.toISOString().split('T')[0];

  });

  const monthStartForRpc = (): string => {
    const d = new Date(startDate);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  };

  const calculateHoursSummary = useCallback(async () => {
    setLoading(true);
    try {
      const { data: employees, error: employeesError } = await supabase
        .from('employees')
        .select('*')
        .order('name');

      if (employeesError) throw employeesError;

      const list = (employees || []) as Employee[];
      const pMonth = monthStartForRpc();

      const rows: HoursCalculation[] = [];

      for (const employee of list) {
        const { data, error } = await supabase.rpc('calculate_employee_hours', {
          p_employee_id: employee.id,
          p_month: pMonth,
        });

        if (error) throw error;

        const rpc = (Array.isArray(data) ? data[0] : data) as RpcRow | null | undefined;
        if (!rpc) {
          rows.push({
            employee_id: employee.id,
            employee_name: employee.name,
            normal_hours: 0,
            night_hours: 0,
            sunday_hours: 0,
            total_hours: 0,
            vacation_days: 0,
            sick_days: 0,
          });
          continue;
        }

        rows.push({
          employee_id: employee.id,
          employee_name: employee.name,
          normal_hours: Number(rpc.normal_hours),
          night_hours: Number(rpc.night_hours),
          sunday_hours: Number(rpc.sunday_hours),
          total_hours: Number(rpc.total_hours),
          vacation_days: Number(rpc.vacation_days),
          sick_days: Number(rpc.sick_days),
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
  }, [startDate]);

  useEffect(() => {
    void calculateHoursSummary();
  }, [calculateHoursSummary]);

  const formatHours = (hours: number): string => hours.toFixed(2);

  const formatDays = (n: number): string => String(Math.round(n));

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
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-900">{t.accountantViewTitle}</h1>
            <div className="flex items-center space-x-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t.startDate}
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-md border-2 border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t.endDate}
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-md border-2 border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-white shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t.employee}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t.normalHours}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t.nightHours}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t.sundayHours}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t.vacationDays}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t.sickDays}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t.totalHours}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {hoursData.map((data, index) => (
                  <tr key={data.employee_id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {data.employee_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                      {formatHours(data.normal_hours)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                      {formatHours(data.night_hours)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                      {formatHours(data.sunday_hours)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                      {formatDays(data.vacation_days)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                      {formatDays(data.sick_days)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 text-right">
                      {formatHours(data.total_hours)}
                    </td>
                  </tr>
                ))}
                {hoursData.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-500">
                      {t.noDataAvailable}
                    </td>
                  </tr>
                )}
              </tbody>
              {hoursData.length > 0 && (
                <tfoot className="bg-gray-50">
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                      {t.total}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 text-right">
                      {formatHours(hoursData.reduce((sum, data) => sum + data.normal_hours, 0))}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 text-right">
                      {formatHours(hoursData.reduce((sum, data) => sum + data.night_hours, 0))}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 text-right">
                      {formatHours(hoursData.reduce((sum, data) => sum + data.sunday_hours, 0))}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 text-right">
                      {formatDays(hoursData.reduce((sum, data) => sum + data.vacation_days, 0))}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 text-right">
                      {formatDays(hoursData.reduce((sum, data) => sum + data.sick_days, 0))}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 text-right">
                      {formatHours(hoursData.reduce((sum, data) => sum + data.total_hours, 0))}
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

