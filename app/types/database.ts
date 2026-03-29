export interface Employee {
  id: string;
  name: string;
  created_at: string;
  employment_start_date?: string | null;
  birth_date?: string | null;
  is_active?: boolean;
  sort_order?: number | null;
  /** Optional; used for estimated cost in reports (same unit as UI currency). */
  hourly_rate?: number | null;
}

export interface Store {
  id: string;
  name: string;
  color?: string | null;
}

export interface Shift {
  id: string;
  name: string;
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
  normal_hours: number;
  night_hours: number;
  sunday_hours: number;
  total_hours: number;
  vacation_days: number;
  sick_days: number;
}
