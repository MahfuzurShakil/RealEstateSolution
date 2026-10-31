'use client';

import { useCustomerPortal } from '../CustomerPortalProvider';
import { DocumentList } from '../DocumentList';
import { PageHeading, Panel } from '../ui';

export function DocumentsPage() {
  const { portfolio } = useCustomerPortal();
  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Records"
        title="Documents"
        description="Your signed agreements, deeds, payment schedules and share certificates, project by project."
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
          <DocumentList docs={v.documents} />
        </Panel>
      ))}
    </div>
  );
}
