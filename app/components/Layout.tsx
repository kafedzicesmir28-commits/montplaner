'use client';

import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { t } from '@/lib/translations';

export default function Layout({
  children,
  plannerControls,
}: {
  children: React.ReactNode;
  plannerControls?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const navItems = [
    { href: '/dashboard', label: t.dashboard },
    { href: '/employees', label: t.employees },
    { href: '/stores', label: t.stores },
    { href: '/shifts', label: t.shifts },
    { href: '/planner', label: t.planner },
    { href: '/montatsplaner', label: t.monthlyPlanner },
    { href: '/vacations', label: t.vacations },
    { href: '/accountant', label: t.accountantView },
  ];

  const reportItems = [
    { href: '/reports/employee-monthly', label: 'Employee Monthly' },
    { href: '/reports/employee-vacations', label: 'Employee Vacations' },
    { href: '/stores', label: 'Store Overview' },
  ];

  const isPlannerRoute =
    pathname === '/planner' || (pathname?.startsWith('/planner/') ?? false);

  return (
    <div className="min-h-screen bg-[#f8f9fb] text-gray-900 print:bg-white">
      {isPlannerRoute ? (
        <nav className="print:hidden border-b border-gray-200 bg-white">
          <div className="mx-auto max-w-none px-4 sm:px-6 lg:px-6 xl:px-8">
            <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 py-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="rounded-md px-2.5 py-1 text-sm font-medium text-gray-800 hover:bg-gray-100"
                >
                  {t.plannerBack}
                </button>
                <Link
                  href="/dashboard"
                  className="rounded-md px-2.5 py-1 text-sm font-medium text-blue-700 hover:bg-blue-50"
                >
                  {t.dashboard}
                </Link>
              </div>
              {plannerControls ? (
                <div className="flex flex-1 items-center justify-center gap-2 overflow-x-auto">
                  {plannerControls}
                </div>
              ) : null}
              <button
                onClick={handleLogout}
                className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {t.logout}
              </button>
            </div>
          </div>
        </nav>
      ) : (
        <nav className="print:hidden border-b border-gray-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 justify-between">
              <div className="flex">
                <div className="flex space-x-8">
                  {navItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium ${
                        pathname === item.href
                          ? 'border-blue-600 text-gray-900'
                          : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'
                      }`}
                    >
                      {item.label}
                    </Link>
                  ))}
                  <div className="inline-flex items-center border-b-2 border-transparent px-1 pt-1 text-sm font-semibold text-gray-700">
                    Reports
                  </div>
                  {reportItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium ${
                        pathname === item.href
                          ? 'border-blue-600 text-gray-900'
                          : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'
                      }`}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <button
                  onClick={handleLogout}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {t.logout}
                </button>
              </div>
            </div>
          </div>
        </nav>
      )}
      <main
        className={
          'mx-auto px-4 py-8 sm:px-6 lg:px-8 print:max-w-none print:px-2 print:py-4 ' +
          (isPlannerRoute
            ? 'max-w-none py-2 sm:py-3 lg:px-6 xl:px-8'
            : 'max-w-7xl')
        }
      >
        {children}
      </main>
    </div>
  );
}
