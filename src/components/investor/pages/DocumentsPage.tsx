'use client';

import { CheckCircle2, Circle } from 'lucide-react';
import { SHARE_DOC_KINDS, SHARE_DOC_META, shareDocScope } from '@/lib/domain/share-documents';
import type { HoldingView } from '@/lib/domain/investor-portal';
import { useCustomerPortal } from '../CustomerPortalProvider';
import { UploadButton, UploadList } from '../CustomerUploads';
import { DocumentList } from '../DocumentList';
import { PageHeading, Panel } from '../ui';

/** One investment's papers: what the office issued and filed, then what the customer sent in. */
export function HoldingDocuments({ v, holdings }: { v: HoldingView; holdings: HoldingView[] }) {
  const { snapshot } = useCustomerPortal();
  const mine = snapshot.uploads.filter((u) => u.holding_code === v.holding.code);
  const office = mine.filter((u) => u.source === 'office');
  const sent = mine.filter((u) => u.source === 'customer');
  return (
    <>
      <DocumentList docs={v.documents} />
      {office.length > 0 && (
        <>
          <div className="border-t border-site-line bg-site-ivory/60 px-5 py-3 sm:px-6">
            <p className="text-sm">
              <span className="font-semibold">Signed papers from our office</span>
              <span className="text-site-muted"> · scans of the originals we keep for you</span>
            </p>
          </div>
          <UploadList uploads={office} />
        </>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-site-line bg-site-ivory/60 px-5 py-3 sm:px-6">
        <p className="text-sm">
          <span className="font-semibold">Uploaded by you</span>
          <span className="text-site-muted"> · {sent.length ? `${sent.length} file${sent.length > 1 ? 's' : ''}` : 'payment slips, cheque copies, signed papers'}</span>
        </p>
        <UploadButton holdings={holdings} holdingCode={v.holding.code} size="sm" />
      </div>
      <UploadList uploads={sent} />
    </>
  );
}

/**
 * The customer's own papers — identity, photo, tax, nominee, bank — kept once
 * and used for every investment, whoever put them on file.
 */
export function PersonalDocuments() {
  const { snapshot, portfolio } = useCustomerPortal();
  const personal = snapshot.uploads.filter((u) => shareDocScope(u.kind) === 'customer');
  const kinds = SHARE_DOC_KINDS.filter((k) => shareDocScope(k) === 'customer');
  const onFile = (k: (typeof kinds)[number]) => personal.some((u) => u.kind === k && u.status !== 'rejected');
  return (
    <Panel
      title={
        <span className="leading-tight">
          <span className="block">Personal papers</span>
          <span className="block text-xs font-medium text-site-muted">Kept on your customer file and used for all your investments</span>
        </span>
      }
      action={<UploadButton holdings={portfolio.holdings} scope="customer" size="sm" label="Upload" />}
      padded={false}
    >
      <ul className="grid gap-x-6 gap-y-2 px-5 py-4 text-sm sm:grid-cols-2 sm:px-6">
        {kinds.map((k) => (
          <li key={k} className="flex items-center gap-2">
            {onFile(k) ? <CheckCircle2 className="size-4 shrink-0 text-site-primary" aria-hidden /> : <Circle className="size-4 shrink-0 text-site-line" aria-hidden />}
            <span className={onFile(k) ? 'font-medium' : 'text-site-muted'}>{SHARE_DOC_META[k].label}</span>
          </li>
        ))}
      </ul>
      <div className="border-t border-site-line">
        <UploadList uploads={personal} />
      </div>
    </Panel>
  );
}

export function DocumentsPage() {
  const { portfolio } = useCustomerPortal();
  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Records"
        title="Documents"
        description="Your signed agreements, deeds, payment schedules and share certificates, project by project — your personal papers — and the documents you have sent us."
        actions={<UploadButton holdings={portfolio.holdings} />}
      />
      <PersonalDocuments />
      {portfolio.holdings.map((v) => (
        <Panel
          key={v.holding.code}
          title={
            <span className="leading-tight">
              <span className="block">{v.project.name}</span>
              <span className="tabular block text-xs font-medium text-site-muted">
                {v.holding.code} · Agreement {v.holding.agreement_no}
              </span>
            </span>
          }
          padded={false}
        >
          <HoldingDocuments v={v} holdings={portfolio.holdings} />
        </Panel>
      ))}
    </div>
  );
}
