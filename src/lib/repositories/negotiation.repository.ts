'use client';

import { db } from '../db/database';
import type {
  AcquisitionCostHead,
  LandAcquisitionCost,
  LandNegotiation,
} from '../db/types';
import { ACQUISITION_COST_HEADS } from '../db/types';
import { BaseRepository, type NewRecord } from './base.repository';

/**
 * Batch L4 — the negotiation ladder and the acquisition cost sheet
 * (BRD section 10, ACQ-001 and ACQ-002).
 */

/** Two decimals, the same rounding the procurement domain uses. */
const money = (n: number) => Math.round(n * 100) / 100;

/** One line of the cost sheet with its actual filled in from the ledger. */
export interface AcquisitionCostLine {
  cost_head: AcquisitionCostHead;
  estimated: number;
  /** ledger payments plus anything paid before this system (v29) */
  actual: number;
  /** v29 — the part of `actual` that predates this system */
  historic: number;
  remarks: string | null;
  /** null when there is no estimate to compare against */
  variance: number | null;
}

export interface AcquisitionCostSheet {
  lines: AcquisitionCostLine[];
  /** acquisition heads only — the land itself and what it took to get it */
  estimatedTotal: number;
  actualTotal: number;
  /** what the ledger holds that no line accounts for — see the note below */
  unclassifiedActual: number;
  /**
   * v29 — land development (filling, boundary, internal roads): its budget
   * and what has been incurred, from the development activities (DEV-001…).
   */
  development: { estimated: number; actual: number };
  /** v29 — acquisition plus development: what this land costs in cash */
  landTotal: { estimated: number; actual: number };
  /**
   * v29 — on a joint venture, what the landowner is paid in flats.
   *
   * Not cash and not in `landTotal`, but it is the larger part of what a JV
   * plot costs, and an owner comparing a JV project with a bought one needs
   * to see it (client decision 2026-10-06: show both). Valued at the list
   * price of the units allocated to the landowner in the projects on this
   * land; `null` until a project on it has allocated any.
   */
  landownerShare: { units: number; value: number } | null;
}

class LandNegotiationRepository extends BaseRepository<LandNegotiation> {
  constructor() {
    super(() => db.land_negotiations);
  }

  /** Newest round first — the top of the list is where the deal stands. */
  async listForLand(landId: string): Promise<LandNegotiation[]> {
    const rows = await db.land_negotiations.where('land_id').equals(landId).toArray();
    return rows.sort((a, b) => b.round_no - a.round_no);
  }

  async acceptedForLand(landId: string): Promise<LandNegotiation | undefined> {
    const rows = await this.listForLand(landId);
    return rows.find((r) => r.status === 'accepted');
  }

  /**
   * Adds a round, numbering it and superseding the one before.
   *
   * The numbering and the supersede are one operation on purpose. A counter
   * offer that leaves the previous round `open` produces a ladder with two live
   * offers on it, and nobody can then say what was on the table.
   */
  async addRound(
    input: Omit<NewRecord<LandNegotiation>, 'round_no' | 'status'>,
    createdBy: string | null = null,
  ): Promise<LandNegotiation> {
    const rows = await this.listForLand(input.land_id);
    const openOnes = rows.filter((r) => r.status === 'open');
    for (const row of openOnes) {
      await this.update(row.id, { status: 'superseded' });
    }
    const round_no = (rows[0]?.round_no ?? 0) + 1;
    return this.create({ ...input, round_no, status: 'open' } as NewRecord<LandNegotiation>, createdBy);
  }

  /**
   * Marks one round accepted and closes the rest.
   *
   * Everything still open becomes `superseded` rather than `rejected`: a round
   * that was overtaken by a better one was not turned down, and the difference
   * matters when somebody reads the ladder back.
   */
  async accept(id: string): Promise<LandNegotiation | undefined> {
    const row = await this.getById(id);
    if (!row) return undefined;
    const siblings = await this.listForLand(row.land_id);
    for (const other of siblings) {
      if (other.id === id) continue;
      if (other.status === 'accepted' || other.status === 'open') {
        await this.update(other.id, { status: 'superseded' });
      }
    }
    return this.update(id, { status: 'accepted' });
  }

  async removeForLand(landId: string): Promise<void> {
    const rows = await db.land_negotiations.where('land_id').equals(landId).toArray();
    await db.land_negotiations.bulkDelete(rows.map((r) => r.id));
  }
}

class LandAcquisitionCostRepository extends BaseRepository<LandAcquisitionCost> {
  constructor() {
    super(() => db.land_acquisition_costs);
  }

  async listForLand(landId: string): Promise<LandAcquisitionCost[]> {
    return db.land_acquisition_costs.where('land_id').equals(landId).toArray();
  }

  /** Writes one head's estimate, replacing whatever was there. */
  async setEstimate(
    landId: string,
    head: AcquisitionCostHead,
    estimated: number,
    remarks: string | null,
    createdBy: string | null = null,
  ): Promise<void> {
    const existing = (await this.listForLand(landId)).find((r) => r.cost_head === head);
    if (existing) {
      await this.update(existing.id, { estimated_amount: estimated, remarks });
      return;
    }
    await this.create(
      { land_id: landId, cost_head: head, estimated_amount: estimated, remarks },
      createdBy,
    );
  }

  /**
   * v29 — what an owned land cost before this system existed.
   *
   * The estimate is set to the same figure when the head has none: for land
   * already bought, the cost is known, and an empty estimate beside a paid
   * amount would read as an overrun.
   */
  async setHistoric(
    landId: string,
    head: AcquisitionCostHead,
    paid: number,
    createdBy: string | null = null,
  ): Promise<void> {
    const existing = (await this.listForLand(landId)).find((r) => r.cost_head === head);
    if (existing) {
      await this.update(existing.id, {
        historic_paid_amount: paid,
        ...(Number(existing.estimated_amount) > 0 ? {} : { estimated_amount: paid }),
      });
      return;
    }
    await this.create(
      {
        land_id: landId,
        cost_head: head,
        estimated_amount: paid,
        historic_paid_amount: paid,
        remarks: 'Paid before this system — entered with the land',
      },
      createdBy,
    );
  }

  /**
   * The sheet: estimate per head, actual per head, and the variance
   * (BRD ACQ-002).
   *
   * Actuals are **read from the expense ledger**, never stored here. The money
   * was already recorded when it was paid, and a second copy on this table is a
   * second answer to "what did this land cost" — the two would disagree the
   * first time somebody edited an expense.
   *
   * The mapping from an expense to a head is the expense's `cost_category`:
   * `land_payment` is the land price, and everything else on the land
   * (`land_extra_cost`) is the fees. Splitting the fees further needs a head on
   * the expense itself, which is the cost-center work in the plan's section 3.4
   * — so until then those land in `other` and `unclassifiedActual` says so
   * rather than quietly padding one line.
   */
  async sheetForLand(landId: string): Promise<AcquisitionCostSheet> {
    const [estimates, expenses, land, activities, mappings] = await Promise.all([
      this.listForLand(landId),
      db.expenses.where('land_id').equals(landId).toArray(),
      db.lands.get(landId),
      db.land_development_activities.where('land_id').equals(landId).toArray(),
      db.land_project_mapping.where('land_id').equals(landId).toArray(),
    ]);

    const actualByHead = new Map<AcquisitionCostHead, number>();
    let unclassified = 0;
    for (const e of expenses) {
      const amount = Number(e.amount) || 0;
      // v29 — a fee that names its head goes on that line
      const head: AcquisitionCostHead | null =
        e.cost_category === 'land_payment'
          ? 'land_price'
          : e.cost_category === 'land_extra_cost' && e.land_cost_head
            ? e.land_cost_head
            : null;
      if (head) actualByHead.set(head, (actualByHead.get(head) ?? 0) + amount);
      else unclassified += amount;
    }

    const byHead = new Map(estimates.map((e) => [e.cost_head, e]));
    const lines: AcquisitionCostLine[] = ACQUISITION_COST_HEADS.map((head) => {
      const row = byHead.get(head);
      const estimated = money(Number(row?.estimated_amount) || 0);
      const historic = money(Number(row?.historic_paid_amount) || 0);
      const actual = money((actualByHead.get(head) ?? 0) + historic);
      return {
        cost_head: head,
        estimated,
        actual,
        historic,
        remarks: row?.remarks ?? null,
        /*
         * `null` until something has actually been spent.
         *
         * `actual - estimated` on a head nobody has paid yet is the whole
         * estimate as a negative number, which renders as a large "under
         * budget" figure in green — on a land where the money simply has not
         * gone out. An estimate with no spend against it has no variance; it
         * has an estimate.
         */
        variance: actual > 0 ? money(actual - estimated) : null,
      };
    });

    const estimatedTotal = money(lines.reduce((s, l) => s + l.estimated, 0));
    const actualTotal = money(lines.reduce((s, l) => s + l.actual, 0) + unclassified);

    /*
     * Development, read the way `landDevelopmentRepository.readinessForLand`
     * reads it: a cancelled activity costs nothing more, and its incurred
     * total is the last progress report's running figure.
     */
    const live = activities.filter((a) => a.status !== 'cancelled');
    const progress = live.length
      ? await db.land_development_progress
          .where('activity_id')
          .anyOf(live.map((a) => a.id))
          .toArray()
      : [];
    const incurredByActivity = new Map<string, { at: string; amount: number }>();
    for (const p of progress) {
      const prev = incurredByActivity.get(p.activity_id);
      const at = `${p.progress_date}|${p.created_at}`;
      if (!prev || at > prev.at) {
        incurredByActivity.set(p.activity_id, { at, amount: Number(p.amount_incurred) || 0 });
      }
    }
    const development = {
      estimated: money(live.reduce((s, a) => s + (Number(a.budget_amount) || 0), 0)),
      actual: money(live.reduce((s, a) => s + (incurredByActivity.get(a.id)?.amount ?? 0), 0)),
    };

    let landownerShare: AcquisitionCostSheet['landownerShare'] = null;
    if (land?.acquisition_type === 'joint_venture' && mappings.length > 0) {
      const towers = await db.towers
        .where('project_id')
        .anyOf(mappings.map((m) => m.project_id))
        .toArray();
      const units = towers.length
        ? await db.units
            .where('tower_id')
            .anyOf(towers.map((t) => t.id))
            .toArray()
        : [];
      const owners = units.filter((u) => u.allocation_type === 'landowner_share');
      if (owners.length > 0) {
        landownerShare = {
          units: owners.length,
          value: money(owners.reduce((s, u) => s + (Number(u.base_price) || 0), 0)),
        };
      }
    }

    return {
      lines,
      estimatedTotal,
      actualTotal,
      unclassifiedActual: money(unclassified),
      development,
      landTotal: {
        estimated: money(estimatedTotal + development.estimated),
        actual: money(actualTotal + development.actual),
      },
      landownerShare,
    };
  }

  async removeForLand(landId: string): Promise<void> {
    const rows = await this.listForLand(landId);
    await db.land_acquisition_costs.bulkDelete(rows.map((r) => r.id));
  }
}

export const landNegotiationRepository = new LandNegotiationRepository();
export const landAcquisitionCostRepository = new LandAcquisitionCostRepository();
