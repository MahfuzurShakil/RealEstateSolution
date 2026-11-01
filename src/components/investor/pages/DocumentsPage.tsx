'use client';

import type { HoldingView } from '@/lib/domain/investor-portal';
import { useCustomerPortal } from '../CustomerPortalProvider';
import { UploadButton, UploadList } from '../CustomerUploads';
import { DocumentList } from '../DocumentList';
import { PageHeading, Panel } from '../ui';

/** One investment's papers: what the office issued, then what the customer sent in. */
export function HoldingDocuments({ v, holdings }: { v: HoldingView; holdings: HoldingView[] }) {
  const { snapshot } = useCustomerPortal();
  const uploads = snapshot.uploads.filter((u) => u.holding_code === v.holding.code);
  return (
    <>
      <DocumentList docs={v.documents} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-site-line bg-site-ivory/60 px-5 py-3 sm:px-6">
        <p className="text-sm">
          <span className="font-semibold">Uploaded by you</span>
          <span className="text-site-muted"> · {uploads.length ? `${uploads.length} file${uploads.length > 1 ? 's' : ''}` : 'payment slips, ID copies, signed papers'}</span>
        </p>
        <UploadButton holdings={holdings} holdingCode={v.holding.code} size="sm" />
      </div>
      <UploadList uploads={uploads} />
    </>
  );
}

export function DocumentsPage() {
  const { portfolio } = useCustomerPortal();
  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Records"
        title="Documents"
        description="Your signed agreements, deeds, payment schedules and share certificates, project by project — and the documents you have sent us."
        actions={<UploadButton holdings={portfolio.holdings} />}
      />
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
