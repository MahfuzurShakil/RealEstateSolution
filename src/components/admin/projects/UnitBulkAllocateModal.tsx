'use client';

import { useEffect, useState } from 'react';
import { Handshake } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import {
  ALLOCATION_TYPES,
  FOR_SALE_BY,
  type AllocationType,
  type ForSaleBy,
  type Land,
  type Landowner,
} from '@/lib/db/types';
import { ALLOCATION_TYPE_LABEL, FOR_SALE_BY_LABEL } from '@/lib/domain/project';
import { projectRepository, unitRepository } from '@/lib/repositories';

/**
 * Bulk allocation — the second half of the 2026-09-01 decision: select units,
 * mark them landowner share and pick the owner. This is what the JV
 * target-vs-actual check on the project page reads.
 *
 * Mounted only while open, so the fields start from their defaults each time.
 *
 * A landowner's own flats default to `owner_direct`: the developer does not
 * sell them, so they must stay out of the company's revenue roll-up (Section
 * 8.3, "শুধু Company-owned sale").
 */
export function UnitBulkAllocateModal({
  open,
  projectId,
  unitIds,
  onClose,
}: {
  open: boolean;
  /** scopes the landowner list to the owners of this project's own land */
  projectId: string;
  unitIds: string[];
  onClose: () => void;
}) {
  const [allocationType, setAllocationType] = useState<AllocationType>('landowner_share');
  const [ownerId, setOwnerId] = useState('');
  const [forSaleBy, setForSaleBy] = useState<ForSaleBy>('owner_direct');
  const [owners, setOwners] = useState<
    Array<{ owner: Landowner; lands: Array<{ land: Land; share_pct: number }> }>
  >([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  /*
   * Only the owners of the land this project sits on. Offering every landowner
   * in the system let a flat be handed to someone with no stake here, and the
   * JV target-vs-actual check counts per owner, so the mistake lands in the
   * one screen a joint venture is argued from.
   */
  useEffect(() => {
    projectRepository.landownersForProject(projectId).then(setOwners);
  }, [projectId]);

  const isLandowner = allocationType === 'landowner_share';

  async function apply() {
    if (isLandowner && !ownerId) return setError('Pick the landowner these flats belong to');
    setBusy(true);
    try {
      await unitRepository.bulkAllocate(unitIds, {
        allocation_type: allocationType,
        allocated_to_owner_id: isLandowner ? ownerId : null,
        for_sale_by: forSaleBy,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Allocate units"
      subtitle={`${unitIds.length} unit${unitIds.length === 1 ? '' : 's'} selected`}
      icon={Handshake}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={busy}>
            {busy ? 'Applying…' : 'Apply to selection'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Allocation">
          <SelectInput
            value={allocationType}
            onChange={(e) => {
              const value = e.target.value as AllocationType;
              setAllocationType(value);
              setForSaleBy(value === 'landowner_share' ? 'owner_direct' : 'company');
            }}
          >
            {ALLOCATION_TYPES.map((a) => (
              <option key={a} value={a}>
                {ALLOCATION_TYPE_LABEL[a]}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field label="Landowner" required={isLandowner}>
          <SelectInput
            value={ownerId}
            disabled={!isLandowner}
            onChange={(e) => setOwnerId(e.target.value)}
          >
            <option value="">—</option>
            {owners.map(({ owner, lands }) => (
              <option key={owner.id} value={owner.id}>
                {owner.name} — {lands.map((l) => `${l.land.code} ${l.share_pct}%`).join(', ')}
              </option>
            ))}
          </SelectInput>
        </Field>
        {isLandowner && owners.length === 0 && (
          <p className="text-xs text-amber-700">
            No landowner is attached to this project&rsquo;s land yet. Link the land on the project,
            and record its owners on the land record, before allocating a landowner share.
          </p>
        )}

        <Field
          label="Who sells it"
          hint="A landowner's own flat stays out of the company's sales and collections."
        >
          <SelectInput
            value={forSaleBy}
            onChange={(e) => setForSaleBy(e.target.value as ForSaleBy)}
          >
            {FOR_SALE_BY.map((v) => (
              <option key={v} value={v}>
                {FOR_SALE_BY_LABEL[v]}
              </option>
            ))}
          </SelectInput>
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}
