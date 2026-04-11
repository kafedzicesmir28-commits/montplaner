export interface Employee {
  id: string;
  name: string;
  created_at: string;
  /** Tenant scope (RLS); set on writes from app. */
  company_id?: string | null;
  employment_start_date?: string | null;
  birth_date?: string | null;
  store_id?: string | null;
  is_active?: boolean;
  sort_order?: number | null;
  /** Optional; used for estimated cost in reports (same unit as UI currency). */
  hourly_rate?: number | null;
}

export interface Store {
  id: string;
  name: string;
  color?: string | null;
  company_id?: string | null;
}

export interface Shift {
  id: string;
  name: string;
  company_id?: string | null;
  code?: string | null;
  start_time: string; // HH:mm format
  end_time: string; // HH:mm format
  break_minutes: number;
  store_id?: string | null;
  is_global?: boolean;
}

export interface ShiftAssignment {
  id: string;
  employee_id: string;
  company_id?: string | null;
  date: string; // YYYY-MM-DD format
  shift_id: string | null;
  store_id: string | null;
  assignment_type?: 'SHIFT' | 'FREI' | 'KRANK' | 'FERIEN';
  /** Per-day break override (minutes). Null = use linked shift.break_minutes. */
  custom_break_minutes?: number | null;
}

export interface Vacation {
  id: string;
  employee_id: string;
  company_id?: string | null;
  start_date: string; // YYYY-MM-DD format
  end_date: string; // YYYY-MM-DD format
}

export interface ShiftAssignmentWithDetails extends ShiftAssignment {
  employee?: Employee;
  shift?: Shift;
  store?: Store;
}

export interface HoursCalculation {
  employee_id: string;
  employee_name: string;
  /** Informational: daytime bucket — not added to `total_hours`. */
  normal_hours: number;
  /** Informational: night bucket — not added to `total_hours`. */
  night_hours: number;
  /** Informational: Sunday bucket — not added to `total_hours`. */
  sunday_hours: number;
  /** Efektiv: effective worked hours (duration − break) — sole payroll total. */
  total_hours: number;
  vacation_days: number;
  sick_days: number;
}
