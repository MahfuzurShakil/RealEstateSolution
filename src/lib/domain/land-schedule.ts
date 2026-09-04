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
