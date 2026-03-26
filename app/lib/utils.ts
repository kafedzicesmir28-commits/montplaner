import { Shift, ShiftAssignment } from '@/types/database';

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
  return date.toISOString().split('T')[0];
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
