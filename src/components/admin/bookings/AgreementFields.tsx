'use client';

import { Field, MoneyInput, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { SALE_PAYMENT_MODES, type Booking, type SalePaymentMode } from '@/lib/db/types';
import { SALE_PAYMENT_MODE_LABEL, addMonths, kistiAmount } from '@/lib/domain/booking';
import type { AgreementInput } from '@/lib/repositories';
import { formatBdt, formatDate } from '@/lib/utils/format';

/**
 * The agreement (চুক্তি) as typed — SALES-FLOW-PLAN.md S3.
 *
 * Shared by the booking form (optional, at booking time) and the Agreement tab's
 * popup (later), so the two can never ask for different things.
 */
export interface AgreementForm {
  agreement_date: string;
  agreement_no: string;
  payment_mode: SalePaymentMode;
  full_payment_due_date: string;
  installment_count: string;
  installment_amount: string;
  first_installment_date: string;
  handover_date: string;
  agreement_terms: string;
}

export function emptyAgreement(date: string): AgreementForm {
  return {
    agreement_date: date,
    agreement_no: '',
    payment_mode: 'installment',
    full_payment_due_date: '',
    installment_count: '',
    installment_amount: '',
    first_installment_date: addMonths(date, 1),
    handover_date: '',
    agreement_terms: '',
  };
}

export function agreementFromBooking(b: Booking, fallbackDate: string): AgreementForm {
  if (!b.agreement_date && !b.payment_mode) return emptyAgreement(fallbackDate);
  return {
    agreement_date: b.agreement_date ?? '',
    agreement_no: b.agreement_no ?? '',
    payment_mode: b.payment_mode ?? 'installment',
    full_payment_due_date: b.full_payment_due_date ?? '',
    installment_count: b.installment_count ? String(b.installment_count) : '',
    installment_amount: b.installment_amount ? String(b.installment_amount) : '',
    first_installment_date: b.first_installment_date ?? '',
    handover_date: b.handover_date ?? '',
    agreement_terms: b.agreement_terms ?? '',
  };
}

export function agreementInput(f: AgreementForm): AgreementInput {
  return {
    agreement_date: f.agreement_date || null,
    agreement_no: f.agreement_no,
    payment_mode: f.payment_mode,
    full_payment_due_date: f.full_payment_due_date || null,
    installment_count: Number(f.installment_count) || null,
    installment_amount: Number(f.installment_amount) || null,
    first_installment_date: f.first_installment_date || null,
    handover_date: f.handover_date || null,
    agreement_terms: f.agreement_terms,
  };
}

export function validateAgreement(f: AgreementForm): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.agreement_date) e.agreement_date = 'When was it signed?';
  if (f.payment_mode === 'full' && !f.full_payment_due_date) {
    e.full_payment_due_date = 'By when is the full price due?';
  }
  if (f.payment_mode === 'installment') {
    const count = Number(f.installment_count);
    if (!Number.isInteger(count) || count < 1 || count > 240) {
      e.installment_count = 'Enter 1 to 240 kisti';
    }
    if (f.installment_amount.trim() && !(Number(f.installment_amount) > 0)) {
      e.installment_amount = 'Must be more than zero';
    }
    if (!f.first_installment_date) e.first_installment_date = 'When is the first kisti due?';
  }
  return e;
}

export function AgreementFields({
  value,
  onChange,
  errors,
  finalPrice,
  bookingAmount,
}: {
  value: AgreementForm;
  onChange: (next: AgreementForm) => void;
  errors: Record<string, string>;
  /** to show what a kisti comes to when no amount is typed */
  finalPrice: number;
  bookingAmount: number;
}) {
  const set = <K extends keyof AgreementForm>(key: K, v: AgreementForm[K]) =>
    onChange({ ...value, [key]: v });

  const count = Number(value.installment_count) || 0;
  const each = kistiAmount({
    booking_date: '',
    final_price: finalPrice,
    booking_amount: bookingAmount,
    payment_mode: 'installment',
    installment_count: count,
    installment_amount: Number(value.installment_amount) || null,
    full_payment_due_date: null,
    first_installment_date: value.first_installment_date || null,
  });
  const lastDate =
    count > 0 && value.first_installment_date ? addMonths(value.first_installment_date, count - 1) : null;
  const typedTotal = bookingAmount + each * count;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Agreement date" required error={errors.agreement_date}>
          <TextInput
            type="date"
            value={value.agreement_date}
            onChange={(e) => set('agreement_date', e.target.value)}
            invalid={Boolean(errors.agreement_date)}
          />
        </Field>
        <Field label="Agreement no." hint="As written on the paper (optional)">
          <TextInput
            value={value.agreement_no}
            onChange={(e) => set('agreement_no', e.target.value)}
            placeholder="e.g. AGR-114"
          />
        </Field>
        <Field label="How the buyer pays" required>
          <SelectInput
            value={value.payment_mode}
            onChange={(e) => set('payment_mode', e.target.value as SalePaymentMode)}
          >
            {SALE_PAYMENT_MODES.map((m) => (
              <option key={m} value={m}>
                {SALE_PAYMENT_MODE_LABEL[m]}
              </option>
            ))}
          </SelectInput>
        </Field>

        {value.payment_mode === 'full' ? (
          <Field
            label="Full price due by"
            required
            error={errors.full_payment_due_date}
            hint="The whole balance after the booking money"
          >
            <TextInput
              type="date"
              value={value.full_payment_due_date}
              onChange={(e) => set('full_payment_due_date', e.target.value)}
              invalid={Boolean(errors.full_payment_due_date)}
            />
          </Field>
        ) : (
          <>
            <Field label="Number of kisti" required error={errors.installment_count}>
              <TextInput
                type="number"
                min="1"
                max="240"
                value={value.installment_count}
                onChange={(e) => set('installment_count', e.target.value)}
                placeholder="e.g. 24"
                invalid={Boolean(errors.installment_count)}
              />
            </Field>
            <Field
              label="Each kisti (BDT)"
              error={errors.installment_amount}
              hint={
                count > 0 && !value.installment_amount.trim()
                  ? `Blank = balance split evenly: ${formatBdt(Math.round(each))}`
                  : 'Blank = balance split evenly'
              }
            >
              <MoneyInput
                value={value.installment_amount}
                onChange={(e) => set('installment_amount', e.target.value)}
                invalid={Boolean(errors.installment_amount)}
              />
            </Field>
            <Field
              label="First kisti due"
              required
              error={errors.first_installment_date}
              hint={lastDate ? `Monthly, last one ${formatDate(lastDate)}` : 'Then the same day every month'}
            >
              <TextInput
                type="date"
                value={value.first_installment_date}
                onChange={(e) => set('first_installment_date', e.target.value)}
                invalid={Boolean(errors.first_installment_date)}
              />
            </Field>
          </>
        )}

        <Field label="Handover / registration by" hint="As promised in the agreement (optional)">
          <TextInput
            type="date"
            value={value.handover_date}
            onChange={(e) => set('handover_date', e.target.value)}
          />
        </Field>
      </div>

      {value.payment_mode === 'installment' &&
        count > 0 &&
        value.installment_amount.trim() &&
        Math.abs(typedTotal - finalPrice) > 1 && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
            Booking money {formatBdt(bookingAmount)} + {count} × {formatBdt(each)} ={' '}
            {formatBdt(typedTotal)}, but the final price is {formatBdt(finalPrice)}. The last kisti
            is taken as whatever closes the price.
          </p>
        )}

      <Field label="Other terms" hint="Anything else the agreement says — penalty, utility, parking…">
        <TextArea
          value={value.agreement_terms}
          onChange={(e) => set('agreement_terms', e.target.value)}
          placeholder="e.g. 2% per month late fee after 30 days; utility connection charged at actual cost"
        />
      </Field>
    </div>
  );
}
