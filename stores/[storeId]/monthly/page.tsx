'use client';

import { useParams } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import Layout from '@/components/Layout';
import StoreMonthlyPlannerView from '@/components/stores/StoreMonthlyPlannerView';

export default function StoreMonthlyPage() {
  const params = useParams();
  const storeId = typeof params.storeId === 'string' ? params.storeId : '';

  return (
    <AuthGuard>
      <Layout>
        {storeId ? (
          <StoreMonthlyPlannerView storeId={storeId} />
        ) : (
          <p className="text-sm text-red-600">Invalid store.</p>
        )}
      </Layout>
    </AuthGuard>
  );
}

