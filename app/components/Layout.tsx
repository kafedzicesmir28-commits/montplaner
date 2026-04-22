'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getUserSafe } from '@/lib/supabaseAuthSafe';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { t } from '@/lib/translations';
import { Settings } from 'lucide-react';

export default function Layout({
  children,
  plannerControls,
}: {
  children: React.ReactNode;
  plannerControls?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [role, setRole] = useState<'superadmin' | 'user'>('user');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const loadRole = async () => {
      try {
        const user = await getUserSafe();
        if (!user) return;
        const { data } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        if ((data?.role ?? 'user') === 'superadmin') {
          setRole('superadmin');
        } else {
          setRole('user');
        }
      } catch {
        // On rapid auth transitions, keep default nav until session stabilizes.
      }
    };
    void loadRole();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const userNavItems = [
    { href: '/dashboard', label: t.dashboard },
    { href: '/employees', label: t.employees },
    { href: '/stores', label: t.stores },
    { href: '/shifts', label: t.shifts },
    { href: '/planner', label: t.planner },
    { href: '/montatsplaner', label: t.monthlyPlanner },
    { href: '/vacations', label: t.vacations },
    { href: '/accountant', label: t.accountantView },
  ];

  const superadminNavItems = [{ href: '/admin', label: 'Admin' }];

  const reportItems = role === 'superadmin' ? [] : [
    { href: '/reports', label: t.reportsHub },
    { href: '/reports/stores', label: t.reportsStoreOverviewShort },
    { href: '/reports/employee-monthly', label: t.reportsEmployeeMonthlyShort },
    { href: '/reports/employee-vacations', label: t.reportsEmployeeVacationsShort },
  ];

  const navItems = useMemo(
    () => (role === 'superadmin' ? superadminNavItems : userNavItems),
    [role]
  );

  const primaryDesktopHrefs = useMemo(
    () => new Set(['/dashboard', '/planner', '/vacations', '/reports']),
    []
  );
  const primaryNavItems = useMemo(
    () => navItems.filter((item) => primaryDesktopHrefs.has(item.href)),
    [navItems, primaryDesktopHrefs]
  );
  const overflowNavItems = useMemo(
    () => [...navItems.filter((item) => !primaryDesktopHrefs.has(item.href)), ...reportItems.filter((item) => item.href !== '/reports')],
    [navItems, reportItems, primaryDesktopHrefs]
  );

  const allNavHrefs = [...navItems, ...reportItems].map((i) => i.href);

  const isNavItemActive = (href: string) => {
    if (!pathname) return false;
    const matchesPath =
      pathname === href || pathname.startsWith(`${href}/`);
    if (!matchesPath) return false;
    return !allNavHrefs.some(
      (h) =>
        h.length > href.length &&
        (pathname === h || pathname.startsWith(`${h}/`))
    );
  };

  const isPlannerRoute =
    pathname === '/planner' || (pathname?.startsWith('/planner/') ?? false);

  const isMontatsplanerRoute = pathname === '/montatsplaner';

  return (
    <div className="min-h-screen bg-[#f8f9fb] text-gray-900 print:bg-white">
      {isPlannerRoute ? (
        <nav className="print:hidden sticky top-0 z-[100] border-b border-gray-200 bg-white/95 shadow-sm backdrop-blur-sm">
          <div className="mx-auto max-w-none px-3 sm:px-5 lg:px-6 xl:px-8">
            <div className="flex h-11 min-h-11 flex-nowrap items-center justify-between gap-2">
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="rounded-md px-2 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900"
                >
                  {t.plannerBack}
                </button>
                <Link
                  href="/dashboard"
                  className="rounded-md px-2 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900"
                >
                  {t.dashboard}
                </Link>
              </div>
              {plannerControls ? (
                <div className="relative z-[101] flex min-w-0 flex-1 items-center justify-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {plannerControls}
                </div>
              ) : null}
              <button
                type="button"
                onClick={handleLogout}
                className="shrink-0 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50"
              >
                {t.logout}
              </button>
            </div>
          </div>
        </nav>
      ) : (
        <nav className="print:hidden sticky top-0 z-[10] border-b border-gray-200 bg-white/95 backdrop-blur-sm">
          <div className="mx-auto max-w-7xl px-3 sm:px-5 lg:px-8">
            <div className="flex h-12 items-center justify-between gap-3">
              <div className="hidden min-w-0 flex-1 items-center gap-1 md:flex">
                {(role === 'superadmin' ? navItems : primaryNavItems).map((item) => {
                  const active = isNavItemActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`inline-flex shrink-0 items-center rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                        active
                          ? 'bg-blue-50 text-blue-800 shadow-sm'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
                {role !== 'superadmin' && overflowNavItems.length > 0 ? (
                  <details className="relative">
                    <summary
                      className={`inline-flex cursor-pointer list-none items-center rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                        overflowNavItems.some((item) => isNavItemActive(item.href))
                          ? 'bg-blue-50 text-blue-800 shadow-sm'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                    >
                      Mehr
                    </summary>
                    <div className="absolute left-0 top-full z-20 mt-2 w-64 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                      {overflowNavItems.map((item) => {
                        const active = isNavItemActive(item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={`block rounded-md px-2.5 py-2 text-sm transition-colors ${
                              active ? 'bg-blue-50 font-medium text-blue-800' : 'text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  </details>
                ) : null}
              </div>
              <div className="min-w-0 flex-1 md:hidden">
                <button
                  type="button"
                  onClick={() => setMobileNavOpen((v) => !v)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Menu
                </button>
              </div>
              <div className="flex shrink-0 items-center border-l border-gray-100 pl-3">
                {role !== 'superadmin' ? (
                  <Link
                    href="/dashboard/settings"
                    aria-label="Einstellungen"
                    title="Einstellungen"
                    className={`mr-2 inline-flex items-center rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors ${
                      isNavItemActive('/dashboard/settings')
                        ? 'border-blue-200 bg-blue-50 text-blue-800'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <Settings className="h-4 w-4" />
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50"
                >
                  {t.logout}
                </button>
              </div>
            </div>
            {mobileNavOpen ? (
              <div className="border-t border-gray-100 py-2 md:hidden">
                <div className="grid gap-1">
                  {[...navItems, ...reportItems, ...(role !== 'superadmin' ? [{ href: '/dashboard/settings', label: 'Einstellungen' }] : [])].map((item) => {
                    const active = isNavItemActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileNavOpen(false)}
                        className={`inline-flex shrink-0 items-center rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                          active
                            ? 'bg-blue-50 text-blue-800 shadow-sm'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </nav>
      )}
      <main
        className={
          isMontatsplanerRoute
            ? 'mx-0 flex w-full max-w-none min-w-0 flex-col items-stretch justify-start px-0 py-2 sm:py-2 print:max-w-none print:justify-start print:px-0 print:py-0'
            : 'mx-auto w-full max-w-full min-w-0 px-3 py-4 sm:px-6 sm:py-8 lg:px-8 print:max-w-none print:px-2 print:py-4 ' +
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
