'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookingForm } from '@/components/admin/bookings/BookingForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { bookingRepository } from '@/lib/repositories';

export default function EditBookingPage() {
  const { id } = useParams<{ id: string }>();
  const booking = useLiveQuery(() => bookingRepository.getWithRelations(id), [id]);

  if (booking === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (!booking) return <p className="text-sm text-ink-muted">This booking no longer exists.</p>;

  return (
    <>
      <PageHeader title={`Edit ${booking.code}`} subtitle={booking.customer?.name} />
      <Suspense fallback={<p className="text-sm text-ink-muted">Loading…</p>}>
        <BookingForm booking={booking} />
      </Suspense>
    </>
  );
}
