'use client';

import { db } from '../db/database';
import type {
  Booking,
  BookingStatus,
  Customer,
  Lead,
  Project,
  Tower,
  PaymentMethod,
  Unit,
  User,
} from '../db/types';
import { derivedStatus, finalPrice } from '../domain/booking';
import { nextCode, nowIso } from '../utils/id';
import { BaseRepository, type NewRecord } from './base.repository';
import { documentRepository } from './document.repository';
import { leadActivityRepository, normalizePhone } from './lead.repository';
import { refundRepository } from './finance.repository';
import { paymentRepository } from './payment.repository';

export interface BookingFilters {
  search?: string;
  status?: BookingStatus | 'all';
  project_id?: string;
  booked_by?: string | 'all';
}

/** A booking plus everything its detail page shows. */
export interface BookingWithRelations extends Booking {
  customer: Customer | undefined;
  unit: Unit | undefined;
  tower: Tower | undefined;
  project: Project | undefined;
  lead: Lead | undefined;
  seller: User | undefined;
  /** money actually received against this booking so far */
  amount_received: number;
  /** v32 — the other bookings made in the same go, with their unit codes */
  group_siblings: Array<{ id: string; code: string; unit_code: string; status: BookingStatus }>;
}

export interface CustomerFilters {
  /** one field per thing you might know — a single box mixing them all
   *  matched too loosely and made the results feel random */
  name?: string;
  phone?: string;
  nid?: string;
  profession?: string;
  /** 'any' | 'none' | 'active' | 'confirmed' */
  booking_state?: 'any' | 'none' | 'active' | 'confirmed';
}

export interface CustomerWithRelations extends Customer {
  bookings: Booking[];
  /** v32 — unit code per booking id, so a buyer with several flats sees which is which */
  unit_codes: Record<string, string>;
  lead: Lead | undefined;
  /**
   * Money roll-up across this buyer's active bookings. Instalments hang off a
   * booking, not off a customer — somebody with two flats has two schedules —
   * so what belongs on a customer page is the total, not a schedule.
   */
  finance: {
    total_value: number;
    total_received: number;
    outstanding: number;
    received_by_booking: Record<string, number>;
  };
}

class CustomerRepository extends BaseRepository<Customer> {
  constructor() {
    super(() => db.customers);
  }

  async generateCode(): Promise<string> {
    const codes = (await db.customers.toArray()).map((c) => c.code);
    return nextCode('CUST', codes);
  }

  async create(input: NewRecord<Customer>, createdBy: string | null = null): Promise<Customer> {
    const code = input.code?.trim() ? input.code : await this.generateCode();
    return super.create({ ...input, code, phone: normalizePhone(input.phone) }, createdBy);
  }

  async findByPhone(phone: string): Promise<Customer | undefined> {
    const normalized = normalizePhone(phone);
    return (await db.customers.toArray()).find((c) => normalizePhone(c.phone) === normalized);
  }

  /**
   * Customer record for a lead, reusing the existing one when the buyer is
   * already known (Section 5.3 — phone is unique). Name/phone/email are copied
   * off the lead so nothing has to be retyped.
   */
  async fromLead(leadId: string, createdBy: string | null = null): Promise<Customer> {
    const lead = await db.leads.get(leadId);
    if (!lead) throw new Error('Lead not found');

    const existing = await this.findByPhone(lead.phone);
    if (existing) {
      // link it back to the lead if it was created some other way
      if (!existing.lead_id) await this.update(existing.id, { lead_id: leadId });
      return existing;
    }

    return this.create(
      {
        code: '',
        name: lead.name,
        phone: lead.phone,
        email: lead.email ?? null,
        nid: null,
        address: null,
        profession: null,
        lead_id: leadId,
      },
      createdBy,
    );
  }

  async list(filters: CustomerFilters = {}): Promise<Customer[]> {
    let rows = await db.customers.toArray();

    if (filters.name?.trim()) {
      const q = filters.name.trim().toLowerCase();
      // name box also matches the code and email — that is what people type there
      rows = rows.filter((c) =>
        [c.name, c.code, c.email].filter(Boolean).some((f) => String(f).toLowerCase().includes(q)),
      );
    }
    if (filters.phone?.trim()) {
      const q = normalizePhone(filters.phone);
      rows = rows.filter((c) => normalizePhone(c.phone).includes(q));
    }
    if (filters.nid?.trim()) {
      const q = filters.nid.trim().toLowerCase();
      rows = rows.filter((c) => (c.nid ?? '').toLowerCase().includes(q));
    }
    if (filters.profession?.trim()) {
      const q = filters.profession.trim().toLowerCase();
      rows = rows.filter((c) => (c.profession ?? '').toLowerCase().includes(q));
    }

    if (filters.booking_state && filters.booking_state !== 'any') {
      const bookings = await db.bookings.toArray();
      rows = rows.filter((c) => {
        const mine = bookings.filter((b) => b.customer_id === c.id);
        const active = mine.filter((b) => b.status !== 'cancelled');
        if (filters.booking_state === 'none') return active.length === 0;
        if (filters.booking_state === 'confirmed') {
          return active.some((b) => b.status === 'confirmed');
        }
        return active.length > 0;
      });
    }

    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  /*
   * `null`, not `undefined`, when the record is gone. `useLiveQuery` reports
   * its own pending state as `undefined`, so a repository returning
   * `undefined` for "no such row" leaves the detail page unable to tell a
   * deleted record from a query still in flight — it sat on "Loading…"
   * forever instead of saying the record no longer exists.
   */
  async getWithRelations(id: string): Promise<CustomerWithRelations | null> {
    const customer = await this.getById(id);
    if (!customer) return null;

    const bookings = await bookingRepository.listForCustomer(id);
    const active = bookings.filter((b) => b.status !== 'cancelled');

    const received_by_booking: Record<string, number> = {};
    let total_received = 0;
    for (const booking of active) {
      const paid = await paymentRepository.totalForBooking(booking.id);
      received_by_booking[booking.id] = paid;
      total_received += paid;
    }
    const total_value = active.reduce((sum, b) => sum + (Number(b.final_price) || 0), 0);

    const unit_codes: Record<string, string> = {};
    for (const booking of bookings) {
      const unit = await db.units.get(booking.unit_id);
      if (unit) unit_codes[booking.id] = unit.code;
    }

    return {
      ...customer,
      bookings,
      unit_codes,
      lead: customer.lead_id ? await db.leads.get(customer.lead_id) : undefined,
      finance: {
        total_value,
        total_received,
        outstanding: total_value - total_received,
        received_by_booking,
      },
    };
  }

  /** A customer with bookings must not vanish underneath them. */
  async removeCascade(id: string): Promise<{ removed: boolean; reason?: string }> {
    const bookings = await bookingRepository.listForCustomer(id);
    if (bookings.length > 0) {
      return {
        removed: false,
        reason: `This customer has ${bookings.length} booking${bookings.length === 1 ? '' : 's'}. Cancel or delete those first.`,
      };
    }
    await documentRepository.removeForEntity('customer', id);
    await this.remove(id);
    return { removed: true };
  }
}

export interface BookingInput {
  /**
   * Empty when booking straight from a lead: `lead_id` then names the buyer
   * and the customer is made (or found by phone) as the booking is saved, so
   * a lead never has to be "converted" as a separate step first.
   */
  customer_id: string;
  unit_id: string;
  lead_id?: string | null;
  booking_date: string;
  base_price: number;
  floor_premium: number;
  facing_premium: number;
  parking_charge: number;
  /**
   * v27 — the plot premiums (PROJECT-MODULE-PLAN.md Phase 2). Optional, so
   * every existing caller that only knows about flats still compiles and
   * writes nothing for them.
   */
  road_premium?: number | null;
  corner_premium?: number | null;
  other_charges: number;
  discount_amount: number;
  booking_amount: number;
  booked_by: string | null;
  /** v32 — set by `createGroupBooking`; a single booking leaves it null */
  booking_group?: string | null;
  /** SALES-FLOW-PLAN.md S3 — optional at booking time, can be recorded later */
  agreement?: AgreementInput | null;
  /**
   * Optional receipt taken at the same moment as the booking. Recording it
   * creates a real `payments` row — `booking_amount_received` is then derived
   * from the money, not typed by hand.
   */
  payment?: {
    amount: number;
    payment_date: string;
    payment_method: PaymentMethod;
    reference_no?: string | null;
    notes?: string | null;
    /** the account the money landed in — what puts it in Cash Position */
    account_id?: string | null;
  } | null;
}

/** The agreement (চুক্তি) fields, as typed — see `Booking` for what each means. */
export type AgreementInput = Pick<
  Booking,
  | 'agreement_date'
  | 'agreement_no'
  | 'payment_mode'
  | 'full_payment_due_date'
  | 'installment_count'
  | 'installment_amount'
  | 'first_installment_date'
  | 'handover_date'
  | 'agreement_terms'
>;

/** Keeps only the fields the chosen payment mode uses, so stale terms never linger. */
function cleanAgreement(a: AgreementInput): AgreementInput {
  const mode = a.payment_mode ?? null;
  return {
    agreement_date: a.agreement_date || null,
    agreement_no: a.agreement_no?.trim() || null,
    payment_mode: mode,
    full_payment_due_date: mode === 'full' ? a.full_payment_due_date || null : null,
    installment_count: mode === 'installment' ? Number(a.installment_count) || null : null,
    installment_amount: mode === 'installment' ? Number(a.installment_amount) || null : null,
    first_installment_date: mode === 'installment' ? a.first_installment_date || null : null,
    handover_date: a.handover_date || null,
    agreement_terms: a.agreement_terms?.trim() || null,
  };
}

class BookingRepository extends BaseRepository<Booking> {
  constructor() {
    super(() => db.bookings);
  }

  async generateCode(): Promise<string> {
    const codes = (await db.bookings.toArray()).map((b) => b.code);
    return nextCode('BOOK', codes);
  }

  /**
   * Creates a booking and applies every side-effect together: the unit is
   * reserved (or marked booked when the booking lands confirmed), the lead is
   * moved to `booked` on confirmation, and the status is derived from the
   * booking money rather than chosen.
   */
  async createBooking(input: BookingInput, createdBy: string | null = null): Promise<Booking> {
    input = { ...input, ...(await this.resolveBuyer(input, createdBy)) };
    const unit = await db.units.get(input.unit_id);
    if (!unit) throw new Error('Unit not found');
    /*
     * QA audit 2026-10-11 (P-05): the booking form only lists projects whose
     * sales are open, but nothing stopped a booking arriving another way —
     * which is how a "not open" project came to hold BDT 18.4M of bookings.
     */
    const tower = await db.towers.get(unit.tower_id);
    const project = tower ? await db.projects.get(tower.project_id) : undefined;
    if (project && (project.sales_status ?? 'not_open') !== 'open') {
      throw new Error(`Sales are not open on ${project.code}, so it cannot take a booking. Open sales on the project first.`);
    }

    // the money decides this, not a checkbox
    const received = (input.payment?.amount ?? 0) >= input.booking_amount && input.booking_amount > 0;
    const status = derivedStatus({ booking_amount_received: received, status: 'hold' });

    const booking = await super.create(
      {
        code: await this.generateCode(),
        customer_id: input.customer_id,
        unit_id: input.unit_id,
        lead_id: input.lead_id ?? null,
        booking_date: input.booking_date,
        base_price: input.base_price,
        floor_premium: input.floor_premium,
        facing_premium: input.facing_premium,
        parking_charge: input.parking_charge,
        // v27 — zero rather than null on a flat, so the columns always sum
        road_premium: input.road_premium ?? 0,
        corner_premium: input.corner_premium ?? 0,
        other_charges: input.other_charges,
        discount_amount: input.discount_amount,
        final_price: finalPrice(input),
        booking_amount: input.booking_amount,
        booking_amount_received: received,
        installment_tenure_months: null,
        // the column is the scope's; nothing gates on it since v37
        discount_approval_status: 'not_required',
        discount_approved_by: null,
        discount_decision_note: null,
        status,
        cancellation_reason: null,
        booked_by: input.booked_by,
        booking_group: input.booking_group ?? null,
        ...(input.agreement ? cleanAgreement(input.agreement) : {}),
      },
      createdBy,
    );

    if (input.payment && input.payment.amount > 0) {
      await paymentRepository.record(
        {
          booking_id: booking.id,
          amount: input.payment.amount,
          payment_date: input.payment.payment_date,
          payment_method: input.payment.payment_method,
          account_id: input.payment.account_id ?? null,
          reference_no: input.payment.reference_no,
          received_by: input.booked_by,
          notes: input.payment.notes,
        },
        createdBy,
      );
    }

    await this.applySideEffects(booking, createdBy);
    return booking;
  }

  /**
   * The customer and lead a booking belongs to. Booked from a lead → the
   * customer is that lead's (made now if this is its first booking). Booked
   * for a customer → the lead it came from, if any, so the lead still moves.
   */
  private async resolveBuyer(
    input: Pick<BookingInput, 'customer_id' | 'lead_id'>,
    createdBy: string | null,
  ): Promise<{ customer_id: string; lead_id: string | null }> {
    if (!input.customer_id) {
      if (!input.lead_id) throw new Error('Pick the buyer — a customer or a lead.');
      const customer = await customerRepository.fromLead(input.lead_id, createdBy);
      return { customer_id: customer.id, lead_id: input.lead_id };
    }
    const customer = await db.customers.get(input.customer_id);
    return { customer_id: input.customer_id, lead_id: input.lead_id ?? customer?.lead_id ?? null };
  }

  async generateGroupCode(): Promise<string> {
    const codes = (await db.bookings.toArray())
      .map((b) => b.booking_group)
      .filter((c): c is string => Boolean(c));
    return nextCode('BKG', codes);
  }

  /**
   * v32 — one buyer, several units, one go. Each unit still becomes its own
   * booking (its own price, receipts and agreement), all
   * carrying the same `booking_group`. Every unit is checked before anything
   * is written, so a clash on the third unit does not leave the first two
   * booked on their own.
   */
  async createGroupBooking(
    shared: Pick<BookingInput, 'customer_id' | 'lead_id' | 'booking_date' | 'booked_by'>,
    lines: Array<
      Omit<BookingInput, 'customer_id' | 'lead_id' | 'booking_date' | 'booked_by' | 'booking_group'>
    >,
    createdBy: string | null = null,
  ): Promise<{ booking_group: string | null; bookings: Booking[] }> {
    if (lines.length === 0) throw new Error('Pick at least one unit.');
    const seen = new Set<string>();
    for (const line of lines) {
      if (seen.has(line.unit_id)) throw new Error('The same unit is picked twice.');
      seen.add(line.unit_id);
      const unit = await db.units.get(line.unit_id);
      if (!unit) throw new Error('Unit not found');
      const clash = await this.activeForUnit(line.unit_id);
      if (clash) throw new Error(`${clash.code} is already active on ${unit.code}.`);
    }

    // one customer for every unit, made from the lead once rather than per line
    shared = { ...shared, ...(await this.resolveBuyer(shared, createdBy)) };
    // a single unit is just a booking — no group to tie together
    const booking_group = lines.length > 1 ? await this.generateGroupCode() : null;
    const bookings: Booking[] = [];
    for (const line of lines) {
      bookings.push(
        await this.createBooking({ ...shared, ...line, booking_group }, createdBy),
      );
    }
    return { booking_group, bookings };
  }

  /** The other bookings made in the same go, oldest code first. */
  async listGroup(bookingGroup: string): Promise<Booking[]> {
    const rows = await db.bookings.where('booking_group').equals(bookingGroup).toArray();
    return rows.sort((a, b) => a.code.localeCompare(b.code));
  }

  /**
   * Re-derives `booking_amount_received` from the payments actually recorded,
   * then lets that settle the status. Called after any money moves,
   * so the flag can never drift away from the receipts.
   */
  async syncFromPayments(id: string, createdBy: string | null = null): Promise<Booking | undefined> {
    const current = await this.getById(id);
    if (!current) return undefined;

    const received = await paymentRepository.totalForBooking(id);
    const isReceived = current.booking_amount > 0 && received >= current.booking_amount;

    const updated = await this.update(id, {
      booking_amount_received: isReceived,
      status: derivedStatus({ ...current, booking_amount_received: isReceived }),
    });
    if (updated) await this.applySideEffects(updated, createdBy);
    return updated;
  }

  /** Edits the money on a booking and re-derives its status. */
  async updatePricing(
    id: string,
    input: Omit<
      BookingInput,
      'customer_id' | 'unit_id' | 'lead_id' | 'booked_by' | 'payment' | 'agreement'
    >,
    createdBy: string | null = null,
  ): Promise<Booking | undefined> {
    const current = await this.getById(id);
    if (!current) return undefined;

    // changing the expected booking amount can flip whether it is covered
    const received = await paymentRepository.totalForBooking(id);
    const isReceived = input.booking_amount > 0 && received >= input.booking_amount;

    const updated = await this.update(id, {
      ...input,
      booking_amount_received: isReceived,
      final_price: finalPrice(input),
      status: derivedStatus({ booking_amount_received: isReceived, status: current.status }),
    });

    if (updated) await this.applySideEffects(updated, createdBy);
    return updated;
  }

  /** Records or edits the agreement (চুক্তি). Status does not depend on it. */
  async saveAgreement(id: string, input: AgreementInput): Promise<Booking | undefined> {
    return this.update(id, cleanAgreement(input));
  }

  /** Records a receipt against the booking, then re-derives its status. */
  async recordPayment(
    id: string,
    input: {
      amount: number;
      payment_date: string;
      payment_method: PaymentMethod;
      reference_no?: string | null;
      notes?: string | null;
      received_by?: string | null;
      /** Tier 3.5: the account this money landed in. */
      account_id?: string | null;
    },
    createdBy: string | null = null,
  ): Promise<Booking | undefined> {
    const current = await this.getById(id);
    if (!current) return undefined;

    await paymentRepository.record(
      {
        booking_id: id,
        amount: input.amount,
        payment_date: input.payment_date,
        payment_method: input.payment_method,
        account_id: input.account_id ?? null,
        reference_no: input.reference_no,
        received_by: input.received_by ?? current.booked_by ?? null,
        notes: input.notes,
      },
      createdBy,
    );
    return this.syncFromPayments(id, createdBy);
  }

  /** Deletes a receipt entered by mistake, then re-derives the status. */
  async removePayment(
    bookingId: string,
    paymentId: string,
    createdBy: string | null = null,
  ): Promise<Booking | undefined> {
    await paymentRepository.removeCascade(paymentId);
    return this.syncFromPayments(bookingId, createdBy);
  }

  /** Cancels a booking and hands the unit back (Section 5.6). */
  async cancel(id: string, reason: string, createdBy: string | null = null): Promise<Booking | undefined> {
    const updated = await this.update(id, {
      status: 'cancelled',
      cancellation_reason: reason,
    });
    if (updated) await this.applySideEffects(updated, createdBy);
    return updated;
  }

  /**
   * The side-effects of Section 5.6, in one place so they cannot drift apart:
   *
   *   hold                   → unit reserved, lead booked
   *   confirmed              → unit booked, lead booked
   *   cancelled              → unit back to available, lead back to
   *                            negotiation unless it has another live booking
   *
   * A unit that a human already moved past booking (sold, handed over) is left
   * alone — those belong to later modules, not to this one.
   */
  private async applySideEffects(booking: Booking, createdBy: string | null): Promise<void> {
    const unit = await db.units.get(booking.unit_id);
    if (!unit) return;

    const target =
      booking.status === 'confirmed'
        ? 'booked'
        : booking.status === 'cancelled'
          ? 'available'
          : 'reserved';

    const untouchable = unit.status === 'sold' || unit.status === 'handed_over';
    if (!untouchable && unit.status !== target) {
      await db.units.update(unit.id, { status: target, updated_at: nowIso() });
    }

    if (booking.lead_id) await this.syncLead(booking.lead_id, booking, unit.code, createdBy);
  }

  /**
   * A lead is `booked` exactly while it has a live booking (client,
   * 2026-10-22). Made → booked; its last live booking cancelled or deleted →
   * back to negotiation, so the desk follows the buyer up again.
   */
  private async syncLead(
    leadId: string,
    booking: Booking,
    unitCode: string,
    createdBy: string | null,
  ): Promise<void> {
    const lead = await db.leads.get(leadId);
    if (!lead) return;
    const live = (await db.bookings.where('lead_id').equals(leadId).toArray()).some(
      (b) => b.status !== 'cancelled' && b.id !== (booking.status === 'cancelled' ? booking.id : ''),
    );
    const target = live ? 'booked' : lead.status === 'booked' ? 'negotiation' : lead.status;
    if (target === lead.status) return;
    await leadActivityRepository.create(
      {
        lead_id: lead.id,
        activity_type: 'status_change',
        activity_date: nowIso(),
        next_follow_up_date: null,
        notes:
          target === 'booked'
            ? `${lead.status} → booked. Booking ${booking.code} made for unit ${unitCode}.`
            : `booked → negotiation. Booking ${booking.code} on ${unitCode} was cancelled.`,
      },
      createdBy,
    );
    await db.leads.update(lead.id, { status: target, updated_at: nowIso() });
  }

  async list(filters: BookingFilters = {}): Promise<Booking[]> {
    let rows = await db.bookings.toArray();

    if (filters.status && filters.status !== 'all') {
      rows = rows.filter((b) => b.status === filters.status);
    }
    if (filters.booked_by && filters.booked_by !== 'all') {
      rows = rows.filter((b) => b.booked_by === filters.booked_by);
    }
    if (filters.project_id) {
      const unitIds = new Set(
        (await unitIdsForProject(filters.project_id)).map((u) => u),
      );
      rows = rows.filter((b) => unitIds.has(b.unit_id));
    }
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      const customers = await db.customers.toArray();
      const units = await db.units.toArray();
      const customerById = new Map(customers.map((c) => [c.id, c]));
      const unitById = new Map(units.map((u) => [u.id, u]));
      rows = rows.filter((b) =>
        [
          b.code,
          b.booking_group,
          customerById.get(b.customer_id)?.name,
          unitById.get(b.unit_id)?.code,
        ]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q)),
      );
    }

    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  /*
   * `null`, not `undefined`, when the record is gone. `useLiveQuery` reports
   * its own pending state as `undefined`, so a repository returning
   * `undefined` for "no such row" leaves the detail page unable to tell a
   * deleted record from a query still in flight — it sat on "Loading…"
   * forever instead of saying the record no longer exists.
   */
  async getWithRelations(id: string): Promise<BookingWithRelations | null> {
    const booking = await this.getById(id);
    if (!booking) return null;

    const unit = await db.units.get(booking.unit_id);
    const tower = unit ? await db.towers.get(unit.tower_id) : undefined;
    const project = tower ? await db.projects.get(tower.project_id) : undefined;

    const group_siblings: BookingWithRelations['group_siblings'] = [];
    if (booking.booking_group) {
      for (const b of await this.listGroup(booking.booking_group)) {
        if (b.id === booking.id) continue;
        const u = await db.units.get(b.unit_id);
        group_siblings.push({ id: b.id, code: b.code, unit_code: u?.code ?? '—', status: b.status });
      }
    }

    return {
      ...booking,
      group_siblings,
      unit,
      tower,
      project,
      customer: await db.customers.get(booking.customer_id),
      lead: booking.lead_id ? await db.leads.get(booking.lead_id) : undefined,
      seller: booking.booked_by ? await db.users.get(booking.booked_by) : undefined,
      amount_received: await paymentRepository.totalForBooking(booking.id),
    };
  }

  async listForCustomer(customerId: string): Promise<Booking[]> {
    const rows = await db.bookings.where('customer_id').equals(customerId).toArray();
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  /** Active booking on a unit, if any — a unit cannot be double-booked. */
  async activeForUnit(unitId: string): Promise<Booking | undefined> {
    const rows = await db.bookings.where('unit_id').equals(unitId).toArray();
    return rows.find((b) => b.status !== 'cancelled');
  }

  async countByStatus(): Promise<Record<string, number>> {
    const rows = await db.bookings.toArray();
    return rows.reduce<Record<string, number>>((acc, b) => {
      acc[b.status] = (acc[b.status] ?? 0) + 1;
      return acc;
    }, {});
  }

  /** Bookings on a project — shown on the project detail page. */
  async listForProject(projectId: string): Promise<Booking[]> {
    const unitIds = new Set(await unitIdsForProject(projectId));
    const rows = await db.bookings.toArray();
    return rows
      .filter((b) => unitIds.has(b.unit_id))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  /** Confirmed value of a project's bookings — the company's own sales only. */
  async confirmedValueForProject(projectId: string): Promise<number> {
    const rows = await this.listForProject(projectId);
    return rows
      .filter((b) => b.status === 'confirmed')
      .reduce((sum, b) => sum + (Number(b.final_price) || 0), 0);
  }

  /** Deleting a booking releases the unit, like a cancellation would. */
  async removeCascade(id: string): Promise<void> {
    const booking = await this.getById(id);
    if (booking) {
      const unit = await db.units.get(booking.unit_id);
      if (unit && unit.status !== 'sold' && unit.status !== 'handed_over') {
        await db.units.update(unit.id, { status: 'available', updated_at: nowIso() });
      }
    }
    // the receipts and any refund belong to this booking and mean nothing without it
    for (const refund of await refundRepository.listForBooking(id)) {
      await refundRepository.removeCascade(refund.id);
    }
    await paymentRepository.removeForBooking(id);
    // Phase 3 — the delivery record is this booking's too
    const deliveries = await db.unit_deliveries.where('booking_id').equals(id).toArray();
    await db.unit_deliveries.bulkDelete(deliveries.map((d) => d.id));
    await documentRepository.removeForEntity('booking', id);
    await this.remove(id);
    // a deleted booking frees its lead the same way a cancelled one does
    if (booking?.lead_id) {
      await this.syncLead(booking.lead_id, { ...booking, status: 'cancelled' }, '', null);
    }
  }

  /** Bookings made from a lead, newest first — the lead page lists them. */
  async listForLead(leadId: string): Promise<Booking[]> {
    const rows = await db.bookings.where('lead_id').equals(leadId).toArray();
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
}

async function unitIdsForProject(projectId: string): Promise<string[]> {
  const towers = await db.towers.where('project_id').equals(projectId).toArray();
  const towerIds = new Set(towers.map((t) => t.id));
  return (await db.units.toArray()).filter((u) => towerIds.has(u.tower_id)).map((u) => u.id);
}

export const customerRepository = new CustomerRepository();
export const bookingRepository = new BookingRepository();
