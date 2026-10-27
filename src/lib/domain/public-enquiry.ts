/* ------------------------------------------------------------------ *
 * Website enquiries (PUBLIC-WEBSITE-MASTER-PLAN.md §8)
 *
 * Pure rules shared by the enquiry modal and the public inquiry repository,
 * so the form refuses exactly what the repository would.
 * ------------------------------------------------------------------ */

/** Digits only, with a Bangladeshi number brought to its local 01… form. */
function bdDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('880')) return `0${digits.slice(3)}`;
  if (digits.length === 10 && digits.startsWith('1')) return `0${digits}`;
  return digits;
}

/** A Bangladeshi mobile: 01 + operator digit 3–9 + 8 digits ("01711-223344", "+8801711223344"). */
export function isBdMobile(phone: string): boolean {
  return /^01[3-9]\d{8}$/.test(bdDigits(phone));
}

/** Any country's number, for buyers abroad: 8–15 digits (E.164 length). */
export function isIntlPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export const VISIT_SLOTS = ['morning', 'afternoon', 'evening'] as const;
export type VisitSlot = (typeof VISIT_SLOTS)[number];

export const CALLBACK_TIMES = ['morning', 'afternoon', 'evening', 'any'] as const;
export type CallbackTime = (typeof CALLBACK_TIMES)[number];

/** YYYY-MM-DD in local time — `toISOString` would shift the day east of UTC. */
export function localIsoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * The next 14 days a visit can be booked for, starting tomorrow. Friday is the
 * weekly holiday, so it is listed but closed — the buyer sees why the gap is
 * there instead of wondering where the day went.
 */
export function visitDays(today = new Date()): { date: string; closed: boolean }[] {
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i + 1);
    return { date: localIsoDate(d), closed: d.getDay() === 5 };
  });
}

/** "12 Nov" — how the visit date reads in the lead note. */
export function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Read once per tab: the campaign tags a visitor landed with (master plan §10.2). */
export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'] as const;
export type Utm = Partial<Record<(typeof UTM_KEYS)[number], string>>;
