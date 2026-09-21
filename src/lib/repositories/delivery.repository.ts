'use client';

import { db } from '../db/database';
import type { DeliveryStep, UnitDelivery } from '../db/types';
import { money } from '../domain/finance';
import {
  deliveryBlockReason,
  deliverySteps,
  projectShape,
  type DeliveryFacts,
  type ProjectShape,
} from '../domain/project';
import { BaseRepository } from './base.repository';
import { landDevelopmentRepository } from './land-development.repository';

/** Thrown when a rule stops a delivery step. `message` is the sentence to show. */
export class DeliveryBlockedError extends Error {}

export interface DeliveryState {
  shape: ProjectShape;
  steps: DeliveryStep[];
  recorded: UnitDelivery[];
  facts: DeliveryFacts;
  /** the next step to record, or null once the item is delivered */
  next: DeliveryStep | null;
  /** why `next` cannot be recorded yet, or null when it can */
  blockedBy: string | null;
}

/**
 * Phase 3 — delivering an item to its buyer (PROJECT-MODULE-PLAN.md §4).
 *
 * The one place a unit becomes `handed_over`. Before this, nothing did: the
 * status was counted by the project pipeline and set by no screen, so a
 * project could never honestly reach Closed.
 *
 * What delivery *is* comes from the project shape — keys, deed and mutation
 * for a flat; possession, deed and mutation for a plot; certificate and deed
 * for a share — and the rules that guard it live in `deliveryBlockReason`.
 */
class DeliveryRepository extends BaseRepository<UnitDelivery> {
  constructor() {
    super(() => db.unit_deliveries);
  }

  async listForUnit(unitId: string): Promise<UnitDelivery[]> {
    const rows = await db.unit_deliveries.where('unit_id').equals(unitId).toArray();
    return rows.sort((a, b) => a.event_date.localeCompare(b.event_date) || a.created_at.localeCompare(b.created_at));
  }

  /** Where a booking's delivery stands, and what the next step needs. */
  async stateForBooking(bookingId: string): Promise<DeliveryState | null> {
    const booking = await db.bookings.get(bookingId);
    if (!booking) return null;
    const unit = await db.units.get(booking.unit_id);
    if (!unit) return null;
    const tower = await db.towers.get(unit.tower_id);
    const project = tower ? await db.projects.get(tower.project_id) : undefined;
    const shape = projectShape(project?.project_type ?? 'apartment');

    const [recorded, payments, mappings] = await Promise.all([
      this.listForUnit(unit.id),
      db.payments.where('booking_id').equals(bookingId).toArray(),
      project ? db.land_project_mapping.where('project_id').equals(project.id).toArray() : [],
    ]);

    /*
     * A plot's development lives on the land (Module 1), not on the project,
     * so possession reads it there — the one record of whether the filling
     * and the roads under this plot are finished.
     */
    let developmentOutstanding = 0;
    if (shape.item === 'plot') {
      for (const m of mappings) {
        developmentOutstanding += (await landDevelopmentRepository.readinessForLand(m.land_id)).outstanding;
      }
    }

    const paid = money(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0));
    const facts: DeliveryFacts = {
      bookingStatus: booking.status,
      outstanding: money(Math.max(0, booking.final_price - paid)),
      done: recorded.map((r) => r.step),
      developmentOutstanding,
    };
    const steps = deliverySteps(shape);
    const next = steps.find((s) => !facts.done.includes(s)) ?? null;
    return {
      shape,
      steps,
      recorded,
      facts,
      next,
      blockedBy: next ? deliveryBlockReason(next, shape, facts) : null,
    };
  }

  /**
   * Records one step. The last step of the shape completes the delivery and
   * moves the unit to `handed_over` in the same call, so the unit status can
   * never disagree with the delivery record.
   */
  async record(
    bookingId: string,
    step: DeliveryStep,
    details: {
      event_date: string;
      reference_no: string | null;
      performed_by: string | null;
      remarks: string | null;
    },
    createdBy: string | null = null,
  ): Promise<UnitDelivery> {
    const state = await this.stateForBooking(bookingId);
    if (!state) throw new DeliveryBlockedError('This booking no longer exists.');
    const reason = deliveryBlockReason(step, state.shape, state.facts);
    if (reason) throw new DeliveryBlockedError(reason);

    const booking = (await db.bookings.get(bookingId))!;
    const row = await this.create(
      {
        unit_id: booking.unit_id,
        booking_id: bookingId,
        step,
        event_date: details.event_date,
        reference_no: details.reference_no,
        performed_by: details.performed_by,
        remarks: details.remarks,
      },
      createdBy,
    );

    if (step === state.steps.at(-1)) {
      await db.units.update(booking.unit_id, {
        status: 'handed_over',
        updated_at: new Date().toISOString(),
      });
    }
    return row;
  }

  /** Delete cascade for a booking. */
  async removeForBooking(bookingId: string): Promise<void> {
    const rows = await db.unit_deliveries.where('booking_id').equals(bookingId).toArray();
    await db.unit_deliveries.bulkDelete(rows.map((r) => r.id));
  }
}

export const deliveryRepository = new DeliveryRepository();
