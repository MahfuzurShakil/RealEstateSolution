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
}: {
  value: string;
  onChange: (accountId: string) => void;
  label?: string;
}) {
  const accounts = useLiveQuery(() => bankAccountRepository.options(), []);
  if (!accounts || accounts.length === 0) return null;

  return (
    <Field label={label} hint="Leave blank if it is not known — it shows as unattributed">
      <SelectInput value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Not recorded</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </SelectInput>
    </Field>
  );
}
