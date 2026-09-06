import { addMonths, money, type PlannedInstallment } from './finance';

/**
 * The terms a land purchase is actually agreed on (Tier 3.4).
 *
 * Deliberately not `installment_plan_templates`: that is a project's plan for
 * its *buyers*, expressed in percentages of a flat's price. A plot is
 * negotiated once, with one owner, in taka — "twenty lakh bayna now, the rest
 * over six months, balance at registration" — so the terms are entered per
 * land rather than inherited from anywhere.
 */
export interface LandPaymentTerms {
  /** The agreed total. Every line below is carved out of this. */
  totalAmount: number;
  /** Date the agreement was signed; instalment 1 is dated from here. */
  agreementDate: string;
  /** Bayna / advance paid at agreement. 0 if there is none. */
  advanceAmount: number;
  /** How many monthly instalments sit between the advance and registration. */
  monthlyCount: number;
  /** Held back until the deed is registered. 0 if there is none. */
  registrationAmount: number;
  /** Months from the agreement to registration, when there is a final payment. */
  registrationAfterMonths: number;
}

export interface LandPlanProblem {
  field: 'advanceAmount' | 'registrationAmount' | 'monthlyCount' | 'totalAmount';
  message: string;
}

/**
 * What is wrong with these terms, if anything.
 *
 * Separate from the planner because the form needs to say *why* it will not
 * generate before anybody presses the button, and because a schedule that does
 * not add up to the agreed amount is the one outcome worth refusing outright:
 * the land page's balance is the agreed amount less what has been paid, and it
 * stops meaning anything the moment the plan disagrees with the agreement.
 */
export function validateLandTerms(terms: LandPaymentTerms): LandPlanProblem[] {
  const problems: LandPlanProblem[] = [];
  const total = money(terms.totalAmount);
  const advance = money(terms.advanceAmount);
  const registration = money(terms.registrationAmount);

  if (!(total > 0)) {
    problems.push({
      field: 'totalAmount',
      message: 'Set the final agreed amount on the land before building a schedule.',
    });
    return problems;
  }

  if (advance < 0) {
    problems.push({ field: 'advanceAmount', message: 'The advance cannot be negative.' });
  }
  if (registration < 0) {
    problems.push({
      field: 'registrationAmount',
      message: 'The registration payment cannot be negative.',
    });
  }
  if (terms.monthlyCount < 0 || !Number.isInteger(terms.monthlyCount)) {
    problems.push({
      field: 'monthlyCount',
      message: 'Enter a whole number of monthly instalments.',
    });
  }

  const remainder = money(total - advance - registration);
  if (remainder < -0.009) {
    problems.push({
      field: 'advanceAmount',
      message: 'The advance and registration payment together come to more than the agreed amount.',
    });
  }
  // Money with nowhere to go: no monthly line to carry it and no final payment.
  if (remainder > 0.009 && terms.monthlyCount === 0) {
    problems.push({
      field: 'monthlyCount',
      message:
        'The advance and registration payment do not cover the agreed amount — add monthly instalments for the difference.',
    });
  }
  if (remainder <= 0.009 && terms.monthlyCount > 0) {
    problems.push({
      field: 'monthlyCount',
      message: 'There is nothing left for the monthly instalments to carry.',
    });
  }

  return problems;
}

/**
 * Turns agreed terms into instalment lines.
 *
 * Rounding follows `planInstallments`: every line is rounded and the **last
 * monthly** absorbs the difference, so the schedule totals the agreed amount
 * exactly. A plan whose lines do not add up to the agreement would leave a
 * balance that never reaches zero however much is paid.
 *
 * Returns `[]` for terms that do not validate, so a caller that skips the
 * check cannot write a schedule that contradicts the agreement.
 */
export function planLandInstallments(terms: LandPaymentTerms): PlannedInstallment[] {
  if (validateLandTerms(terms).length > 0) return [];

  const total = money(terms.totalAmount);
  const advance = money(terms.advanceAmount);
  const registration = money(terms.registrationAmount);
  const lines: PlannedInstallment[] = [];

  let no = 1;
  if (advance > 0.009) {
    lines.push({
      installment_no: no,
      label: 'Advance (bayna)',
      due_date: terms.agreementDate,
      amount_due: advance,
    });
    no += 1;
  }

  const monthlyTotal = money(total - advance - registration);
  if (terms.monthlyCount > 0 && monthlyTotal > 0.009) {
    const each = money(monthlyTotal / terms.monthlyCount);
    let allocated = 0;
    for (let i = 0; i < terms.monthlyCount; i += 1) {
      const isLast = i === terms.monthlyCount - 1;
      const amount = isLast ? money(monthlyTotal - allocated) : each;
      allocated = money(allocated + amount);
      lines.push({
        installment_no: no,
        label: `Instalment ${i + 1}/${terms.monthlyCount}`,
        due_date: addMonths(terms.agreementDate, i + 1),
        amount_due: amount,
      });
      no += 1;
    }
  }

  if (registration > 0.009) {
    lines.push({
      installment_no: no,
      label: 'On registration',
      /*
       * Dated, unlike a booking's `on_handover` line, which is left null
       * because a handover date years out is genuinely unknown. A registration
       * date is part of what gets agreed at bayna, so a date here is a real
       * commitment rather than a guess — and it is what makes the payment
       * capable of being overdue.
       */
      due_date: addMonths(terms.agreementDate, terms.registrationAfterMonths),
      amount_due: registration,
    });
  }

  return lines;
}

/** One instalment as the allocator sees it. */
export interface AllocatableLine {
  id: string;
  amount_due: number;
}

export interface AllocationResult {
  /** How much of each line is covered, keyed by line id. */
  filled: Map<string, number>;
  /** Money with no line left to carry it. */
  unallocated: number;
}

/**
 * Spreads amounts across instalments, oldest line first.
 *
 * The single implementation of the rule, shared by `recalculateForLand` (which
 * writes the result) and the expense form's preview (which shows what an amount
 * *would* do). Two implementations of one rule drift, and the one that drifts
 * is the preview — which is the half a person makes decisions on.
 *
 * Underpayment is deliberately carried on the line it fell short of: pay
 * 1,500,000 against a 2,000,000 instalment and that instalment stays open for
 * 500,000 and goes overdue on its own date, rather than the shortfall being
 * quietly moved to the end of the plan. The arrears then read as arrears, and
 * the plan still describes what was agreed rather than what happened to be
 * paid.
 *
 * `lines` must already be in instalment order, and `amounts` in the order the
 * money was actually paid.
 */
export function allocateOldestFirst(
  lines: AllocatableLine[],
  amounts: number[],
): AllocationResult {
  return allocatePayments(
    lines,
    amounts.map((amount) => ({ amount, installment_id: null })),
  );
}

/** A payment, and the instalment it was recorded against if it names one. */
export interface AllocatablePayment {
  amount: number;
  /** `null` = not aimed at a line; it falls into the waterfall */
  installment_id?: string | null;
}

/**
 * The waterfall, with an exception for money that says where it is going.
 *
 * Oldest-first is the right default and the wrong absolute. A landowner will
 * accept a payment against a named milestone — "this cheque is the
 * registration money" — while an earlier instalment is still short, and the
 * plan should then show that earlier line as arrears and the named one as
 * settled. Forcing it forward would report the opposite of what both sides
 * agreed, and no note anywhere could correct the figures.
 *
 * So: targeted payments are applied to their own line first, in the order they
 * were paid, and only what will not fit there rejoins the waterfall — a
 * payment aimed at a line that is already full is not lost, it flows on like
 * any other money. Untargeted payments then fill the remaining room
 * oldest-first, exactly as before.
 *
 * The pass order matters and is the reason targeting is honoured at all: if
 * untargeted money ran first it would already have filled the line the
 * targeted payment was for, and naming an instalment would change nothing.
 */
export function allocatePayments(
  lines: AllocatableLine[],
  payments: AllocatablePayment[],
): AllocationResult {
  const filled = new Map<string, number>(lines.map((line) => [line.id, 0]));
  const byId = new Map(lines.map((line) => [line.id, line]));
  let unallocated = 0;

  /** What a targeted payment could not fit onto its own line. */
  const overflow: number[] = [];

  for (const payment of payments) {
    const id = payment.installment_id;
    if (!id || !byId.has(id)) continue;
    const line = byId.get(id)!;
    let remaining = Number(payment.amount) || 0;
    const room = (Number(line.amount_due) || 0) - (filled.get(line.id) ?? 0);
    if (room > 0.005) {
      const take = Math.min(remaining, room);
      filled.set(line.id, money((filled.get(line.id) ?? 0) + take));
      remaining = money(remaining - take);
    }
    if (remaining > 0.005) overflow.push(remaining);
  }

  const untargeted = payments
    .filter((p) => !p.installment_id || !byId.has(p.installment_id))
    .map((p) => Number(p.amount) || 0);

  let cursor = 0;
  for (const amount of [...untargeted, ...overflow]) {
    let remaining = Number(amount) || 0;
    while (remaining > 0.005 && cursor < lines.length) {
      const line = lines[cursor];
      const room = (Number(line.amount_due) || 0) - (filled.get(line.id) ?? 0);
      if (room <= 0.005) {
        cursor += 1;
        continue;
      }
      const take = Math.min(remaining, room);
      filled.set(line.id, money((filled.get(line.id) ?? 0) + take));
      remaining = money(remaining - take);
      if (take >= room - 0.005) cursor += 1;
    }
    // every line is full and there is still money — real money, recorded, with
    // a plan that no longer accounts for all of it
    if (remaining > 0.005) unallocated = money(unallocated + remaining);
  }

  return { filled, unallocated };
}

export interface PaymentEffect {
  /** Instalments this amount settles outright. */
  settles: string[];
  /** The line it lands on but does not finish, and what would be left on it. */
  partial: { label: string; remaining: number } | null;
  /** Beyond what the plan still accounts for. */
  excess: number;
  /** Nothing is outstanding — the plan is already fully covered. */
  alreadySettled: boolean;
}

/**
 * What a payment of `amount` would do to the plan, without writing anything.
 *
 * Runs the *same* allocator the ledger runs, over the amounts already paid plus
 * the new one, and reports the difference. Deriving it from the shared function
 * rather than re-deriving the rule is the point: a preview that disagrees with
 * what actually happens is worse than no preview, because it is believed.
 */
export function previewLandPayment(
  lines: Array<AllocatableLine & { label: string; amount_paid: number }>,
  amount: number,
  /** the instalment the payment is being recorded against, if it names one */
  installmentId: string | null = null,
): PaymentEffect {
  /*
   * The already-paid figures are re-run untargeted, because the *result* of
   * their own targeting is what `amount_paid` already holds — replaying them
   * as a flat waterfall over the lines reproduces exactly the state on screen.
   * Only the new payment carries an instalment, which is the difference this
   * preview exists to show.
   */
  const paidAlready = lines.map((l) => ({
    amount: Number(l.amount_paid) || 0,
    installment_id: l.id,
  }));
  const before = allocatePayments(lines, paidAlready);
  const after = allocatePayments(lines, [
    ...paidAlready,
    { amount: Number(amount) || 0, installment_id: installmentId },
  ]);

  const settles: string[] = [];
  let partial: PaymentEffect['partial'] = null;

  for (const line of lines) {
    const wasFull = (before.filled.get(line.id) ?? 0) >= line.amount_due - 0.005;
    const nowFilled = after.filled.get(line.id) ?? 0;
    const nowFull = nowFilled >= line.amount_due - 0.005;

    if (!wasFull && nowFull) settles.push(line.label);
    else if (!nowFull && nowFilled > (before.filled.get(line.id) ?? 0) + 0.005) {
      partial = { label: line.label, remaining: money(line.amount_due - nowFilled) };
    }
  }

  return {
    settles,
    partial,
    excess: money(after.unallocated - before.unallocated),
    alreadySettled: lines.every((l) => (before.filled.get(l.id) ?? 0) >= l.amount_due - 0.005),
  };
}
