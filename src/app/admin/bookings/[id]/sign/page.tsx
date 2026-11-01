'use client';

import { useParams, useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { SignBookingWizard } from '@/components/admin/bookings/SignBookingWizard';
import { PageHeader } from '@/components/ui/PageHeader';
import { bookingRepository, customerUploadRepository } from '@/lib/repositories';

/** Signing a booking's sale agreement, step by step (BUYER-PORTAL-PLAN.md §2.7). */
export default function SignBookingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const booking = useLiveQuery(() => bookingRepository.getWithRelations(id), [id]);
  const uploads = useLiveQuery(
    async () => (booking?.customer_id ? customerUploadRepository.forCustomer(booking.customer_id) : []),
    [booking?.customer_id],
  );

  if (booking === undefined || uploads === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (!booking || !booking.customer) return <p className="text-sm text-ink-muted">This booking no longer exists.</p>;

  return (
    <>
      <PageHeader
        title={`Sign the agreement · ${booking.customer.name}`}
        subtitle={`${booking.code} · ${booking.unit?.code ?? 'unit removed'}${booking.project ? ` · ${booking.project.name}` : ''}`}
      />
      <SignBookingWizard
        booking={booking}
        customer={booking.customer}
        uploads={uploads}
        onDone={() => router.push(`/admin/bookings/${id}?tab=agreement`)}
      />
    </>
  );
}
