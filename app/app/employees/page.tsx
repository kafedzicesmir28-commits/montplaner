'use client';

import { useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import Layout from '@/components/Layout';
import { supabase } from '@/lib/supabaseClient';
import { Employee, Store } from '@/types/database';
import { t } from '@/lib/translations';

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [name, setName] = useState('');
  const [employmentStartDate, setEmploymentStartDate] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [hourlyRate, setHourlyRate] = useState('');
  const [storeId, setStoreId] = useState('');

  useEffect(() => {
    fetchEmployees();
    fetchStores();
  }, []);

  const fetchEmployees = async () => {
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setEmployees(data || []);
    } catch (error: any) {
      console.error('Error fetching employees:', error.message);
      // Show helpful error message if tables don't exist
      if (error.message?.includes('Could not find the table')) {
        alert(
          'Database tables not found!\n\n' +
          'Please set up your database:\n' +
          '1. Go to your Supabase project\n' +
          '2. Open SQL Editor\n' +
          '3. Follow app/supabase/CANONICAL_SETUP.md and run app/supabase/migration-multi-tenant-superadmin.sql\n\n' +
          'Or visit /setup-check for detailed instructions.'
        );
      } else if (error.message?.includes('sort_order') || error.message?.includes('employment_start_date')) {
        alert(
          'Employees schema is outdated.\n\n' +
          'Please run the canonical migration path:\n' +
          'app/supabase/migration-multi-tenant-superadmin.sql\n' +
          '(see app/supabase/CANONICAL_SETUP.md).'
        );
      } else if (error.message?.includes('hourly_rate')) {
        alert(
          'Employees table is missing hourly_rate.\n\n' +
          'Please run the canonical migration path:\n' +
          'app/supabase/migration-multi-tenant-superadmin.sql\n' +
          '(see app/supabase/CANONICAL_SETUP.md).'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchStores = async () => {
    try {
      const { data, error } = await supabase
        .from('stores')
        .select('id,name')
        .order('name', { ascending: true });
      if (error) throw error;
      setStores((data || []) as Store[]);
    } catch (error: any) {
      console.error('Error fetching stores:', error.message);
      setStores([]);
    }
  };

  const normalizeDate = (dateValue: string) => (dateValue ? dateValue : null);

  const parseHourlyRate = (): number | null => {
    const raw = hourlyRate.trim();
    if (!raw) return null;
    const n = parseFloat(raw.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };

  const buildPayload = (sortOrder?: number) => ({
    name,
    employment_start_date: normalizeDate(employmentStartDate),
    birth_date: normalizeDate(birthDate),
    store_id: storeId || null,
    is_active: isActive,
    hourly_rate: parseHourlyRate(),
    ...(typeof sortOrder === 'number' ? { sort_order: sortOrder } : {}),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingEmployee) {
        const { error } = await supabase
          .from('employees')
          .update(buildPayload())
          .eq('id', editingEmployee.id);

        if (error) throw error;
      } else {
        const nextSortOrder = employees.length + 1;
        const { error } = await supabase
          .from('employees')
          .insert([buildPayload(nextSortOrder)]);

        if (error) throw error;
      }

      setShowModal(false);
      setEditingEmployee(null);
      setName('');
      setEmploymentStartDate('');
      setBirthDate('');
      setIsActive(true);
      setHourlyRate('');
      setStoreId('');
      fetchEmployees();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  };

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setName(employee.name);
    setEmploymentStartDate(employee.employment_start_date || '');
    setBirthDate(employee.birth_date || '');
    setIsActive(employee.is_active ?? true);
    setHourlyRate(
      employee.hourly_rate != null && Number.isFinite(Number(employee.hourly_rate))
        ? String(employee.hourly_rate)
        : '',
    );
    setStoreId(employee.store_id ?? '');
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t.areYouSureDeleteEmployee)) return;

    try {
      const { error } = await supabase
        .from('employees')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchEmployees();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingEmployee(null);
    setName('');
    setEmploymentStartDate('');
    setBirthDate('');
    setIsActive(true);
    setHourlyRate('');
    setStoreId('');
  };

  const handleAddEmployee = () => {
    setEditingEmployee(null);
    setName('');
    setEmploymentStartDate('');
    setBirthDate('');
    setIsActive(true);
    setHourlyRate('');
    setStoreId('');
    setShowModal(true);
  };

  if (loading) {
    return (
      <AuthGuard>
        <Layout>
          <div className="text-center">Loading...</div>
        </Layout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <Layout>
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-900">{t.employeesTitle}</h1>
            <button
              onClick={handleAddEmployee}
              className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              {t.addEmployee}
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-blue-100 bg-white shadow">
            <table className="min-w-full table-fixed divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-blue-50 via-indigo-50 to-cyan-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {t.employeeName}
                  </th>
                  <th className="w-[170px] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {t.employmentStartDate}
                  </th>
                  <th className="w-[160px] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {t.birthDate}
                  </th>
                  <th className="w-[190px] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {t.employeeStore}
                  </th>
                  <th className="w-[140px] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {t.status}
                  </th>
                  <th className="w-[120px] px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {t.hourlyRateLabel}
                  </th>
                  <th className="w-[150px] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {t.created}
                  </th>
                  <th className="w-[130px] px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {t.actions}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                  {employees.map((employee, index) => (
                  <tr
                    key={employee.id}
                    className={`transition-colors ${
                      index % 2 === 0
                        ? 'bg-white'
                        : 'bg-slate-50'
                    }`}
                  >
                    <td className="truncate px-4 py-3 text-sm font-medium text-gray-900">
                      {employee.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {employee.employment_start_date
                        ? new Date(employee.employment_start_date).toLocaleDateString()
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {employee.birth_date ? new Date(employee.birth_date).toLocaleDateString() : '-'}
                    </td>
                    <td className="truncate px-4 py-3 text-sm text-gray-700">
                      {stores.find((s) => s.id === employee.store_id)?.name || t.unassignedStore}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          employee.is_active ?? true
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {(employee.is_active ?? true) ? t.active : t.inactive}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700">
                      {employee.hourly_rate != null && Number.isFinite(Number(employee.hourly_rate))
                        ? new Intl.NumberFormat('de-DE', {
                            style: 'currency',
                            currency: 'EUR',
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }).format(Number(employee.hourly_rate))
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(employee.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium">
                      <button
                        onClick={() => handleEdit(employee)}
                        title="Edit"
                        aria-label="Edit"
                        className="mr-2 inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(employee.id)}
                        title="Delete"
                        aria-label="Delete"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {showModal && (
            <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
              <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                <h3 className="text-lg font-bold text-gray-900 mb-4">
                  {editingEmployee ? t.editEmployee : t.addEmployee}
                </h3>
                <form onSubmit={handleSubmit}>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t.employeeName}
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="w-full rounded-md border-2 border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Employee name"
                    />
                  </div>
                  <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        {t.employmentStartDate}
                      </label>
                      <input
                        type="date"
                        value={employmentStartDate}
                        onChange={(e) => setEmploymentStartDate(e.target.value)}
                        className="w-full rounded-md border-2 border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">{t.birthDate}</label>
                      <input
                        type="date"
                        value={birthDate}
                        onChange={(e) => setBirthDate(e.target.value)}
                        className="w-full rounded-md border-2 border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="mb-4">
                    <label className="mb-1 block text-sm font-medium text-gray-700">{t.employeeStore}</label>
                    <select
                      value={storeId}
                      onChange={(e) => setStoreId(e.target.value)}
                      className="w-full rounded-md border-2 border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">{t.unassignedStore}</option>
                      {stores.map((store) => (
                        <option key={store.id} value={store.id}>
                          {store.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-4">
                    <label className="mb-1 block text-sm font-medium text-gray-700">{t.status}</label>
                    <select
                      value={isActive ? 'active' : 'inactive'}
                      onChange={(e) => setIsActive(e.target.value === 'active')}
                      className="w-full rounded-md border-2 border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="active">{t.active}</option>
                      <option value="inactive">{t.inactive}</option>
                    </select>
                  </div>
                  <div className="mb-4">
                    <label className="mb-1 block text-sm font-medium text-gray-700">{t.hourlyRateLabel}</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={hourlyRate}
                      onChange={(e) => setHourlyRate(e.target.value)}
                      placeholder="z. B. 24,50"
                      className="w-full rounded-md border-2 border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="mt-1 text-xs text-gray-500">{t.hourlyRateHint}</p>
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
                      {editingEmployee ? t.update : t.create}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </Layout>
    </AuthGuard>
  );
}

