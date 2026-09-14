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
  actual: number;
  remarks: string | null;
  /** null when there is no estimate to compare against */
  variance: number | null;
}

export interface AcquisitionCostSheet {
  lines: AcquisitionCostLine[];
  estimatedTotal: number;
  actualTotal: number;
  /** what the ledger holds that no line accounts for — see the note below */
  unclassifiedActual: number;
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
    const [estimates, expenses] = await Promise.all([
      this.listForLand(landId),
      db.expenses.where('land_id').equals(landId).toArray(),
    ]);

    const actualByHead = new Map<AcquisitionCostHead, number>();
    let unclassified = 0;
    for (const e of expenses) {
      const amount = Number(e.amount) || 0;
      if (e.cost_category === 'land_payment') {
        actualByHead.set('land_price', (actualByHead.get('land_price') ?? 0) + amount);
      } else {
        // every other land cost is a fee we cannot yet attribute to a head
        unclassified += amount;
      }
    }

    const byHead = new Map(estimates.map((e) => [e.cost_head, e]));
    const lines: AcquisitionCostLine[] = ACQUISITION_COST_HEADS.map((head) => {
      const row = byHead.get(head);
      const estimated = money(Number(row?.estimated_amount) || 0);
      const actual = money(actualByHead.get(head) ?? 0);
      return {
        cost_head: head,
        estimated,
        actual,
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

    return {
      lines,
      estimatedTotal: money(lines.reduce((s, l) => s + l.estimated, 0)),
      actualTotal: money(lines.reduce((s, l) => s + l.actual, 0) + unclassified),
      unclassifiedActual: money(unclassified),
    };
  }

  async removeForLand(landId: string): Promise<void> {
    const rows = await this.listForLand(landId);
    await db.land_acquisition_costs.bulkDelete(rows.map((r) => r.id));
  }
}

export const landNegotiationRepository = new LandNegotiationRepository();
export const landAcquisitionCostRepository = new LandAcquisitionCostRepository();
