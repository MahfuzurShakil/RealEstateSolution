'use client';

import { db } from '../db/database';
import type {
  Expense,
  LandDevelopmentActivity,
  LandDevelopmentProgress,
  LandFeasibility,
  LandNegotiation,
  LandStatusEvent,
  SiteVisit,
} from '../db/types';
import { localDay as day } from '../utils/format';
import { landDdRepository, isSettled, type LandDdItemWithMaster } from './dd.repository';
import { landDevelopmentRepository } from './land-development.repository';
import { landStatusEventRepository } from './land.repository';
import { landNegotiationRepository } from './negotiation.repository';
import { landFeasibilityRepository, siteVisitRepository } from './site-visit.repository';

/**
 * L7 part 4 — the Lifecycle feed (LAND-UX-REVIEW.md section 5).
 *
 * "What has happened to this land" used to be told in four fragments: status
 * changes on the Timeline tab, and visits, studies and rounds each on a tab of
 * their own. This reads every record type that marks a dated moment on a land
 * and returns them as one list, so the page can tell the story once.
 *
 * Read-only, and nothing new is stored: every entry is a view of a row that
 * already exists, so the feed can never disagree with the tab that owns it.
 */
export type LifecycleKind =
  | 'status'
  | 'visit'
  | 'study'
  | 'round'
  | 'dd'
  | 'development'
  | 'payment';

interface EntryBase {
  /** stable across re-reads — the feed remembers which entries are open */
  key: string;
  /** YYYY-MM-DD, the day the thing happened */
  date: string;
  /** breaks ties within a day: later writes sort later */
  at: string;
}

export type LifecycleEntry =
  | (EntryBase & { kind: 'status'; event: LandStatusEvent })
  | (EntryBase & { kind: 'visit'; visit: SiteVisit })
  | (EntryBase & { kind: 'study'; study: LandFeasibility; isCurrent: boolean })
  | (EntryBase & { kind: 'round'; round: LandNegotiation; ownerName: string | null })
  | (EntryBase & { kind: 'dd'; items: LandDdItemWithMaster[] })
  | (EntryBase & {
      kind: 'development';
      progress: LandDevelopmentProgress;
      activity: LandDevelopmentActivity;
    })
  | (EntryBase & { kind: 'payment'; expense: Expense; ownerName: string | null });

/**
 * When a due-diligence item reached where it is. A waiver is dated by the
 * waiver, a review by the review, and an item only submitted by the
 * submission — the latest thing a person actually did to it.
 */
function ddMilestoneAt(row: LandDdItemWithMaster): string | null {
  return row.waived_at ?? row.reviewed_at ?? row.submitted_at ?? null;
}

class LandLifecycleRepository {
  async feedForLand(landId: string): Promise<LifecycleEntry[]> {
    const [events, visits, studies, rounds, ddRows, activities, expenses, mappings] =
      await Promise.all([
        landStatusEventRepository.listForLand(landId),
        siteVisitRepository.listForLand(landId),
        landFeasibilityRepository.listForLand(landId),
        landNegotiationRepository.listForLand(landId),
        landDdRepository.listForLand(landId),
        landDevelopmentRepository.listForLand(landId),
        db.expenses.where('land_id').equals(landId).toArray(),
        db.land_owner_mapping.where('land_id').equals(landId).toArray(),
      ]);

    // rounds name the owner, payments name the owner's mapping on this land
    const people = await db.landowners.bulkGet(mappings.map((m) => m.owner_id));
    const ownerNameById = new Map(
      people.filter((p) => p !== undefined).map((p) => [p.id, p.name] as const),
    );
    const owners = new Map(
      mappings.map((m) => [m.id, ownerNameById.get(m.owner_id) ?? null] as const),
    );

    const entries: LifecycleEntry[] = [];

    for (const event of events) {
      entries.push({ kind: 'status', key: `status:${event.id}`, date: day(event.event_date), at: event.created_at, event });
    }

    for (const visit of visits) {
      entries.push({ kind: 'visit', key: `visit:${visit.id}`, date: day(visit.visit_date), at: visit.created_at, visit });
    }

    /*
     * One entry per version, dated by the last thing that happened to it — a
     * study decided in June belongs in June, not on the day somebody opened a
     * draft in April. The entry itself shows the whole trail.
     */
    studies.forEach((study, i) => {
      const at = study.decided_at ?? study.submitted_at ?? study.created_at;
      entries.push({ kind: 'study', key: `study:${study.id}`, date: day(at), at, study, isCurrent: i === 0 });
    });

    for (const round of rounds) {
      entries.push({
        kind: 'round',
        key: `round:${round.id}`,
        date: day(round.offer_date),
        at: round.created_at,
        round,
        ownerName: round.owner_id ? (ownerNameById.get(round.owner_id) ?? null) : null,
      });
    }

    /*
     * Due diligence is grouped by day. A lawyer returns a search report that
     * settles five checks at once, and five rows saying so is noise that
     * pushes the visit from the same week off the screen. Items still pending
     * have no milestone and are not in the feed — the Legal tab is where the
     * outstanding list lives.
     */
    const ddByDay = new Map<string, LandDdItemWithMaster[]>();
    for (const row of ddRows) {
      const at = ddMilestoneAt(row);
      if (!at || row.status === 'pending') continue;
      const bucket = ddByDay.get(day(at));
      if (bucket) bucket.push(row);
      else ddByDay.set(day(at), [row]);
    }
    for (const [date, items] of ddByDay) {
      const at = items.map(ddMilestoneAt).filter(Boolean).sort().at(-1) ?? date;
      // settled first, then failures, so the entry reads as the lawyer would report it
      items.sort((a, b) => Number(isSettled(b.status)) - Number(isSettled(a.status)));
      entries.push({ kind: 'dd', key: `dd:${date}`, date, at, items });
    }

    for (const activity of activities) {
      for (const progress of activity.updates) {
        entries.push({
          kind: 'development',
          key: `development:${progress.id}`,
          date: day(progress.progress_date),
          at: progress.created_at,
          progress,
          activity,
        });
      }
    }

    for (const expense of expenses) {
      entries.push({
        kind: 'payment',
        key: `payment:${expense.id}`,
        date: day(expense.expense_date),
        at: expense.created_at,
        expense,
        ownerName: expense.owner_mapping_id ? (owners.get(expense.owner_mapping_id) ?? null) : null,
      });
    }

    // newest first; the component can reverse it
    return entries.sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at));
  }
}

export const landLifecycleRepository = new LandLifecycleRepository();
