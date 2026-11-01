import type { PaymentMethod } from '@/lib/domain/investor-portal';

/** A stable, provider-looking transaction ID from a seed string. */
export function demoReference(method: PaymentMethod, seed: string): string {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const alnum = (len: number) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    let x = h;
    for (let i = 0; i < len; i++) {
      x = Math.imul(x ^ (x >>> 13), 1274126177) >>> 0;
      s += chars[x % chars.length];
    }
    return s;
  };
  const digits = (len: number) => String(h).padStart(len, '7').slice(-len);
  switch (method) {
    case 'bkash':
      return alnum(10);
    case 'nagad':
      return `7${alnum(7)}`;
    case 'rocket':
      return digits(10);
    case 'card':
      return `AUTH ${digits(6)}`;
    case 'internet_banking':
      return `IB${digits(10)}`;
    case 'cheque':
      return `CHQ ${digits(7)}`;
    default:
      return `DEP-${digits(8)}`;
  }
}
