'use client';

import React, { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import SurveillanceReconciliation from '@/components/modules/surveillance/SurveillanceReconciliation';

export default function ReconciliationPage() {
  const params = useParams();
  const router = useRouter();
  const surveillanceId = params.id as string;
  const user = useAppStore(s => s.user);

  useEffect(() => {
    if (user?.role) {
      document.body.setAttribute('data-role', user.role);
      return () => { document.body.removeAttribute('data-role'); };
    }
  }, [user?.role]);

  return (
    <SurveillanceReconciliation
      surveillanceId={surveillanceId}
      onBack={() => router.push(`/surveillance/${surveillanceId}`)}
    />
  );
}
