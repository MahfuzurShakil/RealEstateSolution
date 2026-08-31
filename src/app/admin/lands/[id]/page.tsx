'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Handshake, Pencil, Trash2, User } from 'lucide-react';
import { LandTimeline } from '@/components/admin/lands/LandTimeline';
import { LocationCard } from '@/components/ui/map/LocationCard';
import { DocumentsPanel } from '@/components/admin/documents/DocumentsPanel';
import { LandStatusCard } from '@/components/admin/lands/LandStatusCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PageHeader } from '@/components/ui/PageHeader';
import { ACQUISITION_TYPE_LABEL, LAND_SIZE_UNIT_LABEL } from '@/lib/domain/land';
import { landRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatDate } from '@/lib/utils/format';

type Tab = 'overview' | 'owners' | 'jv' | 'documents' | 'timeline';

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-hairline py-2.5 last:border-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-right text-sm font-medium text-ink">{value ?? '—'}</span>
    </div>
  );
}

/** Land detail — Design Reference A.8 (sidebar cards + tabbed main column). */
export default function LandDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('overview');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const land = useLiveQuery(() => landRepository.getWithRelations(id), [id]);

  if (land === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (!land) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">This land no longer exists.</p>
        <Link href="/admin/lands" className="mt-3 inline-block">
          <Button variant="outline" size="sm">
            <ArrowLeft className="size-4" /> Back to lands
          </Button>
        </Link>
      </Card>
    );
  }

  const isJv = land.acquisition_type === 'joint_venture';
  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'owners', label: `Owners (${land.owners.length})` },
    ...(isJv ? [{ key: 'jv' as Tab, label: 'Joint Venture' }] : []),
    { key: 'documents', label: 'Documents' },
    { key: 'timeline', label: 'Timeline' },
  ];

  return (
    <>
      <Link
        href="/admin/lands"
        className="mb-4 inline-flex items-center gap-2 text-sm text-ink-muted hover:text-admin-700"
      >
        <ArrowLeft className="size-4" /> Back to lands
      </Link>

      <PageHeader
        title={land.name}
        subtitle={`${land.code} · ${[land.location_area, land.location_district, land.location_division].filter(Boolean).join(', ')}`}
        action={
          <div className="flex gap-2">
            <Link href={`/admin/lands/${land.id}/edit`}>
              <Button variant="outline">
                <Pencil className="size-4" /> Edit
              </Button>
            </Link>
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" /> Delete
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 lg:order-1">
          <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-hairline bg-white p-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                  tab === t.key
                    ? 'bg-admin-500 text-white'
                    : 'text-ink-muted hover:bg-admin-50 hover:text-admin-700',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="space-y-5">
              <Card>
                <CardHeader title="Land Information" />
                <Row label="Reference name" value={land.name} />
                <Row label="Code" value={land.code} />
                <Row
                  label="Size"
                  value={`${land.land_size} ${LAND_SIZE_UNIT_LABEL[land.land_size_unit]}`}
                />
                <Row
                  label="Acquisition type"
                  value={ACQUISITION_TYPE_LABEL[land.acquisition_type]}
                />
                <Row label="Division" value={land.location_division} />
                <Row label="District" value={land.location_district} />
                <Row label="Area" value={land.location_area} />
                <Row label="Road" value={land.road} />
                <Row label="Mouza" value={land.mouza} />
                <Row label="Dag number" value={land.dag_number} />
                <Row label="Khatian number" value={land.khatian_number} />
                <Row
                  label="GPS"
                  value={land.gps_lat && land.gps_lng ? `${land.gps_lat}, ${land.gps_lng}` : '—'}
                />
              </Card>

              <Card>
                <CardHeader title="Commercials" />
                <Row label="Asking price" value={formatBdt(land.asking_price)} />
                <Row label="Negotiated price" value={formatBdt(land.negotiated_price)} />
                <Row label="Final agreed amount" value={formatBdt(land.final_agreed_amount)} />
                <p className="mt-3 text-xs text-ink-muted">
                  Payments and instalments against this land are tracked in the Finance module.
                </p>
              </Card>

              {(land.nearby_facilities || land.remarks) && (
                <Card>
                  <CardHeader title="Notes" />
                  {land.nearby_facilities && (
                    <div className="mb-4">
                      <p className="mb-1 text-sm font-medium text-ink">Nearby facilities</p>
                      <p className="whitespace-pre-wrap text-sm text-ink-muted">
                        {land.nearby_facilities}
                      </p>
                    </div>
                  )}
                  {land.remarks && (
                    <div>
                      <p className="mb-1 text-sm font-medium text-ink">Remarks</p>
                      <p className="whitespace-pre-wrap text-sm text-ink-muted">{land.remarks}</p>
                    </div>
                  )}
                </Card>
              )}
            </div>
          )}

          {tab === 'owners' && (
            <Card>
              <CardHeader
                title="Landowners"
                action={
                  <Link href={`/admin/lands/${land.id}/edit`}>
                    <Button variant="outline" size="sm">
                      <Pencil className="size-4" /> Manage
                    </Button>
                  </Link>
                }
              />
              {land.owners.length === 0 ? (
                <p className="text-sm text-ink-muted">No landowner linked to this land yet.</p>
              ) : (
                <ul className="space-y-3">
                  {land.owners.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center gap-3 rounded-xl border border-hairline p-3"
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-admin-50 text-admin-600">
                        <User className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">
                          {row.owner?.name ?? 'Unknown owner'}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {[row.owner?.phone, row.owner?.nid && `NID ${row.owner.nid}`]
                            .filter(Boolean)
                            .join(' · ') || 'No contact details'}
                        </p>
                      </div>
                      {row.is_primary_contact && <Badge tone="teal">Primary</Badge>}
                      <Badge>{row.ownership_share_pct}%</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {tab === 'jv' && (
            <Card>
              <CardHeader title="Joint Venture Details" />
              {!land.jv ? (
                <p className="text-sm text-ink-muted">
                  No JV terms recorded yet — add them from the edit form.
                </p>
              ) : (
                <>
                  <Row label="Developer share" value={`${land.jv.developer_share_pct}%`} />
                  <Row label="Landowner share" value={`${land.jv.landowner_share_pct}%`} />
                  <Row label="Agreement date" value={formatDate(land.jv.agreement_date)} />
                  <Row
                    label="Power of attorney"
                    value={
                      land.jv.power_of_attorney ? (
                        <Badge tone="green">Signed</Badge>
                      ) : (
                        <Badge tone="amber">Not signed</Badge>
                      )
                    }
                  />
                  <Row label="POA reference" value={land.jv.poa_reference} />
                </>
              )}
            </Card>
          )}

          {tab === 'timeline' && (
            <Card>
              <CardHeader title="Pipeline history" />
              <LandTimeline landId={land.id} />
            </Card>
          )}

          {tab === 'documents' && (
            <Card>
              <CardHeader title="Documents" />
              <DocumentsPanel entityType="land" entityId={land.id} />
            </Card>
          )}
        </div>

        <aside className="min-w-0 space-y-5 lg:order-2">
          <LandStatusCard land={land} />

          <LocationCard
            lat={land.gps_lat}
            lng={land.gps_lng}
            title={land.name}
            address={[land.location_area, land.location_district, land.location_division]
              .filter(Boolean)
              .join(', ')}
          />

          <Card>
            <CardHeader title="Summary" />
            <Row
              label="Size"
              value={`${land.land_size} ${LAND_SIZE_UNIT_LABEL[land.land_size_unit]}`}
            />
            <Row
              label="Price"
              value={formatBdt(land.negotiated_price ?? land.asking_price, { compact: true })}
            />
            <Row label="Owners" value={land.owners.length} />
            <Row label="Created" value={formatDate(land.created_at)} />
            <Row label="Last updated" value={formatDate(land.updated_at)} />
          </Card>

          {isJv && land.jv && (
            <Card>
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-admin-50 text-admin-600">
                  <Handshake className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-medium text-ink">JV split</p>
                  <p className="text-xs text-ink-muted">
                    Developer {land.jv.developer_share_pct}% · Owner {land.jv.landowner_share_pct}%
                  </p>
                </div>
              </div>
            </Card>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${land.code}`}
        subtitle={land.name}
        confirmLabel="Delete land"
        message="This deletes the land along with its owner links, JV terms, pipeline history and uploaded documents. It cannot be undone."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await landRepository.removeCascade(land.id);
          router.push('/admin/lands');
        }}
      />
    </>
  );
}
