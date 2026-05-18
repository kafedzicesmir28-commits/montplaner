'use client';

import AuthGuard from '@/components/AuthGuard';
import Layout from '@/components/Layout';
import EmployeeMonthlyReport from '@/components/reports/EmployeeMonthlyReport';

export default function EmployeeMonthlyReportPage() {
  return (
    <AuthGuard>
      <Layout>
        <EmployeeMonthlyReport />
      </Layout>
    </AuthGuard>
  );
}
