'use client';

import { PaymentsView } from '@/components/admin/finance/PaymentsView';

/** Accounts → Payment History: every payment made against a recorded cost. */
export default function Page() {
  return <PaymentsView view="paid" />;
}
