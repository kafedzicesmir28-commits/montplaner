import { Shift, ShiftAssignment } from '@/types/database';

/** Break minutes for worked-hours: assignment override, else shift template. */
export function effectiveBreakMinutes(
  assignment: Pick<ShiftAssignment, 'custom_break_minutes'> | null | undefined,
  shift: Pick<Shift, 'break_minutes'> | null | undefined
): number {
  const o = assignment?.custom_break_minutes;
  if (o != null && Number.isFinite(Number(o))) {
    return Math.max(0, Math.floor(Number(o)));
  }
  return Math.max(0, Math.floor(Number(shift?.break_minutes ?? 0)));
}

export type HourBuckets = {
  totalHours: number;
  effectiveHours: number;
  nightHours: number;
  sundayHours: number;
};

function toMinuteOfDay(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

function normalizeShiftWindow(startTime: string, endTime: string): { start: number; end: number } {
  const start = toMinuteOfDay(startTime);
  let end = toMinuteOfDay(endTime);
  if (end <= start) end += 24 * 60;
  return { start, end };
}

function isNightMinute(minuteOfDay: number): boolean {
  return minuteOfDay >= 20 * 60 || minuteOfDay < 6 * 60;
}

/**
 * Calculate hours between two times, accounting for overnight shifts
 */
export function calculateHours(
  startTime: string,
  endTime: string,
  breakMinutes: number = 0
): number {
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);

  let startMinutes = startHour * 60 + startMin;
  let endMinutes = endHour * 60 + endMin;

  // Handle overnight shifts (end time is next day)
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60; // Add 24 hours
  }

  const totalMinutes = endMinutes - startMinutes - breakMinutes;
  return Math.max(0, totalMinutes / 60);
}

/**
 * Split shift duration into business buckets:
 * - effectiveHours: excludes night and Sunday minutes
 * - nightHours: night premium bucket (20:00-06:00)
 * - sundayHours: Sunday premium bucket
 * Break minutes are deducted proportionally across all buckets.
 */
export function calculateHourBuckets(
  startTime: string,
  endTime: string,
  breakMinutes: number = 0,
  date?: string
): HourBuckets {
  const { start, end } = normalizeShiftWindow(startTime, endTime);
  const rawMinutes = Math.max(0, end - start);
  if (rawMinutes === 0) {
    return { totalHours: 0, effectiveHours: 0, nightHours: 0, sundayHours: 0 };
  }

  const anchor = date ? new Date(`${date}T00:00:00`) : null;
  let nightMinutes = 0;
  let sundayMinutes = 0;
  let effectiveMinutes = 0;

  for (let minute = start; minute < end; minute++) {
    const minuteOfDay = minute % (24 * 60);
    const dayOffset = Math.floor(minute / (24 * 60));
    const dayOfWeek = anchor ? new Date(anchor.getTime() + dayOffset * 86400000).getDay() : null;
    const sunday = dayOfWeek === 0;

    if (sunday) {
      sundayMinutes++;
    } else if (isNightMinute(minuteOfDay)) {
      nightMinutes++;
    } else {
      effectiveMinutes++;
    }
  }

  const deduct = Math.min(Math.max(0, Math.floor(breakMinutes)), rawMinutes);
  const factor = (rawMinutes - deduct) / rawMinutes;

  return {
    totalHours: (rawMinutes - deduct) / 60,
    effectiveHours: (effectiveMinutes * factor) / 60,
    nightHours: (nightMinutes * factor) / 60,
    sundayHours: (sundayMinutes * factor) / 60,
  };
}

/**
 * Check if a time falls within night hours (22:00 - 06:00)
 */
export function isNightTime(time: string): boolean {
  const [hour] = time.split(':').map(Number);
  return hour >= 22 || hour < 6;
}

/**
 * Calculate night hours for a shift
 */
export function calculateNightHours(
  startTime: string,
  endTime: string,
  breakMinutes: number = 0
): number {
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);

  let startMinutes = startHour * 60 + startMin;
  let endMinutes = endHour * 60 + endMin;
  const isOvernight = endMinutes <= startMinutes;

  if (isOvernight) {
    endMinutes += 24 * 60;
  }

  let nightMinutes = 0;
  const nightStart = 22 * 60; // 22:00
  const nightEnd = 6 * 60; // 06:00

  // Calculate night hours
  for (let minute = startMinutes; minute < endMinutes; minute++) {
    const currentHour = Math.floor((minute % (24 * 60)) / 60);
    const currentMin = minute % 60;
    const timeInDay = currentHour * 60 + currentMin;

    if (timeInDay >= nightStart || timeInDay < nightEnd) {
      nightMinutes++;
    }
  }

  // Subtract break time if it overlaps with night hours
  // Simplified: assume break doesn't affect night hours calculation significantly
  const totalNightHours = (nightMinutes - breakMinutes) / 60;
  return Math.max(0, totalNightHours);
}

/**
 * Check if a date is a Sunday
 */
export function isSunday(date: string): boolean {
  const d = new Date(date);
  return d.getDay() === 0;
}

/**
 * Format date to YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Human-readable worked time for UI (e.g. planner totals, reports). Input is decimal hours; display is never "57.3h".
 * Example: 57.5 → "57h 30min"
 */
export function formatWorkHoursDisplay(decimalHours: number): string {
  if (!Number.isFinite(decimalHours) || decimalHours <= 0) {
    return '0h 00min';
  }
  const totalMinutes = Math.round(decimalHours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}min`;
}

export function parseYmdLocal(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function firstOfMonthFromDate(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** First-of-month strings YYYY-MM-01 from start through end (inclusive), by calendar month. */
export function monthsFirstOfMonthInRange(startYmd: string, endYmd: string): string[] {
  const start = firstOfMonthFromDate(parseYmdLocal(startYmd));
  const end = firstOfMonthFromDate(parseYmdLocal(endYmd));
  if (end < start) return [];
  const out: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    out.push(`${y}-${m}-01`);
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

/**
 * Get all dates in a month
 */
export function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const date = new Date(year, month, 1);
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
}

/** ISO 8601 week number (Mon–Sun), local calendar date. */
function getISOWeekForSegment(date: Date): number {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    )
  );
}

function getISOWeekYearForSegment(date: Date): number {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  return d.getFullYear();
}

type WeekSegment = {
  weekNumber: number;
  weekYear: number;
  days: Date[];
};

function segmentDaysByISOWeek(days: Date[]): WeekSegment[] {
  const segments: WeekSegment[] = [];
  for (const day of days) {
    const weekNumber = getISOWeekForSegment(day);
    const weekYear = getISOWeekYearForSegment(day);
    const last = segments[segments.length - 1];
    if (last && last.weekNumber === weekNumber && last.weekYear === weekYear) {
      last.days.push(day);
    } else {
      segments.push({ weekNumber, weekYear, days: [day] });
    }
  }
  return segments;
}

/**
 * First 1 or 2 ISO week strips inside the given month `days` array (from getDaysInMonth).
 */
export function getPrintWeekDays(days: Date[], weekCount: 1 | 2): Date[] {
  const segments = segmentDaysByISOWeek(days);
  if (segments.length === 0) return [];
  if (weekCount === 1) return segments[0]!.days;
  const first = segments[0]!.days;
  if (segments.length < 2) return first;
  return [...first, ...segments[1]!.days];
}

/**
 * Check if a date falls within a vacation period
 */
export function isDateInVacation(
  date: string,
  startDate: string,
  endDate: string
): boolean {
  const d = new Date(date);
  const start = new Date(startDate);
  const end = new Date(endDate);
  return d >= start && d <= end;
}

/**
 * Supabase PostgrestError and RPC errors are often plain objects, not Error instances.
 */
export function formatErrorMessage(e: unknown): string {
  if (e == null) return 'Unknown error';
  if (e instanceof Error) return e.message.trim() || e.name || 'Error';
  if (typeof e === 'object') {
    const r = e as Record<string, unknown>;
    const msg = r.message;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
    const parts: string[] = [];
    if (typeof r.code === 'string' && r.code.trim()) parts.push(`[${r.code}]`);
    if (typeof r.details === 'string' && r.details.trim()) parts.push(r.details.trim());
    if (typeof r.hint === 'string' && r.hint.trim()) parts.push(r.hint.trim());
    if (parts.length) return parts.join(' · ');
    try {
      const s = JSON.stringify(e);
      if (s && s !== '{}') return s;
    } catch {
      /* ignore */
    }
  }
  if (typeof e === 'string') return e;
  return 'Unknown error';
}
