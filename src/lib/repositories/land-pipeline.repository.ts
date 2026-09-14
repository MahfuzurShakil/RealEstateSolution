'use client';

import type {
  LandFeasibility,
  LandNegotiation,
  LandStatus,
  LandStatusEvent,
  SiteVisit,
} from '../db/types';
import { nextAutomaticStep, type LandWorkFacts } from '../domain/land';
import { localDay } from '../utils/format';
import type { NewRecord } from './base.repository';
import { landRepository } from './land.repository';
import { landNegotiationRepository } from './negotiation.repository';
import { landFeasibilityRepository, siteVisitRepository } from './site-visit.repository';

/**
 * L7 — one way in (LAND-UX-REVIEW.md sections 4 and 6).
 *
 * The four pieces of work that move a land are recorded *through here*, and
 * the status follows them in the same call: a site visit puts the land under
 * review, an approved Proceed study sends it to due diligence, the first
 * negotiation round opens negotiation, and an accepted round makes it agreed.
 * Module 6 did the same to material requests — a Purchase Order writes
 * `ordered`, and the manual buttons were deleted.
 *
 * A separate file rather than methods on the work repositories because it has
 * to import `landRepository`, and `land.repository` already imports those
 * repositories for its delete cascade. Putting it here keeps the dependency
 * one-way.
 *
 * The raw `create` methods on the work repositories are left alone on purpose:
 * the demo seeder replays histories whose statuses are already decided, and a
 * sync firing mid-replay would push seeded lands past where the story says
 * they are.
 */
class LandPipelineRepository {
  /** What the records on a land say has happened. */
  async workFacts(landId: string): Promise<LandWorkFacts> {
    const [visits, studies, rounds] = await Promise.all([
      siteVisitRepository.listForLand(landId),
      landFeasibilityRepository.listForLand(landId),
      landNegotiationRepository.listForLand(landId),
    ]);
    // visits and rounds come back newest first
    const firstVisit = visits.at(-1);
    const firstRound = rounds.at(-1);
    const accepted = rounds.find((r) => r.status === 'accepted');
    const approved = studies.find((s) => s.status === 'approved');
    return {
      firstVisit: firstVisit && {
        visit_date: firstVisit.visit_date,
        visited_by: firstVisit.visited_by,
      },
      currentStudy: studies[0] && { version_no: studies[0].version_no, status: studies[0].status },
      latestApproved: approved && {
        version_no: approved.version_no,
        recommendation: approved.recommendation,
        decided_at: approved.decided_at,
      },
      firstRound: firstRound && {
        round_no: firstRound.round_no,
        offer_date: firstRound.offer_date,
        amount: firstRound.amount,
        party: firstRound.party,
      },
      /*
       * A round has no acceptance date of its own, and `accept` is the last
       * thing to write it, so `updated_at` is the day it was accepted. Good
       * enough for a feed; a real `accepted_at` is a Phase B column.
       */
      acceptedRound: accepted && {
        round_no: accepted.round_no,
        amount: accepted.amount,
        accepted_on: localDay(accepted.updated_at),
      },
    };
  }

  /**
   * Moves the land as far as its work has earned, one logged step at a time.
   *
   * Forward only. Deleting the site visit that put a land under review does
   * not send it back to Sourced: by then the land has usually moved on, and
   * unwinding a pipeline from a deleted record would rewrite a history that
   * other records (a DD checklist, a study) were made against. A land in the
   * wrong place is what "Correct this status" is for.
   *
   * Capped at four because there are four automatic steps; the cap is what
   * guarantees the loop ends if a rule is ever written that does not advance.
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

  /* -------------------------- the four pieces of work -------------------------- */

  async recordSiteVisit(input: NewRecord<SiteVisit>, actor: string | null): Promise<SiteVisit> {
    const visit = await siteVisitRepository.create(input, actor);
    await this.syncFromWork(visit.land_id, actor);
    return visit;
  }

  /**
   * Approves or rejects a study. Only an approval can move the land, and only
   * one that recommends Proceed — `nextAutomaticStep` applies gate G1's rule.
   */
  async decideFeasibility(
    studyId: string,
    decision: { approve: boolean; note: string },
    actor: string | null,
  ): Promise<LandFeasibility | undefined> {
    const study = await landFeasibilityRepository.update(studyId, {
      status: decision.approve ? 'approved' : 'rejected',
      decided_by: actor,
      decided_at: new Date().toISOString(),
      decision_note: decision.note,
    });
    if (study && decision.approve) await this.syncFromWork(study.land_id, actor);
    return study;
  }

  async addNegotiationRound(
    input: Omit<NewRecord<LandNegotiation>, 'round_no' | 'status'>,
    actor: string | null,
  ): Promise<LandNegotiation> {
    const round = await landNegotiationRepository.addRound(input, actor);
    await this.syncFromWork(round.land_id, actor);
    return round;
  }

  /**
   * Accepting a round writes the land's agreed amount and makes it Agreed.
   *
   * The amount write moved here from the panel: the accepted round *is* the
   * deal, and a caller that could accept without writing the amount is how
   * the two came to disagree.
   */
  async acceptNegotiationRound(roundId: string, actor: string | null): Promise<void> {
    const round = await landNegotiationRepository.accept(roundId);
    if (!round) return;
    await landRepository.update(round.land_id, { final_agreed_amount: round.amount });
    await this.syncFromWork(round.land_id, actor);
  }

  /* ------------------------------ the override ------------------------------ */

  /**
   * "Correct this status" (review section 7, question 2).
   *
   * For the land bought in 2019 that is being entered today, and for the one
   * somebody moved by mistake. It skips the gates — that is the point of it —
   * so the reason is required and the history row says it was a correction,
   * which is what stops it being a quiet back door.
   */
  async correctStatus(
    landId: string,
    to: LandStatus,
    details: { event_date: string; reason: string; performed_by: string | null },
    actor: string | null,
  ): Promise<LandStatusEvent | undefined> {
    const reason = details.reason.trim();
    if (!reason) throw new Error('A correction needs a reason');
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

