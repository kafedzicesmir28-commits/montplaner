'use client';

import { useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import Layout from '@/components/Layout';
import { supabase } from '@/lib/supabaseClient';
import { Vacation, Employee } from '@/types/database';
import { notifyPlannerAssignmentsChanged } from '@/lib/plannerEvents';
import { t } from '@/lib/translations';

type WeeklyVacationRow = {
  weekLabel: string;
  weekKey: string;
  employeeName: string;
  vacationDays: number;
};
type WeekCell = {
  weekNumber: number;
  start: Date;
  end: Date;
  monthIndex: number;
};

function toDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  const s = toDateOnly(start);
  const e = toDateOnly(end);
  for (let cur = new Date(s); cur <= e; cur.setDate(cur.getDate() + 1)) {
    out.push(dayKey(cur));
  }
  return out;
}

function isoWeek(dateStr: string): { label: string; key: string } {
  const d = toDateOnly(dateStr);
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + 3 - ((x.getDay() + 6) % 7));
  const week1 = new Date(x.getFullYear(), 0, 4);
  const n =
    1 +
    Math.round(((x.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  const y = x.getFullYear();
  return { label: `KW ${n}/${y}`, key: `${y}-${String(n).padStart(2, '0')}` };
}

function isoWeekFromDate(date: Date): { week: number; weekYear: number } {
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
  if (dow <= 4) monday.setDate(simple.getDate() - simple.getDay() + 1);
  else monday.setDate(simple.getDate() + 8 - simple.getDay());
  return monday;
}

function buildYearWeeks(year: number): WeekCell[] {
  const out: WeekCell[] = [];
  for (let week = 1; week <= 53; week++) {
    const start = mondayOfIsoWeek(year, week);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const check = isoWeekFromDate(start);
    if (check.weekYear !== year || check.week !== week) continue;
    out.push({ weekNumber: week, start, end, monthIndex: start.getMonth() });
  }
  return out;
}

function intersects(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA <= endB && endA >= startB;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

export default function VacationsPage() {
  const [vacations, setVacations] = useState<(Vacation & { employee?: Employee })[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingVacation, setEditingVacation] = useState<Vacation | null>(null);
  const [employeeId, setEmployeeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [overlapWarning, setOverlapWarning] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [vacationsRes, employeesRes] = await Promise.all([
        supabase
          .from('vacations')
          .select('*')
          .order('start_date', { ascending: false }),
        supabase.from('employees').select('*').order('name'),
      ]);

      if (vacationsRes.error) throw vacationsRes.error;
      if (employeesRes.error) throw employeesRes.error;

      const vacationsData = vacationsRes.data || [];
      const employeesData = employeesRes.data || [];

      // Enrich vacations with employee data
      const enrichedVacations = vacationsData.map((vacation) => ({
        ...vacation,
        employee: employeesData.find((e) => e.id === vacation.employee_id),
      }));

      setVacations(enrichedVacations);
      setEmployees(employeesData);
    } catch (error: any) {
      console.error('Error fetching data:', error.message);
      alert('Error loading data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (new Date(endDate) < new Date(startDate)) {
      alert('End date must be after start date');
      return;
    }

    try {
      const overlapCheck = await supabase
        .from('vacations')
        .select('id, employee_id, start_date, end_date')
        .lte('start_date', endDate)
        .gte('end_date', startDate);
      if (overlapCheck.error) throw overlapCheck.error;
      const overlaps = (overlapCheck.data || []).filter((v) => {
        if (editingVacation && v.id === editingVacation.id) return false;
        return v.employee_id !== employeeId;
      });
      if (overlaps.length > 0) {
        setOverlapWarning(
          `Warnung: ${overlaps.length} bestehende Urlaubsantrag(e) uberlappen mit diesem Zeitraum.`
        );
      } else {
        setOverlapWarning(null);
      }

      if (editingVacation) {
        const { error } = await supabase
          .from('vacations')
          .update({
            employee_id: employeeId,
            start_date: startDate,
            end_date: endDate,
          })
          .eq('id', editingVacation.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('vacations').insert([
          {
            employee_id: employeeId,
            start_date: startDate,
            end_date: endDate,
          },
        ]);

        if (error) throw error;
      }

      setShowModal(false);
      setEditingVacation(null);
      resetForm();
      fetchData();
      notifyPlannerAssignmentsChanged();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  };

  const resetForm = () => {
    setEmployeeId('');
    setStartDate('');
    setEndDate('');
  };

  const handleEdit = (vacation: Vacation) => {
    setEditingVacation(vacation);
    setEmployeeId(vacation.employee_id);
    setStartDate(vacation.start_date);
    setEndDate(vacation.end_date);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t.areYouSureDeleteVacation)) return;

    try {
      const { error } = await supabase.from('vacations').delete().eq('id', id);

      if (error) throw error;
      fetchData();
      notifyPlannerAssignmentsChanged();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingVacation(null);
    resetForm();
  };

  const overlapDays = vacations.reduce<Record<string, Set<string>>>((acc, vacation) => {
    const emp = vacation.employee?.name || 'Unknown';
    for (const d of eachDay(vacation.start_date, vacation.end_date)) {
      if (!acc[d]) acc[d] = new Set<string>();
      acc[d]!.add(emp);
    }
    return acc;
  }, {});

  const heavyOverlapDays = Object.entries(overlapDays)
    .filter(([, names]) => names.size > 1)
    .sort(([a], [b]) => a.localeCompare(b));

  const weeklyOverview: WeeklyVacationRow[] = (() => {
    const byWeekEmp = new Map<string, WeeklyVacationRow>();
    for (const v of vacations) {
      const name = v.employee?.name || 'Unknown';
      for (const d of eachDay(v.start_date, v.end_date)) {
        const wk = isoWeek(d);
        const k = `${wk.key}:${name}`;
        const prev = byWeekEmp.get(k);
        if (prev) {
          prev.vacationDays += 1;
        } else {
          byWeekEmp.set(k, { weekLabel: wk.label, weekKey: wk.key, employeeName: name, vacationDays: 1 });
        }
      }
    }
    return Array.from(byWeekEmp.values()).sort((a, b) => {
      return a.weekKey.localeCompare(b.weekKey) || a.employeeName.localeCompare(b.employeeName);
    });
  })();

  const yearStart = `${selectedYear}-01-01`;
  const yearEnd = `${selectedYear}-12-31`;
  const weeks = useMemo(() => buildYearWeeks(selectedYear), [selectedYear]);
  const monthSpans = useMemo(() => {
    const spans: { monthIndex: number; count: number }[] = [];
    for (const w of weeks) {
      const last = spans[spans.length - 1];
      if (!last || last.monthIndex !== w.monthIndex) spans.push({ monthIndex: w.monthIndex, count: 1 });
      else last.count += 1;
    }
    return spans;
  }, [weeks]);
  const vacationsForYear = useMemo(
    () => vacations.filter((v) => v.start_date <= yearEnd && v.end_date >= yearStart),
    [vacations, yearEnd, yearStart]
  );
  const vacationsByEmployee = useMemo(() => {
    const map = new Map<string, Vacation[]>();
    for (const v of vacationsForYear) {
      const list = map.get(v.employee_id) ?? [];
      list.push(v);
      map.set(v.employee_id, list);
    }
    return map;
  }, [vacationsForYear]);
  const weekColorMap = useMemo(() => {
    const vacationWeeks = weeks
      .filter((w) =>
        vacationsForYear.some((v) =>
          intersects(toDateOnly(v.start_date), toDateOnly(v.end_date), w.start, w.end)
        )
      )
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .map((w) => w.weekNumber);

    const map: Record<number, 'red' | 'orange'> = {};
    vacationWeeks.forEach((weekId, index) => {
      map[weekId] = index % 2 === 0 ? 'red' : 'orange';
    });
    return map;
  }, [weeks, vacationsForYear]);
  const vacationsSortedByEmployeeName = useMemo(() => {
    return [...vacations].sort((a, b) => {
      const nameA = a.employee?.name || 'Unknown';
      const nameB = b.employee?.name || 'Unknown';
      const byName = nameA.localeCompare(nameB);
      if (byName !== 0) return byName;
      return a.start_date.localeCompare(b.start_date);
    });
  }, [vacations]);
  const printByTarget = (target: 'table' | 'list') => {
    document.body.setAttribute('data-vacation-print-target', target);
    window.print();
    document.body.removeAttribute('data-vacation-print-target');
  };
  const printVacationTable = () => printByTarget('table');
  const printVacationList = () => printByTarget('list');
  const yearOptions = useMemo(() => {
    const out: number[] = [];
    for (let y = new Date().getFullYear() - 1; y <= 2040; y++) out.push(y);
    return out;
  }, []);

  return (
    <AuthGuard>
      <Layout>
        {loading ? (
          <div className="text-center">{t.loading}</div>
        ) : (
        <div className="space-y-6">
          {overlapWarning ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 print:hidden">
              {overlapWarning}
            </div>
          ) : null}

          {heavyOverlapDays.length > 0 ? (
            <div className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800 print:hidden">
              Mehrfach-Urlaub erkannt: {heavyOverlapDays.length} Tag(e) haben gleichzeitige Antrage.
            </div>
          ) : null}

          <div className="flex items-center justify-between print:hidden">
            <h1 className="text-3xl font-bold text-gray-900">{t.vacationsTitle}</h1>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <span>Jahr</span>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="rounded border border-gray-300 bg-white px-2 py-1.5"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={printVacationTable}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
              >
                Print Vacation Table
              </button>
              <button
                type="button"
                onClick={printVacationList}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
              >
                Print Vacation List
              </button>
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                {t.addVacation}
              </button>
            </div>
          </div>

          <div
            id="print-vacation-table"
            className="vacations-print-area overflow-auto rounded-lg border border-gray-300 bg-white shadow-sm print:overflow-visible print:shadow-none print:rounded-none"
          >
            <div className="hidden print:block print:border-b print:border-gray-400 print:bg-white print:px-2 print:py-3">
              <h1 className="text-xl font-bold text-gray-900">
                {t.vacationsPrintTitle} {selectedYear}
              </h1>
              <p className="mt-1 text-sm text-gray-600">{t.vacationsTitle}</p>
            </div>
            <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-800 print:border-gray-400 print:bg-gray-100 print:py-2.5 print:text-base">
              Ferienplan {selectedYear}
            </div>
            <div className="vacations-print-table-wrap overflow-x-auto print:overflow-visible">
              <table className="vacations-print-table w-full min-w-max border-collapse text-xs print:text-[11px]">
                <thead>
                  <tr className="bg-gray-100 print:bg-gray-100">
                    <th className="sticky left-0 z-20 border border-gray-300 bg-gray-100 px-3 py-2 text-left font-semibold print:static print:z-0 print:px-2 print:py-2 print:text-sm">
                      Name
                    </th>
                    {monthSpans.map((m, idx) => (
                      <th
                        key={`${m.monthIndex}-${idx}`}
                        colSpan={m.count}
                        className="month-divider border border-gray-300 px-2 py-2 text-center font-semibold print:px-1.5 print:py-2 print:text-xs"
                      >
                        {MONTH_SHORT[m.monthIndex]}
                      </th>
                    ))}
                  </tr>
                  <tr className="bg-gray-50 print:bg-gray-50">
                    <th className="sticky left-0 z-20 border border-gray-300 bg-gray-50 px-3 py-1 text-left font-semibold print:static print:z-0 print:px-2 print:py-1.5 print:text-sm">
                      Woche
                    </th>
                    {weeks.map((w, weekIdx) => {
                      const isEndOfMonthGroup =
                        weekIdx === weeks.length - 1 ||
                        weeks[weekIdx + 1]!.monthIndex !== w.monthIndex;
                      return (
                        <th
                          key={w.weekNumber}
                          className={`border border-gray-300 px-1 py-1 text-[10px] font-medium print:min-w-[1.5rem] print:px-0.5 print:py-1.5 print:text-[10px]${isEndOfMonthGroup ? ' month-divider' : ''}`}
                        >
                          {w.weekNumber}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp, rowIdx) => {
                    const empVac = vacationsByEmployee.get(emp.id) ?? [];
                    return (
                      <tr key={emp.id} className={rowIdx % 2 === 0 ? 'bg-blue-100' : 'bg-white'}>
                        <td className="sticky left-0 z-10 border border-gray-300 bg-inherit px-3 py-1.5 font-medium text-gray-900 print:static print:z-0 print:px-2 print:py-1.5 print:text-sm">
                          {emp.name}
                        </td>
                        {weeks.map((w, weekIdx) => {
                          const isEndOfMonthGroup =
                            weekIdx === weeks.length - 1 ||
                            weeks[weekIdx + 1]!.monthIndex !== w.monthIndex;
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
                          const weekColor = weekColorMap[w.weekNumber];
                          const vacationToneClass =
                            active && weekColor === 'red'
                              ? 'bg-red-300/90 print:bg-red-300/90'
                              : active && weekColor === 'orange'
                                ? 'bg-orange-300/90 print:bg-orange-300/90'
                                : '';

                          return (
                            <td
                              key={`${emp.id}-${w.weekNumber}`}
                              title={active ? `${vacDaysInWeek} vacation day(s)` : ''}
                              className={`h-6 min-w-6 border border-gray-300 text-center print:h-auto print:min-w-[1.25rem] print:py-1 print:text-xs ${vacationToneClass}${isEndOfMonthGroup ? ' month-divider' : ''}`}
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
            </div>
          </div>

          <div id="print-vacation-list" className="vacations-data-table rounded-lg bg-white shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t.employee}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t.startDate}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t.endDate}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t.days}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t.actions}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {vacationsSortedByEmployeeName.map((vacation) => {
                  const start = new Date(vacation.start_date);
                  const end = new Date(vacation.end_date);
                  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

                  return (
                    <tr key={vacation.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {vacation.employee?.name || 'Unknown'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {start.toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {end.toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {days} {days !== 1 ? t.days : t.day}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleEdit(vacation)}
                          title="Edit"
                          aria-label="Edit"
                          className="mr-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(vacation.id)}
                          title="Delete"
                          aria-label="Delete"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="vacations-weekly-overview overflow-hidden rounded-lg border border-gray-200 bg-white shadow">
            <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-800">
              Wochenubersicht aller Mitarbeiter (Urlaubstage pro Woche)
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Woche
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {t.employee}
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Urlaubstage
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {weeklyOverview.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-4 text-center text-sm text-gray-500">
                      Keine Urlaubseintrage vorhanden.
                    </td>
                  </tr>
                ) : (
                  weeklyOverview.map((row, idx) => (
                    <tr key={`${row.weekLabel}-${row.employeeName}-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-2 text-sm text-gray-700">{row.weekLabel}</td>
                      <td className="px-4 py-2 text-sm font-medium text-gray-900">{row.employeeName}</td>
                      <td className="px-4 py-2 text-right text-sm text-gray-700">{row.vacationDays}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {showModal && (
            <div className="fixed inset-0 z-50 h-full w-full overflow-y-auto bg-gray-600 bg-opacity-50 print:hidden">
              <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                <h3 className="text-lg font-bold text-gray-900 mb-4">
                  {editingVacation ? t.editVacation : t.addVacation}
                </h3>
                <form onSubmit={handleSubmit}>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t.employee}
                    </label>
                    <select
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                      required
                      className="w-full rounded-md border-2 border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">{t.selectEmployee}</option>
                      {employees.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t.startDate}
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                      className="w-full rounded-md border-2 border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t.endDate}
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      required
                      className="w-full rounded-md border-2 border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                    >
                      {t.cancel}
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      {editingVacation ? t.update : t.create}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
        )}
      </Layout>
      <style jsx global>{`
        .vacations-print-table th.month-divider,
        .vacations-print-table td.month-divider {
          border-right: 1px solid #000;
        }
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body[data-vacation-print-target='table'] #print-vacation-list,
          body[data-vacation-print-target='table'] .vacations-weekly-overview {
            display: none !important;
          }
          body[data-vacation-print-target='list'] #print-vacation-table,
          body[data-vacation-print-target='list'] .vacations-weekly-overview {
            display: none !important;
          }
        }
      `}</style>
    </AuthGuard>
  );
}

