'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import Layout from '@/components/Layout';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/lib/supabaseClient';
import { Shift, Store } from '@/types/database';
import { t } from '@/lib/translations';
import { resolveStoreColor, storeTextColor } from '@/lib/storeColors';

type ShiftRow = Shift & { store?: Store | null };
type ShiftTemplate = {
  label: string;
  name: string;
  code: string;
  start: string;
  end: string;
  breakMinutes: 0 | 30 | 45 | 60;
};

const SHIFT_TEMPLATES: ShiftTemplate[] = [
  { label: 'Fruhschicht 06:00-14:00', name: 'Fruhschicht', code: 'FS', start: '06:00', end: '14:00', breakMinutes: 30 },
  { label: 'Tag 08:00-16:00', name: 'Tagdienst', code: 'TD', start: '08:00', end: '16:00', breakMinutes: 30 },
  { label: 'Spatschicht 14:00-22:00', name: 'Spatschicht', code: 'SS', start: '14:00', end: '22:00', breakMinutes: 45 },
  { label: 'Nachtschicht 22:00-06:00', name: 'Nachtschicht', code: 'NS', start: '22:00', end: '06:00', breakMinutes: 60 },
];

function normalizeTime24(value: string): string | null {
  const trimmed = String(value ?? '').trim();
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(trimmed);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return `rgba(245,245,245,${alpha})`;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function ShiftsPage() {
  return (
    <AuthGuard>
      <ShiftsPageInner />
    </AuthGuard>
  );
}

function ShiftsPageInner() {
  const { companyId } = useCompany();
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftRow | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [breakMinutes, setBreakMinutes] = useState(30);
  const [storeId, setStoreId] = useState('');
  const [isGlobal, setIsGlobal] = useState(false);

  const fetchShifts = useCallback(async () => {
    try {
      if (!companyId) {
        setShifts([]);
        setStores([]);
        return;
      }
      const [shiftsRes, storesRes] = await Promise.all([
        supabase
          .from('shifts')
          .select('*, store:stores(id,name,color)')
          .eq('company_id', companyId)
          .order('is_global', { ascending: false })
          .order('start_time'),
        supabase.from('stores').select('id,name,color').eq('company_id', companyId).order('name'),
      ]);

      if (shiftsRes.error) throw shiftsRes.error;
      if (storesRes.error) throw storesRes.error;
      setShifts((shiftsRes.data || []) as ShiftRow[]);
      setStores((storesRes.data || []) as Store[]);
    } catch (error: any) {
      console.error('Error fetching shifts:', error.message);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void fetchShifts();
  }, [fetchShifts]);

  useEffect(() => {
    const onStoresUpdated = () => {
      void fetchShifts();
    };
    window.addEventListener('stores:colors-updated', onStoresUpdated as EventListener);
    return () => window.removeEventListener('stores:colors-updated', onStoresUpdated as EventListener);
  }, [fetchShifts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedStart = normalizeTime24(startTime);
    const normalizedEnd = normalizeTime24(endTime);
    if (!normalizedStart || !normalizedEnd) {
      alert('Please enter time in 24-hour format (HH:mm).');
      return;
    }

    try {
      if (!companyId) {
        alert(t.tenantNoCompanySave);
        return;
      }
      if (editingShift) {
        const { error } = await supabase
          .from('shifts')
          .update({
            name,
            code: code || null,
            start_time: normalizedStart,
            end_time: normalizedEnd,
            break_minutes: breakMinutes,
            is_global: isGlobal,
            store_id: isGlobal ? null : (storeId || null),
          })
          .eq('id', editingShift.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('shifts')
          .insert([{
            name,
            code: code || null,
            start_time: normalizedStart,
            end_time: normalizedEnd,
            break_minutes: breakMinutes,
            is_global: isGlobal,
            store_id: isGlobal ? null : (storeId || null),
            company_id: companyId,
          }]);

        if (error) throw error;
      }

      setShowModal(false);
      setEditingShift(null);
      resetForm();
      fetchShifts();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  };

  const resetForm = () => {
    setName('');
    setCode('');
    setStartTime('');
    setEndTime('');
    setBreakMinutes(30);
    setStoreId('');
    setIsGlobal(false);
  };

  const handleEdit = (shift: ShiftRow) => {
    setEditingShift(shift);
    setName(shift.name);
    setCode(shift.code || '');
    setStartTime(normalizeTime24(shift.start_time) || shift.start_time);
    setEndTime(normalizeTime24(shift.end_time) || shift.end_time);
    setBreakMinutes([0, 30, 45, 60].includes(Number(shift.break_minutes)) ? Number(shift.break_minutes) : 30);
    setStoreId(shift.store_id || '');
    setIsGlobal(Boolean(shift.is_global));
    setShowModal(true);
  };

  const applyTemplate = (tpl: ShiftTemplate) => {
    setName((prev) => (prev.trim() ? prev : tpl.name));
    setCode((prev) => (prev.trim() ? prev : tpl.code));
    setStartTime(tpl.start);
    setEndTime(tpl.end);
    setBreakMinutes(tpl.breakMinutes);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t.areYouSureDeleteShift)) return;

    try {
      const { error } = await supabase
        .from('shifts')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchShifts();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingShift(null);
    resetForm();
  };

  if (loading) {
    return (
      <Layout>
        <div className="text-center">{t.loading}</div>
      </Layout>
    );
  }

  const grouped = shifts.reduce<Record<string, ShiftRow[]>>((acc, s) => {
    const key = s.is_global ? 'GLOBAL' : (s.store_id || 'UNKNOWN');
    if (!acc[key]) acc[key] = [];
    acc[key]!.push(s);
    return acc;
  }, {});

  return (
    <Layout>
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-900">{t.shiftsTitle}</h1>
            <button
              onClick={() => setShowModal(true)}
              className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              {t.addShift}
            </button>
          </div>

          <div className="rounded-lg bg-white shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t.shiftName}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Store
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t.startTime}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t.endTime}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t.breakMinutes}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t.actions}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Object.entries(grouped).flatMap(([groupKey, rows], groupIdx) => {
                  const first = rows[0];
                  const groupName = first?.is_global
                    ? 'GLOBAL'
                    : (first?.store?.name || stores.find((s) => s.id === groupKey)?.name || 'Unknown Store');
                  const groupColor = first?.is_global
                    ? '#64748b'
                    : resolveStoreColor(first?.store?.color || stores.find((s) => s.id === groupKey)?.color || '#f5f5f5');
                  const groupTintEven = hexToRgba(groupColor, 0.10);
                  const groupTintOdd = hexToRgba(groupColor, 0.06);
                  const out = [
                    <tr
                      key={`group-${groupKey}`}
                      style={{ borderTop: `2px solid ${groupColor}` }}
                    >
                      <td colSpan={7} className="px-6 py-2 text-xs font-bold uppercase tracking-wide text-gray-700">
                        <span
                          className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold"
                          style={{
                            backgroundColor: groupColor,
                            color: storeTextColor(groupColor),
                          }}
                        >
                          {groupName}
                        </span>
                      </td>
                    </tr>,
                  ];
                  rows.forEach((shift, index) => {
                    out.push(
                      <tr
                        key={shift.id}
                        style={{ backgroundColor: index % 2 === 0 ? groupTintEven : groupTintOdd }}
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {shift.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {shift.code || '—'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {shift.is_global ? (
                            <span className="inline-flex items-center rounded-md bg-slate-600 px-2 py-0.5 text-xs font-semibold text-white">
                              GLOBAL
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold"
                              style={{
                                backgroundColor: resolveStoreColor(shift.store?.color || '#f5f5f5'),
                                color: storeTextColor(resolveStoreColor(shift.store?.color || '#f5f5f5')),
                              }}
                            >
                              {shift.store?.name || '—'}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {normalizeTime24(shift.start_time) || shift.start_time}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {normalizeTime24(shift.end_time) || shift.end_time}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {shift.break_minutes}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleEdit(shift)}
                            title="Edit"
                            aria-label="Edit"
                            className="mr-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(shift.id)}
                            title="Delete"
                            aria-label="Delete"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  });
                  return out;
                })}
              </tbody>
            </table>
          </div>

          {showModal && (
            <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
              <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                <h3 className="text-lg font-bold text-gray-900 mb-4">
                  {editingShift ? t.editShift : t.addShift}
                </h3>
                <form onSubmit={handleSubmit}>
                  {!editingShift ? (
                    <div className="mb-4">
                      <label className="mb-1 block text-sm font-medium text-gray-700">Shift template</label>
                      <div className="flex flex-wrap gap-2">
                        {SHIFT_TEMPLATES.map((tpl) => (
                          <button
                            key={tpl.label}
                            type="button"
                            onClick={() => applyTemplate(tpl)}
                            className="rounded-md border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                          >
                            {tpl.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t.shiftName}
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="w-full rounded-md border-2 border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={t.shiftName}
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
                    <input
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      className="w-full rounded-md border-2 border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="BBF"
                    />
                  </div>
                  <div className="mb-4 flex items-center gap-2">
                    <input
                      id="shift-global"
                      type="checkbox"
                      checked={isGlobal}
                      onChange={(e) => setIsGlobal(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <label htmlFor="shift-global" className="text-sm font-medium text-gray-700">
                      Global shift (available in all stores)
                    </label>
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Store</label>
                    <select
                      value={storeId}
                      onChange={(e) => setStoreId(e.target.value)}
                      disabled={isGlobal}
                      className="w-full rounded-md border-2 border-gray-300 bg-white px-3 py-2 text-gray-900 disabled:bg-gray-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">No store</option>
                      {stores.map((store) => (
                        <option key={store.id} value={store.id}>
                          {store.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t.startTime}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      onBlur={() => {
                        const normalized = normalizeTime24(startTime);
                        if (normalized) setStartTime(normalized);
                      }}
                      required
                      placeholder="08:00"
                      pattern="^([01]?\d|2[0-3]):[0-5]\d$"
                      title="Use 24-hour format HH:mm"
                      className="w-full rounded-md border-2 border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t.endTime}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      onBlur={() => {
                        const normalized = normalizeTime24(endTime);
                        if (normalized) setEndTime(normalized);
                      }}
                      required
                      placeholder="16:30"
                      pattern="^([01]?\d|2[0-3]):[0-5]\d$"
                      title="Use 24-hour format HH:mm"
                      className="w-full rounded-md border-2 border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t.breakMinutes}
                    </label>
                    <select
                      value={String(breakMinutes)}
                      onChange={(e) => setBreakMinutes(parseInt(e.target.value, 10) || 0)}
                      className="w-full rounded-md border-2 border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="0">0</option>
                      <option value="30">30</option>
                      <option value="45">45</option>
                      <option value="60">60</option>
                    </select>
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
                      {editingShift ? t.update : t.create}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </Layout>
  );
}

