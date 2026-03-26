import AuthGuard from '@/components/AuthGuard';
import Layout from '@/components/Layout';
import Link from 'next/link';
import { t } from '@/lib/translations';

export default function DashboardPage() {
  return (
    <AuthGuard>
      <Layout>
        <div className="space-y-6">
          <h1 className="text-3xl font-bold text-gray-900">{t.dashboardTitle}</h1>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              href="/employees"
              className="rounded-lg bg-white p-6 shadow hover:shadow-md transition-shadow"
            >
              <h2 className="text-xl font-semibold text-gray-900">{t.employees}</h2>
              <p className="mt-2 text-gray-600">{t.manageEmployeeInformation}</p>
            </Link>
            <Link
              href="/stores"
              className="rounded-lg bg-white p-6 shadow hover:shadow-md transition-shadow"
            >
              <h2 className="text-xl font-semibold text-gray-900">{t.stores}</h2>
              <p className="mt-2 text-gray-600">{t.manageStoreLocations}</p>
            </Link>
            <Link
              href="/shifts"
              className="rounded-lg bg-white p-6 shadow hover:shadow-md transition-shadow"
            >
              <h2 className="text-xl font-semibold text-gray-900">{t.shifts}</h2>
              <p className="mt-2 text-gray-600">{t.defineShiftTemplates}</p>
            </Link>
            <Link
              href="/planner"
              className="rounded-lg bg-white p-6 shadow hover:shadow-md transition-shadow"
            >
              <h2 className="text-xl font-semibold text-gray-900">{t.monthlyPlanner}</h2>
              <p className="mt-2 text-gray-600">{t.planEmployeeShifts}</p>
            </Link>
            <Link
              href="/vacations"
              className="rounded-lg bg-white p-6 shadow hover:shadow-md transition-shadow"
            >
              <h2 className="text-xl font-semibold text-gray-900">{t.vacations}</h2>
              <p className="mt-2 text-gray-600">{t.manageVacationRequests}</p>
            </Link>
            <Link
              href="/accountant"
              className="rounded-lg bg-white p-6 shadow hover:shadow-md transition-shadow"
            >
              <h2 className="text-xl font-semibold text-gray-900">{t.accountantView}</h2>
              <p className="mt-2 text-gray-600">{t.viewHoursSummary}</p>
            </Link>
          </div>
        </div>
      </Layout>
    </AuthGuard>
  );
}

