'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/** Signing now lives in the purchase page's "Sign agreement" tab; old links land there. */
export default function SignAgreementRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/admin/share-sale/sales/${id}?tab=sign`);
  }, [id, router]);
  return <p className="text-sm text-ink-muted">Opening the agreement…</p>;
}
