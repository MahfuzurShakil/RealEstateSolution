'use client';

import { db } from '../db/database';
import type {
  Booking,
  BookingStatus,
  Customer,
  DiscountApprovalRule,
  Lead,
  Project,
  Tower,
  PaymentMethod,
  Unit,
  User,
  UserRole,
} from '../db/types';
import { derivedStatus, finalPrice, needsDiscountApproval } from '../domain/booking';
import { nextCode, nowIso } from '../utils/id';
import { BaseRepository, type NewRecord } from './base.repository';
import { documentRepository } from './document.repository';
import { leadActivityRepository, normalizePhone } from './lead.repository';
import { paymentRepository } from './payment.repository';

export interface BookingFilters {
  search?: string;
  status?: BookingStatus | 'all';
  project_id?: string;
  booked_by?: string | 'all';
  /** narrows to bookings a manager has to act on */
  awaiting_approval?: boolean;
}

/** A booking plus everything its detail page shows. */
export interface BookingWithRelations extends Booking {
  customer: Customer | undefined;
  unit: Unit | undefined;
  tower: Tower | undefined;
  project: Project | undefined;
  lead: Lead | undefined;
  seller: User | undefined;
  approver: User | undefined;
  /** money actually received against this booking so far */
  amount_received: number;
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

  async getWithRelations(id: string): Promise<CustomerWithRelations | undefined> {
    const customer = await this.getById(id);
    if (!customer) return undefined;

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

    return {
      ...customer,
      bookings,
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

class DiscountApprovalRuleRepository extends BaseRepository<DiscountApprovalRule> {
  constructor() {
    super(() => db.discount_approval_rules);
  }

  /** Ceiling for a role, or null when no rule is configured (Section 5.4). */
  async maxDiscountPctFor(role: UserRole | undefined): Promise<number | null> {
    if (!role) return null;
    const rule = await db.discount_approval_rules.where('role').equals(role).first();
    return rule ? Number(rule.max_discount_pct) : null;
  }

  async upsertForRole(role: UserRole, maxDiscountPct: number): Promise<void> {
    const existing = await db.discount_approval_rules.where('role').equals(role).first();
    if (existing) await this.update(existing.id, { max_discount_pct: maxDiscountPct });
    else await this.create({ role, max_discount_pct: maxDiscountPct });
  }
}

export interface BookingInput {
  customer_id: string;
  unit_id: string;
  lead_id?: string | null;
  booking_date: string;
  base_price: number;
  floor_premium: number;
  facing_premium: number;
  parking_charge: number;
  other_charges: number;
  discount_amount: number;
  booking_amount: number;
  installment_tenure_months?: number | null;
  booked_by: string | null;
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
  } | null;
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
   * Creates a booking and applies every side-effect of Section 5.6 together:
   * the unit is reserved (or marked booked when the booking lands confirmed),
   * the lead is moved to `booked` on confirmation, and the status itself is
   * derived from the gating rule rather than chosen.
   */
  async createBooking(input: BookingInput, createdBy: string | null = null): Promise<Booking> {
    const unit = await db.units.get(input.unit_id);
    if (!unit) throw new Error('Unit not found');

    const seller = input.booked_by ? await db.users.get(input.booked_by) : undefined;
    const ceiling = await discountApprovalRuleRepository.maxDiscountPctFor(seller?.role);
    const requiresApproval = needsDiscountApproval(
      input.base_price,
      input.discount_amount,
      ceiling,
    );

    const discount_approval_status = requiresApproval ? 'pending' : 'not_required';
    // the money decides this, not a checkbox
    const received = (input.payment?.amount ?? 0) >= input.booking_amount && input.booking_amount > 0;
    const status = derivedStatus({
      booking_amount_received: received,
      discount_approval_status,
      status: 'hold',
    });

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
        other_charges: input.other_charges,
        discount_amount: input.discount_amount,
        final_price: finalPrice(input),
        booking_amount: input.booking_amount,
        booking_amount_received: received,
        installment_tenure_months: input.installment_tenure_months ?? null,
        discount_approval_status,
        discount_approved_by: null,
        discount_decision_note: null,
        status,
        cancellation_reason: null,
        booked_by: input.booked_by,
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
   * Re-derives `booking_amount_received` from the payments actually recorded,
   * then lets the gating rule settle the status. Called after any money moves,
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

  /** Edits the money on a booking and re-runs the gating rule. */
  async updatePricing(
    id: string,
    input: Omit<
      BookingInput,
      'customer_id' | 'unit_id' | 'lead_id' | 'booked_by' | 'payment'
    >,
    createdBy: string | null = null,
  ): Promise<Booking | undefined> {
    const current = await this.getById(id);
    if (!current) return undefined;

    const seller = current.booked_by ? await db.users.get(current.booked_by) : undefined;
    const ceiling = await discountApprovalRuleRepository.maxDiscountPctFor(seller?.role);
    const requiresApproval = needsDiscountApproval(
      input.base_price,
      input.discount_amount,
      ceiling,
    );

    /*
     * Re-submitting after a rejection is the documented way back (5.6): the
     * discount is adjusted and goes round again. If it now sits inside the
     * ceiling, no approval is needed at all.
     */
    let discount_approval_status = current.discount_approval_status;
    if (!requiresApproval) discount_approval_status = 'not_required';
    else if (current.discount_approval_status !== 'approved') discount_approval_status = 'pending';

    // changing the expected booking amount can flip whether it is covered
    const received = await paymentRepository.totalForBooking(id);
    const isReceived = input.booking_amount > 0 && received >= input.booking_amount;

    const updated = await this.update(id, {
      ...input,
      booking_amount_received: isReceived,
      final_price: finalPrice(input),
      discount_approval_status,
      discount_approved_by:
        discount_approval_status === 'approved' ? current.discount_approved_by : null,
      // a resubmitted discount starts with a clean slate
      discount_decision_note:
        discount_approval_status === current.discount_approval_status
          ? current.discount_decision_note
          : null,
      status: derivedStatus({
        booking_amount_received: isReceived,
        discount_approval_status,
        status: current.status,
      }),
    });

    if (updated) await this.applySideEffects(updated, createdBy);
    return updated;
  }

  /** Records a receipt against the booking, then re-runs the gating rule. */
  async recordPayment(
    id: string,
    input: {
      amount: number;
      payment_date: string;
      payment_method: PaymentMethod;
      reference_no?: string | null;
      notes?: string | null;
      received_by?: string | null;
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
        reference_no: input.reference_no,
        received_by: input.received_by ?? current.booked_by ?? null,
        notes: input.notes,
      },
      createdBy,
    );
    return this.syncFromPayments(id, createdBy);
  }

  /** Deletes a receipt entered by mistake, then re-runs the gating rule. */
  async removePayment(
    bookingId: string,
    paymentId: string,
    createdBy: string | null = null,
  ): Promise<Booking | undefined> {
    await paymentRepository.removeCascade(paymentId);
    return this.syncFromPayments(bookingId, createdBy);
  }

  /**
   * Approve or reject the discount (Section 5.6). A rejection drops the
   * booking back to `hold` with the reason recorded, so the sales person can
   * adjust and submit again.
   */
  async decideDiscount(
    id: string,
    decision: 'approved' | 'rejected',
    approverId: string | null,
    note: string,
    createdBy: string | null = null,
  ): Promise<Booking | undefined> {
    const current = await this.getById(id);
    if (!current) return undefined;

    const updated = await this.update(id, {
      discount_approval_status: decision,
      discount_approved_by: decision === 'approved' ? approverId : null,
      discount_decision_note: note.trim() || null,
      // a rejection lands back on `hold`, which derivedStatus works out on its own
      status: derivedStatus({ ...current, discount_approval_status: decision }),
    });

    if (updated) {
      await this.applySideEffects(updated, createdBy);
      // the decision belongs on the lead's trail too, when there is one
      if (updated.lead_id) {
        await leadActivityRepository.create(
          {
            lead_id: updated.lead_id,
            activity_type: 'status_change',
            activity_date: nowIso(),
            next_follow_up_date: null,
            notes: `Discount ${decision} on ${updated.code}${note.trim() ? `. ${note.trim()}` : ''}`,
          },
          createdBy,
        );
      }
    }
    return updated;
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
   *   hold / pending_approval → unit reserved
   *   confirmed              → unit booked, lead booked
   *   cancelled              → unit back to available
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

    if (booking.status === 'confirmed' && booking.lead_id) {
      const lead = await db.leads.get(booking.lead_id);
      if (lead && lead.status !== 'booked') {
        await leadActivityRepository.create(
          {
            lead_id: lead.id,
            activity_type: 'status_change',
            activity_date: nowIso(),
            next_follow_up_date: null,
            notes: `${lead.status} → booked. Booking ${booking.code} confirmed for unit ${unit.code}.`,
          },
          createdBy,
        );
        await db.leads.update(lead.id, { status: 'booked', updated_at: nowIso() });
      }
    }
  }

  async list(filters: BookingFilters = {}): Promise<Booking[]> {
    let rows = await db.bookings.toArray();

    if (filters.status && filters.status !== 'all') {
      rows = rows.filter((b) => b.status === filters.status);
    }
    if (filters.awaiting_approval) {
      rows = rows.filter((b) => b.discount_approval_status === 'pending');
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
        [b.code, customerById.get(b.customer_id)?.name, unitById.get(b.unit_id)?.code]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q)),
      );
    }

    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async getWithRelations(id: string): Promise<BookingWithRelations | undefined> {
    const booking = await this.getById(id);
    if (!booking) return undefined;

    const unit = await db.units.get(booking.unit_id);
    const tower = unit ? await db.towers.get(unit.tower_id) : undefined;
    const project = tower ? await db.projects.get(tower.project_id) : undefined;

    return {
      ...booking,
      unit,
      tower,
      project,
      customer: await db.customers.get(booking.customer_id),
      lead: booking.lead_id ? await db.leads.get(booking.lead_id) : undefined,
      seller: booking.booked_by ? await db.users.get(booking.booked_by) : undefined,
      amount_received: await paymentRepository.totalForBooking(booking.id),
      approver: booking.discount_approved_by
        ? await db.users.get(booking.discount_approved_by)
        : undefined,
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
    await paymentRepository.removeForBooking(id);
    await documentRepository.removeForEntity('booking', id);
    await this.remove(id);
  }
}

async function unitIdsForProject(projectId: string): Promise<string[]> {
  const towers = await db.towers.where('project_id').equals(projectId).toArray();
  const towerIds = new Set(towers.map((t) => t.id));
  return (await db.units.toArray()).filter((u) => towerIds.has(u.tower_id)).map((u) => u.id);
}

export const customerRepository = new CustomerRepository();
export const bookingRepository = new BookingRepository();
export const discountApprovalRuleRepository = new DiscountApprovalRuleRepository();
