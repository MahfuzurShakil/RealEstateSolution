'use client';

import { Suspense } from 'react';
import { BookingForm } from '@/components/admin/bookings/BookingForm';
import { PageHeader } from '@/components/ui/PageHeader';

export default function NewBookingPage() {
  return (
    <>
      <PageHeader
        title="Add Booking"
        subtitle="The status is worked out from the booking amount and the discount — it is not chosen here."
      />
      {/* the form reads ?customer= from the URL, which needs a Suspense boundary */}
      <Suspense fallback={<p className="text-sm text-ink-muted">Loading…</p>}>
        <BookingForm />
      </Suspense>
    </>
  );
}
