'use client';

import {
  bookingRepository,
  customerRepository,
  discountApprovalRuleRepository,
  documentRepository,
  landProjectMappingRepository,
  leadActivityRepository,
  leadRepository,
  projectRepository,
  projectStatusEventRepository,
  towerRepository,
  unitRepository,
  userRepository,
  landJvRepository,
  normalizePhone,
  landOwnerMappingRepository,
  landRepository,
  landStatusEventRepository,
  landownerRepository,
} from '../repositories';
import type { ProjectStatus } from './types';
import { getDb } from './database';
import { DEMO_LANDS, DEMO_OWNERS } from './demo-data';
import { DEMO_BOOKINGS, DEMO_CUSTOMERS, DEMO_DISCOUNT_RULES } from './demo-bookings';
import { DEMO_LEADS, DEMO_USERS } from './demo-leads';
import { DEMO_PROJECTS } from './demo-projects';

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
  const landIds = new Map<string, string>();

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
          jv_share_basis: demo.jv.jv_share_basis ?? 'flat_count',
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
    landIds.set(demo.name, land.id);
  }

  const { projectIds, unitIds } = await seedDemoProjects(landIds, ownerIds, createdBy);
  const { userIds, leadIdByPhone } = await seedDemoLeads(projectIds, unitIds, createdBy);
  await seedDemoBookings(projectIds, unitIds, userIds, leadIdByPhone, createdBy);

  setClearedFlag(false);
}

/**
 * Module 2 demo data. Units go through the same bulk generator the UI uses, so
 * what the demo shows is exactly what the feature produces — including the
 * deliberately mismatched JV allocation on the Agrabad project.
 */
async function seedDemoProjects(
  landIds: Map<string, string>,
  ownerIds: Map<string, string>,
  createdBy: string | null,
): Promise<{ projectIds: Map<string, string>; unitIds: Map<string, string> }> {
  const db = getDb();
  const projectIds = new Map<string, string>();
  /** keyed "Project Name::UNIT-CODE" so two projects can reuse a code */
  const allUnitIds = new Map<string, string>();

  for (const demo of DEMO_PROJECTS) {
    const project = await projectRepository.create(
      {
        code: '',
        name: demo.name,
        project_type: demo.project_type,
        total_land_area: demo.total_land_area ?? null,
        total_land_area_unit: 'katha',
        location_summary: demo.location_summary,
        expected_start_date: demo.expected_start_date,
        expected_completion_date: demo.expected_completion_date,
        actual_start_date: demo.actual_start_date ?? null,
        status: demo.status,
        project_manager: null,
        architect: demo.architect ?? null,
        surroundings: demo.surroundings ?? null,
        amenities: demo.amenities,
        cover_image_url: demo.cover_image_url ?? null,
        is_public: demo.is_public,
        is_featured: demo.is_featured,
      },
      createdBy,
    );

    // also flips those lands to `linked_to_project`
    await landProjectMappingRepository.setLandsForProject(
      project.id,
      demo.land_names.map((name) => landIds.get(name)).filter((id): id is string => Boolean(id)),
    );

    const unitIdByCode = new Map<string, string>();

    for (const demoTower of demo.towers) {
      const tower = await towerRepository.create(
        {
          project_id: project.id,
          name: demoTower.name,
          floor_count: demoTower.floor_count,
          status: demoTower.status,
          building_type: demoTower.building_type ?? null,
          unit_per_floor: demoTower.unit_per_floor ?? null,
          lift_count: demoTower.lift_count ?? null,
          electricity_backup: demoTower.electricity_backup ?? null,
          front_road_width_ft: demoTower.front_road_width_ft ?? null,
        },
        createdBy,
      );

      for (const pattern of demoTower.patterns) {
        const { created } = await unitRepository.bulkGenerate(
          tower.id,
          {
            prefix: pattern.prefix,
            separator: pattern.separator,
            floor_from: pattern.floor_from,
            floor_to: pattern.floor_to,
            excluded_floors: pattern.excluded_floors ?? [],
            rows: pattern.rows.map((row) => ({
              suffix: row.suffix,
              unit_type: row.unit_type,
              bedroom_count: String(row.bedroom_count),
              bathroom_count: String(row.bathroom_count),
              balcony_count: String(row.balcony_count),
              size_sqft: String(row.size_sqft),
              facing: row.facing,
              price_mode: 'per_sqft' as const,
              price_value: String(row.rate_per_sqft),
              parking_allocated: String(row.parking_allocated),
            })),
          },
          createdBy,
        );
        for (const unit of created) unitIdByCode.set(unit.code, unit.id);
      }
    }

    if (demo.landowner_allocation) {
      const ownerId = ownerIds.get(demo.landowner_allocation.owner_key);
      const ids = demo.landowner_allocation.unit_codes
        .map((code) => unitIdByCode.get(code))
        .filter((id): id is string => Boolean(id));
      if (ownerId && ids.length > 0) {
        await unitRepository.bulkAllocate(ids, {
          allocation_type: 'landowner_share',
          allocated_to_owner_id: ownerId,
          for_sale_by: 'owner_direct',
        });
      }
    }

    for (const [status, codes] of Object.entries(demo.unit_status_overrides ?? {})) {
      const ids = (codes ?? [])
        .map((code) => unitIdByCode.get(code))
        .filter((id): id is string => Boolean(id));
      if (ids.length > 0) await unitRepository.bulkSetStatus(ids, status as never);
    }

    await db.projects.update(project.id, {
      created_at: demo.created_at,
      updated_at: demo.created_at,
    });

    // a couple of attachments so the Documents tab is not empty either
    for (const type of ['architectural_plan', 'brochure'] as const) {
      const png = await makeSamplePng(`${demo.name} — ${type.replace(/_/g, ' ')}`);
      if (!png) continue;
      const fileName = `${type}-${project.code.toLowerCase()}.png`;
      await documentRepository.create(
        {
          entity_type: 'project',
          entity_id: project.id,
          document_type: type,
          custom_type_name: null,
          file_url: fileName,
          file_data: png,
          file_name: fileName,
          file_size: png.size,
          mime_type: 'image/png',
          // the brochure is what the public portal is allowed to show
          is_public: type === 'brochure' && demo.is_public,
          uploaded_by: createdBy,
          uploaded_at: demo.created_at,
          notes:
            type === 'brochure'
              ? 'Marketing brochure handed to buyers at the sales office'
              : 'Approved architectural drawing set',
        },
        createdBy,
      );
    }

    // pipeline trail, so the Timeline tab has something in it
    let previousStatus: ProjectStatus = 'planning';
    for (const event of demo.history ?? []) {
      const saved = await projectStatusEventRepository.create(
        {
          project_id: project.id,
          from_status: previousStatus,
          to_status: event.to_status,
          event_date: event.event_date,
          performed_by: event.performed_by ?? null,
          reference_no: event.reference_no ?? null,
          remarks: event.remarks ?? null,
        },
        createdBy,
      );
      // log entries carry the date of the step, not the moment of seeding
      await db.project_status_history.update(saved.id, {
        created_at: `${event.event_date}T09:00:00.000Z`,
      });
      previousStatus = event.to_status;
    }

    projectIds.set(demo.name, project.id);
    for (const [code, unitId] of unitIdByCode) allUnitIds.set(`${demo.name}::${code}`, unitId);
  }

  return { projectIds, unitIds: allUnitIds };
}

/**
 * Module 3 demo data — staff first, then the leads assigned to them.
 *
 * Follow-up dates are stored as offsets from the day the demo is loaded, so the
 * overdue / due-today / upcoming states stay true whenever it is opened.
 */
async function seedDemoLeads(
  projectIds: Map<string, string>,
  unitIds: Map<string, string>,
  createdBy: string | null,
): Promise<{ userIds: Map<string, string>; leadIdByPhone: Map<string, string> }> {
  const db = getDb();

  const userIds = new Map<string, string>();
  const leadIdByPhone = new Map<string, string>();

  for (const user of DEMO_USERS) {
    const saved = await userRepository.create(
      {
        name: user.name,
        phone: user.phone,
        email: user.email,
        // Phase A has no real auth (Section 0) — this is a placeholder
        password_hash: 'demo-no-auth',
        role: user.role,
        status: user.status,
        last_login_at: null,
      },
      createdBy,
    );
    userIds.set(user.key, saved.id);
  }

  for (const demo of DEMO_LEADS) {
    const projectId = demo.project_name ? (projectIds.get(demo.project_name) ?? null) : null;
    const unitId =
      demo.project_name && demo.unit_code
        ? (unitIds.get(`${demo.project_name}::${demo.unit_code}`) ?? null)
        : null;

    const lead = await leadRepository.create(
      {
        code: '',
        name: demo.name,
        phone: demo.phone,
        email: demo.email ?? null,
        source: demo.source,
        inquiry_message: demo.inquiry_message ?? null,
        interested_project_id: projectId,
        interested_unit_id: unitId,
        budget_range: demo.budget_range ?? null,
        assigned_to: demo.assigned_key ? (userIds.get(demo.assigned_key) ?? null) : null,
        status: demo.status,
        lost_reason: demo.lost_reason ?? null,
      },
      createdBy,
    );

    for (const activity of demo.activities) {
      const saved = await leadActivityRepository.create(
        {
          lead_id: lead.id,
          activity_type: activity.activity_type,
          notes: activity.notes,
          activity_date: daysFromToday(-activity.days_ago),
          next_follow_up_date:
            activity.follow_up_in_days === undefined
              ? null
              : daysFromToday(activity.follow_up_in_days).slice(0, 10),
        },
        createdBy,
      );
      await db.lead_activities.update(saved.id, {
        created_at: daysFromToday(-activity.days_ago),
      });
    }

    const createdAt = daysFromToday(-demo.created_days_ago);
    await db.leads.update(lead.id, { created_at: createdAt, updated_at: createdAt });
    leadIdByPhone.set(normalizePhone(demo.phone), lead.id);
  }

  return { userIds, leadIdByPhone };
}

/**
 * Module 4 demo data. Bookings go through `createBooking` / `decideDiscount` /
 * `cancel`, so the Section 5.6 side-effects (unit reserved, booked, released;
 * lead moved to booked) are produced by the real code path, not faked here.
 */
async function seedDemoBookings(
  projectIds: Map<string, string>,
  unitIds: Map<string, string>,
  userIds: Map<string, string>,
  leadIdByPhone: Map<string, string>,
  createdBy: string | null,
): Promise<void> {
  const db = getDb();

  // the discount ceilings the gating rule reads (Section 5.4)
  for (const rule of DEMO_DISCOUNT_RULES) {
    await discountApprovalRuleRepository.upsertForRole(rule.role, rule.max_discount_pct);
  }

  const customerIds = new Map<string, string>();
  for (const demo of DEMO_CUSTOMERS) {
    const saved = await customerRepository.create(
      {
        code: '',
        name: demo.name,
        phone: demo.phone,
        email: demo.email ?? null,
        nid: demo.nid ?? null,
        address: demo.address ?? null,
        profession: demo.profession ?? null,
        lead_id: demo.from_lead_phone
          ? (leadIdByPhone.get(normalizePhone(demo.from_lead_phone)) ?? null)
          : null,
      },
      createdBy,
    );
    customerIds.set(demo.key, saved.id);

    const createdAt = daysFromToday(-demo.created_days_ago);
    await db.customers.update(saved.id, { created_at: createdAt, updated_at: createdAt });
  }

  for (const demo of DEMO_BOOKINGS) {
    const customerId = customerIds.get(demo.customer_key);
    const unitId = unitIds.get(`${demo.project_name}::${demo.unit_code}`);
    const unit = unitId ? await db.units.get(unitId) : undefined;
    if (!customerId || !unitId || !unit) continue;

    const customer = await db.customers.get(customerId);
    const booking = await bookingRepository.createBooking(
      {
        customer_id: customerId,
        unit_id: unitId,
        lead_id: customer?.lead_id ?? null,
        booking_date: daysFromToday(-demo.days_ago).slice(0, 10),
        base_price: unit.base_price,
        floor_premium: demo.floor_premium,
        facing_premium: demo.facing_premium,
        parking_charge: demo.parking_charge,
        other_charges: demo.other_charges,
        discount_amount: demo.discount_amount,
        booking_amount: demo.booking_amount,
        installment_tenure_months: demo.installment_tenure_months ?? null,
        booked_by: userIds.get(demo.booked_by_key) ?? null,
      },
      createdBy,
    );

    // receipts drive `booking_amount_received`, so they go in through the
    // repository and the gating rule settles the status by itself
    for (const receipt of demo.payments ?? []) {
      await bookingRepository.recordPayment(
        booking.id,
        {
          amount: receipt.amount,
          payment_date: daysFromToday(-receipt.days_ago).slice(0, 10),
          payment_method: receipt.method,
          reference_no: receipt.reference_no ?? null,
          notes: receipt.notes ?? null,
          received_by: userIds.get(demo.booked_by_key) ?? null,
        },
        createdBy,
      );
    }

    if (demo.discount_decision) {
      await bookingRepository.decideDiscount(
        booking.id,
        demo.discount_decision.decision,
        userIds.get(demo.discount_decision.approver_key) ?? null,
        demo.discount_decision.note,
        createdBy,
      );
    }

    if (demo.cancel) {
      await bookingRepository.cancel(booking.id, demo.cancel.reason, createdBy);
    }

    const createdAt = daysFromToday(-demo.days_ago);
    await db.bookings.update(booking.id, { created_at: createdAt, updated_at: createdAt });
  }
}

/** ISO timestamp `offset` days from now (negative = in the past). */
function daysFromToday(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(11, 0, 0, 0);
  return d.toISOString();
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
    db.projects.clear(),
    db.land_project_mapping.clear(),
    db.towers.clear(),
    db.project_status_history.clear(),
    db.units.clear(),
    db.users.clear(),
    db.leads.clear(),
    db.lead_activities.clear(),
    db.customers.clear(),
    db.bookings.clear(),
    db.discount_approval_rules.clear(),
    db.payments.clear(),
    db.installment_plan_templates.clear(),
  ]);
  setClearedFlag(true);
}

export async function resetDemoData(createdBy: string | null = null): Promise<void> {
  await clearDemoData();
  await seedDemoData(createdBy);
}
