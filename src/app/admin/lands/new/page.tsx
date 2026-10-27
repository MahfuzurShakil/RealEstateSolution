'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { LandForm } from '@/components/admin/lands/LandForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { landOfferRepository } from '@/lib/repositories';

/**
 * `?mode=owned` opens straight on the already-owned entry (v29);
 * `?offer=<id>` starts from a website land offer (W8).
 */
function NewLandForm() {
  const params = useSearchParams();
  const offerId = params.get('offer');
  // `null` once looked up and missing, so the form never waits forever
  const offer = useLiveQuery(async () => (offerId ? ((await landOfferRepository.getById(offerId)) ?? null) : null), [offerId]);
  if (offerId && offer === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;
  return (
    <LandForm
      key={offer?.id ?? 'blank'}
      initialMode={params.get('mode') === 'owned' ? 'owned' : 'pipeline'}
      offer={offer && offer.status !== 'converted' ? offer : undefined}
    />
  );
}

export default function NewLandPage() {
  return (
    <>
      <PageHeader
        title="Add Land"
        subtitle="A land code (LND-YYYY-NNN) is assigned automatically on save."
      />
      <Suspense>
        <NewLandForm />
      </Suspense>
    </>
  );
}
