'use client';

import AuthGuard from '@/components/AuthGuard';
import Layout from '@/components/Layout';
import EmployeeVacationReport from '@/components/reports/EmployeeVacationReport';

export default function EmployeeVacationsReportPage() {
  return (
    <AuthGuard>
      <Layout>
        <EmployeeVacationReport />
      </Layout>
    </AuthGuard>
  );
}
