'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Layout from '@/components/Layout';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/lib/supabaseClient';
import type { Employee, Vacation } from '@/types/database';
import { formatErrorMessage } from '@/lib/utils';

type WeekCell = {
  weekNumber: number;
  start: Date;
  end: Date;
  monthIndex: number;
};

function toDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function isoWeek(date: Date): { week: number; weekYear: number } {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const week =
    1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return { week, weekYear: d.getFullYear() };
}

function mondayOfIsoWeek(year: number, week: number): Date {
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dow = simple.getDay();
  const monday = new Date(simple);
  if (dow <= 4) {
    monday.setDate(simple.getDate() - simple.getDay() + 1);
  } else {
    monday.setDate(simple.getDate() + 8 - simple.getDay());
  }
  return monday;
}

function buildYearWeeks(year: number): WeekCell[] {
  const out: WeekCell[] = [];
  for (let week = 1; week <= 53; week++) {
    const start = mondayOfIsoWeek(year, week);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const check = isoWeek(start);
    if (check.weekYear !== year || check.week !== week) continue;
    out.push({
      weekNumber: week,
      start,
      end,
      monthIndex: start.getMonth(),
    });
  }
  return out;
}

function intersects(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA <= endB && endA >= startB;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

function VacationSpreadsheetInner() {
  const { companyId } = useCompany();
  const [year, setYear] = useState(new Date().getFullYear());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const weeks = useMemo(() => buildYearWeeks(year), [year]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!companyId) {
        setEmployees([]);
        setVacations([]);
        return;
      }
      const yearStart = `${year}-01-01`;
      const yearEnd = `${year}-12-31`;
      const [empRes, vacRes] = await Promise.all([
        supabase.from('employees').select('*').eq('company_id', companyId).order('name', { ascending: true }),
        supabase
          .from('vacations')
          .select('*')
          .eq('company_id', companyId)
          .lte('start_date', yearEnd)
          .gte('end_date', yearStart),
      ]);

      if (empRes.error) throw empRes.error;
      if (vacRes.error) throw vacRes.error;

      setEmployees((empRes.data || []) as Employee[]);
      setVacations((vacRes.data || []) as Vacation[]);
    } catch (e: unknown) {
      setError(formatErrorMessage(e));
      setEmployees([]);
      setVacations([]);
    } finally {
      setLoading(false);
    }
  }, [year, companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const vacationsByEmployee = useMemo(() => {
    const map = new Map<string, Vacation[]>();
    for (const v of vacations) {
      const list = map.get(v.employee_id) ?? [];
      list.push(v);
      map.set(v.employee_id, list);
    }
    return map;
  }, [vacations]);

  const monthSpans = useMemo(() => {
    const spans: { monthIndex: number; count: number }[] = [];
    for (const w of weeks) {
      const last = spans[spans.length - 1];
      if (!last || last.monthIndex !== w.monthIndex) {
        spans.push({ monthIndex: w.monthIndex, count: 1 });
      } else {
        last.count += 1;
      }
    }
    return spans;
  }, [weeks]);

  const yearOptions = useMemo(() => {
    const out: number[] = [];
    for (let y = new Date().getFullYear() - 1; y <= 2040; y++) out.push(y);
    return out;
  }, []);

  return (
    <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Vacation Spreadsheet</h1>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <span>Year</span>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="rounded border border-gray-300 bg-white px-2 py-1"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error ? (
            <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
          ) : null}

          <div className="overflow-auto rounded-lg border border-gray-300 bg-white shadow-sm">
            {loading ? (
              <div className="px-4 py-8 text-center text-sm text-gray-600">Loading...</div>
            ) : (
              <table className="border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="sticky left-0 z-20 border border-gray-300 bg-gray-100 px-3 py-2 text-left font-semibold">
                      Name
                    </th>
                    {monthSpans.map((m, idx) => (
                      <th
                        key={`${m.monthIndex}-${idx}`}
                        colSpan={m.count}
                        className="border border-gray-300 px-2 py-2 text-center font-semibold"
                      >
                        {MONTH_SHORT[m.monthIndex]}
                      </th>
                    ))}
                  </tr>
                  <tr className="bg-gray-50">
                    <th className="sticky left-0 z-20 border border-gray-300 bg-gray-50 px-3 py-1 text-left font-semibold">
                      Woche
                    </th>
                    {weeks.map((w) => (
                      <th key={w.weekNumber} className="border border-gray-300 px-1 py-1 text-[10px] font-medium">
                        {w.weekNumber}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp, rowIdx) => {
                    const empVac = vacationsByEmployee.get(emp.id) ?? [];
                    return (
                      <tr key={emp.id} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="sticky left-0 z-10 border border-gray-300 bg-inherit px-3 py-1.5 font-medium text-gray-900">
                          {emp.name}
                        </td>
                        {weeks.map((w) => {
                          const vacDaysInWeek = empVac.reduce((sum, v) => {
                            const s = toDateOnly(v.start_date);
                            const e = toDateOnly(v.end_date);
                            if (!intersects(s, e, w.start, w.end)) return sum;
                            const start = s > w.start ? s : w.start;
                            const end = e < w.end ? e : w.end;
                            const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
                            return sum + Math.max(0, days);
                          }, 0);

                          const active = vacDaysInWeek > 0;
                          return (
                            <td
                              key={`${emp.id}-${w.weekNumber}`}
                              title={active ? `${vacDaysInWeek} vacation day(s)` : ''}
                              className={`h-6 min-w-6 border border-gray-300 text-center ${
                                active ? 'bg-red-400/80 text-white' : ''
                              }`}
                            >
                              {active ? vacDaysInWeek : ''}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
    </div>
  );
}

export default function VacationSpreadsheetPage() {
  return (
    <AuthGuard>
      <Layout>
        <VacationSpreadsheetInner />
      </Layout>
    </AuthGuard>
  );
}

