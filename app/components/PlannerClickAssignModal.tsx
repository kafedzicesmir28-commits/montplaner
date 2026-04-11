'use client';

import { useCallback, useMemo, useState } from 'react';
import type { Shift, Store } from '@/types/database';
import { getStoreColor, storeTextColor } from '@/lib/storeColors';
import {
  shiftsForStore,
  snapToPlannerBreakMinutes,
  upsertQuickPlannerShift,
} from '@/lib/plannerShiftQuickAssign';
import { t } from '@/lib/translations';

type StoreRow = Pick<Store, 'id' | 'name'> & { color?: string | null };

function formatClock(value: string): string {
  const part = value.split(':').slice(0, 2);
  if (part.length < 2) return value;
  return `${part[0]!.padStart(2, '0')}:${part[1]!.padStart(2, '0')}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace(/^#/, '');
  if (h.length === 3) {
    return {
      r: parseInt(h[0]! + h[0]!, 16),
      g: parseInt(h[1]! + h[1]!, 16),
      b: parseInt(h[2]! + h[2]!, 16),
    };
  }
  if (h.length === 6) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  return null;
}

function withAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(245,245,245,${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export type PlannerClickAssignModalProps = {
  open: boolean;
  employeeName: string;
  dateLabel: string;
  employeeId: string;
  dateStr: string;
  assignmentId: string | undefined;
  stores: StoreRow[];
  shifts: Shift[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

export function PlannerClickAssignModal({
  open,
  employeeName,
  dateLabel,
  employeeId,
  dateStr,
  assignmentId,
  stores,
  shifts,
  onClose,
  onSaved,
}: PlannerClickAssignModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [storeId, setStoreId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetAndClose = useCallback(() => {
    setStep(1);
    setStoreId('');
    setError(null);
    setSaving(false);
    onClose();
  }, [onClose]);

  const selectedStore = useMemo(() => stores.find((s) => s.id === storeId), [stores, storeId]);
  const storeColor = getStoreColor(storeId, stores);
  const availableShifts = useMemo(() => (storeId ? shiftsForStore(shifts, storeId) : []), [shifts, storeId]);

  const handlePickStore = useCallback((id: string) => {
    setStoreId(id);
    setStep(2);
    setError(null);
  }, []);

  const handlePickShift = useCallback(
    async (shift: Shift) => {
      if (!storeId) return;
      if (!availableShifts.some((s) => s.id === shift.id)) return;
      setSaving(true);
      setError(null);
      const result = await upsertQuickPlannerShift({
        employeeId,
        dateStr,
        shiftId: shift.id,
        storeId,
        assignmentId,
        breakMinutes: snapToPlannerBreakMinutes(shift.break_minutes ?? 0),
      });
      setSaving(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await onSaved();
      resetAndClose();
    },
    [assignmentId, availableShifts, dateStr, employeeId, onSaved, resetAndClose, storeId]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="planner-click-assign-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) resetAndClose();
      }}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="planner-click-assign-title" className="text-lg font-semibold text-gray-900">
          {t.plannerClickAssignTitle}
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          <span className="font-medium text-gray-800">{employeeName}</span>
          <span className="mx-1 text-gray-400">·</span>
          <span className="tabular-nums">{dateLabel}</span>
        </p>

        {step === 1 ? (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t.plannerClickAssignChooseStore}
            </p>
            <div className="flex flex-col gap-2">
              {stores.map((s) => {
                const bg = getStoreColor(s.id, stores);
                const fg = storeTextColor(bg);
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={saving}
                    onClick={() => handlePickStore(s.id)}
                    className="flex w-full items-center gap-2 rounded-md border border-gray-300 px-3 py-2.5 text-left text-sm font-semibold transition hover:opacity-95 disabled:opacity-50"
                    style={{ backgroundColor: bg, color: fg }}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-white/80" aria-hidden />
                    {s.name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => {
                setStep(1);
                setStoreId('');
                setError(null);
              }}
              disabled={saving}
              className="mb-3 text-sm font-medium text-blue-700 hover:text-blue-900 disabled:opacity-50"
            >
              ← {t.plannerBack}
            </button>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t.plannerClickAssignChooseShift}
            </p>
            {selectedStore ? (
              <p className="mb-2 text-sm text-gray-700">
                <span
                  className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-semibold"
                  style={{
                    backgroundColor: storeColor,
                    color: storeTextColor(storeColor),
                  }}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-white/80" aria-hidden />
                  {selectedStore.name}
                </span>
              </p>
            ) : null}
            {availableShifts.length === 0 ? (
              <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                {t.plannerNoShiftsForStore}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {availableShifts.map((s, idx) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => void handlePickShift(s)}
                    disabled={saving}
                    autoFocus={idx === 0}
                    className="w-full rounded-md px-3 py-2.5 text-left text-sm font-medium text-gray-900 transition-all hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                    style={{
                      backgroundColor: withAlpha(storeColor, 0.22),
                      border: `1px solid ${storeColor}`,
                    }}
                  >
                    <div className="font-semibold">{s.name}</div>
                    <div className="text-xs opacity-90">
                      {formatClock(s.start_time)} – {formatClock(s.end_time)}
                    </div>
                    <div className="text-xs opacity-90">
                      {t.plannerPauseAbbrev} {snapToPlannerBreakMinutes(s.break_minutes ?? 0)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

        <div className="mt-4 flex justify-end border-t border-gray-100 pt-3">
          <button
            type="button"
            onClick={resetAndClose}
            disabled={saving}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {t.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
