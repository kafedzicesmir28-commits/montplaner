'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Layout from '@/components/Layout';
import { useCompany } from '@/contexts/CompanyContext';
import { Montatsplaner, type HeaderEmployee } from '@/components/montatsplaner';
import { PlannerStateManager, usePlanner } from '@/components/montatsplaner/PlannerStateManager';
import { exportPlannerExcel, exportPlannerPdf } from '@/components/montatsplaner/exportService';
import { supabase } from '@/lib/supabaseClient';
import { t } from '@/lib/translations';
import { formatErrorMessage } from '@/lib/utils';

const MONTH_OPTIONS = [
  { key: 'januar', label: 'Januar' },
  { key: 'februar', label: 'Februar' },
  { key: 'märz', label: 'Marz' },
  { key: 'april', label: 'April' },
  { key: 'mai', label: 'Mai' },
  { key: 'juni', label: 'Juni' },
  { key: 'juli', label: 'Juli' },
  { key: 'august', label: 'August' },
  { key: 'september', label: 'September' },
  { key: 'oktober', label: 'Oktober' },
  { key: 'november', label: 'November' },
  { key: 'dezember', label: 'Dezember' },
] as const;

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
  const [selectedMonth, setSelectedMonth] = useState<string>(MONTH_OPTIONS[0].key);

  const yearOptions = useMemo(() => {
    const fromYear = Math.max(2024, new Date().getFullYear() - 2);
    const out: number[] = [];
    for (let y = fromYear; y <= 2040; y++) out.push(y);
    return out;
  }, []);

  useEffect(() => {
    const el = document.getElementById(`montatsplaner-month-${selectedMonth}`);
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [selectedMonth, year]);

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2 sm:gap-3 sm:px-3 print:hidden">
        <h1 className="text-xl font-semibold text-gray-900">{t.monthlyPlanner}</h1>
        <div className="flex flex-wrap items-center gap-4">
          <MontatsplanerExports employees={employees} />
          <label className="flex items-center gap-2 text-sm text-gray-800">
            <span>Monat</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="border border-gray-300 bg-white px-2 py-1 text-gray-900"
            >
              {MONTH_OPTIONS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
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
  return (
    <AuthGuard>
      <Layout>
        <MontatsplanerPageInner />
      </Layout>
    </AuthGuard>
  );
}

function MontatsplanerPageInner() {
  const { companyId } = useCompany();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [employees, setEmployees] = useState<HeaderEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const employeeIds = useMemo(() => employees.map((e) => e.id), [employees]);
  const storageTenantKey = companyId ?? '_no_company_';

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!companyId) {
        setEmployees([]);
        return;
      }
      const { data: empRows, error: empErr } = await supabase
        .from('employees')
        .select('id, name')
        .eq('company_id', companyId)
        .order('name');
      if (empErr) throw empErr;
      const list = (empRows || []).map((e) => ({ id: e.id as string, name: e.name as string }));
      setEmployees(list);
    } catch (e) {
      setError(formatErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  return (
    <div className="print:bg-white w-full min-w-0 max-w-full">
      {!companyId ? (
        <p className="text-sm text-amber-800 print:hidden">{t.tenantNoCompanySave}</p>
      ) : null}
      {error ? (
        <p className="mb-4 text-sm text-red-600 print:hidden" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-gray-600">{t.loading}</p>
      ) : companyId ? (
        <PlannerStateManager year={year} employeeIds={employeeIds} storageTenantKey={storageTenantKey}>
          <MontatsplanerShell year={year} onYearChange={setYear} employees={employees} />
        </PlannerStateManager>
      ) : null}
    </div>
  );
}

