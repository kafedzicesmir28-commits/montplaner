'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Layout from '@/components/Layout';
import { Montatsplaner, type HeaderEmployee } from '@/components/montatsplaner';
import { PlannerStateManager, usePlanner } from '@/components/montatsplaner/PlannerStateManager';
import { exportPlannerExcel, exportPlannerPdf } from '@/components/montatsplaner/exportService';
import { supabase } from '@/lib/supabaseClient';
import { t } from '@/lib/translations';
import { formatErrorMessage } from '@/lib/utils';

function MontatsplanerExports({ employees }: { employees: HeaderEmployee[] }) {
  const { data } = usePlanner();

  const onExcel = useCallback(() => {
    void exportPlannerExcel({ year: data.year, employees, data });
  }, [data, employees]);

  const onPdf = useCallback(() => {
    void exportPlannerPdf('montatsplaner-export-root');
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <button
        type="button"
        onClick={onExcel}
        className="border border-gray-400 bg-white px-3 py-1.5 text-sm text-gray-900"
      >
        Export Excel
      </button>
      <button
        type="button"
        onClick={onPdf}
        className="border border-gray-400 bg-white px-3 py-1.5 text-sm text-gray-900"
      >
        Export PDF
      </button>
    </div>
  );
}

function MontatsplanerShell({
  year,
  onYearChange,
  employees,
}: {
  year: number;
  onYearChange: (y: number) => void;
  employees: HeaderEmployee[];
}) {
  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1];
  }, []);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4 print:hidden">
        <h1 className="text-xl font-semibold text-gray-900">{t.monthlyPlanner}</h1>
        <div className="flex flex-wrap items-center gap-4">
          <MontatsplanerExports employees={employees} />
          <label className="flex items-center gap-2 text-sm text-gray-800">
            <span>Jahr</span>
            <select
              value={year}
              onChange={(e) => onYearChange(Number(e.target.value))}
              className="border border-gray-300 bg-white px-2 py-1 text-gray-900"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <Montatsplaner year={year} employees={employees} />
    </>
  );
}

export default function MontatsplanerPage() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [employees, setEmployees] = useState<HeaderEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const employeeIds = useMemo(() => employees.map((e) => e.id), [employees]);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: empRows, error: empErr } = await supabase
        .from('employees')
        .select('id, name')
        .order('name');
      if (empErr) throw empErr;
      const list = (empRows || []).map((e) => ({ id: e.id as string, name: e.name as string }));
      setEmployees(list);
    } catch (e) {
      setError(formatErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  return (
    <AuthGuard>
      <Layout>
        <div className="print:bg-white">
          {error ? (
            <p className="mb-4 text-sm text-red-600 print:hidden" role="alert">
              {error}
            </p>
          ) : null}

          {loading ? (
            <p className="text-sm text-gray-600">{t.loading}</p>
          ) : (
            <PlannerStateManager year={year} employeeIds={employeeIds}>
              <MontatsplanerShell year={year} onYearChange={setYear} employees={employees} />
            </PlannerStateManager>
          )}
        </div>
      </Layout>
    </AuthGuard>
  );
}

