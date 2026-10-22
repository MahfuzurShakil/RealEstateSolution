# Sales & CRM flow — simplification plan (2026-10-22)

Client ask: keep sales simple for a small developer. No discount approval, no
auto-generated monthly plan. Booking money confirms a booking; the deal's terms
go into an agreement (চুক্তি) with documents; the Payments tab is the money
ledger for the buyer, and every receipt lands in a bank or cash account.

## What is there today

| Piece | Today | Problem |
|---|---|---|
| Discount | Role ceiling (`discount_approval_rules`) → `pending_approval` → approve / reject / resubmit | A small developer's owner gives the discount himself; the queue is overhead |
| Confirm | Derived: booking money received **and** discount cleared | Fine once the discount half goes |
| Payment plan | Confirming generates `payment_schedules` + `payment_installments` from the project template (10% / 60% over N months / 20% / 10%); receipts are spread over them | Real buyers pay what was agreed, not a template; editing generated rows is worse than typing terms |
| Payments tab | Received / outstanding / booking money cards + receipts list; account optional | A receipt without an account never reaches Cash Position |
| Delivery | Step records (keys, deed, mutation) | Already record-keeping — keep as is |

## Validation

1. **Drop discount approval — agree.** The discount is still typed and shown
   (amount and % of base), it just never blocks anything.
2. **Booking money confirms — agree, already how it works.** Hold until the full
   booking amount is in, then Confirmed. Statuses become `hold → confirmed`,
   plus `cancelled`.
3. **Drop the generated monthly plan — agree, with one guard.** Without any
   expected dates nobody can say a buyer is *late*, and the owner dashboard's
   "buyer instalments overdue" alert would go blank. The agreement therefore
   holds the payment terms in plain form, and "expected by today" is worked
   out on the fly — no stored instalment rows.
4. **Agreement step — agree.** One agreement per booking, entered at booking
   time or later, with documents attached.
5. **Payments tab as the buyer ledger — agree.** Total receivable, received,
   balance (and behind, when terms exist) on top; receipts table below. The
   "Received into" account becomes required so each receipt is a cash/bank
   movement in Cash Position and in the project's money.

## Plan

### S1 — Booking without approval
- `BOOKING_STATUSES` → `hold | confirmed | cancelled`; `derivedStatus` = money only.
- Remove the discount approval card, approve/reject/resubmit, the "pending
  approval" counter on the Bookings list, and the discount-ceiling settings.
- Dexie v37 upgrade: `pending_approval` bookings re-derived; every
  `discount_approval_status` set to `not_required` (column kept, not indexed
  away — table/field names stay); booking payment schedules deleted.

### S2 — Booking form inputs
- Customer, date, booked by, project, unit.
- Price: base + premiums + other charges − discount = final price.
- Booking money: amount, and (optional) received now — amount, date, method,
  reference, **received into account**.
- Instalment tenure and the template preview removed.
- Optional "Agreement" section (S3), collapsed by default.

### S3 — Agreement (চুক্তি)
Fields on `bookings` (not indexed, so no new store):
`agreement_date`, `agreement_no`, `payment_mode` (`full` | `installment`),
`full_payment_due_date`, `installment_count`, `installment_amount`,
`first_installment_date`, `handover_date`, `agreement_terms`.
- Booking page gets an **Agreement** tab: view + "Record agreement" / "Edit"
  popup, and the documents list with a new `sale_agreement` document type.
- Expected-by-date is computed: full → final price due on its date;
  instalment → (final price − booking amount) spread over the count, monthly
  from the first date, booking money due on the booking date.

### S4 — Payments tab
- Top: Total receivable · Received · Balance · Behind (if terms) + progress bar.
- Receipts table (date, amount, method, account, reference, received by, print,
  delete). Account required in the Record payment popup and in the booking form.
- Instalments tab removed.

### S5 — Knock-on screens
- Owner dashboard "overdue" alert and Finance/Collections summary read the
  agreement-based "behind" figure instead of instalment rows.
- Collections page lists bookings with balance / behind instead of instalments.
- Customer page and booking print drop the "N-month plan" line, show agreement
  terms instead.

### S6 — Demo + verify
- Demo bookings: no approvals; a mix of full-payment and instalment agreements,
  some buyers behind; every receipt carries an account.
- Browser-verify booking create → confirm → agreement → payments → Cash Position.
