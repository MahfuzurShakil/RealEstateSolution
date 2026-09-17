'use client';

import { db } from '../db/database';
import type {
  JvShareBasis,
  Land,
  LandDdItem,
  LandDevelopmentActivity,
  LandDevelopmentProgress,
  LandNegotiation,
  LandStatus,
  LandStatusEvent,
  SiteVisit,
} from '../db/types';
import {
  LAND_STATUS_META,
  allowedNextStatuses,
  closingBlockReason,
  feasibilityGateBlockReason,
  landWaitingOn,
  nextAutomaticStep,
  splitAmountByShare,
  type LandWorkFacts,
  type WaitingKey,
} from '../domain/land';
import { localDay } from '../utils/format';
import type { NewRecord, UpdateRecord } from './base.repository';
import { landDdRepository } from './dd.repository';
import {
  landDevelopmentProgressRepository,
  landDevelopmentRepository,
} from './land-development.repository';
import { paymentScheduleRepository } from './finance.repository';
import {
  landJvRepository,
  landOwnerMappingRepository,
  landRepository,
  landStatusEventRepository,
} from './land.repository';
import { landNegotiationRepository } from './negotiation.repository';
import { landFeasibilityRepository, siteVisitRepository } from './site-visit.repository';

/** A rule stopped the change. `message` is the sentence to show the user. */
export class PipelineBlockedError extends Error {}

/**
 * L7 — every land status change goes through here (LAND-L7-PLAN.md).
 *
 * The page no longer has a place to type a status in. The four middle steps
 * follow the work recorded on the Timeline — a visit, a due-diligence check, a
 * round, an accepted round — and are applied in the same call that records the
 * work. Registration and JV signing are recorded where the deal is closed, and
 * only the real decisions (reject, dispose, reopen, correct) are free-standing.
 * Keeping all of it in one repository is what stops a screen from recording
 * the work without the status following, or skipping a BRD rule.
 *
 * A separate file because it imports `landRepository`, which already imports
 * the work repositories for its delete cascade.
 *
 * The raw `create` methods on the work repositories are left alone on purpose:
 * the demo seeder replays histories whose statuses are already decided.
 */
class LandPipelineRepository {
  /** What the records on a land say has happened. */
  async workFacts(landId: string): Promise<LandWorkFacts> {
    const [land, visits, ddItems, rounds, activities, development] = await Promise.all([
      landRepository.getById(landId),
      siteVisitRepository.listForLand(landId),
      landDdRepository.listForLand(landId),
      landNegotiationRepository.listForLand(landId),
      landDevelopmentRepository.listForLand(landId),
      landDevelopmentRepository.readinessForLand(landId),
    ]);
    // visits and rounds come back newest first; a planned visit has not happened
    const firstVisit = visits.filter((v) => v.status !== 'planned').at(-1);
    const worked = ddItems
      .filter((d) => d.status !== 'pending' && (d.submitted_at ?? d.updated_at))
      .sort((a, b) => (a.submitted_at ?? a.updated_at).localeCompare(b.submitted_at ?? b.updated_at))[0];
    const firstRound = rounds.at(-1);
    const accepted = rounds.find((r) => r.status === 'accepted');
    return {
      firstVisit: firstVisit && { visit_date: firstVisit.visit_date, visited_by: firstVisit.visited_by },
      firstDdWork: worked && {
        at: worked.submitted_at ?? worked.updated_at,
        label: worked.item?.label ?? 'a checklist item',
      },
      firstRound: firstRound && {
        round_no: firstRound.round_no,
        offer_date: firstRound.offer_date,
        amount: firstRound.amount,
        party: firstRound.party,
      },
      // `accept` is the last write to an accepted round, so its updated_at is the day
      acceptedRound: accepted && {
        round_no: accepted.round_no,
        amount: accepted.amount,
        accepted_on: localDay(accepted.updated_at),
      },
      development: {
        total: development.total,
        outstanding: development.outstanding,
        firstStartedOn: activities
          .map((a) => a.start_date)
          .filter((d): d is string => Boolean(d))
          .sort()[0],
      },
      noDevelopmentRequired: Boolean(land?.no_development_required),
    };
  }

  /**
   * Moves the land as far as its work has earned, one logged step at a time.
   *
   * Forward only: deleting the visit that moved a land does not move it back,
   * because by then other records were made against the later status. A land
   * in the wrong place is what `correctStatus` is for.
   */
  async syncFromWork(landId: string, actor: string | null = null): Promise<LandStatusEvent[]> {
    const logged: LandStatusEvent[] = [];
    for (let i = 0; i < 4; i++) {
      const land = await landRepository.getById(landId);
      if (!land) break;
      const step = nextAutomaticStep(land.status, await this.workFacts(landId), land.acquisition_type);
      if (!step) break;
      const moved = await landRepository.setStatus(
        landId,
        step.to,
        {
          event_date: step.event_date,
          performed_by: step.performed_by,
          amount: step.amount,
          reference_no: null,
          remarks: step.remarks,
          source: 'automatic',
        },
        actor,
      );
      if (!moved) break;
      logged.push(moved.event);
    }
    return logged;
  }

  /* ------------------------------ the work ------------------------------ */

  async recordSiteVisit(input: NewRecord<SiteVisit>, actor: string | null): Promise<SiteVisit> {
    const visit = await siteVisitRepository.create(input, actor);
    await this.syncFromWork(visit.land_id, actor);
    return visit;
  }

  /** Editing a visit can turn a planned one into a done one, which is work. */
  async updateSiteVisit(
    id: string,
    changes: UpdateRecord<SiteVisit>,
    actor: string | null,
  ): Promise<SiteVisit | undefined> {
    const visit = await siteVisitRepository.update(id, changes);
    if (visit) await this.syncFromWork(visit.land_id, actor);
    return visit;
  }

  async updateDdItem(
    id: string,
    changes: UpdateRecord<LandDdItem>,
    actor: string | null,
  ): Promise<LandDdItem | undefined> {
    const row = await landDdRepository.update(id, changes);
    if (row) await this.syncFromWork(row.land_id, actor);
    return row;
  }

  /* --------------------------- waiting on --------------------------- */

  /**
   * What each land is waiting on (`landWaitingOn`), for the land list.
   *
   * Every table is read once and grouped in memory rather than queried per
   * land: the list shows a page of lands, and a query per land per table is
   * how a list page starts taking seconds.
   */
  async waitingOnForLands(lands: Land[]): Promise<Map<string, { key: WaitingKey; text: string }>> {
    const ids = new Set(lands.map((l) => l.id));
    const [visits, studies, ddItems, rounds, schedules, activities, checklist] = await Promise.all([
      db.site_visits.toArray(),
      db.land_feasibility.toArray(),
      db.land_dd_items.toArray(),
      db.land_negotiations.toArray(),
      db.payment_schedules.where('entity_type').equals('land').toArray(),
      db.land_development_activities.toArray(),
      db.dd_checklist_items.toArray(),
    ]);

    const settledDd = new Set(['passed', 'conditionally_approved', 'waived', 'not_applicable']);
    const byLand = <T extends { land_id: string }>(rows: T[]) => {
      const map = new Map<string, T[]>();
      for (const row of rows) {
        if (!ids.has(row.land_id)) continue;
        const bucket = map.get(row.land_id);
        if (bucket) bucket.push(row);
        else map.set(row.land_id, [row]);
      }
      return map;
    };
    const visitsBy = byLand(visits);
    const studiesBy = byLand(studies);
    const ddBy = byLand(ddItems);
    const roundsBy = byLand(rounds);
    const activitiesBy = byLand(activities);
    const scheduleFor = new Set(schedules.map((s) => s.entity_id));

    const out = new Map<string, { key: WaitingKey; text: string }>();
    for (const land of lands) {
      const landStudies = (studiesBy.get(land.id) ?? []).sort((a, b) => b.version_no - a.version_no);
      const landDd = ddBy.get(land.id) ?? [];
      const mandatory = landDd.filter((d) => d.is_mandatory);
      const landRounds = (roundsBy.get(land.id) ?? []).sort((a, b) => b.round_no - a.round_no);
      const landActivities = activitiesBy.get(land.id) ?? [];
      out.set(
        land.id,
        landWaitingOn({
          status: land.status,
          acquisitionType: land.acquisition_type,
          doneVisits: (visitsBy.get(land.id) ?? []).filter((v) => v.status !== 'planned').length,
          feasibility: {
            current: landStudies[0],
            latestApproved: landStudies.find((s) => s.status === 'approved'),
          },
          dd: {
            mandatoryTotal: mandatory.length,
            mandatoryOutstanding: mandatory.filter((d) => !settledDd.has(d.status)).length,
            mandatoryFailed: mandatory.filter((d) => d.status === 'failed').length,
          },
          openRound: landRounds.find((r) => r.status === 'open'),
          roundCount: landRounds.length,
          hasSchedule: scheduleFor.has(land.id),
          development: {
            total: landActivities.length,
            outstanding: landActivities.filter(
              (a) => a.status !== 'completed' && a.status !== 'cancelled',
            ).length,
          },
          noDevelopmentRequired: Boolean(land.no_development_required),
        }),
      );
    }
    // the checklist master is read only to keep this a single round of queries
    void checklist;
    return out;
  }

  /* ------------------------- land development ------------------------- */

  /**
   * Development work is what moves a held plot to Under Development and then to
   * Ready for Project, so every write to it goes through here. A plot nobody
   * has assessed stays `acquired`, which is the honest answer.
   */
  async recordDevelopmentActivity(
    input: NewRecord<LandDevelopmentActivity>,
    actor: string | null,
  ): Promise<LandDevelopmentActivity> {
    const activity = await landDevelopmentRepository.create(input, actor);
    await this.syncFromWork(activity.land_id, actor);
    return activity;
  }

  async updateDevelopmentActivity(
    id: string,
    changes: UpdateRecord<LandDevelopmentActivity>,
    actor: string | null,
  ): Promise<LandDevelopmentActivity | undefined> {
    const activity = await landDevelopmentRepository.update(id, changes);
    if (activity) await this.syncFromWork(activity.land_id, actor);
    return activity;
  }

  async removeDevelopmentActivity(id: string, actor: string | null): Promise<void> {
    const activity = await landDevelopmentRepository.getById(id);
    await landDevelopmentRepository.removeCascade(id);
    if (activity) await this.syncFromWork(activity.land_id, actor);
  }

  async recordDevelopmentProgress(
    input: NewRecord<LandDevelopmentProgress>,
    actor: string | null,
  ): Promise<void> {
    await landDevelopmentProgressRepository.record(input, actor);
    const activity = await landDevelopmentRepository.getById(input.activity_id);
    if (activity) await this.syncFromWork(activity.land_id, actor);
  }

  /** The "this plot needs no development" flag — it makes a held plot ready. */
  async setNoDevelopmentRequired(
    landId: string,
    value: boolean,
    actor: string | null,
  ): Promise<void> {
    await landRepository.update(landId, { no_development_required: value });
    await this.syncFromWork(landId, actor);
  }

  /* ------------------------------- on hold ------------------------------- */

  /**
   * Back to where the land was before it was parked.
   *
   * The status it left is read from its own history rather than stored on the
   * land: the history row is written anyway, and a second copy of the same
   * fact is one more thing to keep in step. The work is then re-checked, so a
   * land that was parked at Agreed and registered on paper meanwhile catches
   * up in the same call.
   */
  async resumeFromHold(
    landId: string,
    details: { event_date: string; remarks: string | null },
    actor: string | null,
  ): Promise<LandStatusEvent | undefined> {
    const land = await landRepository.getById(landId);
    if (!land || land.status !== 'on_hold') {
      throw new PipelineBlockedError('This land is not on hold.');
    }
    const history = await landStatusEventRepository.listForLand(landId);
    const before = [...history].reverse().find((e) => e.to_status === 'on_hold')?.from_status;
    const moved = await landRepository.setStatus(
      landId,
      before ?? 'sourced',
      {
        event_date: details.event_date,
        performed_by: null,
        amount: null,
        reference_no: null,
        remarks: details.remarks ?? `Resumed — back to ${LAND_STATUS_META[before ?? 'sourced'].label}.`,
        source: 'manual',
      },
      actor,
    );
    await this.syncFromWork(landId, actor);
    return moved?.event;
  }

  /** Why a round cannot be recorded yet (BRD SITE-003), or null. */
  async negotiationBlockReason(landId: string): Promise<string | null> {
    const studies = await landFeasibilityRepository.listForLand(landId);
    return feasibilityGateBlockReason({
      current: studies[0],
      latestApproved: studies.find((s) => s.status === 'approved'),
    });
  }

  async addNegotiationRound(
    input: Omit<NewRecord<LandNegotiation>, 'round_no' | 'status'>,
    actor: string | null,
  ): Promise<LandNegotiation> {
    const blocked = await this.negotiationBlockReason(input.land_id);
    if (blocked) throw new PipelineBlockedError(blocked);
    const round = await landNegotiationRepository.addRound(input, actor);
    await this.syncFromWork(round.land_id, actor);
    return round;
  }

  /** The accepted round is the deal: it writes the agreed amount and makes the land Agreed. */
  async acceptNegotiationRound(roundId: string, actor: string | null): Promise<void> {
    const round = await landNegotiationRepository.accept(roundId);
    if (!round) return;
    await landRepository.update(round.land_id, { final_agreed_amount: round.amount });
    await this.fillOwnerAmounts(round.land_id, round.amount);
    await this.syncFromWork(round.land_id, actor);
  }

  /**
   * Once a price is agreed, each owner's part of it (BRD LAND-002, ACQ-003).
   *
   * Split by share, and only into owners with no amount yet: an amount somebody
   * set by hand on the Owners tab — the brother who took less — is a decision,
   * and a later round must not overwrite it. Where the parts then stop adding
   * up, the Owners tab says so.
   */
  async fillOwnerAmounts(landId: string, total: number): Promise<void> {
    if (!(total > 0)) return;
    const mappings = await landOwnerMappingRepository.listForLand(landId);
    const split = splitAmountByShare(
      total,
      mappings.map((m) => ({ id: m.id, share: m.ownership_share_pct })),
    );
    for (const m of mappings) {
      if (m.agreed_amount == null) {
        await landOwnerMappingRepository.update(m.id, { agreed_amount: split[m.id] });
      }
    }
  }

  /** The Owners tab's edit: the amounts as the user set them. */
  async setOwnerAmounts(amounts: Record<string, number | null>): Promise<void> {
    for (const [mappingId, amount] of Object.entries(amounts)) {
      await landOwnerMappingRepository.update(mappingId, { agreed_amount: amount });
    }
  }

  /* --------------------------- closing the deal --------------------------- */

  /** Why registration / JV signing cannot be recorded yet, or null. */
  async closingBlockReason(landId: string): Promise<string | null> {
    const land = await landRepository.getById(landId);
    if (!land) return 'This land no longer exists.';
    const [dd, schedule] = await Promise.all([
      landDdRepository.progressForLand(landId),
      paymentScheduleRepository.withInstallmentsForLand(landId),
    ]);
    return closingBlockReason({
      status: land.status,
      acquisitionType: land.acquisition_type,
      dd,
      hasSchedule: Boolean(schedule),
    });
  }

  /** A direct purchase becomes Acquired when the deed is registered. */
  async recordRegistration(
    landId: string,
    details: {
      event_date: string;
      amount: number;
      reference_no: string | null;
      performed_by: string | null;
      remarks: string | null;
    },
    actor: string | null,
  ): Promise<LandStatusEvent> {
    const blocked = await this.closingBlockReason(landId);
    if (blocked) throw new PipelineBlockedError(blocked);
    const moved = await landRepository.setStatus(landId, 'acquired', { ...details, source: 'manual' }, actor);
    if (!moved) throw new PipelineBlockedError('This land no longer exists.');
    await landRepository.update(landId, { final_agreed_amount: details.amount });
    await this.fillOwnerAmounts(landId, details.amount);
    return moved.event;
  }

  /** A joint venture becomes JV Signed when the agreement is signed; the split is confirmed here. */
  async recordJvSigning(
    landId: string,
    details: {
      event_date: string;
      developer_share_pct: number;
      landowner_share_pct: number;
      jv_share_basis: JvShareBasis;
      cash_payable: number | null;
      reference_no: string | null;
      remarks: string | null;
    },
    actor: string | null,
  ): Promise<LandStatusEvent> {
    if (Math.abs(details.developer_share_pct + details.landowner_share_pct - 100) > 0.001) {
      throw new PipelineBlockedError('Developer + landowner share must total 100%.');
    }
    const blocked = await this.closingBlockReason(landId);
    if (blocked) throw new PipelineBlockedError(blocked);
    const moved = await landRepository.setStatus(
      landId,
      'acquired',
      {
        event_date: details.event_date,
        amount: details.cash_payable,
        reference_no: details.reference_no,
        performed_by: null,
        remarks: details.remarks,
        source: 'manual',
      },
      actor,
    );
    if (!moved) throw new PipelineBlockedError('This land no longer exists.');
    const existing = await landJvRepository.getForLand(landId);
    await landJvRepository.upsertForLand(landId, {
      developer_share_pct: details.developer_share_pct,
      landowner_share_pct: details.landowner_share_pct,
      jv_share_basis: details.jv_share_basis,
      agreement_date: details.event_date,
      power_of_attorney: existing?.power_of_attorney ?? false,
      poa_reference: existing?.poa_reference ?? null,
    });
    if (details.cash_payable != null) {
      await landRepository.update(landId, { final_agreed_amount: details.cash_payable });
      await this.fillOwnerAmounts(landId, details.cash_payable);
    }
    return moved.event;
  }

  /* ------------------------------ decisions ------------------------------ */

  /** Reject, dispose or reopen — the statuses only a person can decide. */
  async recordDecision(
    landId: string,
    to: LandStatus,
    details: {
      event_date: string;
      amount: number | null;
      reference_no: string | null;
      performed_by: string | null;
      remarks: string | null;
    },
    actor: string | null,
  ): Promise<LandStatusEvent> {
    const land = await landRepository.getById(landId);
    if (!land) throw new PipelineBlockedError('This land no longer exists.');
    if (!allowedNextStatuses(land.status).includes(to)) {
      throw new PipelineBlockedError(
        `A land that is ${LAND_STATUS_META[land.status].label} cannot be marked ${LAND_STATUS_META[to].label}.`,
      );
    }
    const moved = await landRepository.setStatus(landId, to, { ...details, source: 'manual' }, actor);
    if (!moved) throw new PipelineBlockedError('This land no longer exists.');
    return moved.event;
  }

  /**
   * "Correct this status" — for land bought before this system existed, or
   * moved by mistake. Skips the rules, so the reason is required and the
   * history row says it was a correction.
   */
  async correctStatus(
    landId: string,
    to: LandStatus,
    details: { event_date: string; reason: string; performed_by: string | null },
    actor: string | null,
  ): Promise<LandStatusEvent | undefined> {
    const reason = details.reason.trim();
    if (!reason) throw new PipelineBlockedError('A correction needs a reason');
    const moved = await landRepository.setStatus(
      landId,
      to,
      {
        event_date: details.event_date,
        performed_by: details.performed_by,
        amount: null,
        reference_no: null,
        remarks: reason,
        source: 'correction',
      },
      actor,
    );
    return moved?.event;
  }
}

export const landPipelineRepository = new LandPipelineRepository();
