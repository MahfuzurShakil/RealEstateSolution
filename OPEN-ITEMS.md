# Open Items

Known-open work that is **not** a blocker for what is already shipped. Add to
this as modules land; delete an entry when it is done.

Last reviewed: 2026-09-04, after the client review batches F1–F4 (Section 0b)
and the Tier 2 remediation batches 2A–2E from
`REMEDIATION-PLAN.md` (see Section 0 below, which also covers Tier 1). The
full defect list is in `ANALYSIS-REPORT_2026-09-02.md`.

---

## 1. Open

### 1.1 `.claude/launch.json` dev port
Changed from 3000 to 3001, because port 3000 belongs to another project on this
machine. The file is tracked, so the change ships to everyone who clones the
repo. Harmless for a solo repo; revisit if anyone else starts working on it.

Note for anyone verifying in a browser: Next 16 refuses a second `next dev` in
the same directory, so only one session can hold the server at a time.

### 1.2 Public Portal will exercise `progress.public.repository.ts` properly
`src/lib/repositories/public/progress.public.repository.ts` implements
Section 6.7 (tower-wise `current_progress_pct` + latest public photo,
field-whitelisted).

It is no longer untested code — the **"On the public website" preview** on the
project's Site Progress tab and Photos tab reads through it, so both gates
(project not published, photo not marked public) are exercised by real screens.
But it has still never been rendered by an actual public page, so re-check the
shape it returns when P2 is built.

### 1.3 Supplier return / debit note is out of scope
Section 7.6 says so explicitly: a failed quality check keeps the material off
stock, but there is no workflow for sending it back and getting the money or a
credit note. Phase 2. Today the only trace of a rejected batch is the GRN line
itself, which is enough to argue with the supplier but not to reconcile a
refund.

### 1.4 Stock has no re-order level or ageing
Nothing warns that a site is about to run out, or that material has been
sitting in a store for six months. Not in Section 7, and not invented — but it
is the first thing a storekeeper asks for, so it is worth raising with the
client before Phase B.

### 1.5 A cancelled PO's paid vouchers are left alone
Cancelling voids the undelivered balance, but any voucher already raised
against the order stays as it is (correctly — the money did move). What is
missing is the other half: recovering an advance on a cancelled order. That is
the same gap as 1.3 and belongs with it.

**Since 1D:** the money is no longer invisible. A cancelled order stops
reporting a payable (its balance is void, not owed), the part of a payment that
bought material still counts as billable, and only the remainder — money that
bought nothing — is surfaced, on the order as a note and on the supplier row as
"advance held". Recovering it still needs the Phase 2 debit note.

### 1.6 Overdue reminders are a dashboard list, not a notification
Section 8.4 defers automated SMS/push to Phase 2. Today an overdue instalment
is visible on the collections queue, the finance overview and the project's
finance card, and nowhere else — nobody is told. That is the scope's decision,
but it is worth confirming with the client before go-live, because a
collections desk that has to remember to open a screen is how instalments slip.

### 1.7 Finance has no period close or reporting range
Costs and collections are filterable by date, but there is no month-end close,
no locked period, and no statement a buyer could be handed. Not in Section 8,
not invented — flag it when Phase B accounting integration is discussed.

### 1.8 `payment_schedules.entity_type` is an ENUM of one
Section 8.2 names it, so it is there, but only `booking` is ever written. It
earns its place when the Contractor module lands and a running bill needs the
same shape; until then it is a column that does nothing.

### 1.9 Project scoping is enforced at the route, not yet in every query
Section 9.6 now drives the sidebar and a route guard in the shell, so a role
cannot open a module that is not theirs. What is **not** yet applied is the
"(assigned)" half: a project manager who opens Projects still sees every
project, not only the ones on their account.

The pieces are in place — `userProjectAssignmentRepository.scopeFor()` returns
`null` for unscoped roles and the id list for the rest — but wiring it into
every list query is Phase B work, where it belongs behind the API. Doing it in
the browser now would be filtering the user can undo from devtools, which reads
as a security control while being none: Phase A has no real auth at all
(Section 0). Worth agreeing with the client that Phase A demonstrates scoping
rather than enforcing it.

### 1.10 "Own only" is not enforced either, for the same reason
`sales_executive` is "Own only" on leads and bookings (9.6). Today they see the
whole list. Same answer as 1.9 — the matrix records the intent and Phase B
enforces it server-side.

### 1.11 No audit log
Section 9 does not ask for one and Section 11 records that audit logging was
left out of scope at the client's request. Worth revisiting before go-live now
that money moves through the platform: `land_status_history`,
`project_status_history` and `material_request_status_history` cover their own
pipelines, but nothing records who edited a price, retired a master-data option
or changed somebody's role.

### 1.12 Printed documents are promised in copy, not built
Company Settings now says the booking form, money receipt and supplier voucher
are **not built yet** and explains why the fields are still worth filling in.
That is honest, but it is honest about a gap: Tier 3.6 builds the documents,
and when it does this copy should go back to the present tense.

### 1.13 `sold` and `handed_over` demo units still have no booking behind them
Tier 2 put real bookings behind Tower A's `booked` and `reserved` flats, so
those statuses are now produced by `createBooking` and the Section 5.6 receipt
rule rather than by `unit_status_overrides`. `sold` and `handed_over` are still
seeded directly, on purpose: a flat sold before this software existed genuinely
has no booking record, and that is the inventory a developer actually starts
with.

The cost of back-filling them is inventing a sales history for eleven more
units and moving every finance figure on the dashboard, which is a demo-data
decision rather than a defect. Worth agreeing with the client which of the two
stories the demo should tell.

### 1.14 Bulk lead assignment acts on the filter, not a selection
`leadRepository.bulkAssign` reassigns every lead the filters currently match,
including the ones on later pages, behind a confirm that says so. That fits the
job it exists for — this morning's website enquiries, or everything unassigned.
What it cannot do is "these four but not that one", which needs per-card
selection the `ResultCard` component has no slot for. Raise it if anyone asks
for it; the repository method already takes an arbitrary list of ids.

### 1.15 The land page shows what was paid, not what was due
`expenseRepository.landPaymentSummary` reads the cost ledger, so "paid to date"
and "balance" are real, and the balance deliberately compares the agreed amount
with land-payment costs only — registration and legal fees are money spent on
the land but not money owed to the owner.

What is still missing is the other side: what was agreed to be paid, and when.
That is the land payment schedule (Tier 3.4, which needs no schema change
because `payment_schedules.entity_type` is already there — see 1.8). Until it
lands, the page says explicitly that no instalment plan is recorded, rather
than implying the balance is on time.

---

## 0c. Pipeline guard + end-to-end integrity pass — 2026-09-04

**A project could be closed without any work happening.** Reported from a
walkthrough. The pipeline captured a date and remarks and checked nothing, so
Planning → Closed took six clicks on a project with no tower, no unit and no
site progress. Now split into hard blocks (things that cannot be true: no
tower, no reported progress, nothing handed over) and warnings (things merely
unlikely: closing under 100%, units not handed over, buyers still owing).
Moving *back* is never blocked — correcting a premature move must stay
possible. Rules are pure functions in `domain/project.ts`, facts come from
`projectRepository.readiness`.

**The two "not a function" TypeErrors were not from this codebase.** Both
stack traces pointed at a sibling `realEstateSolution` build folder — a
different, older project (its own git history, port 3000, no
`format.ts`, no `LandForm.tsx`). This project is `RealEstateSolution3` on
port 3001. A clean `rm -rf .next && next build` compiles all 40+ routes.
Worth deleting or renaming the old folder to stop the confusion recurring.

### End-to-end integrity pass

Ran against a freshly seeded demo, reconciling every cross-module link
directly against IndexedDB rather than trusting the screens:

- **Referential integrity: 0 failures.** towers→projects, units→towers,
  bookings→units/customers/leads, schedules→bookings, instalments→schedules,
  payments→bookings, refunds→bookings, PO items→orders, GRNs→orders, GRN
  items→GRNs, vouchers→orders.
- **Finance:** every confirmed booking has a schedule; every schedule totals
  to `final_price` to the taka; every booking-amount line equals the agreed
  `booking_amount` (Tier 1 B-1 holding). The one schedule on a non-confirmed
  booking belongs to the cancelled, refunded BOOK-2026-008 — correct.
- **Money agrees across screens:** dashboard "Collected" (16,900,000) is
  receipts excluding cancelled bookings, exactly; the collections queue's
  "allocated to instalments" (13,000,000) is lower by the money taken on
  bookings with no schedule yet — the F-2 distinction, holding.
- **Procurement:** PO line `received_quantity` equals the sum of *passed* GRN
  lines on all 22 lines — failed and pending quality checks correctly
  excluded from both stock and the received figure.
- **Stock ledger reconciles exactly:** every row's `quantity_available`
  equals passed receipts − issues ± transfers. No orphan movements, no
  negative stock.
- **Site progress:** work-item weights total 100 on all 5 towers; every
  cached `towers.current_progress_pct` matches its computed roll-up.
- **Module 5 → 6 handoff:** every `ordered`/`fulfilled` material request has
  a PO or a stock transfer behind it; no rejection without a reason; no
  orphan status history.
- **Lead → customer → booking:** every booked lead has a converted customer
  and a booking. (Two leads carry no activity — both `new`, created 1–3 Sept,
  never contacted. Realistic, not a defect.)
- **Section 9.6 role scoping** verified per role: site manager sees
  Dashboard/Projects/Site Progress, accounts sees Finance and Procurement but
  no Land, land team sees Land but no Finance, and only super_admin sees
  Administration.
- All 20 list pages and the detail routes return 200 with no server errors.

---

## 0b. Client review — done 2026-09-04 (feedback batches F1–F4)

Seven points raised after a walkthrough of the land, project and unit
screens. Two needed no code: the map already centred on Dhaka, and the unit
price was already the user's to set (the gap was that it could not vary by
floor). One schema addendum — `projects.cover_image_document_id`, nullable
and not indexed, so no new Dexie version block.

- **F1** — `MoneyInput` echoes what is being typed, grouped and in lakh/crore,
  because an ungrouped number field makes 45000000 and 450000000 the same
  shape on the fields that hold the price of land. An input aid only; money
  is still displayed in full everywhere. The unit-grid legend now lists all
  six statuses with counts instead of only the ones present. "Sold By" became
  "Who sells it", and a developer-share flat can no longer be marked
  owner-sold — that field drives the company-revenue filter.
- **F2** — unit allocation offers only the landowners of the project's own
  land, via `projectRepository.landownersForProject`.
- **F3** — the bulk generator can price height, per floor as a percentage or
  a fixed amount, counted from the first floor generated.
- **F4** — a "Pictures" section on the project's Documents tab, with a
  display picture chosen from the uploaded images.

### Still open from this review

**Money grouping is Western, not South Asian.** `formatBdt` renders
`BDT 45,000,000`, where this market writes `4,50,00,000`. The crore/lakh echo
on the input fields covers the moment where it matters most — typing — but
every table and tile still groups in thousands. Switching `formatBdt` to
`en-IN` grouping would change every money figure in the application at once,
so it is worth deciding deliberately rather than in passing.

---

## 0a. Tier 2 remediation — done 2026-09-04 (batches 2A–2E)

Minor and cosmetic defects. No new table and no new index — the one schema-
adjacent change is a `land_id` filter on `ExpenseFilters`, and that column was
already there and already indexed, so no Dexie version block was opened.
Browser-verified at 1440 px and 375 px against a freshly reloaded demo set;
`tsc` and `eslint` clean after every batch.

**2A — lists and shell.** Card grids default to 12 rows and worklist tables to
25, so 102 collection instalments stopped being 21 pages and 11 lands stopped
being two (L-2 / F-5). The paging bar hides itself against the page size in
force rather than the smallest offered, and singularises its label — "1
refund", not "1 refunds" (F-8). `Delete` on ten detail headers moved to a new
quiet `dangerGhost` button so it stops out-shouting `Edit` (L-3). Sidebar
groups are remembered across a reload in `localStorage`, read through
`useSyncExternalStore` for the same hydration reason the acting role is
(U-6). Seeded staff accounts are back-dated Mar 2024 – Feb 2026 instead of all
reading "today" (U-7). Company Settings stops claiming printed documents
exist (U-8) — see 1.12.

**2B — the four data tables become cards on a phone.** `DataTable` takes an
optional `mobileCard`; collections, expenses, supplier vouchers and users use
it. Collections was 889 px of table inside a 299 px window, three swipes from
the customer's name to the outstanding amount. Every other table keeps its
scroll box, which is right for a reference table nobody works from on a phone.

**2C — actions the money screens were missing.** "Record payment" straight from
a collections row (F-6): the dialog moved out of `PaymentPanel` into a shared
`RecordPaymentModal`, and receipts are still allocated oldest-first by the
finance repository, so the money lands where the schedule says rather than on
the row that was clicked. A negative amount now says "Amount must be greater
than zero" instead of "Enter the amount received" (B-4). The Refunds page has
a "Record refund" action that picks a cancelled booking first (B-3). A rejected
discount has "Resubmit for approval" (B-5). Expenses has a sort control and a
clickable category breakdown (F-7).

**2D — cards carry the fact you had to open the record to find.** Sold % and
booked value on the project list (P-4); "18 of 22 generated" on a tower whose
bulk generation left a hole (P-3); last-activity date on the lead card (C-3);
"goods still to come" separated from "still to pay" on the PO card (PR-5); a
work item with no plan dates says it is outside the schedule maths (S-3).

**2E — the unit/booking invariant, bulk assignment, land money.** See 1.13,
1.14 and 1.15 below for what is deliberately still open.

**Two findings did not reproduce and were left alone rather than "fixed":**

- **P-5** — the report has the 7-tab project strip overflowing and scrolling
  silently with `Documents` off-screen. The strip is `flex-wrap` and measures
  `scrollWidth === clientWidth` at 1200, 900 and 375 px, wrapping to 2, 2 and
  3 rows with every tab reachable and no page overflow.
- **PR-6** — a draft order already reads "Drafted 30 Aug 2026", not "Ordered".
  Left as "Drafted" rather than changed to "Created", because the date shown
  is `order_date` and "Created" would imply `created_at`.

---

## 0. Tier 1 remediation — done 2026-09-03 (batches 1A–1E)

No schema change; nothing in this pass writes to the database that did not
write there before. Browser-verified against a freshly reloaded demo set.

**1A — money is readable.** `formatBdt`'s `compact` option is gone; all 34 call
sites now print in full. Every column on the Finance Overview adds up by eye
(sales 158,740,000 = 97,590,000 + 44,830,000 + 16,320,000, and so on), and the
overdue banner and the Overdue column finally show the same figure. New
`formatBdtRate` prints unit prices and weighted-average costs to two decimals,
so a BDT 13.50 brick stops displaying as BDT 14 and lines multiply out again.
The two "Collected" figures were relabelled rather than merged — the Finance
Overview counts every receipt, the collections queue counts what is allocated
to instalments, and the queue now says why it reads lower.

**1B — site progress tells the truth.** `rollupProgress` gained
`comparable_actual_pct` and `planned_coverage_pct`; `actual_pct` is untouched,
so `towers.current_progress_pct`, the public-portal repository, the "behind
schedule" filter and the site-list ordering all behave exactly as before. The
caption is now built once, in `scheduleCaption`, and names the actual it
measured against: *"planned 37.8% by today vs 38.4% on the 97% of work that has
dates · +0.6%"* instead of a bare "+0.7%" beside a smaller number. Tower chips
and the `Σ (progress × weight ÷ 100)` footer agree to one decimal. A site that
has gone quiet loses its green badge — `scheduleBadge` renders "On Track ·
unconfirmed" in amber, because a site nobody has reported from in twenty days
is unknown rather than fine. "Behind Schedule" keeps its red.

**1C — a confirmed booking is no longer born overdue.** `planInstallments`
takes `bookingAmount`; when the template has an `on_booking` line and the
booking carries an agreed amount, that amount wins over the percentage and the
difference is spread across the later lines in proportion. Guards: the template
stands if the agreed amount is zero, at or above the price, or if the template
is entirely `on_booking` (nothing to absorb the difference). Verified on
`BOOK-2026-003`: instalment 1 is now BDT 1,000,000 and `Paid` rather than BDT
1,337,000 and five days late, monthlies moved 222,833 → 229,074, and the
schedule still totals the price to the taka. Company overdue fell from BDT
8,424,000 across 11 instalments to BDT 4,541,111 across 7 — the difference was
arrears the platform had invented.

**1D — payables are real money.** Supplier stats now separate what was placed
from what was drafted: BSRM reads 1 order + 1 draft and BDT 1,732,800 due, not
BDT 6,405,600. `received_value` and `awaiting_delivery_value` sit alongside so a
commitment is never read as an invoice, and `supplierBalance` reports an
overpayment as "advance held" rather than a negative. **The order-level policy
was deliberately left alone** — `paymentSummary` still measures due against
order value, because Section 7.9 treats a PO as a ledger entry rather than a
bill and paying an advance is normal here. Whether payables should move to a
received-value basis is a question for the client, not a bug fix; it is not
done. The voucher register gained a Date column and now opens in date order
instead of by voucher code.

**1E — the shell stops lying.** The acting role is persisted through
`useSyncExternalStore` on `localStorage`, so it survives a reload instead of
silently reverting to `super_admin` and defeating the route guard. The dashboard
reads the same `PERMISSION_MATRIX` the sidebar does — an Accounts user no longer
opens the platform to land plots and a sales follow-up queue — and gained a
Money card (collected, still due, overdue, due this month) for the roles that
Section 9.6 gives the dashboard to. The topbar's non-functional search box and
four unlabelled icon buttons are gone, as is the inert "Help and Support" entry
whose `/admin/help` route 404s; the avatar shows the acting user's initials
instead of a hardcoded "DU". A lead with a live booking drops out of the
follow-up queue (it used to keep nagging the desk about a buyer already at
`pending_approval`), and the leads banner now counts unassigned leads.

### Follow-up, same day — Material Request flow

Two things found while answering "who approves a material request", both fixed
and browser-verified. Recorded in the scope Decision Log (Section 11).

- **A requester could approve his own request.** The permission matrix drove
  the sidebar and the route guard but not the buttons inside the page, so a
  Site Manager saw "Approve request" on the request he had just raised —
  against 9.6, which gives him "Create (assigned)" and nothing more. Approve
  and reject now sit behind `canApprove(role, 'material_request')`
  (Procurement, Project Manager), and "Raise Request" / "Request material" sit
  behind `canEdit(...)` (Site Manager), so the two halves stay apart. The
  "(assigned)" half — *which* projects — is still Phase B (1.9).
- **Section 7.8a route (b) did not exist.** The scope gives Procurement two
  ways out of an approved request: raise a purchase order, or transfer material
  the central store already holds, buying nothing. Only the first was built,
  and `stock_transfers` never touched request status — so taking the second
  route left the request on `approved` for ever while the material was already
  on site. Added `stock_transfers.request_id` (nullable, **not** indexed, so no
  new Dexie version block — the `towers.current_progress_pct` precedent) and
  `approved → fulfilled` for this route only. "Fulfil from central stock" now
  sits beside "Raise Purchase Order", and deleting the transfer reopens the
  request, mirroring the goods-receipt rollback.

- **Procurement's inbox was filed under someone else's module.** Material
  Requests sat in the Site Progress nav group for every role, so Procurement —
  who has no `site_progress` access at all in 9.6 — had to open a Site Progress
  heading to reach the queue they live in, while their own Procurement group
  did not mention it. It is the Section 6.5 bridge, so it now appears once, in
  the group that matches what the role does with it: approvers who do not raise
  requests (Procurement, Project Manager) find it under **Procurement**,
  everyone else under **Site Progress**. `NavItem.visibleFor` carries the rule;
  nobody sees it twice.
- **Deciding and buying were treated as one job.** "Raise Purchase Order" and
  "Fulfil from central stock" rendered for everyone who could open an approved
  request, including a Site Manager with no procurement access and a Project
  Manager who only views it — both linking to a page that would refuse them.
  Those two actions now need `canEdit(role, 'procurement')`; the others get a
  line saying Procurement takes it from here. Seeing the decision and its note
  was never gated and still is not — the site is told what happened to its
  request, it just cannot decide or buy.

**Not done, deliberately:** Tier 2 (minor and cosmetic) and Tier 3 (the
features worth building in now) from `REMEDIATION-PLAN.md`.

---

## 2. Schema addenda — recorded in the scope document

All Module 5 and Module 6 addenda are written into
`Real-Estate-Developer-Platform_Scope-Document_v3.md` (Section 11, Decision
Log). The full cross-module list, for reference:

Modules 7 and 8 needed **no** new fields — Section 8's four tables and Section
9's `user_project_assignments` were implemented exactly as written. Their
implementation decisions (never storing `overdue`; the payment waterfall;
assignment as an allow-list) are in the Decision Log rather than here, because
they change no schema.

| Table | Field | Why |
|---|---|---|
| `purchase_order_items` | `sort_order` | Module 6 — same as the Module 5 case below: lines save in the same millisecond, so a PO came back shuffled |
| `material_requests` | `decision_note` | 6.5 has a `rejected` branch but nowhere to say why; `notes` is the requester's own text |
| `material_request_items` | `sort_order` | Lines had no order and `created_at` does not settle it — several save in the same millisecond |
| `material_request_status_history` | whole table | 6.5 defines a lifecycle but recorded no transitions, so only the current status was knowable |
| `towers` | `current_progress_pct` | Named in 6.3 as a cached field; not indexed, so no schema version change |
| `bookings` | `discount_decision_note` | Module 4 — 5.6 sends a rejection back to `hold` "note সহ" with no field to hold it |
| `bookings` | `installment_tenure_months` | Module 4 — tenure is what buyers negotiate |
| `land_jv_details` | `jv_share_basis` | Module 2 — a share % is meaningless without "percent of what" |
| `payments` | `booking_id` | Module 4 — 8.2 links a payment through an instalment that does not exist yet |
| `land_status_history`, `project_status_history` | whole tables | Audit trail for the pipelines |

---

## 3. Closed in Module 8 — kept as a record

**What Module 8 took over**

`users` was created in Module 3 so leads had somebody to be assigned to, with a
read-only helper living inside `lead.repository.ts`. Module 8 owns the table
now: the repository moved to `user.repository.ts` and grew the rest of Section
9 — create/edit, activate/deactivate, uniqueness on phone and email, and the
project scoping of 9.5.

The permission matrix of 9.6 is no longer only a table in a document. It lives
in `src/lib/domain/access.ts` and two things read it: the sidebar hides modules
a role cannot open, and `AccessGate` in the shell refuses the page when the URL
is typed in directly. See 1.9 and 1.10 for what is deliberately *not* enforced
yet.

**Verified by hand in the browser**

Switching to Site Manager collapsing the sidebar to Dashboard / Projects / Site
Progress and the Users page refusing to open with the role named in the
message; switching back restoring everything; a user with 14 progress updates
and 4 material requests refusing to be deleted and naming what blocks it;
adding a master-data option, moving it up the list, retiring it (still visible,
struck through, counted separately) and the case-insensitive duplicate guard
rejecting "  solar panel " against "Solar Panel"; company settings saving and
staying a single row; and mobile at 375px with no horizontal overflow,
including the 10-column permission matrix, which scrolls inside its own box.

---

## 4. Closed in Module 7 — kept as a record

**What Module 7 took over**

`payments` and `installment_plan_templates` were brought forward into Module 4
because the receipt details are only knowable when the booking money is taken.
Module 7 now owns the rest: a confirmed booking generates its
`payment_schedule` and `payment_installments` from the project's plan template,
and every receipt — including the booking money taken back at `hold`, before
any schedule existed — is spread across those lines automatically.

`refunds` closes the booking-cancellation lifecycle that Section 8.2 flagged as
a gap, and `expenses` gives every irregular cost somewhere to go.

**Verified by hand in the browser**

A 400-day-old booking generating 27 instalments totalling its price to the
taka; the waterfall filling instalments 1–4 and leaving 5 part-paid where the
lump payments ran out; overdue derived at read time with day counts; a new
receipt reallocating live (collected 5.8M → 7.1M, overdue down by exactly the
amount received) and the same receipt deleted rolling both figures back
precisely; the over-refund guard refusing more than the buyer paid; a
part-refunded cancellation showing what is still owed back; the cost ledger
across every category with company-level costs correctly excluded from project
rows; a bad expense id showing "no longer exists" rather than hanging on
"Loading…"; and mobile at 375px with no horizontal overflow on any new page.

---

## 5. Closed in Module 6 — kept as a record

**What Module 6 took over from Module 5**

`material_requests` reached `approved` in Module 5, and `ordered` / `fulfilled`
were marked by hand from the status card because Procurement did not exist yet.
They are now driven by the real workflow — raising a Purchase Order writes
`ordered`, a Goods Receipt that completes the order writes `fulfilled` — both
through `materialRequestRepository.setStatus`, so the decision trail is written
exactly as before. The manual buttons are gone; `approved` now offers "Raise
Purchase Order" instead.

The reverse is handled too: deleting the goods receipt that completed an order
puts the request back to `ordered` with a note saying why.

**Verified by hand in the browser**

Weighted average across two lots at different rates (2000 bags @ 512 + 800 @
568 → 528.00, carried intact through two transfers); a failed quality check and
a pending one both staying out of stock while remaining on the GRN; over-receipt
refused against the outstanding quantity; over-issue refused against what the
store holds; a goods receipt deleted and the whole chain rolling back (PO line
quantity, stock, PO status, and the material request reopening from `fulfilled`
to `ordered`); a stock issue deleted and the material returning to the store at
the rate it left; a central → project transfer creating a store row that did
not exist; the supplier delete guard; every list filter and sort; empty states
on all four new pages; not-found pages for a bad purchase-order and supplier id;
and mobile at 375px with no horizontal overflow on any new page.
