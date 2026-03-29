import AuthGuard from '@/components/AuthGuard';
import Layout from '@/components/Layout';
import {
  BarChart3,
  CalendarClock,
  CalendarDays,
  DollarSign,
  Store,
  Umbrella,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { t } from '@/lib/translations';

type DashboardCard = {
  href: string;
  title: string;
  description: string;
  accent: string;
  dot: string;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
};

const primaryCards: DashboardCard[] = [
  {
    href: '/employees',
    title: t.employees,
    description: t.manageEmployeeInformation,
    accent: 'from-sky-50 to-sky-100/70 border-sky-100',
    dot: 'bg-sky-400',
    icon: Users,
    iconColor: 'text-sky-700',
    iconBg: 'bg-sky-100',
  },
  {
    href: '/stores',
    title: t.stores,
    description: t.manageStoreLocations,
    accent: 'from-emerald-50 to-emerald-100/70 border-emerald-100',
    dot: 'bg-emerald-400',
    icon: Store,
    iconColor: 'text-emerald-700',
    iconBg: 'bg-emerald-100',
  },
  {
    href: '/shifts',
    title: t.shifts,
    description: t.defineShiftTemplates,
    accent: 'from-amber-50 to-amber-100/70 border-amber-100',
    dot: 'bg-amber-400',
    icon: CalendarClock,
    iconColor: 'text-amber-700',
    iconBg: 'bg-amber-100',
  },
  {
    href: '/planner',
    title: t.monthlyPlanner,
    description: t.planEmployeeShifts,
    accent: 'from-indigo-50 to-indigo-100/70 border-indigo-100',
    dot: 'bg-indigo-400',
    icon: CalendarDays,
    iconColor: 'text-indigo-700',
    iconBg: 'bg-indigo-100',
  },
];

const secondaryCards: DashboardCard[] = [
  {
    href: '/vacations',
    title: t.vacations,
    description: t.manageVacationRequests,
    accent: 'from-cyan-50 to-cyan-100/70 border-cyan-100',
    dot: 'bg-cyan-400',
    icon: Umbrella,
    iconColor: 'text-cyan-700',
    iconBg: 'bg-cyan-100',
  },
  {
    href: '/accountant',
    title: t.accountantView,
    description: t.viewHoursSummary,
    accent: 'from-violet-50 to-violet-100/70 border-violet-100',
    dot: 'bg-violet-400',
    icon: DollarSign,
    iconColor: 'text-violet-700',
    iconBg: 'bg-violet-100',
  },
  {
    href: '/reports',
    title: t.reportsHub,
    description: t.openReportsAndAnalytics,
    accent: 'from-slate-50 to-slate-100/70 border-slate-200',
    dot: 'bg-slate-500',
    icon: BarChart3,
    iconColor: 'text-slate-800',
    iconBg: 'bg-slate-100',
  },
];

export default function DashboardPage() {
  return (
    <AuthGuard>
      <Layout>
        <div className="space-y-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">{t.dashboardTitle}</h1>
            <p className="max-w-2xl text-sm text-gray-500">
              Zentrale Bereiche fur Planung, Verwaltung und Ubersicht.
            </p>
          </div>

          <section className="space-y-4 rounded-xl border border-gray-200/80 bg-white/80 p-4 sm:p-5">
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
              {t.dashboardPrimarySection}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {primaryCards.map((card) => (
                <Link
                  key={card.href}
                  href={card.href}
                  className={`rounded-lg border bg-gradient-to-br p-5 shadow transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${card.accent}`}
                >
                  <div className={`mb-4 inline-flex rounded-md p-2 ${card.iconBg}`}>
                    <card.icon className={`h-5 w-5 ${card.iconColor}`} aria-hidden="true" />
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg font-semibold text-gray-900">{card.title}</h3>
                    <span className={`mt-1 h-2.5 w-2.5 rounded-full ${card.dot}`} />
                  </div>
                  <p className="mt-2 text-sm leading-6 text-gray-600">{card.description}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-gray-200/80 bg-white/80 p-4 sm:p-5">
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
              {t.dashboardSecondarySection}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {secondaryCards.map((card) => (
                <Link
                  key={card.href}
                  href={card.href}
                  className={`rounded-lg border bg-gradient-to-br p-5 shadow transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${card.accent}`}
                >
                  <div className={`mb-4 inline-flex rounded-md p-2 ${card.iconBg}`}>
                    <card.icon className={`h-5 w-5 ${card.iconColor}`} aria-hidden="true" />
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg font-semibold text-gray-900">{card.title}</h3>
                    <span className={`mt-1 h-2.5 w-2.5 rounded-full ${card.dot}`} />
                  </div>
                  <p className="mt-2 text-sm leading-6 text-gray-600">{card.description}</p>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </Layout>
    </AuthGuard>
  );
}

