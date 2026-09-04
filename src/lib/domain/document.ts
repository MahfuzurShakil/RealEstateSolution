/**
 * Printed-document helpers (Tier 3.6).
 *
 * Pure functions only — no I/O, no Dexie. What a receipt or voucher *says*
 * lives here; where the data comes from is `repositories/print.repository.ts`.
 */

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/** 0–99. */
function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const tens = TENS[Math.floor(n / 10)];
  const rest = ONES[n % 10];
  return rest ? `${tens} ${rest}` : tens;
}

/** 0–999. */
function threeDigits(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (!hundreds) return twoDigits(rest);
  const head = `${ONES[hundreds]} Hundred`;
  return rest ? `${head} ${twoDigits(rest)}` : head;
}

/**
 * A whole number in South Asian units — crore, lakh, thousand.
 *
 * Deliberately *not* the Western scale: a receipt handed to a buyer in Dhaka
 * reads "Fifteen Lakh", not "One Million Five Hundred Thousand". Note that
 * `formatBdt` still groups the figure the Western way (`BDT 1,500,000`) —
 * that grouping is an open decision recorded in OPEN-ITEMS §0b, and the words
 * here follow the market rather than wait for it.
 */
function wholeNumberInWords(value: number): string {
  if (value === 0) return 'Zero';

  const parts: string[] = [];
  const crore = Math.floor(value / 10000000);
  const lakh = Math.floor((value % 10000000) / 100000);
  const thousand = Math.floor((value % 100000) / 1000);
  const rest = value % 1000;

  // recursion terminates: the crore count is always smaller than the value itself
  if (crore) parts.push(`${wholeNumberInWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));

  return parts.join(' ');
}

/**
 * "Taka Fifteen Lakh Fifty Thousand Only" — the line a Bangladeshi receipt
 * carries beside the figure so the figure cannot be altered by a pen stroke.
 *
 * Paisa are spelled out only when they are non-zero; every money value in the
 * app is rounded to two decimals by `money()` in the procurement domain, so
 * anything finer than a paisa is a rounding artefact and is dropped.
 */
export function amountInWords(amount?: number | null, currencyWord = 'Taka'): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';

  const negative = amount < 0;
  const abs = Math.abs(Number(amount));
  const whole = Math.floor(abs);
  const paisa = Math.round((abs - whole) * 100);

  let words = `${currencyWord} ${wholeNumberInWords(whole)}`;
  if (paisa > 0) words += ` and ${twoDigits(paisa)} Paisa`;
  if (negative) words = `Minus ${words}`;

  return `${words} Only`;
}
