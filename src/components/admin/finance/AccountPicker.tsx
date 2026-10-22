'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { Field, SelectInput } from '@/components/ui/Field';
import { bankAccountRepository } from '@/lib/repositories';

/**
 * Which account the money moved through (Tier 3.5).
 *
 * Optional on purpose. Refusing to record a payment because nobody has set up
 * accounts yet would block the money screens on an unrelated bit of
 * configuration; a movement with no account is simply reported as unattributed
 * on the Cash Position page, where it can be seen and fixed.
 *
 * Hidden entirely when no account exists, so an install that does not use the
 * feature never sees a dropdown with one empty option in it.
 */
export function AccountPicker({
  value,
  onChange,
  label = 'Paid from',
  required = false,
  error,
}: {
  value: string;
  onChange: (accountId: string) => void;
  label?: string;
  /**
   * Buyer receipts (SALES-FLOW-PLAN.md S4): every taka a buyer pays must land
   * in an account, or Cash Position and the project's money never see it.
   */
  required?: boolean;
  error?: string;
}) {
  const accounts = useLiveQuery(() => bankAccountRepository.options(), []);
  if (!accounts) return null;
  if (accounts.length === 0) {
    if (!required) return null;
    return (
      <Field label={label} required error={error}>
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
          No bank or cash account is set up yet. Add one under Accounts → Cash Position first.
        </p>
      </Field>
    );
  }
  return (
    <Field
      label={label}
      required={required}
      error={error}
      hint={required ? 'The bank or cash account the money went into' : 'Leave blank if it is not known — it shows as unattributed'}
    >
      <SelectInput value={value} onChange={(e) => onChange(e.target.value)} invalid={Boolean(error)}>
        <option value="">{required ? 'Pick an account' : 'Not recorded'}</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </SelectInput>
    </Field>
  );
}
