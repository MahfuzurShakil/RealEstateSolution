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
  /** 2026-10-21 — the deal amount for this head; null until agreed */
  agreed: number | null;
  /** ledger payments plus anything paid before this system (v29) */
  actual: number;
  /** what is still to pay: the deal (or the budget, before one) less actual */
  pending: number;
  /** v29 — the part of `actual` that predates this system */
  historic: number;
  remarks: string | null;
  /** null when there is no estimate to compare against */
  variance: number | null;
}

/** One development activity on the cost sheet (2026-10-21). */
export interface DevelopmentCostLine {
  activity_id: string;
  label: string;
  status: string;
  estimated: number;
  agreed: number | null;
  actual: number;
  pending: number;
}

export interface AcquisitionCostSheet {
  lines: AcquisitionCostLine[];
  /** acquisition heads only — the land itself and what it took to get it */
  estimatedTotal: number;
  /** deal per head, budget where a head has no deal yet; null before any deal */
  agreedTotal: number | null;
  actualTotal: number;
  pendingTotal: number;
  /** what the ledger holds that no line accounts for — see the note below */
  unclassifiedActual: number;
  /**
   * v29 — land development (filling, boundary, internal roads): its budget
   * and what has been incurred, from the development activities (DEV-001…).
   */
  development: {
    estimated: number;
    /** contract where awarded, budget otherwise; null before any contract */
    agreed: number | null;
    actual: number;
    pending: number;
    lines: DevelopmentCostLine[];
  };
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
   * Writes the budget and the deal amount for several heads at once — the
   * Land Cost tab edits them as one sheet (2026-10-21). A head left at zero
   * budget and no deal is not stored at all.
   */
  async setAmounts(
    landId: string,
    /** `remarks` left out keeps whatever note the head already has */
    rows: Array<{ head: AcquisitionCostHead; estimated: number; agreed: number | null; remarks?: string | null }>,
    createdBy: string | null = null,
  ): Promise<void> {
    const existing = new Map((await this.listForLand(landId)).map((r) => [r.cost_head, r]));
    for (const row of rows) {
      const changes = {
        estimated_amount: money(row.estimated),
        agreed_amount: row.agreed == null ? null : money(row.agreed),
        ...(row.remarks !== undefined ? { remarks: row.remarks } : {}),
      };
      const prev = existing.get(row.head);
      if (prev) await this.update(prev.id, changes);
      else if (row.estimated > 0 || row.agreed != null) {
        await this.create({ land_id: landId, cost_head: row.head, ...changes }, createdBy);
      }
    }
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
    remarks?: string,
  ): Promise<void> {
    const existing = (await this.listForLand(landId)).find((r) => r.cost_head === head);
    if (existing) {
      await this.update(existing.id, {
        historic_paid_amount: paid,
        ...(remarks ? { remarks } : {}),
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
        remarks: remarks ?? 'Paid before this system — entered with the land',
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
    const devPaidBy = new Map<string, number>();
    const activityIds = new Set(activities.map((a) => a.id));
    for (const e of expenses) {
      const amount = Number(e.amount) || 0;
      /*
       * 2026-10-21 — a development payment belongs to its activity, not a
       * head. One whose activity was deleted falls through to unclassified,
       * so the money never drops out of the total.
       */
      if (e.land_development_activity_id && activityIds.has(e.land_development_activity_id)) {
        const id = e.land_development_activity_id;
        devPaidBy.set(id, (devPaidBy.get(id) ?? 0) + amount);
        continue;
      }
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
      let estimated = money(Number(row?.estimated_amount) || 0);
      let remarks = row?.remarks ?? null;
      /*
       * v29 — a land nobody has costed yet still has a price: the agreed
       * amount, or the asking price on a purchase. Without it, a project on
       * land still in negotiation showed its land at zero and its margin
       * too good by the price of the plot.
       */
      if (head === 'land_price' && estimated === 0 && land) {
        const fallback =
          Number(land.final_agreed_amount) ||
          (land.acquisition_type === 'direct_purchase' ? Number(land.asking_price) || 0 : 0);
        if (fallback > 0) {
          estimated = money(fallback);
          remarks = Number(land.final_agreed_amount) ? 'From the agreed amount' : 'From the asking price, until an estimate is set';
        }
      }
      const historic = money(Number(row?.historic_paid_amount) || 0);
      const actual = money((actualByHead.get(head) ?? 0) + historic);
      // the deal, or for the land price the amount the accepted round set
      const agreed =
        row?.agreed_amount != null
          ? money(Number(row.agreed_amount))
          : head === 'land_price' && land && Number(land.final_agreed_amount) > 0
            ? money(Number(land.final_agreed_amount))
            : null;
      return {
        cost_head: head,
        estimated,
        agreed,
        actual,
        pending: money(Math.max(0, (agreed ?? estimated) - actual)),
        historic,
        remarks,
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
     * Once any head has a deal, the deal total counts the budget for the heads
     * that have none yet — otherwise a land with only its price agreed shows
     * the fees as "paid beyond the deal".
     */
    const agreedTotal = lines.some((l) => l.agreed != null)
      ? money(lines.reduce((s, l) => s + (l.agreed ?? l.estimated), 0))
      : null;
    const pendingTotal = money(lines.reduce((s, l) => s + l.pending, 0));

    /*
     * Development, per activity: budget, contract, and what the payments
     * recorded against it add up to (2026-10-21). A cancelled activity costs
     * nothing more, but money already paid on it still counts.
     */
    const devLines = activities
      .filter((a) => a.status !== 'cancelled' || devPaidBy.has(a.id))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((a) => {
        const budget = a.status === 'cancelled' ? 0 : money(Number(a.budget_amount) || 0);
        const contract = a.contract_amount != null ? money(Number(a.contract_amount)) : null;
        const paid = money(devPaidBy.get(a.id) ?? 0);
        return {
          activity_id: a.id,
          label: a.activity_type,
          status: a.status,
          estimated: budget,
          agreed: contract,
          actual: paid,
          pending: a.status === 'cancelled' ? 0 : money(Math.max(0, (contract ?? budget) - paid)),
        };
      });
    const development = {
      estimated: money(devLines.reduce((s, l) => s + l.estimated, 0)),
      agreed: devLines.some((l) => l.agreed != null)
        ? money(devLines.reduce((s, l) => s + (l.agreed ?? l.estimated), 0))
        : null,
      actual: money(devLines.reduce((s, l) => s + l.actual, 0)),
      pending: money(devLines.reduce((s, l) => s + l.pending, 0)),
      lines: devLines,
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
      agreedTotal,
      actualTotal,
      pendingTotal,
      unclassifiedActual: money(unclassified),
      development,
      landTotal: {
        estimated: money(estimatedTotal + development.estimated),
        actual: money(actualTotal + development.actual),
      },
      landownerShare,
    };
  }

  /**
   * v29 — every land's cash cost so far, in one pass, for the finance roll-up.
   *
   * The same figure as `sheetForLand(...).landTotal.actual`: every expense
   * booked against the land, plus historic cost on owned land, plus what land
   * development has incurred. Read table by table rather than land by land,
   * because the finance overview needs it for every project at once.
   */
  async cashActualByLand(): Promise<Map<string, number>> {
    // development payments are expenses on the land, so they are in here already
    const [expenses, costs] = await Promise.all([
      db.expenses.toArray(),
      db.land_acquisition_costs.toArray(),
    ]);
    const out = new Map<string, number>();
    const add = (landId: string, amount: number) =>
      out.set(landId, money((out.get(landId) ?? 0) + amount));

    for (const e of expenses) if (e.land_id) add(e.land_id, Number(e.amount) || 0);
    for (const c of costs) add(c.land_id, Number(c.historic_paid_amount) || 0);

    return out;
  }

  async removeForLand(landId: string): Promise<void> {
    const rows = await this.listForLand(landId);
    await db.land_acquisition_costs.bulkDelete(rows.map((r) => r.id));
  }
}

export const landNegotiationRepository = new LandNegotiationRepository();
export const landAcquisitionCostRepository = new LandAcquisitionCostRepository();
