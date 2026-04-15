'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Shift, ShiftAssignment, Store } from '@/types/database';
import { supabase } from '@/lib/supabaseClient';
import { effectiveBreakMinutes, formatErrorMessage } from '@/lib/utils';
import { notifyPlannerAssignmentsChanged } from '@/lib/plannerEvents';
import {
  PLANNER_BREAK_OPTIONS,
  shiftsForStore,
  snapToPlannerBreakMinutes,
  upsertQuickPlannerShift,
} from '@/lib/plannerShiftQuickAssign';
import { t } from '@/lib/translations';
import { getStoreColor } from '@/lib/storeColors';

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

function withAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(245,245,245,${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
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

function foregroundForPicker(bgHex: string): string {
  const rgb = hexToRgb(bgHex);
  if (!rgb) return '#000000';
  const L = relativeLuminance(rgb.r, rgb.g, rgb.b);
  return L < 0.2 ? '#ffffff' : '#000000';
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

function hhmmFromShiftTime(value: string | null | undefined): string {
  if (!value) return '';
  return String(value).split(':').slice(0, 2).join(':');
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

const TIME_OPTIONS = Array.from({ length: 144 }, (_, i) => {
  const total = i * 10;
  const h = String(Math.floor(total / 60)).padStart(2, '0');
  const m = String(total % 60).padStart(2, '0');
  return `${h}:${m}`;
});

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
  weekDividerRight?: boolean;
  /** Optional store-section row tint applied to the cell background only. */
  rowBackgroundColor?: string;
  onActivate: () => void;
  /** Empty cell: open click-to-assign flow (store → shift modal) instead of inline editor. */
  onClickAssignEmpty?: () => void;
  onSaved: () => void | Promise<void>;
  /** Clears grid editing state after delete (avoids stuck editor on empty cell). */
  onCloseCellEdit?: () => void;
  isBirthday?: boolean;
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
  weekDividerRight = false,
  rowBackgroundColor,
  onActivate,
  onClickAssignEmpty,
  onSaved,
  onCloseCellEdit,
  isBirthday = false,
}: PlannerCellProps) {
  const code = shift?.code?.trim() || shift?.name?.trim() || '';
  const storeName = store?.name?.trim() || '';
  const timeLine = workingRange(assignment, shift);
  const displayBreakMinutes = effectiveBreakMinutes(assignment, shift);
  const vacationText = vacationLabel ? 'Ferie' : 'Ferie';
  const assignmentType = assignment?.assignment_type ?? 'SHIFT';
  const isAssignmentStatusOnly =
    assignmentType === 'KRANK' || assignmentType === 'FREI' || assignmentType === 'FERIEN';

  const [shiftId, setShiftId] = useState(assignment?.shift_id ?? '');
  const [storeId, setStoreId] = useState(assignment?.store_id ?? '');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [breakMinutes, setBreakMinutes] = useState<(typeof PLANNER_BREAK_OPTIONS)[number]>(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingDroppedStoreId, setPendingDroppedStoreId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const startTimeSelectRef = useRef<HTMLSelectElement | null>(null);
  const endTimeSelectRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    if (!isEditing) return;
    setShiftId(assignment?.shift_id ?? '');
    const nextStoreId = forceStoreId ?? pendingStoreId ?? pendingDroppedStoreId ?? assignment?.store_id ?? '';
    setStoreId(nextStoreId);
    const assignmentHasCustomRange =
      assignment?.custom_start_time != null &&
      assignment?.custom_start_time !== '' &&
      assignment?.custom_end_time != null &&
      assignment?.custom_end_time !== '';
    if (assignmentHasCustomRange) {
      setCustomStart(formatClock(String(assignment?.custom_start_time)));
      setCustomEnd(formatClock(String(assignment?.custom_end_time)));
    } else {
      setCustomStart(shift ? hhmmFromShiftTime(shift.start_time) : '');
      setCustomEnd(shift ? hhmmFromShiftTime(shift.end_time) : '');
    }
    setBreakMinutes(snapToPlannerBreakMinutes(effectiveBreakMinutes(assignment, shift)));
    setSaveError(null);
    if (pendingDroppedStoreId) setPendingDroppedStoreId(null);
  }, [
    isEditing,
    forceStoreId,
    pendingStoreId,
    pendingDroppedStoreId,
    assignment?.id,
    assignment?.shift_id,
    assignment?.store_id,
    assignment?.custom_start_time,
    assignment?.custom_end_time,
    assignment?.custom_break_minutes,
    shift,
  ]);

  useEffect(() => {
    if (!isEditing) return;
    const id = window.requestAnimationFrame(() => {
      startTimeSelectRef.current?.focus();
      const startSelected = startTimeSelectRef.current?.selectedOptions?.[0];
      const endSelected = endTimeSelectRef.current?.selectedOptions?.[0];
      startSelected?.scrollIntoView({ block: 'center' });
      endSelected?.scrollIntoView({ block: 'center' });
    });
    return () => window.cancelAnimationFrame(id);
  }, [isEditing, customStart, customEnd]);

  useEffect(() => {
    if (!forceStoreId) return;
    setStoreId(forceStoreId);
  }, [forceStoreId]);

  const selectedStoreId = forceStoreId ?? storeId ?? pendingStoreId ?? assignment?.store_id ?? '';
  const selectedStoreColor = getStoreColor(selectedStoreId, stores);
  const availableShifts = selectedStoreId ? shiftsForStore(shifts, selectedStoreId) : [];

  useEffect(() => {
    if (!isEditing) return;
    if (!shiftId) return;
    const valid = availableShifts.some((s) => s.id === shiftId);
    if (!valid) setShiftId('');
  }, [isEditing, shiftId, availableShifts]);

  const persist = useCallback(async (closeAfterSave = false) => {
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
    const normalizedStart = customStart;
    const normalizedEnd = customEnd;
    if (normalizedStart && normalizedEnd) {
      if (toMinutes(normalizedEnd) <= toMinutes(normalizedStart)) {
        setSaveError('End time must be after start time.');
        return;
      }
      const selectedShift = shifts.find((s) => s.id === shiftId);
      const selectedDefaultStart = selectedShift ? hhmmFromShiftTime(selectedShift.start_time) : '';
      const selectedDefaultEnd = selectedShift ? hhmmFromShiftTime(selectedShift.end_time) : '';
      const matchesShiftDefaults =
        selectedDefaultStart !== '' &&
        selectedDefaultEnd !== '' &&
        normalizedStart === selectedDefaultStart &&
        normalizedEnd === selectedDefaultEnd;

      if (!matchesShiftDefaults) {
        const dbStart = toDbTime(normalizedStart);
        const dbEnd = toDbTime(normalizedEnd);
        if (dbStart && dbEnd) {
          customPayload = { custom_start_time: dbStart, custom_end_time: dbEnd };
        }
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
            custom_break_minutes: breakMinutes,
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
            custom_break_minutes: breakMinutes,
            ...customPayload,
          },
          { onConflict: 'employee_id,date' }
        );
        if (error) throw error;
      }
      await onSaved();
      notifyPlannerAssignmentsChanged();
      if (closeAfterSave) onCloseCellEdit?.();
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
    breakMinutes,
    shifts,
    availableShifts,
    employeeId,
    dateStr,
    onSaved,
    isVacation,
    assignmentType,
    onCloseCellEdit,
  ]);

  const applyShiftQuick = useCallback(async (nextShiftId: string) => {
    const effectiveStoreId = forceStoreId ?? storeId ?? pendingStoreId ?? assignment?.store_id ?? '';
    if (!effectiveStoreId) return;
    const selectedShift = availableShifts.find((s) => s.id === nextShiftId);
    if (!selectedShift) return;

    setSaving(true);
    setSaveError(null);
    setShiftId(nextShiftId);
    setBreakMinutes(snapToPlannerBreakMinutes(selectedShift.break_minutes ?? 0));

    try {
      const result = await upsertQuickPlannerShift({
        employeeId,
        dateStr,
        shiftId: nextShiftId,
        storeId: effectiveStoreId,
        assignmentId: assignment?.id,
        breakMinutes: snapToPlannerBreakMinutes(selectedShift.break_minutes ?? 0),
      });
      if (!result.ok) {
        setSaveError(result.message);
        console.error('PlannerCell quick assign:', result.message);
        return;
      }
      await onSaved();
      onCloseCellEdit?.();
    } finally {
      setSaving(false);
    }
  }, [
    forceStoreId,
    storeId,
    pendingStoreId,
    assignment,
    availableShifts,
    employeeId,
    dateStr,
    onSaved,
    onCloseCellEdit,
  ]);

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
      setBreakMinutes(0);
      onStoreDrop?.(employeeId, dateStr, null);
      await onSaved();
      notifyPlannerAssignmentsChanged();
      onCloseCellEdit?.();
    } catch (err: unknown) {
      const msg = formatErrorMessage(err);
      setSaveError(msg);
      console.error('PlannerCell clear:', msg, err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCustomOverride = useCallback(async () => {
    if (!assignment) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { error } = await supabase
        .from('shift_assignments')
        .update({
          custom_start_time: null,
          custom_end_time: null,
        })
        .eq('id', assignment.id);
      if (error) throw error;
      const defaultStart = shift ? hhmmFromShiftTime(shift.start_time) : '00:00';
      const defaultEnd = shift ? hhmmFromShiftTime(shift.end_time) : '00:15';
      setCustomStart(defaultStart);
      setCustomEnd(defaultEnd);
      await onSaved();
      notifyPlannerAssignmentsChanged();
      onCloseCellEdit?.();
    } catch (err: unknown) {
      const msg = formatErrorMessage(err);
      setSaveError(msg);
      console.error('PlannerCell clear custom override:', msg, err);
    } finally {
      setSaving(false);
    }
  }, [assignment, onCloseCellEdit, onSaved, shift]);

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
    backgroundColor = getStoreColor(selectedStoreId, stores);
    color = contrastingForeground(backgroundColor);
  } else if (assignment && shift) {
    backgroundColor = getStoreColor(assignment.store_id, stores);
    color = contrastingForeground(backgroundColor);
  } else {
    backgroundColor = EMPTY_BG;
    color = EMPTY_FG;
    borderColor = '#e5e7eb';
  }

  const handleCellClick = () => {
    if (isVacation || readOnly || isUnavailable) return;
    const type = assignment?.assignment_type ?? 'SHIFT';
    const statusOnly = type === 'KRANK' || type === 'FREI' || type === 'FERIEN';
    const hasPersistedShift = Boolean(assignment?.shift_id);
    const openClickAssignModal =
      Boolean(onClickAssignEmpty) && !pendingStoreId && !statusOnly && !hasPersistedShift;
    if (openClickAssignModal) {
      onClickAssignEmpty?.();
      return;
    }
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

  const editorMinWidth = isEditing ? 220 : undefined;
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
        backgroundColor: rowBackgroundColor ?? '#ffffff',
        color: '#111827',
        borderTop: `1px solid ${isEditing ? '#2563eb' : '#e5e7eb'}`,
        borderLeft: `1px solid ${isEditing ? '#2563eb' : '#e5e7eb'}`,
        borderBottom: `1px solid ${isEditing ? '#2563eb' : '#e5e7eb'}`,
        borderRight: weekDividerRight
          ? '4px solid #FFD700'
          : `1px solid ${isEditing ? '#2563eb' : '#e5e7eb'}`,
        minWidth: editorMinWidth ?? 96,
        maxWidth: isEditing ? 320 : 122,
        minHeight: 72,
        height: 'auto',
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
      {isBirthday && !isEditing ? (
        <div
          className="pointer-events-none absolute left-1 top-1 z-10 rounded-full border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 shadow-sm"
          title="Birthday"
          aria-label="Birthday"
        >
          B-Day
        </div>
      ) : null}
      {isEditing && assignment && isAssignmentStatusOnly && !isVacation ? (
        <div className="px-0.5 py-0.5" onClick={stop} onMouseDown={stop}>
          <div
            className="mb-1 flex min-h-[44px] items-center justify-center rounded-md px-1 py-2 text-center text-[11px] font-semibold leading-tight"
            style={cardStyle}
          >
            {assignmentType === 'FERIEN' ? 'Ferie' : assignmentType === 'KRANK' ? 'KR' : 'Frei'}
          </div>
          {saveError ? <div className="mb-0.5 text-[8px] text-red-700">{saveError}</div> : null}
          <button
            type="button"
            onClick={handleClear}
            disabled={saving}
            className="w-full rounded border border-red-300 bg-red-50 py-0.5 text-[8px] font-semibold text-red-800 hover:bg-red-100"
          >
            {t.deleteAssignment}
          </button>
        </div>
      ) : isVacation || assignmentType === 'FERIEN' ? (
        <div
          className={`p-1 ${assignment?.id && isAssignmentStatusOnly && !readOnly && !isUnavailable ? 'group relative' : ''}`}
        >
          <div
            className="flex h-[58px] items-center justify-center rounded-md text-center text-[11px] font-semibold leading-tight"
            style={cardStyle}
          >
            {assignmentType === 'FERIEN' ? 'Ferie' : vacationText}
          </div>
          {assignment?.id && isAssignmentStatusOnly && !readOnly && !isUnavailable ? (
            <button
              type="button"
              onClick={handleClear}
              disabled={saving}
              title={t.deleteAssignment}
              aria-label={t.deleteAssignment}
              className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded bg-white/90 text-[12px] font-bold leading-none text-red-700 shadow-sm ring-1 ring-red-200 opacity-0 transition-opacity hover:bg-red-50 group-hover:opacity-100"
            >
              ×
            </button>
          ) : null}
        </div>
      ) : assignmentType === 'KRANK' ? (
        <div
          className={`p-1 ${assignment?.id && isAssignmentStatusOnly && !readOnly && !isUnavailable ? 'group relative' : ''}`}
        >
          <div
            className="flex h-[58px] items-center justify-center rounded-md text-center text-[11px] font-semibold leading-tight"
            style={cardStyle}
          >
            KR
          </div>
          {assignment?.id && isAssignmentStatusOnly && !readOnly && !isUnavailable ? (
            <button
              type="button"
              onClick={handleClear}
              disabled={saving}
              title={t.deleteAssignment}
              aria-label={t.deleteAssignment}
              className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded bg-white/90 text-[12px] font-bold leading-none text-red-700 shadow-sm ring-1 ring-red-200 opacity-0 transition-opacity hover:bg-red-50 group-hover:opacity-100"
            >
              ×
            </button>
          ) : null}
        </div>
      ) : assignmentType === 'FREI' ? (
        <div
          className={`p-1 ${assignment?.id && isAssignmentStatusOnly && !readOnly && !isUnavailable ? 'group relative' : ''}`}
        >
          <div
            className="flex h-[58px] items-center justify-center rounded-md text-center text-[11px] font-semibold leading-tight"
            style={cardStyle}
          >
            Frei
          </div>
          {assignment?.id && isAssignmentStatusOnly && !readOnly && !isUnavailable ? (
            <button
              type="button"
              onClick={handleClear}
              disabled={saving}
              title={t.deleteAssignment}
              aria-label={t.deleteAssignment}
              className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded bg-white/90 text-[12px] font-bold leading-none text-red-700 shadow-sm ring-1 ring-red-200 opacity-0 transition-opacity hover:bg-red-50 group-hover:opacity-100"
            >
              ×
            </button>
          ) : null}
        </div>
      ) : isEditing ? (
        <div
          className="rounded-lg border border-blue-100 bg-gradient-to-b from-white via-blue-50/40 to-indigo-50/40 px-2 py-2 shadow-[0_1px_6px_rgba(37,99,235,0.08)]"
          onClick={stop}
          onMouseDown={stop}
        >
          {!simplifiedShiftOnlyMode ? (
            <div className="mb-2 flex items-center justify-between gap-1">
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-blue-900">
                {t.assignShift}
              </span>
              {saving ? <span className="text-xs opacity-80">Saving...</span> : null}
            </div>
          ) : null}
          {simplifiedShiftOnlyMode ? (
            <div className="mb-1 flex flex-col gap-2 p-1">
              {availableShifts.length === 0 ? (
                <div className="rounded border border-blue-200 bg-blue-50 px-2 py-1.5 text-sm text-blue-800">
                  {t.plannerNoShiftsForStore}
                </div>
              ) : (
                availableShifts.map((s, idx) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      void applyShiftQuick(s.id);
                    }}
                    disabled={saving}
                    autoFocus={idx === 0}
                    className="w-full rounded-md px-3 py-2.5 text-left text-sm font-medium shadow-sm transition-all hover:-translate-y-[1px] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                    style={{
                      backgroundColor:
                        shiftId === s.id ? selectedStoreColor : withAlpha(selectedStoreColor, 0.2),
                      border: `1px solid ${selectedStoreColor}`,
                      color: shiftId === s.id ? foregroundForPicker(selectedStoreColor) : '#000000',
                      transform: shiftId === s.id ? 'scale(1.02)' : undefined,
                    }}
                  >
                    <div className="truncate text-sm font-semibold">{s.name}</div>
                    <div className="planner-cell-hours text-base font-semibold tabular-nums leading-snug">
                      {formatClock(s.start_time)} – {formatClock(s.end_time)}
                    </div>
                    <div className="planner-cell-numeric text-sm font-medium tabular-nums leading-snug">
                      Break: {snapToPlannerBreakMinutes(s.break_minutes ?? 0)}m
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : (
            <select
              value={shiftId}
              onChange={(e) => {
                const id = e.target.value;
                setShiftId(id);
                const s = shifts.find((x) => x.id === id);
                setBreakMinutes(snapToPlannerBreakMinutes(s?.break_minutes ?? 0));
              }}
              disabled={!selectedStoreId}
              className="mb-2 w-full max-w-full rounded-md border border-blue-200 bg-white px-2 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
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
          )}
          {!simplifiedShiftOnlyMode ? (
            <>
              {lockStoreSelection ? (
                <select
                  value={selectedStoreId}
                  disabled
                  className="mb-2 w-full max-w-full cursor-not-allowed rounded-md border border-slate-200 bg-slate-100 px-2 py-1.5 text-sm text-slate-700 shadow-sm"
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
                  className="mb-2 w-full max-w-full rounded-md border border-blue-200 bg-white px-2 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  {!assignment ? <option value="">{t.selectStore}</option> : null}
                  {stores.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name}
                    </option>
                  ))}
                </select>
              )}
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide opacity-80">
                Start Time
              </label>
              <select
                ref={startTimeSelectRef}
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="planner-cell-hours mb-2 w-full min-w-0 rounded-md border border-indigo-200 bg-white px-2 py-1.5 text-base font-semibold text-gray-900 tabular-nums shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                {TIME_OPTIONS.map((time) => (
                  <option key={`start-${time}`} value={time}>
                    {time}
                  </option>
                ))}
              </select>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide opacity-80">
                End Time
              </label>
              <select
                ref={endTimeSelectRef}
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="planner-cell-hours mb-2 w-full min-w-0 rounded-md border border-indigo-200 bg-white px-2 py-1.5 text-base font-semibold text-gray-900 tabular-nums shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                {TIME_OPTIONS.map((time) => (
                  <option key={`end-${time}`} value={time}>
                    {time}
                  </option>
                ))}
              </select>
              <div className="mb-1">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide opacity-80">{t.plannerBreakSelect}</span>
                <select
                  value={String(breakMinutes)}
                  onChange={(e) => setBreakMinutes(snapToPlannerBreakMinutes(Number(e.target.value)))}
                  className="planner-cell-numeric w-full max-w-full rounded-md border border-violet-200 bg-white px-2 py-1.5 text-base font-semibold text-gray-900 tabular-nums shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                  title={t.breakMinutes}
                >
                  {PLANNER_BREAK_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n === 0 ? t.plannerBreakNone : `${n} min`}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : null}
          {!simplifiedShiftOnlyMode ? (
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void persist(true)}
                disabled={saving}
                className="flex-1 rounded-md border border-blue-400 bg-gradient-to-b from-blue-100 to-blue-200 py-1.5 text-sm font-semibold text-blue-900 shadow-sm transition hover:from-blue-200 hover:to-blue-300"
              >
                Save
              </button>
              {assignment ? (
                <button
                  type="button"
                  onClick={() => void handleDeleteCustomOverride()}
                  disabled={saving}
                  className="flex-1 rounded-md border border-rose-300 bg-gradient-to-b from-rose-50 to-rose-100 py-1.5 text-sm font-semibold text-rose-800 shadow-sm transition hover:from-rose-100 hover:to-rose-200"
                >
                  Delete
                </button>
              ) : null}
            </div>
          ) : null}
          {saveError ? <div className="mt-1 text-xs text-red-700">{saveError}</div> : null}
        </div>
      ) : assignment && shift ? (
        <div
          className={`p-1 ${assignment?.id && !readOnly && !isUnavailable ? 'group relative' : ''}`}
        >
          <div
            className="flex min-h-[56px] flex-col items-center justify-center gap-0 rounded-md px-1 py-0.5 text-center text-[10px] font-medium leading-tight"
            style={cardStyle}
          >
            <div className="max-w-full truncate font-semibold tracking-tight" title={code}>
              {code || '—'}
            </div>
            <div
              className="planner-cell-hours mt-0.5 min-w-0 max-w-full truncate text-[15px] font-medium tabular-nums leading-tight"
              title={timeLine || undefined}
            >
              {timeLine || '—'}
            </div>
            {displayBreakMinutes > 0 ? (
              <div
                className="planner-cell-numeric mt-0.5 min-w-0 max-w-full truncate text-sm tabular-nums leading-tight opacity-70"
                title={`${t.plannerPauseAbbrev} ${displayBreakMinutes}`}
              >
                {t.plannerPauseAbbrev} {displayBreakMinutes}
              </div>
            ) : null}
          </div>
          {assignment?.id && !readOnly && !isUnavailable ? (
            <button
              type="button"
              onClick={handleClear}
              disabled={saving}
              title={t.deleteAssignment}
              aria-label={t.deleteAssignment}
              className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded bg-white/90 text-[12px] font-bold leading-none text-red-700 shadow-sm ring-1 ring-red-200 opacity-0 transition-opacity hover:bg-red-50 group-hover:opacity-100"
            >
              ×
            </button>
          ) : null}
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
            <div className="planner-cell-hours mt-0.5 min-w-0 max-w-full truncate text-[15px] font-medium tabular-nums leading-tight">
              —
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center px-1 py-2 text-center text-[10px] font-normal opacity-70">—</div>
      )}
    </td>
  );
}
