export type BackupTableName =
  | 'companies'
  | 'employees'
  | 'shifts'
  | 'stores'
  | 'shift_assignments'
  | 'vacations';

export const BACKUP_TABLES: BackupTableName[] = [
  'companies',
  'stores',
  'employees',
  'shifts',
  'shift_assignments',
  'vacations',
];

export const BACKUP_CSV_FILENAMES: Record<BackupTableName, string> = {
  companies: 'companies.csv',
  employees: 'employees.csv',
  shifts: 'shifts.csv',
  stores: 'stores.csv',
  shift_assignments: 'planner.csv',
  vacations: 'vacations.csv',
};

export const BACKUP_FALLBACK_FIELDS: Record<BackupTableName, string[]> = {
  companies: ['id', 'name', 'created_at'],
  employees: [
    'id',
    'name',
    'employment_start_date',
    'birth_date',
    'is_active',
    'sort_order',
    'hourly_rate',
    'company_id',
    'created_at',
  ],
  shifts: [
    'id',
    'name',
    'code',
    'start_time',
    'end_time',
    'break_minutes',
    'store_id',
    'is_global',
    'company_id',
  ],
  stores: ['id', 'name', 'color', 'company_id'],
  shift_assignments: [
    'id',
    'employee_id',
    'date',
    'shift_id',
    'store_id',
    'assignment_type',
    'custom_start_time',
    'custom_end_time',
    'custom_break_minutes',
    'company_id',
  ],
  vacations: ['id', 'employee_id', 'start_date', 'end_date', 'company_id'],
};
