'use client';

import { PaymentsView } from '@/components/admin/finance/PaymentsView';

/** Accounts → Bills to Pay: every recorded cost that still owes money. */
export default function Page() {
  return <PaymentsView view="pending" />;
}
