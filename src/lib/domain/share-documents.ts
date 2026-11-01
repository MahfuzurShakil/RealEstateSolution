import type { CustomerUpload, CustomerUploadKind } from '../db/types';

/*
 * A share buyer's file (PROJECT-SHARE-SALE-PLAN.md §4a), shared by the admin
 * Share Sale screens and the Customer Portal.
 *
 * Customer papers (identity, photo, tax, nominee, payout bank) are kept once
 * and serve every purchase. Purchase papers belong to one agreement: the
 * signed agreement on non-judicial stamp paper, the allotment letter, the
 * signed deed of share ownership, the down-payment receipt, post-dated
 * cheques, the source-of-funds declaration and, when someone signs for the
 * customer, the power of attorney.
 */

export type ShareDocScope = 'customer' | 'purchase';

export interface ShareDocMeta {
  label: string;
  scope: ShareDocScope;
  /** what the office needs on file before the agreement can be signed */
  required_to_sign: boolean;
  hint: string;
  /** a customer may send it from the portal; the rest only the office files */
  customer_may_upload: boolean;
}

export const SHARE_DOC_META: Record<CustomerUploadKind, ShareDocMeta> = {
  id_document: { label: 'NID / passport copy', scope: 'customer', required_to_sign: true, hint: 'Both sides of the NID, or the passport photo page', customer_may_upload: true },
  photo: { label: 'Passport-size photograph', scope: 'customer', required_to_sign: true, hint: 'Recent, for the agreement and the share certificate', customer_may_upload: true },
  tin: { label: 'e-TIN certificate', scope: 'customer', required_to_sign: false, hint: 'Needed for the tax return on the investment', customer_may_upload: true },
  address_proof: { label: 'Proof of address', scope: 'customer', required_to_sign: false, hint: 'A recent utility bill or rental deed', customer_may_upload: true },
  nominee_id: { label: 'Nominee NID & photo', scope: 'customer', required_to_sign: false, hint: 'Required when a nominee is named', customer_may_upload: true },
  bank_proof: { label: 'Bank account proof', scope: 'customer', required_to_sign: false, hint: 'A cheque leaf or statement page, for payouts', customer_may_upload: true },
  signed_copy: { label: 'Signed share purchase agreement', scope: 'purchase', required_to_sign: true, hint: 'Signed by both sides and the witnesses, on stamp paper, notarized', customer_may_upload: true },
  allotment_letter: { label: 'Share allotment letter', scope: 'purchase', required_to_sign: false, hint: 'Issued by the company with the agreement', customer_may_upload: false },
  deed: { label: 'Deed of share ownership', scope: 'purchase', required_to_sign: false, hint: 'Signed deed recording the shares held', customer_may_upload: false },
  payment_proof: { label: 'Payment receipt / deposit slip', scope: 'purchase', required_to_sign: false, hint: 'Money receipt, bank deposit slip or pay order', customer_may_upload: true },
  pdc: { label: 'Post-dated cheques (copies)', scope: 'purchase', required_to_sign: false, hint: 'Copies of cheques given for the installments', customer_may_upload: true },
  source_of_funds: { label: 'Source of funds declaration', scope: 'purchase', required_to_sign: false, hint: 'Signed declaration of where the money comes from', customer_may_upload: true },
  power_of_attorney: { label: 'Power of attorney', scope: 'purchase', required_to_sign: false, hint: 'Required when someone signs for the customer', customer_may_upload: true },
  other: { label: 'Other document', scope: 'purchase', required_to_sign: false, hint: 'Anything else for this purchase', customer_may_upload: true },
};

export const SHARE_DOC_KINDS = Object.keys(SHARE_DOC_META) as CustomerUploadKind[];
export const shareDocScope = (kind: CustomerUploadKind): ShareDocScope => SHARE_DOC_META[kind].scope;

export interface ChecklistItem {
  kind: CustomerUploadKind;
  meta: ShareDocMeta;
  /** needed before signing, for this purchase */
  required: boolean;
  /** files on record for it, newest first; sent-back files included */
  files: CustomerUpload[];
  /** a file is on record that has not been sent back */
  done: boolean;
}

/**
 * What one purchase's file holds and still lacks. Customer papers count from
 * any upload of that customer; purchase papers only from this purchase.
 * A nominee's ID becomes required once a nominee is named, a power of
 * attorney once someone signs for the customer.
 */
export function shareDocChecklist(
  uploads: CustomerUpload[],
  saleId: string,
  context: { has_nominee: boolean; by_attorney: boolean },
): ChecklistItem[] {
  return SHARE_DOC_KINDS.filter((k) => k !== 'other').map((kind) => {
    const meta = SHARE_DOC_META[kind];
    const files = uploads
      .filter((u) => u.kind === kind && (meta.scope === 'customer' || u.sale_id === saleId))
      .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
    const required = meta.required_to_sign || (kind === 'nominee_id' && context.has_nominee) || (kind === 'power_of_attorney' && context.by_attorney);
    return { kind, meta, required, files, done: files.some((f) => f.status !== 'rejected') };
  });
}

/** The required papers still missing; empty means the file is ready to sign. */
export function missingToSign(list: ChecklistItem[]): ChecklistItem[] {
  return list.filter((i) => i.required && !i.done);
}
