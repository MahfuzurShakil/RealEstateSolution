'use client';

import {
  documentRepository,
  landJvRepository,
  landOwnerMappingRepository,
  landRepository,
  landStatusEventRepository,
  landownerRepository,
} from '../repositories';
import { getDb } from './database';
import { DEMO_LANDS, DEMO_OWNERS } from './demo-data';

/**
 * Loads the Bangladesh demo dataset (Module 1) so a fresh install opens with
 * something to look at instead of empty lists.
 *
 * It goes through the repositories like the UI does — codes are generated the
 * normal way (LND-YYYY-NNN) and nothing here bypasses the data-access layer.
 * Only the created_at values are back-dated afterwards, so the list shows a
 * believable spread of dates rather than everything landing today.
 */

/** Set once the user deliberately clears the data, so it is not re-seeded. */
const CLEARED_FLAG = 'realestate:demo-data-cleared';

export function demoDataWasCleared(): boolean {
  try {
    return localStorage.getItem(CLEARED_FLAG) === '1';
  } catch {
    return false;
  }
}

function setClearedFlag(value: boolean) {
  try {
    if (value) localStorage.setItem(CLEARED_FLAG, '1');
    else localStorage.removeItem(CLEARED_FLAG);
  } catch {
    /* private mode — the flag is a convenience, not a requirement */
  }
}

/** A small generated PNG so the Documents tab is not empty either. */
async function makeSamplePng(caption: string): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 520;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#0d919c';
  ctx.fillRect(0, 0, 800, 520);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(40, 40, 720, 440);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(caption, 400, 250);
  ctx.font = '20px sans-serif';
  ctx.fillText('Sample document — demo data', 400, 300);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

export async function seedDemoData(createdBy: string | null = null): Promise<void> {
  // owners first — lands reference them
  const ownerIds = new Map<string, string>();
  for (const owner of DEMO_OWNERS) {
    const saved = await landownerRepository.create(
      {
        name: owner.name,
        phone: owner.phone,
        nid: owner.nid,
        address: owner.address,
        notes: owner.notes ?? null,
      },
      createdBy,
    );
    ownerIds.set(owner.key, saved.id);
  }

  const db = getDb();

  for (const demo of DEMO_LANDS) {
    const land = await landRepository.create(
      {
        code: '',
        name: demo.name,
        location_division: demo.location_division,
        location_district: demo.location_district,
        location_area: demo.location_area,
        road: demo.road ?? null,
        mouza: demo.mouza ?? null,
        dag_number: demo.dag_number ?? null,
        khatian_number: demo.khatian_number ?? null,
        land_size: demo.land_size,
        land_size_unit: demo.land_size_unit,
        asking_price: demo.asking_price,
        negotiated_price: demo.negotiated_price ?? null,
        final_agreed_amount: demo.final_agreed_amount ?? null,
        gps_lat: demo.gps_lat ?? null,
        gps_lng: demo.gps_lng ?? null,
        nearby_facilities: demo.nearby_facilities ?? null,
        acquisition_type: demo.acquisition_type,
        status: demo.status,
        assigned_to: null,
        remarks: demo.remarks ?? null,
      },
      createdBy,
    );

    for (const row of demo.owners) {
      const ownerId = ownerIds.get(row.key);
      if (!ownerId) continue;
      await landOwnerMappingRepository.create(
        {
          land_id: land.id,
          owner_id: ownerId,
          ownership_share_pct: row.share,
          is_primary_contact: Boolean(row.primary),
        },
        createdBy,
      );
    }

    if (demo.jv) {
      await landJvRepository.create(
        {
          land_id: land.id,
          developer_share_pct: demo.jv.developer_share_pct,
          landowner_share_pct: demo.jv.landowner_share_pct,
          agreement_date: demo.jv.agreement_date,
          power_of_attorney: demo.jv.power_of_attorney,
          poa_reference: demo.jv.poa_reference ?? null,
        },
        createdBy,
      );
    }

    let previous = 'new' as (typeof demo.history)[number]['to_status'];
    for (const event of demo.history) {
      const saved = await landStatusEventRepository.create(
        {
          land_id: land.id,
          from_status: previous,
          to_status: event.to_status,
          event_date: event.event_date,
          performed_by: event.performed_by ?? null,
          amount: event.amount ?? null,
          reference_no: event.reference_no ?? null,
          remarks: event.remarks ?? null,
        },
        createdBy,
      );
      // log entries carry the date of the step, not the moment of seeding
      await db.land_status_history.update(saved.id, {
        created_at: `${event.event_date}T09:00:00.000Z`,
      });
      previous = event.to_status;
    }

    // a couple of sample attachments on the two closed deals
    if (demo.status === 'acquired' || demo.status === 'jv_signed') {
      const png = await makeSamplePng(demo.name);
      if (png) {
        const type = demo.status === 'jv_signed' ? 'jv_agreement' : 'dolil_deed';
        const fileName = `${type}-${land.code.toLowerCase()}.png`;
        await documentRepository.create(
          {
            entity_type: 'land',
            entity_id: land.id,
            document_type: type,
            custom_type_name: null,
            file_url: fileName,
            file_data: png,
            file_name: fileName,
            file_size: png.size,
            mime_type: 'image/png',
            is_public: false,
            uploaded_by: createdBy,
            uploaded_at: `${demo.history.at(-1)?.event_date ?? '2026-01-01'}T10:00:00.000Z`,
            notes: 'Scanned copy collected from the registry office',
          },
          createdBy,
        );
      }
    }

    await db.lands.update(land.id, { created_at: demo.created_at, updated_at: demo.created_at });
  }

  setClearedFlag(false);
}

/** Wipes every Module 1 record (master data and company settings stay). */
export async function clearDemoData(): Promise<void> {
  const db = getDb();
  await Promise.all([
    db.lands.clear(),
    db.landowners.clear(),
    db.land_owner_mapping.clear(),
    db.land_jv_details.clear(),
    db.land_status_history.clear(),
    db.documents.clear(),
  ]);
  setClearedFlag(true);
}

export async function resetDemoData(createdBy: string | null = null): Promise<void> {
  await clearDemoData();
  await seedDemoData(createdBy);
}
