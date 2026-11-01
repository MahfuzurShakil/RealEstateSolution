import type { Customer, ShareSigningRecord } from '../db/types';

/*
 * What a signed agreement records about the customer and the signing, shared
 * by Share Sale and bookings (BUYER-PORTAL-PLAN.md §2.7): the KYC written on
 * the paper and the signatures, witnesses and stamp at its foot.
 */

export const KYC_FIELDS = [
  'email', 'nid', 'tin', 'date_of_birth', 'profession', 'address', 'permanent_address', 'father_or_spouse_name',
  'nominee_name', 'nominee_relation', 'nominee_phone', 'nominee_nid', 'bank_name', 'bank_branch', 'bank_account', 'kyc_verified_on',
] as const;
export type KycField = (typeof KYC_FIELDS)[number];

export function cleanKyc(c: Partial<Pick<Customer, KycField>>): Partial<Pick<Customer, KycField>> {
  return Object.fromEntries(KYC_FIELDS.map((k) => [k, typeof c[k] === 'string' ? (c[k] as string).trim() || null : (c[k] ?? null)]));
}

export function cleanSigning(s: ShareSigningRecord): ShareSigningRecord {
  const t = (v: string | null | undefined) => v?.trim() || null;
  const witnesses = s.witnesses.map((w) => ({ name: w.name.trim(), id_or_phone: t(w.id_or_phone), address: t(w.address) })).filter((w) => w.name);
  if (!s.place?.trim()) throw new Error('Enter where the agreement was signed.');
  if (!s.company_signatory?.trim()) throw new Error('Enter who signed for the company.');
  if (witnesses.length < 2) throw new Error('An agreement is witnessed by two people — enter both witnesses.');
  const stamp = s.stamp_value != null && String(s.stamp_value) !== '' ? Number(s.stamp_value) : null;
  if (stamp != null && !(stamp >= 0)) throw new Error('The stamp paper value cannot be negative.');
  return {
    place: s.place.trim(),
    company_signatory: s.company_signatory.trim(),
    company_signatory_title: t(s.company_signatory_title),
    witnesses,
    stamp_value: stamp,
    stamp_serial: t(s.stamp_serial),
    notarized_on: t(s.notarized_on),
    notary_name: t(s.notary_name),
    attorney_name: t(s.attorney_name),
  };
}

