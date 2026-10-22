'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { Field, SelectInput } from '@/components/ui/Field';
import { LEAD_STATUS_META } from '@/lib/domain/lead';
import { customerRepository, leadRepository } from '@/lib/repositories';
import { formatPhone } from '@/lib/utils/format';

/** A lead picked as the buyer is carried as `lead:<id>`; anything else is a customer id. */
const LEAD_PREFIX = 'lead:';

export function buyerValueForLead(leadId: string): string {
  return `${LEAD_PREFIX}${leadId}`;
}

/** What the booking repository needs: a customer, or the lead to make one from. */
export function parseBuyer(value: string): { customer_id: string; lead_id: string | null } {
  return value.startsWith(LEAD_PREFIX)
    ? { customer_id: '', lead_id: value.slice(LEAD_PREFIX.length) }
    : { customer_id: value, lead_id: null };
}

/**
 * Who is buying (client, 2026-10-22). One list: existing customers, then open
 * leads that are not customers yet. Picking a lead is enough — saving the
 * booking makes the customer from it, so there is no separate "convert" step.
 */
export function BuyerSelect({
  value,
  onChange,
  error,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  const options = useLiveQuery(async () => {
    const [customers, leads] = await Promise.all([customerRepository.list(), leadRepository.getAll()]);
    const customerPhones = new Set(customers.map((c) => c.phone.replace(/\D/g, '')));
    const openLeads = leads
      .filter((l) => l.status !== 'lost' && l.status !== 'booked')
      .filter((l) => !customerPhones.has(l.phone.replace(/\D/g, '')))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { customers, openLeads };
  }, []);

  return (
    <Field
      label="Buyer"
      required
      error={error}
      hint={
        value.startsWith(LEAD_PREFIX)
          ? 'A customer record is made from this lead when the booking is saved.'
          : 'An existing customer, or a lead from the sales pipeline.'
      }
    >
      <SelectInput
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        invalid={Boolean(error)}
      >
        <option value="">Pick the buyer</option>
        {(options?.customers.length ?? 0) > 0 && (
          <optgroup label="Customers">
            {options!.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.code}
              </option>
            ))}
          </optgroup>
        )}
        {(options?.openLeads.length ?? 0) > 0 && (
          <optgroup label="Leads (not customers yet)">
            {options!.openLeads.map((l) => (
              <option key={l.id} value={buyerValueForLead(l.id)}>
                {l.name} — {formatPhone(l.phone)} · {LEAD_STATUS_META[l.status].label}
              </option>
            ))}
          </optgroup>
        )}
      </SelectInput>
    </Field>
  );
}
