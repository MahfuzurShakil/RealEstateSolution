/** Display formatting helpers (money is BDT, kept as a plain number in storage). */

/**
 * Amounts are always shown in full.
 *
 * Compact notation ("BDT 10M") used to be an option here and was used on the
 * finance tables and tiles. It was removed deliberately: an accountant could
 * not add a column, a BDT 8M cell contradicted the BDT 8,424,000 banner above
 * it, and a receipt for BDT 337,000 moved nothing on screen. Money that cannot
 * be reconciled by eye is worse than money that takes more room.
 */
export function formatBdt(amount?: number | null): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * A *rate* — unit price, weighted-average cost — where the paisa matter.
 *
 * `formatBdt` rounds to whole taka, which is right for a total and wrong for a
 * rate: a brick bought at BDT 13.50 displayed as "BDT 14" stops multiplying
 * out against its own line total (40,000 × 13.50 = 540,000, not 560,000), and
 * the clerk reconciling the supplier's bill hunts a BDT 20,000 gap that does
 * not exist. Trailing ".00" is dropped so whole rates stay clean.
 */
export function formatBdtRate(amount?: number | null): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * What a typed amount actually says, in the units this market speaks in.
 *
 * Bangladesh counts money in lakh and crore, not thousands and millions — the
 * demo's own lead notes say "1.85 কোটি", because that is how the conversation
 * happens. A money field on a form is a row of digits with no grouping while
 * it is being typed, so "45000000" and "450000000" look the same at a glance
 * and a land gets bought for ten times its price.
 *
 * This is an **input aid**, shown under the field being typed into. It is not
 * a display format: stored and displayed amounts stay in full (see the note on
 * `formatBdt`), so nothing here reintroduces compact money in a table.
 */
export function formatTakaWords(amount?: number | null): string {
  if (amount === null || amount === undefined || Number.isNaN(amount) || amount === 0) return '';

  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  // trims a trailing ".00" so a round figure does not read "4.00 crore"
  const trim = (n: number) => String(Number(n.toFixed(2)));

  if (abs >= 10000000) return `${sign}${trim(abs / 10000000)} crore`;
  if (abs >= 100000) return `${sign}${trim(abs / 100000)} lakh`;
  if (abs >= 1000) return `${sign}${trim(abs / 1000)} thousand`;
  return '';
}

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** 'site_visit_done' -> 'Site Visit Done' */
export function humanize(value?: string | null): string {
  if (!value) return '—';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Today in the user's own timezone as YYYY-MM-DD (toISOString would give UTC). */
export function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * BD mobile numbers are stored digits-only (the dedup key) but read as
 * "01711 223344", so display goes through here.
 */
export function formatPhone(phone?: string | null): string {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  return digits.length === 11 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : phone;
}
