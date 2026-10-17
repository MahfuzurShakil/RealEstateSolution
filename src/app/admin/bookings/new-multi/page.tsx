'use client';

import { Suspense } from 'react';
import { MultiBookingForm } from '@/components/admin/bookings/MultiBookingForm';
import { PageHeader } from '@/components/ui/PageHeader';

export default function NewMultiBookingPage() {
  return (
    <>
      <PageHeader
        title="Book Several Units"
        subtitle="One buyer, several units in one go — each unit becomes its own booking under a shared group reference."
      />
      {/* the form reads ?customer= from the URL, which needs a Suspense boundary */}
      <Suspense fallback={<p className="text-sm text-ink-muted">Loading…</p>}>
        <MultiBookingForm />
      </Suspense>
    </>
  );
}
