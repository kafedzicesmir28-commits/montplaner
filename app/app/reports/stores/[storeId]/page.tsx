'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import Layout from '@/components/Layout';
import { supabase } from '@/lib/supabaseClient';
import type { Employee, Shift, ShiftAssignment, Store } from '@/types/database';
import { formatDate, formatErrorMessage } from '@/lib/utils';
import { resolveStoreColor, storeTextColor } from '@/lib/storeColors';

type StoreRow = Store & { color?: string | null };

type AssignmentRow = ShiftAssignment & {
  custom_start_time?: string | null;
  custom_end_time?: string | null;
  employee: Employee | null;
  shift: Shift | null;
};

function resolveHeaderColor(store: StoreRow): string {
  return resolveStoreColor(store.color ?? undefined);
}

function contrastingText(bg: string): string {
  return storeTextColor(bg);
}

function formatClock(value: string): string {
  const part = value.split(':').slice(0, 2);
  if (part.length < 2) return value;
  return `${part[0]!.padStart(2, '0')}:${part[1]!.padStart(2, '0')}`;
}

function effectiveTimes(row: AssignmentRow): { start: string; end: string } {
  const sh = row.shift;
  if (!sh) return { start: '', end: '' };
  const cs = row.custom_start_time;
  const ce = row.custom_end_time;
  const start =
    cs != null && String(cs).trim() !== '' ? String(cs).split(':').slice(0, 2).join(':') : sh.start_time;
  const end =
    ce != null && String(ce).trim() !== '' ? String(ce).split(':').slice(0, 2).join(':') : sh.end_time;
  return { start, end };
}

/** ISO week number + year for grouping label (local date). */
function isoWeekKey(dateStr: string): { label: string; sort: string } {
  const d = new Date(dateStr);
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + 3 - ((x.getDay() + 6) % 7));
  const week1 = new Date(x.getFullYear(), 0, 4);
  const wn =
    1 +
    Math.round(
      ((x.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    );
  const wy = x.getFullYear();
  return {
    label: `KW ${wn} · ${wy}`,
    sort: `${wy}-${String(wn).padStart(2, '0')}`,
  };
}

export default function StoreMonthlyOverviewPage() {
  const params = useParams();
  const storeId = typeof params.storeId === 'string' ? params.storeId : '';

  const [monthValue, setMonthValue] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [store, setStore] = useState<StoreRow | null>(null);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { year, monthIndex, monthStart, monthEnd } = useMemo(() => {
    const [y, m] = monthValue.split('-').map(Number);
    const year = y || new Date().getFullYear();
    const monthIndex = (m || 1) - 1;
    const first = new Date(year, monthIndex, 1);
    const last = new Date(year, monthIndex + 1, 0);
    return {
      year,
      monthIndex,
      monthStart: formatDate(first),
      monthEnd: formatDate(last),
    };
  }, [monthValue]);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setError(null);
    try {
      const [storeRes, assignRes] = await Promise.all([
        supabase.from('stores').select('*').eq('id', storeId).maybeSingle(),
        supabase
          .from('shift_assignments')
          .select('*, employee:employees(*), shift:shifts(*)')
          .eq('store_id', storeId)
          .gte('date', monthStart)
          .lte('date', monthEnd)
          .order('date', { ascending: true }),
      ]);

      if (storeRes.error) throw storeRes.error;
      if (assignRes.error) throw assignRes.error;

      setStore(storeRes.data as StoreRow | null);
      const raw = (assignRes.data || []) as AssignmentRow[];
      raw.sort((a, b) => {
        const da = a.date.localeCompare(b.date);
        if (da !== 0) return da;
        const na = a.employee?.name ?? '';
        const nb = b.employee?.name ?? '';
        return na.localeCompare(nb, undefined, { sensitivity: 'base' });
      });
      setAssignments(raw);
    } catch (e: unknown) {
      setError(formatErrorMessage(e));
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }, [storeId, monthStart, monthEnd]);

  useEffect(() => {
    void load();
  }, [load]);

  const weekGroups = useMemo(() => {
    const groups: { key: string; label: string; rows: AssignmentRow[] }[] = [];
    let currentKey = '';
    for (const row of assignments) {
      const { label, sort } = isoWeekKey(row.date);
      if (sort !== currentKey) {
        currentKey = sort;
        groups.push({ key: sort, label, rows: [row] });
      } else {
        groups[groups.length - 1]!.rows.push(row);
      }
    }
    return groups;
  }, [assignments]);

  const headerBg = store ? resolveHeaderColor(store) : '#e7e6e6';
  const headerFg = contrastingText(headerBg);

  if (!storeId) {
    return (
      <AuthGuard>
        <Layout>
          <p className="text-sm text-red-600">Invalid store.</p>
        </Layout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <Layout>
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div
              className="rounded-md border border-gray-400 px-4 py-3 shadow-sm"
              style={{ backgroundColor: headerBg, color: headerFg }}
            >
              <h1 className="text-lg font-bold tracking-tight">Store schedule</h1>
              {store ? (
                <p className="mt-1 text-base font-semibold">{store.name}</p>
              ) : !loading ? (
                <p className="mt-1 text-sm opacity-90">Store not found.</p>
              ) : null}
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                Month
              </label>
              <input
                type="month"
                value={monthValue}
                onChange={(e) => setMonthValue(e.target.value)}
                className="mt-0.5 rounded border border-gray-400 bg-white px-2 py-1.5 text-sm text-gray-900"
              />
            </div>
          </div>

          {error ? (
            <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          {loading ? (
            <p className="text-sm text-gray-600">Loading…</p>
          ) : (
            <div className="overflow-x-auto border border-gray-400 bg-white shadow-sm">
              <table
                className="w-full border-collapse text-left text-[11px] leading-tight text-gray-900"
                style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
              >
                <thead>
                  <tr className="border-b border-gray-400 bg-[#f3f4f6]">
                    <th className="border-r border-gray-400 px-1.5 py-1 font-bold uppercase">
                      Date
                    </th>
                    <th className="border-r border-gray-400 px-1.5 py-1 font-bold uppercase">
                      Employee
                    </th>
                    <th className="border-r border-gray-400 px-1.5 py-1 font-bold uppercase">
                      Shift
                    </th>
                    <th className="border-r border-gray-400 px-1.5 py-1 text-right font-bold uppercase">
                      Start
                    </th>
                    <th className="px-1.5 py-1 text-right font-bold uppercase">End</th>
                  </tr>
                </thead>
                {assignments.length === 0 ? (
                  <tbody>
                    <tr>
                      <td
                        colSpan={5}
                        className="border-t border-gray-400 px-2 py-6 text-center text-gray-500"
                      >
                        No assignments for this store in the selected month.
                      </td>
                    </tr>
                  </tbody>
                ) : (
                  weekGroups.map((g) => (
                    <tbody key={g.key} className="border-t-2 border-gray-600">
                      <tr className="bg-[#dfe3ea]">
                        <td
                          colSpan={5}
                          className="border-b border-gray-400 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-800"
                        >
                          {g.label}
                        </td>
                      </tr>
                      {g.rows.map((row) => {
                        const { start, end } = effectiveTimes(row);
                        return (
                          <tr
                            key={row.id}
                            className="border-b border-gray-300 hover:bg-gray-50"
                          >
                            <td className="border-r border-gray-300 px-1.5 py-0.5 tabular-nums">
                              {row.date}
                            </td>
                            <td className="border-r border-gray-300 px-1.5 py-0.5">
                              {row.employee?.name ?? '—'}
                            </td>
                            <td className="border-r border-gray-300 px-1.5 py-0.5 font-semibold">
                              {row.shift?.name ?? '—'}
                            </td>
                            <td className="border-r border-gray-300 px-1.5 py-0.5 text-right tabular-nums">
                              {start ? formatClock(start) : '—'}
                            </td>
                            <td className="px-1.5 py-0.5 text-right tabular-nums">
                              {end ? formatClock(end) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  ))
                )}
              </table>
            </div>
          )}
        </div>
      </Layout>
    </AuthGuard>
  );
}
