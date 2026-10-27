'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, Inbox, MapPin, PhoneCall, Ruler, Signpost, XCircle } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, TextArea } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubTabs } from '@/components/ui/SubTabs';
import type { LandOffer, LandOfferStatus } from '@/lib/db/types';
import { landOfferRepository } from '@/lib/repositories';
import { formatDate } from '@/lib/utils/format';

/**
 * Land offers (W8): landowners' offers from the website's /landowners form.
 * Nothing here is a land yet. The land team rings the owner, marks the offer
 * contacted, and then either declines it (with a reason) or adds it as a land,
 * which opens Add Land prefilled and links the two.
 */
type Filter = 'open' | 'converted' | 'declined' | 'all';

const STATUS: Record<LandOfferStatus, { label: string; tone: BadgeTone }> = {
  new: { label: 'New', tone: 'blue' },
  contacted: { label: 'Contacted', tone: 'amber' },
  converted: { label: 'Added as land', tone: 'green' },
  declined: { label: 'Declined', tone: 'neutral' },
};
const OFFER_TYPE: Record<LandOffer['offer_type'], string> = { joint_venture: 'Joint venture', sale: 'Outright sale', either: 'JV or sale' };
const PAPER: Record<string, string> = { deed: 'Deed', khatian: 'Khatian', mutation: 'Mutation', land_tax: 'Land tax', survey_map: 'Survey map' };

export default function LandOffersPage() {
  const [filter, setFilter] = useState<Filter>('open');
  const offers = useLiveQuery(() => landOfferRepository.list(filter), [filter]);
  const all = useLiveQuery(() => landOfferRepository.list('all'), []);
  const [declining, setDeclining] = useState<LandOffer | null>(null);
  const [reason, setReason] = useState('');

  const count = (f: Filter) => (all ?? []).filter((o) => (f === 'all' ? true : f === 'open' ? o.status === 'new' || o.status === 'contacted' : f === 'converted' ? o.status === 'converted' : o.status === 'declined')).length;

  return (
    <>
      <PageHeader
        title="Land Offers"
        subtitle="Offers landowners sent from the website. Call the owner, then add the land to the pipeline or decline the offer."
      />
      <SubTabs
        tabs={[
          { key: 'open', label: `Open (${count('open')})` },
          { key: 'converted', label: `Added as land (${count('converted')})` },
          { key: 'declined', label: `Declined (${count('declined')})` },
          { key: 'all', label: `All (${count('all')})` },
        ]}
        active={filter}
        onChange={setFilter}
      />

      {offers === undefined ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : offers.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={filter === 'open' ? 'No offers waiting' : 'Nothing here'}
          description="Offers sent from the website’s “For landowners” page appear here."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {offers.map((o) => (
            <Card key={o.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-ink-muted">
                    {o.code} · {formatDate(o.created_at)}
                  </p>
                  <p className="mt-0.5 text-base font-semibold text-ink">{o.owner_name}</p>
                  <a href={`tel:${o.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 text-sm text-admin-700 hover:underline">
                    <PhoneCall className="size-3.5" /> {o.phone}
                  </a>
                </div>
                <Badge tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Badge>
              </div>

              <ul className="mt-4 space-y-1.5 text-sm text-ink">
                <li className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-ink-muted" /> {o.location}
                </li>
                {(o.land_size || o.front_road_width_ft) && (
                  <li className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    {o.land_size && (
                      <span className="inline-flex items-center gap-2">
                        <Ruler className="size-4 text-ink-muted" /> {o.land_size} {o.land_size_unit}
                      </span>
                    )}
                    {o.front_road_width_ft && (
                      <span className="inline-flex items-center gap-2">
                        <Signpost className="size-4 text-ink-muted" /> {o.front_road_width_ft} ft road
                      </span>
                    )}
                  </li>
                )}
              </ul>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone="teal">{OFFER_TYPE[o.offer_type]}</Badge>
                {o.papers.map((p) => (
                  <Badge key={p} tone="neutral">
                    {PAPER[p] ?? p}
                  </Badge>
                ))}
              </div>
              {o.message && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-ink-muted">“{o.message}”</p>}
              {o.notes && (
                <p className="mt-3 text-xs text-ink-muted">
                  <span className="font-medium text-ink">Note:</span> {o.notes}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2 border-t border-hairline pt-4">
                {o.status === 'converted' && o.land_id ? (
                  <Link href={`/admin/lands/${o.land_id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-admin-700 hover:underline">
                    Open the land <ArrowRight className="size-4" />
                  </Link>
                ) : (
                  <>
                    <Link
                      href={`/admin/lands/new?offer=${o.id}`}
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-admin-600 px-3.5 text-sm font-medium text-white hover:bg-admin-700"
                    >
                      Add as land <ArrowRight className="size-4" />
                    </Link>
                    {o.status === 'new' && (
                      <Button variant="outline" size="sm" onClick={() => landOfferRepository.setStatus(o.id, 'contacted')}>
                        Mark contacted
                      </Button>
                    )}
                    {o.status !== 'declined' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setReason(o.notes ?? '');
                          setDeclining(o);
                        }}
                      >
                        <XCircle className="size-4" /> Decline
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => landOfferRepository.setStatus(o.id, 'contacted')}>
                        Reopen
                      </Button>
                    )}
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={declining !== null}
        tone="warning"
        title="Decline this offer"
        subtitle={declining ? `${declining.code} · ${declining.owner_name}` : undefined}
        confirmLabel="Decline offer"
        disabled={!reason.trim()}
        onConfirm={async () => {
          if (declining) await landOfferRepository.setStatus(declining.id, 'declined', reason);
          setDeclining(null);
        }}
        onCancel={() => setDeclining(null)}
      >
        <Field label="Why" required hint="For the record — the owner is not sent this.">
          <TextArea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Below 3 katha, road too narrow for a building" />
        </Field>
      </ConfirmDialog>
    </>
  );
}
