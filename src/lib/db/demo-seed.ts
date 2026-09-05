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
  materialRequestRepository,
  siteProgressUpdateRepository,
  towerWorkItemRepository,
  goodsReceiptRepository,
  purchaseOrderItemRepository,
  purchaseOrderRepository,
  stockIssueRepository,
  stockRepository,
  stockTransferRepository,
  supplierRepository,
  supplierVoucherRepository,
  expenseRepository,
  paymentScheduleRepository,
  projectBudgetRepository,
  refundRepository,
  userProjectAssignmentRepository,
} from '../repositories';
import type { MaterialRequestStatus, ProjectStatus } from './types';
import { PROCUREMENT_BUDGET_HEAD } from './types';
import { getDb } from './database';
import { backfillMaterialItems } from './backfill-material-items';
import { DEMO_LANDS, DEMO_OWNERS } from './demo-data';
import { DEMO_BOOKINGS, DEMO_CUSTOMERS, DEMO_DISCOUNT_RULES } from './demo-bookings';
import { DEMO_LEADS, DEMO_USER_JOINED_DAYS_AGO, DEMO_USERS } from './demo-leads';
import { DEMO_PROJECTS } from './demo-projects';
import { DEMO_MATERIAL_REQUESTS, DEMO_TOWER_PROGRESS } from './demo-site-progress';
import { DEMO_EXPENSES, DEMO_REFUNDS } from './demo-finance';
import {
  DEMO_PURCHASE_ORDERS,
  DEMO_STOCK_ISSUES,
  DEMO_STOCK_TRANSFERS,
  DEMO_SUPPLIERS,
} from './demo-procurement';

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
  const bookingIds = await seedDemoBookings(
    projectIds,
    unitIds,
    userIds,
    leadIdByPhone,
    createdBy,
  );
  const requestIds = await seedDemoSiteProgress(projectIds, userIds, createdBy);
  await seedDemoProcurement(projectIds, userIds, requestIds, createdBy);
  /*
   * The catalogue is derived from the procurement rows rather than listed
   * separately, so the demo cannot drift from it (Tier 3.1). It runs here and
   * not in the v13 upgrade because Dexie fires `.upgrade()` only when an
   * existing database moves version — a database created fresh at v13 skips
   * it, and this demo would otherwise load with an empty catalogue.
   */
  await backfillMaterialItems(getDb());
  await seedDemoFinance(projectIds, landIds, userIds, bookingIds, createdBy);
  await seedDemoUserAccess(projectIds, userIds, createdBy);

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
            /*
             * Height is priced in this market, so the demo prices it too:
             * every floor up adds 1.5% to the flat below it. Without this the
             * whole tower generated at one price, which is not what any of
             * these towers would really sell for.
             */
            floor_premium_mode: pattern.floor_premium_mode ?? 'percent',
            floor_premium_value: pattern.floor_premium_value ?? '1.5',
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
    /*
     * Back-date the account like every other demo record. `create` stamps
     * `created_at` at load time, which left the whole staff list reading
     * "Added <today>" against leads and bookings that were properly aged.
     */
    const joined = daysFromToday(-(DEMO_USER_JOINED_DAYS_AGO[user.key] ?? 365));
    await db.users.update(saved.id, { created_at: joined, updated_at: joined });

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
): Promise<Map<string, string>> {
  const db = getDb();
  const bookingIds = new Map<string, string>();

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
    bookingIds.set(`${demo.customer_key}::${demo.unit_code}`, booking.id);
  }

  return bookingIds;
}


/**
 * Module 5 demo data.
 *
 * The tower's default WBS already exists (Module 2 creates it with the tower),
 * so this retunes the weights and plan dates and then replays the readings
 * through `siteProgressUpdateRepository.log` — the same call the Log Update
 * dialog makes. Nothing here writes `actual_progress_pct` or the tower's
 * cached percentage by hand: they fall out of the logged readings, which is
 * the only way to be sure the Section 6.3 behaviour actually works.
 */
async function seedDemoSiteProgress(
  projectIds: Map<string, string>,
  userIds: Map<string, string>,
  createdBy: string | null,
): Promise<Map<string, string>> {
  const requestIds = new Map<string, string>();
  const db = getDb();

  for (const demo of DEMO_TOWER_PROGRESS) {
    const projectId = projectIds.get(demo.project_name);
    if (!projectId) continue;

    const towers = await db.towers.where('project_id').equals(projectId).toArray();
    const tower = towers.find((t) => t.name === demo.tower_name);
    if (!tower) continue;

    const existing = await towerWorkItemRepository.listForTower(tower.id);
    const byName = new Map(existing.map((i) => [i.name, i]));

    for (const [index, demoItem] of demo.items.entries()) {
      const plan = {
        weight_pct: demoItem.weight_pct,
        sequence_no: index + 1,
        planned_start_date:
          demoItem.planned_start_in_days === null
            ? null
            : daysFromToday(demoItem.planned_start_in_days).slice(0, 10),
        planned_end_date:
          demoItem.planned_end_in_days === null
            ? null
            : daysFromToday(demoItem.planned_end_in_days).slice(0, 10),
      };

      let item = byName.get(demoItem.name);
      if (item) {
        await towerWorkItemRepository.updateItem(item.id, plan);
      } else {
        item = await towerWorkItemRepository.create(
          {
            ...plan,
            tower_id: tower.id,
            name: demoItem.name,
            actual_progress_pct: 0,
            status: 'not_started',
          },
          createdBy,
        );
      }

      for (const reading of demoItem.readings ?? []) {
        const reporter = reading.by ? (userIds.get(reading.by) ?? null) : null;
        const update = await siteProgressUpdateRepository.log(
          {
            work_item_id: item.id,
            update_date: daysFromToday(-reading.days_ago).slice(0, 10),
            progress_pct: reading.progress_pct,
            remarks: reading.remarks ?? null,
            gps_lat: reading.gps?.[0] ?? null,
            gps_lng: reading.gps?.[1] ?? null,
            updated_by: reporter,
          },
          createdBy,
        );
        // the log entry carries the date of the reading, not of seeding
        await db.site_progress_updates.update(update.id, {
          created_at: daysFromToday(-reading.days_ago),
        });

        if (!reading.photo) continue;
        const png = await makeSamplePng(`${demo.tower_name} — ${demoItem.name}`);
        if (!png) continue;
        const slug = demoItem.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const fileName = `progress-${slug}-${reading.days_ago}d.png`;
        await documentRepository.create(
          {
            entity_type: 'site_progress_update',
            entity_id: update.id,
            document_type: 'progress_photo',
            custom_type_name: null,
            file_url: fileName,
            file_data: png,
            file_name: fileName,
            file_size: png.size,
            mime_type: 'image/png',
            // site photos are what the public project page shows (Section 6.7)
            is_public: true,
            uploaded_by: reporter,
            uploaded_at: daysFromToday(-reading.days_ago),
            notes: reading.remarks ?? null,
          },
          createdBy,
        );
      }
    }
  }

  for (const demo of DEMO_MATERIAL_REQUESTS) {
    const projectId = projectIds.get(demo.project_name);
    if (!projectId) continue;

    const towers = await db.towers.where('project_id').equals(projectId).toArray();
    const tower = demo.tower_name ? towers.find((t) => t.name === demo.tower_name) : undefined;
    const workItems = tower ? await towerWorkItemRepository.listForTower(tower.id) : [];
    const workItem = demo.work_item_name
      ? workItems.find((w) => w.name === demo.work_item_name)
      : undefined;

    const request = await materialRequestRepository.createRequest(
      {
        project_id: projectId,
        tower_id: tower?.id ?? null,
        work_item_id: workItem?.id ?? null,
        requested_by: userIds.get(demo.requested_by_key) ?? null,
        request_date: daysFromToday(-demo.days_ago).slice(0, 10),
        notes: demo.notes ?? null,
        decision_note: null,
        items: demo.items.map((i) => ({
          item_name: i.item_name,
          unit: i.unit,
          quantity_requested: i.quantity_requested,
        })),
      },
      createdBy,
    );

    /*
     * Walk the lifecycle through the repository so the Section 6.5 side
     * effects — approved quantities settled, quantities cleared on a
     * rejection — are produced by the real code path rather than written
     * straight into the table.
     */
    if (demo.status !== 'pending') {
      const lines = await db.material_request_items.where('request_id').equals(request.id).toArray();
      const approved: Record<string, number | null> = Object.fromEntries(
        lines.map((line) => {
          const match = demo.items.find((i) => i.item_name === line.item_name);
          return [line.id, match?.quantity_approved ?? null];
        }),
      );

      /*
       * Only as far as the decision. `ordered` and `fulfilled` now belong to
       * Module 6 — the purchase order raised below writes the first and the
       * goods receipt that completes it writes the second, so seeding them
       * here would fake the very transitions the module exists to produce.
       */
      const path: MaterialRequestStatus[] = demo.status === 'rejected' ? ['rejected'] : ['approved'];

      /*
       * Each step lands a few days after the one before it, so the request's
       * trail reads like a real procurement cycle rather than everything
       * happening the moment the demo was loaded.
       */
      for (const [step, offset] of path.map((s, i) => [s, i + 1] as const)) {
        const decidedDaysAgo = Math.max(0, demo.days_ago - offset * 3);
        await materialRequestRepository.setStatus(request.id, step, {
          decision_note: step === path[path.length - 1] ? (demo.decision_note ?? null) : undefined,
          approved_quantities: step === 'approved' ? approved : undefined,
          decided_by: userIds.get('monir') ?? null,
          event_date: daysFromToday(-decidedDaysAgo).slice(0, 10),
        });
      }
    }

    const createdAt = daysFromToday(-demo.days_ago);
    await db.material_requests.update(request.id, { created_at: createdAt, updated_at: createdAt });
    requestIds.set(demo.key, request.id);
  }

  return requestIds;
}

/**
 * Module 6 demo data (Section 7).
 *
 * Nothing here writes a stock row, a received quantity or a purchase-order
 * status directly. Every one of those falls out of the same repository calls
 * the UI makes — `createOrder`, `createReceipt`, `issue`, `transfer`, `pay` —
 * so what the demo shows is exactly what the feature produces: the weighted
 * average cost, the failed quality check that never reaches stock, the request
 * that closes itself as Fulfilled when its order is fully received, and the
 * cancellation that voids only the undelivered balance.
 */
async function seedDemoProcurement(
  projectIds: Map<string, string>,
  userIds: Map<string, string>,
  requestIds: Map<string, string>,
  createdBy: string | null,
): Promise<void> {
  const db = getDb();

  const supplierIds = new Map<string, string>();
  for (const demo of DEMO_SUPPLIERS) {
    const saved = await supplierRepository.createSupplier(
      {
        name: demo.name,
        type: demo.type,
        contact_person: demo.contact_person ?? null,
        phone: demo.phone,
        address: demo.address ?? null,
        notes: demo.notes ?? null,
      },
      createdBy,
    );
    supplierIds.set(demo.key, saved.id);
  }

  /*
   * Orders are seeded oldest first. The order matters: a weighted average is
   * a running figure, so loading the 512-taka lot before the 568-taka one is
   * what produces a believable blended rate on the central store — doing it
   * the other way round would give a different (and wrong) answer.
   */
  const ordered = [...DEMO_PURCHASE_ORDERS].sort((a, b) => b.days_ago - a.days_ago);

  for (const demo of ordered) {
    const supplierId = supplierIds.get(demo.supplier_key);
    if (!supplierId) continue;

    const orderDate = daysFromToday(-demo.days_ago);
    const order = await purchaseOrderRepository.createOrder(
      {
        request_id: demo.request_key ? (requestIds.get(demo.request_key) ?? null) : null,
        project_id: demo.project_name ? (projectIds.get(demo.project_name) ?? null) : null,
        supplier_id: supplierId,
        order_date: orderDate.slice(0, 10),
        // a draft stays a draft; everything else is placed with the supplier,
        // and the receipts below move it on from there
        status: demo.status === 'draft' ? 'draft' : 'ordered',
        notes: demo.notes ?? null,
        items: demo.items,
      },
      createdBy,
    );

    const lines = await purchaseOrderItemRepository.listForOrder(order.id);
    const lineByName = new Map(lines.map((line) => [line.item_name, line]));

    for (const receipt of demo.receipts ?? []) {
      const saved = await goodsReceiptRepository.createReceipt(
        {
          po_id: order.id,
          receipt_date: daysFromToday(-receipt.days_ago).slice(0, 10),
          received_by: userIds.get(receipt.received_by_key) ?? null,
          notes: receipt.notes ?? null,
          items: receipt.lines
            .map((line) => ({
              po_item_id: lineByName.get(line.item_name)?.id ?? '',
              quantity_received: line.quantity_received,
              quality_check: line.quality_check,
            }))
            .filter((line) => line.po_item_id),
        },
        createdBy,
      );
      const receivedAt = daysFromToday(-receipt.days_ago);
      await db.goods_receipts.update(saved.id, { created_at: receivedAt, updated_at: receivedAt });
    }

    // cancelled last, so the part-delivery above is already on the record and
    // only the undelivered balance is what gets voided
    if (demo.status === 'cancelled') {
      await purchaseOrderRepository.setStatus(order.id, 'cancelled', {
        note: demo.cancel_reason ?? null,
        actor: userIds.get('monir') ?? null,
      });
    }

    for (const voucher of demo.vouchers ?? []) {
      const saved = await supplierVoucherRepository.pay(
        {
          po_id: order.id,
          amount: voucher.amount,
          payment_date: daysFromToday(-voucher.days_ago).slice(0, 10),
          payment_method: voucher.payment_method,
          reference_no: voucher.reference_no ?? null,
          paid_by: userIds.get(voucher.paid_by_key) ?? null,
          notes: voucher.notes ?? null,
        },
        createdBy,
      );
      const paidAt = daysFromToday(-voucher.days_ago);
      await db.supplier_vouchers.update(saved.id, { created_at: paidAt, updated_at: paidAt });
    }

    await db.purchase_orders.update(order.id, { created_at: orderDate, updated_at: orderDate });
  }

  // transfers before issues: a site cannot consume cement it has not received
  for (const demo of [...DEMO_STOCK_TRANSFERS].sort((a, b) => b.days_ago - a.days_ago)) {
    const toId = projectIds.get(demo.to_project_name);
    if (!toId) continue;
    const fromId = demo.from_project_name ? (projectIds.get(demo.from_project_name) ?? null) : null;

    const saved = await stockTransferRepository.transfer(
      {
        item_name: demo.item_name,
        unit: demo.unit,
        quantity: demo.quantity,
        from_project_id: fromId,
        to_project_id: toId,
        transfer_date: daysFromToday(-demo.days_ago).slice(0, 10),
        transferred_by: userIds.get(demo.transferred_by_key) ?? null,
        notes: demo.notes ?? null,
      },
      createdBy,
    );
    const movedAt = daysFromToday(-demo.days_ago);
    await db.stock_transfers.update(saved.id, { created_at: movedAt, updated_at: movedAt });
  }

  for (const demo of [...DEMO_STOCK_ISSUES].sort((a, b) => b.days_ago - a.days_ago)) {
    const projectId = projectIds.get(demo.project_name);
    if (!projectId) continue;

    const towers = await db.towers.where('project_id').equals(projectId).toArray();
    const tower = demo.tower_name ? towers.find((t) => t.name === demo.tower_name) : undefined;
    const workItems = tower ? await towerWorkItemRepository.listForTower(tower.id) : [];
    const workItem = demo.work_item_name
      ? workItems.find((w) => w.name === demo.work_item_name)
      : undefined;

    /*
     * The demo quantities are written against what the orders above bring in,
     * but a store can still come up short if a demo order is edited later —
     * so the issue is trimmed to what is actually there rather than thrown.
     * A seed that half-loads and then aborts is worse than one that scales a
     * line down.
     */
    const available = await stockRepository.availableFor(projectId, {
      item_name: demo.item_name,
      unit: demo.unit,
    });
    const quantity = Math.min(demo.quantity_issued, available);
    if (quantity <= 0) continue;

    const saved = await stockIssueRepository.issue(
      {
        project_id: projectId,
        work_item_id: workItem?.id ?? null,
        item_name: demo.item_name,
        unit: demo.unit,
        quantity_issued: quantity,
        issue_date: daysFromToday(-demo.days_ago).slice(0, 10),
        issued_by: userIds.get(demo.issued_by_key) ?? null,
        notes: demo.notes ?? null,
      },
      createdBy,
    );
    const issuedAt = daysFromToday(-demo.days_ago);
    await db.stock_issues.update(saved.id, { created_at: issuedAt, updated_at: issuedAt });
  }
}

/**
 * Module 7 demo data (Section 8).
 *
 * The instalment schedules are deliberately absent from the demo dataset:
 * they were already generated by the real code path when each booking was
 * confirmed above, and the receipts recorded against those bookings have
 * already been spread across them. Writing schedules here by hand would
 * demonstrate a schedule the feature never produced — the same rule Module 5
 * follows with progress percentages and Module 6 with stock levels.
 *
 * What is seeded is what has no other source: the cost ledger, and the refund
 * on the booking that was cancelled after money had been taken.
 */
async function seedDemoFinance(
  projectIds: Map<string, string>,
  landIds: Map<string, string>,
  userIds: Map<string, string>,
  bookingIds: Map<string, string>,
  createdBy: string | null,
): Promise<void> {
  const db = getDb();

  for (const demo of DEMO_EXPENSES) {
    const saved = await expenseRepository.createExpense(
      {
        project_id: demo.project_name ? (projectIds.get(demo.project_name) ?? null) : null,
        land_id: demo.land_name ? (landIds.get(demo.land_name) ?? null) : null,
        cost_category: demo.cost_category,
        cost_reason: demo.cost_reason,
        amount: demo.amount,
        expense_date: daysFromToday(-demo.days_ago).slice(0, 10),
        paid_to: demo.paid_to,
        payment_method: demo.payment_method,
        reference_no: demo.reference_no ?? null,
        paid_by: userIds.get(demo.paid_by_key) ?? null,
        notes: demo.notes ?? null,
      },
      createdBy,
    );
    const paidAt = daysFromToday(-demo.days_ago);
    await db.expenses.update(saved.id, { created_at: paidAt, updated_at: paidAt });
  }

  for (const demo of DEMO_REFUNDS) {
    const bookingId = bookingIds.get(`${demo.customer_key}::${demo.unit_code}`);
    if (!bookingId) continue;

    // through the repository, so the "never more than the buyer paid" guard is
    // exercised by the demo rather than bypassed by it
    const saved = await refundRepository.issue(
      {
        booking_id: bookingId,
        amount: demo.amount,
        deduction: demo.deduction,
        refund_date: daysFromToday(-demo.days_ago).slice(0, 10),
        payment_method: demo.payment_method,
        reference_no: demo.reference_no ?? null,
        processed_by: userIds.get(demo.processed_by_key) ?? null,
        notes: demo.notes ?? null,
      },
      createdBy,
    );
    const refundedAt = daysFromToday(-demo.days_ago);
    await db.refunds.update(saved.id, { created_at: refundedAt, updated_at: refundedAt });
  }

  /*
   * One land payment plan (Tier 3.4), generated through the real code path for
   * the same reason the booking schedules are: a plan written by hand would
   * demonstrate a schedule the feature never produced.
   *
   * The Dhanmondi plot is the one worth showing — it was agreed at 82,000,000
   * with 70,000,000 already in the cost ledger above, so the plan seeds itself
   * part-paid: the bayna and three monthlies settled, the fourth short, and
   * the registration money still to go. Generation is deliberately last, after
   * the expenses exist, so the allocation runs over real rows.
   */
  /*
   * A budget on two projects (Tier 3.2), written through the repository so the
   * upsert and the drop-a-zero-line rule are exercised by the demo rather than
   * bypassed by it.
   *
   * Dhanmondi is deliberately seeded **over** budget on contractor payment and
   * with `land_extra_cost` left unbudgeted: a plan where everything is
   * comfortably green demonstrates nothing, and the unbudgeted head is the case
   * the screen exists to make visible.
   */
  const budgets: Array<[string, Array<[string, number]>]> = [
    [
      'Nokshi Dhanmondi Court',
      [
        [PROCUREMENT_BUDGET_HEAD, 2000000],
        ['land_payment', 70000000],
        ['contractor_payment', 6000000],
        ['marketing', 500000],
      ],
    ],
    [
      'Nokshi Green Residence',
      [
        [PROCUREMENT_BUDGET_HEAD, 6000000],
        ['contractor_payment', 12000000],
        ['marketing', 800000],
        ['admin', 400000],
      ],
    ],
  ];
  for (const [name, lines] of budgets) {
    const projectId = projectIds.get(name);
    if (!projectId) continue;
    await projectBudgetRepository.replaceForProject(
      projectId,
      lines.map(([cost_category, budgeted_amount]) => ({ cost_category, budgeted_amount })),
      createdBy,
    );
  }

  const dhanmondiLandId = landIds.get('Dhanmondi Road 27 plot');
  if (dhanmondiLandId) {
    await paymentScheduleRepository.generateForLand(
      dhanmondiLandId,
      {
        agreementDate: '2024-08-05',
        advanceAmount: 42000000,
        monthlyCount: 4,
        registrationAmount: 10000000,
        registrationAfterMonths: 7,
      },
      createdBy,
    );
  }
}

/**
 * Module 8 demo data (Section 9.5).
 *
 * Only the project scoping — the accounts themselves are seeded with the leads
 * in Module 3, because leads needed somebody to be assigned to long before
 * Module 8 existed. Nothing is written for `super_admin`, `management` or
 * `land_team`: those roles see every project without a mapping, and a row for
 * them would suggest a restriction that is never applied.
 */
async function seedDemoUserAccess(
  projectIds: Map<string, string>,
  userIds: Map<string, string>,
  createdBy: string | null,
): Promise<void> {
  for (const demo of DEMO_USERS) {
    if (!demo.projects?.length) continue;
    const userId = userIds.get(demo.key);
    if (!userId) continue;

    const ids = demo.projects
      .map((name) => projectIds.get(name))
      .filter((id): id is string => Boolean(id));

    await userProjectAssignmentRepository.setForUser(userId, ids, createdBy);
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
    db.tower_work_items.clear(),
    db.site_progress_updates.clear(),
    db.material_requests.clear(),
    db.material_request_items.clear(),
    db.material_request_status_history.clear(),
    db.suppliers.clear(),
    db.purchase_orders.clear(),
    db.purchase_order_items.clear(),
    db.goods_receipts.clear(),
    db.goods_receipt_items.clear(),
    db.stock.clear(),
    db.stock_issues.clear(),
    db.stock_transfers.clear(),
    /* The catalogue is derived from these rows, so it goes with them — leaving
       it behind would offer items nothing in the database has ever bought. */
    db.material_items.clear(),
    db.project_budget_lines.clear(),
    db.supplier_vouchers.clear(),
    db.payment_schedules.clear(),
    db.payment_installments.clear(),
    db.refunds.clear(),
    db.expenses.clear(),
    db.user_project_assignments.clear(),
  ]);
  setClearedFlag(true);
}

export async function resetDemoData(createdBy: string | null = null): Promise<void> {
  await clearDemoData();
  await seedDemoData(createdBy);
}
