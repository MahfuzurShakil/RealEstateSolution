'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BadgeCheck, Handshake, Landmark, Lock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { LandEventDialog } from '@/components/admin/lands/LandEventDialog';
import type { Land } from '@/lib/db/types';
import { landIsHeld } from '@/lib/domain/land';
import { landPipelineRepository, landStatusEventRepository } from '@/lib/repositories';
import { formatBdt, formatDate } from '@/lib/utils/format';

/**
 * Where the deal is closed (L7): registration for a direct purchase, signing
 * for a joint venture.
 *
 * These stay manual because nothing else in the system can know a deed was
 * registered. What the card adds is the reason it cannot be done yet — DD-004,
 * and for a purchase the ACQ-003 settlement schedule — stated before anybody
 * clicks, and once done, the record itself.
 */
export function LandClosingCard({ land }: { land: Land }) {
  const [open, setOpen] = useState(false);
  const isJv = land.acquisition_type === 'joint_venture';

  const blocked = useLiveQuery(
    () => landPipelineRepository.closingBlockReason(land.id),
    [land.id, land.status],
  );
  const event = useLiveQuery(
    () => landStatusEventRepository.latestForStatus(land.id, 'acquired'),
    [land.id, land.status],
  );

  const closed = landIsHeld(land.status) || land.status === 'disposed';
  const title = isJv ? 'JV signing' : 'Registration';

  return (
    <Card>
      <CardHeader title={title} />
      {closed ? (
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <BadgeCheck className="size-5" />
          </span>
          <dl className="grid flex-1 gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-ink-muted">{isJv ? 'Signed on' : 'Registered on'}</dt>
              <dd className="text-sm font-medium text-ink">{formatDate(event?.event_date)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">{isJv ? 'Agreement reference' : 'Deed / dolil no.'}</dt>
              <dd className="text-sm font-medium text-ink">{event?.reference_no ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">{isJv ? 'Cash to owner' : 'Amount'}</dt>
              <dd className="text-sm font-medium tabular-nums text-ink">{formatBdt(event?.amount ?? land.final_agreed_amount)}</dd>
            </div>
            {event?.remarks && (
              <p className="whitespace-pre-wrap text-sm text-ink-muted sm:col-span-3">{event.remarks}</p>
            )}
          </dl>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-admin-50 text-admin-600">
              {isJv ? <Handshake className="size-5" /> : <Landmark className="size-5" />}
            </span>
            <p className="min-w-0 flex-1 text-sm text-ink-muted">
              {isJv
                ? 'Record the signed JV agreement — the share split and any cash payable to the owner. The land becomes JV Signed.'
                : 'Record the registered deed. The land becomes Acquired.'}
            </p>
            <Button disabled={blocked !== null} onClick={() => setOpen(true)}>
              {isJv ? 'Record JV signing' : 'Record registration'}
            </Button>
          </div>
          {blocked && (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              <Lock className="mt-0.5 size-4 shrink-0" />
              <span>{blocked}</span>
            </p>
          )}
        </>
      )}
      {open && <LandEventDialog land={land} target="acquired" onClose={() => setOpen(false)} />}
    </Card>
  );
}
