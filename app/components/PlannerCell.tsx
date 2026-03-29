'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Shift, ShiftAssignment, Store } from '@/types/database';
import { supabase } from '@/lib/supabaseClient';
import { formatErrorMessage } from '@/lib/utils';
import { notifyPlannerAssignmentsChanged } from '@/lib/plannerEvents';
import { t } from '@/lib/translations';
import { resolveStoreColor } from '@/lib/storeColors';

export type PlannerAssignment = ShiftAssignment & {
  custom_start_time?: string | null;
  custom_end_time?: string | null;
};

type StoreForPlanner = Pick<Store, 'id' | 'name'> & { color?: string | null };
const VACATION_BG = '#bbf7d0';
const VACATION_FG = '#14532d';
const KRANK_BG = '#f87171';
const KRANK_FG = '#450a0a';
const FREI_BG = '#d1d5db';
const FREI_FG = '#1f2937';
const EMPTY_BG = '#f9fafb';
const EMPTY_FG = '#9ca3af';
function resolveStoreBackgroundColor(store: StoreForPlanner | undefined): string {
  return resolveStoreColor(store?.color);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace(/^#/, '');
  if (h.length === 3) {
    const r = parseInt(h[0]! + h[0]!, 16);
    const g = parseInt(h[1]! + h[1]!, 16);
    const b = parseInt(h[2]! + h[2]!, 16);
    return { r, g, b };
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

function relativeLuminance(r: number, g: number, b: number): number {
  const srgb = [r, g, b].map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0]! + 0.7152 * srgb[1]! + 0.0722 * srgb[2]!;
}

function contrastingForeground(bgHex: string): string {
  const rgb = hexToRgb(bgHex);
  if (!rgb) return '#111827';
  const L = relativeLuminance(rgb.r, rgb.g, rgb.b);
  return L > 0.55 ? '#111827' : '#fafafa';
}

function formatClock(value: string): string {
  const part = value.split(':').slice(0, 2);
  if (part.length < 2) return value;
  return `${part[0]!.padStart(2, '0')}:${part[1]!.padStart(2, '0')}`;
}

function workingRange(assignment: PlannerAssignment | undefined, shift: Shift | undefined): string | null {
  if (!shift) return null;
  const customStart = assignment?.custom_start_time;
  const customEnd = assignment?.custom_end_time;
  if (customStart != null && customStart !== '' && customEnd != null && customEnd !== '') {
    return `${formatClock(String(customStart))} – ${formatClock(String(customEnd))}`;
  }
  return `${formatClock(shift.start_time)} – ${formatClock(shift.end_time)}`;
}

function isKrankShift(shift: Shift | undefined): boolean {
  if (!shift?.name) return false;
  return /\bkrank\b/i.test(shift.name);
}

function isFreiShift(shift: Shift | undefined): boolean {
  if (!shift?.name) return false;
  return /\bfrei\b/i.test(shift.name);
}

function toDbTime(hhmm: string): string | null {
  const t = hhmm.trim();
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const h = m[1]!.padStart(2, '0');
  const min = m[2]!;
  return `${h}:${min}:00`;
}

/** Normalize "H:mm" or "HH:mm" to "HH:mm" or null if invalid clock. */
function normalizeHhMmPart(s: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = parseInt(m[1]!, 10);
  const min = parseInt(m[2]!, 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * Parse manual range "HH:mm – HH:mm" (hyphen, en dash, or em dash between times).
 */
function parseCustomRange(input: string): { start: string; end: string } | null {
  const t = input.trim();
  if (!t) return null;
  const m = /^(\d{1,2}:\d{2})\s*(?:-|–|—|→|->)\s*(\d{1,2}:\d{2})\s*$/u.exec(t);
  if (!m) return null;
  const start = normalizeHhMmPart(m[1]!);
  const end = normalizeHhMmPart(m[2]!);
  if (!start || !end) return null;
  return { start, end };
}

function formatCustomRangeFromDb(
  customStart: string | null | undefined,
  customEnd: string | null | undefined
): string {
  if (customStart == null || customEnd == null || customStart === '' || customEnd === '') return '';
  return `${formatClock(String(customStart))} – ${formatClock(String(customEnd))}`;
}

function shiftDefaultRangeLabel(shift: Shift | undefined): string {
  if (!shift) return 'HH:mm – HH:mm';
  return `${formatClock(shift.start_time)} – ${formatClock(shift.end_time)}`;
}

function shiftAllowedForStore(shift: Shift, storeId: string): boolean {
  return !Boolean(shift.is_global) && shift.store_id === storeId;
}

export type PlannerCellProps = {
  employeeId: string;
  dateStr: string;
  isVacation: boolean;
  vacationLabel: string;
  assignment: PlannerAssignment | undefined;
  store: StoreForPlanner | undefined;
  shift: Shift | undefined;
  shifts: Shift[];
  stores: StoreForPlanner[];
  forceStoreId?: string;
  lockStoreSelection?: boolean;
  enableStoreDrop?: boolean;
  pendingStoreId?: string;
  hideUnassignedStorePreview?: boolean;
  isUnavailable?: boolean;
  onStoreDrop?: (employeeId: string, dateStr: string, storeId: string | null) => void;
  onStatusDrop?: (employeeId: string, dateStr: string, statusType: 'FREI' | 'KRANK' | 'FERIEN') => void;
  isEditing: boolean;
  readOnly?: boolean;
  onActivate: () => void;
  onSaved: () => void | Promise<void>;
};

export default function PlannerCell({
  employeeId,
  dateStr,
  isVacation,
  vacationLabel,
  assignment,
  store,
  shift,
  shifts,
  stores,
  forceStoreId,
  lockStoreSelection = false,
  enableStoreDrop = false,
  pendingStoreId,
  hideUnassignedStorePreview = false,
  isUnavailable = false,
  onStoreDrop,
  onStatusDrop,
  isEditing,
  readOnly = false,
  onActivate,
  onSaved,
}: PlannerCellProps) {
  const code = shift?.code?.trim() || shift?.name?.trim() || '';
  const storeName = store?.name?.trim() || '';
  const timeLine = workingRange(assignment, shift);
  const vacationText = vacationLabel ? 'Ferie' : 'Ferie';
  const assignmentType = assignment?.assignment_type ?? 'SHIFT';

  const [shiftId, setShiftId] = useState(assignment?.shift_id ?? '');
  const [storeId, setStoreId] = useState(assignment?.store_id ?? '');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingDroppedStoreId, setPendingDroppedStoreId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const skipPersistRef = useRef(true);
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isEditing) return;
    skipPersistRef.current = true;
    dirtyRef.current = false;
    setShiftId(assignment?.shift_id ?? '');
    const nextStoreId = forceStoreId ?? pendingStoreId ?? pendingDroppedStoreId ?? assignment?.store_id ?? '';
    setStoreId(nextStoreId);
    setCustomStart(assignment?.custom_start_time ? formatClock(String(assignment.custom_start_time)) : '');
    setCustomEnd(assignment?.custom_end_time ? formatClock(String(assignment.custom_end_time)) : '');
    setSaveError(null);
    if (pendingDroppedStoreId) setPendingDroppedStoreId(null);
  }, [isEditing, forceStoreId, pendingStoreId, pendingDroppedStoreId, assignment?.id, assignment?.shift_id, assignment?.store_id, assignment?.custom_start_time, assignment?.custom_end_time]);

  useEffect(() => {
    if (!forceStoreId) return;
    setStoreId(forceStoreId);
  }, [forceStoreId]);

  const selectedStoreId = forceStoreId ?? storeId ?? pendingStoreId ?? assignment?.store_id ?? '';
  const availableShifts = (selectedStoreId
    ? shifts.filter((s) => shiftAllowedForStore(s, selectedStoreId))
    : []
  ).slice().sort((a, b) => {
    const g = Number(Boolean(a.is_global)) - Number(Boolean(b.is_global));
    if (g !== 0) return g;
    return String(a.start_time).localeCompare(String(b.start_time));
  });

  useEffect(() => {
    if (!isEditing) return;
    if (!shiftId) return;
    const valid = availableShifts.some((s) => s.id === shiftId);
    if (!valid) setShiftId('');
  }, [isEditing, shiftId, availableShifts]);

  const persist = useCallback(async () => {
    const effectiveStoreId = forceStoreId ?? storeId;
    if (isVacation) return;
    if (assignmentType !== 'SHIFT') return;
    if (!shiftId || !effectiveStoreId) return;
    if (!availableShifts.some((s) => s.id === shiftId)) {
      setSaveError('Selected shift is not valid for this store.');
      return;
    }

    let customPayload: { custom_start_time: string | null; custom_end_time: string | null } = {
      custom_start_time: null,
      custom_end_time: null,
    };
    const normalizedStart = normalizeHhMmPart(customStart);
    const normalizedEnd = normalizeHhMmPart(customEnd);
    if (normalizedStart && normalizedEnd) {
      const dbStart = toDbTime(normalizedStart);
      const dbEnd = toDbTime(normalizedEnd);
      if (dbStart && dbEnd) {
        customPayload = { custom_start_time: dbStart, custom_end_time: dbEnd };
      }
    }

    setSaving(true);
    setSaveError(null);
    try {
      if (assignment) {
        const { error } = await supabase
          .from('shift_assignments')
          .update({
            shift_id: shiftId,
            store_id: effectiveStoreId,
            ...customPayload,
          })
          .eq('id', assignment.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('shift_assignments').upsert(
          {
            employee_id: employeeId,
            date: dateStr,
            shift_id: shiftId,
            store_id: effectiveStoreId,
            ...customPayload,
          },
          { onConflict: 'employee_id,date' }
        );
        if (error) throw error;
      }
      await onSaved();
      notifyPlannerAssignmentsChanged();
      dirtyRef.current = false;
    } catch (e: unknown) {
      const msg = formatErrorMessage(e);
      setSaveError(msg);
      console.error('PlannerCell save:', msg, e);
    } finally {
      setSaving(false);
    }
  }, [
    assignment,
    shiftId,
    storeId,
    forceStoreId,
    customStart,
    customEnd,
    shifts,
    availableShifts,
    employeeId,
    dateStr,
    onSaved,
    isVacation,
    assignmentType,
  ]);

  useEffect(() => {
    if (!isEditing) return;

    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }

    if (!shiftId || !(forceStoreId ?? storeId)) return;
    dirtyRef.current = true;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void persist();
    }, 450);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [shiftId, storeId, forceStoreId, customStart, customEnd, isEditing, persist]);

  useEffect(() => {
    if (isEditing) return;
    if (!dirtyRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    void persist();
  }, [isEditing, persist]);

  const handleClear = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!assignment) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { error } = await supabase.from('shift_assignments').delete().eq('id', assignment.id);
      if (error) throw error;
      setShiftId('');
      setStoreId('');
      setCustomStart('');
      setCustomEnd('');
      onStoreDrop?.(employeeId, dateStr, null);
      await onSaved();
      notifyPlannerAssignmentsChanged();
    } catch (err: unknown) {
      const msg = formatErrorMessage(err);
      setSaveError(msg);
      console.error('PlannerCell clear:', msg, err);
    } finally {
      setSaving(false);
    }
  };

  let backgroundColor: string;
  let color: string;
  let borderColor = '#9ca3af';

  const resolvedStoreForDisplay =
    stores.find((s) => s.id === selectedStoreId) ?? store;
  const resolvedStoreName = resolvedStoreForDisplay?.name?.trim() || '';

  if (isVacation || assignmentType === 'FERIEN') {
    backgroundColor = VACATION_BG;
    color = VACATION_FG;
    borderColor = '#16a34a';
  } else if (assignmentType === 'KRANK' || (assignment && shift && isKrankShift(shift))) {
    backgroundColor = KRANK_BG;
    color = KRANK_FG;
  } else if (assignmentType === 'FREI' || (assignment && shift && isFreiShift(shift))) {
    backgroundColor = FREI_BG;
    color = FREI_FG;
  } else if (selectedStoreId) {
    backgroundColor = resolveStoreBackgroundColor(resolvedStoreForDisplay);
    color = contrastingForeground(backgroundColor);
  } else if (assignment && shift) {
    backgroundColor = resolveStoreBackgroundColor(undefined);
    color = contrastingForeground(backgroundColor);
  } else {
    backgroundColor = EMPTY_BG;
    color = EMPTY_FG;
    borderColor = '#e5e7eb';
  }

  const handleCellClick = () => {
    if (isVacation || readOnly || isUnavailable) return;
    onActivate();
  };

  const handleDragOver = (e: React.DragEvent<HTMLTableCellElement>) => {
    if (!enableStoreDrop || isVacation || readOnly || isUnavailable) return;
    e.preventDefault();
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = () => {
    if (isDragOver) setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLTableCellElement>) => {
    if (!enableStoreDrop || isVacation || readOnly || isUnavailable) return;
    e.preventDefault();
    setIsDragOver(false);
    const rawPlannerItem = e.dataTransfer.getData('application/x-planner-item');
    if (rawPlannerItem) {
      try {
        const item = JSON.parse(rawPlannerItem) as { kind?: string; id?: string };
        if (item.kind === 'status' && (item.id === 'FREI' || item.id === 'KRANK' || item.id === 'FERIEN')) {
          onStatusDrop?.(employeeId, dateStr, item.id);
          return;
        }
        if (item.kind === 'store' && item.id && stores.some((s) => s.id === item.id)) {
          setPendingDroppedStoreId(item.id);
          setStoreId(item.id);
          onStoreDrop?.(employeeId, dateStr, item.id);
          onActivate();
          return;
        }
      } catch {
        // fallback below
      }
    }

    const droppedStoreId =
      e.dataTransfer.getData('application/x-store-id') || e.dataTransfer.getData('text/plain');
    if (!droppedStoreId || !stores.some((s) => s.id === droppedStoreId)) return;
    setPendingDroppedStoreId(droppedStoreId);
    setStoreId(droppedStoreId);
    onStoreDrop?.(employeeId, dateStr, droppedStoreId);
    onActivate();
  };

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const hasPersistedShift = Boolean(assignment?.shift_id);
  const simplifiedShiftOnlyMode = enableStoreDrop && lockStoreSelection && !hasPersistedShift;

  const editorMinWidth = isEditing ? 148 : undefined;
  const cardStyle = {
    backgroundColor,
    color,
    border: `1px solid ${isVacation ? '#86efac' : 'rgba(17,24,39,0.06)'}`,
  };
  return (
    <td
      role="gridcell"
      aria-readonly={isVacation || readOnly ? true : undefined}
      onClick={handleCellClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`align-top p-0 text-left ${
        isVacation || readOnly || isUnavailable
          ? 'cursor-default'
          : 'cursor-pointer transition-colors hover:brightness-[0.98]'
      }`}
      style={{
        backgroundColor: '#ffffff',
        color: '#111827',
        border: `1px solid ${isEditing ? '#2563eb' : '#e5e7eb'}`,
        minWidth: editorMinWidth ?? 96,
        maxWidth: isEditing ? 200 : 122,
        height: 72,
        verticalAlign: 'middle',
        position: 'relative',
        zIndex: isEditing ? 20 : undefined,
        boxShadow: isDragOver
          ? 'inset 0 0 0 2px #2563eb'
          : isEditing
            ? '0 0 0 1px #2563eb'
            : undefined,
      }}
    >
      {isVacation || assignmentType === 'FERIEN' ? (
        <div className="p-1">
          <div
            className="flex h-[58px] items-center justify-center rounded-md text-center text-[11px] font-semibold leading-tight"
            style={cardStyle}
          >
            {assignmentType === 'FERIEN' ? 'Ferie' : vacationText}
          </div>
        </div>
      ) : assignmentType === 'KRANK' ? (
        <div className="p-1">
          <div
            className="flex h-[58px] items-center justify-center rounded-md text-center text-[11px] font-semibold leading-tight"
            style={cardStyle}
          >
            KR
          </div>
        </div>
      ) : assignmentType === 'FREI' ? (
        <div className="p-1">
          <div
            className="flex h-[58px] items-center justify-center rounded-md text-center text-[11px] font-semibold leading-tight"
            style={cardStyle}
          >
            Frei
          </div>
        </div>
      ) : isEditing ? (
        <div className="px-0.5 py-0.5" onClick={stop} onMouseDown={stop}>
          {simplifiedShiftOnlyMode ? (
            <div className="mb-1 rounded border border-blue-200 bg-blue-50 px-1 py-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[8px] font-bold uppercase tracking-wide text-blue-800">Step 1: Select Shift</span>
                {saving ? <span className="text-[8px] text-blue-700">…</span> : null}
              </div>
              <div className="mt-0.5 text-[8px] text-blue-700">
                Store is set. Choose a shift to continue.
              </div>
            </div>
          ) : (
            <div className="mb-0.5 flex items-center justify-between gap-0.5">
              <span className="text-[8px] font-bold uppercase opacity-80">{t.assignShift}</span>
              {saving ? <span className="text-[8px] opacity-80">…</span> : null}
            </div>
          )}
          <select
            value={shiftId}
            onChange={(e) => setShiftId(e.target.value)}
            disabled={!selectedStoreId}
            className={`mb-0.5 w-full max-w-full rounded border bg-white text-gray-900 ${
              simplifiedShiftOnlyMode
                ? 'border-blue-300 px-1.5 py-1 text-[10px] font-medium focus:border-blue-500'
                : 'border-gray-300 px-0.5 py-0.5 text-[9px]'
            }`}
          >
            <option value="">
              {selectedStoreId ? t.selectShift : 'Drop a store first'}
            </option>
            {availableShifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {!simplifiedShiftOnlyMode ? (
            <>
              {lockStoreSelection ? (
                <select
                  value={selectedStoreId}
                  disabled
                  className="mb-0.5 w-full max-w-full cursor-not-allowed rounded border border-gray-300 bg-gray-100 px-0.5 py-0.5 text-[9px] text-gray-700"
                >
                  {(selectedStoreId ? stores.filter((st) => st.id === selectedStoreId) : stores).map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  value={storeId}
                  onChange={(e) => setStoreId(e.target.value)}
                  className="mb-0.5 w-full max-w-full rounded border border-gray-300 bg-white px-0.5 py-0.5 text-[9px] text-gray-900"
                >
                  {!assignment ? <option value="">{t.selectStore}</option> : null}
                  {stores.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name}
                    </option>
                  ))}
                </select>
              )}
              <input
                type="time"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="mb-0.5 w-full min-w-0 rounded border border-gray-300 bg-white px-0.5 py-0.5 text-[9px] text-gray-900"
                title="Manual start time (optional)"
              />
              <input
                type="time"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="mb-0.5 w-full min-w-0 rounded border border-gray-300 bg-white px-0.5 py-0.5 text-[9px] text-gray-900"
                title="Manual end time (optional)"
              />
            </>
          ) : null}
          {simplifiedShiftOnlyMode ? (
            <div className="mt-0.5 text-[8px] text-gray-500">
              Other options unlock after this shift is saved.
            </div>
          ) : null}
          {assignment ? (
            <button
              type="button"
              onClick={handleClear}
              disabled={saving}
              className="w-full rounded border border-red-300 bg-red-50 py-0.5 text-[8px] font-semibold text-red-800 hover:bg-red-100"
            >
              {t.deleteAssignment}
            </button>
          ) : null}
          {saveError ? <div className="mt-0.5 text-[8px] text-red-700">{saveError}</div> : null}
        </div>
      ) : assignment && shift ? (
        <div className="p-1">
          <div
            className="flex h-[58px] flex-col items-center justify-center rounded-md px-1 text-center text-[11px] font-medium leading-snug"
            style={cardStyle}
          >
            <div className="max-w-full truncate font-medium" title={storeName}>
              {resolvedStoreName || storeName || '—'}
            </div>
            <div className="max-w-full truncate font-semibold tracking-tight" title={code}>
              {code || '—'}
            </div>
            <div className="mt-0.5 whitespace-nowrap font-medium tabular-nums">{timeLine || '—'}</div>
          </div>
        </div>
      ) : isUnavailable ? (
        <div className="p-1">
          <div
            className="flex h-[58px] flex-col items-center justify-center rounded-md px-1 text-center text-[11px] font-semibold leading-snug"
            style={{ backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' }}
            title="Already assigned to another store or status"
          >
            <div>Unavailable</div>
            <div className="mt-0.5 text-[10px] font-medium">Already assigned</div>
          </div>
        </div>
      ) : selectedStoreId && !hideUnassignedStorePreview ? (
        <div className="p-1">
          <div
            className="flex h-[58px] flex-col items-center justify-center rounded-md px-1 text-center text-[11px] font-medium leading-snug"
            style={cardStyle}
          >
            <div className="max-w-full truncate font-medium" title={resolvedStoreName}>
              {resolvedStoreName || '—'}
            </div>
            <div className="max-w-full truncate font-semibold tracking-tight">Select shift</div>
            <div className="mt-0.5 whitespace-nowrap font-medium tabular-nums">—</div>
          </div>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center px-1 py-2 text-center text-[10px] font-normal opacity-70">—</div>
      )}
    </td>
  );
}
