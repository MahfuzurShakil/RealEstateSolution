# Open Items

Known-open work that is **not** a blocker for what is already shipped. Add to
this as modules land; delete an entry when it is done.

Last reviewed: 2026-09-05, after the list-filter consistency pass (Section 0k)
and Tier 3.5 — cash position (Section 0j),
Tier 3.2 — project budget (Section 0i),
Tier 3.1 — material catalogue (Section 0h)
and the land expense ↔ instalment feedback (Section 0g); before that 2026-09-04, after Tier 3.4 — land payment schedule (Section 0f),
Tier 3.3 — cost categories (Section 0e) and
Tier 3.6 — printed documents (Section 0d),
the client review batches F1–F4 (Section 0b)
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

### 1.8 `payment_schedules.entity_type` — **closed** by Tier 3.4, see Section 0f
`land` joined `booking` when the land payment schedule landed, so the column
and its `[entity_type+entity_id]` index now do the job Section 8.2 named them
for. A contractor's running bill is still the third value it is waiting on.

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

### 1.12 Printed documents — **closed** by Tier 3.6, see Section 0d
The number is kept rather than reused, because Sections 0a and 0b refer to
1.12 by number and renumbering the list would silently repoint them.

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

### 1.15 The land page shows what was due — **closed** by Tier 3.4, see Section 0f
The other side — what was agreed to be paid, and when — is now the Payment plan
tab. `landPaymentSummary` still answers "how much has gone out"; the plan
answers "how much should have, by now", and the two are computed by different
code paths from the same ledger rows, so they cross-check each other.

---

## 0k. List filters made consistent — 2026-09-05 (client feedback)

Reported: filters differ page to page, no search or reset in places, sorting
inconsistent, and some dropdowns stretch the full width.

**The width complaint had a root cause worth more than the symptom.** `cn()`
was `clsx` alone, which *concatenates* classes rather than resolving Tailwind
conflicts. `SelectInput`'s base style carries `w-full`, so a caller passing
`w-auto` produced `class="w-full w-auto"` and the browser picked whichever rule
came later in the stylesheet — not the caller's. **Every `w-auto` override in
the application was dead.** On collections two filter dropdowns measured
**1079 px**. `cn` now runs `twMerge`, so the caller wins as every call site
already assumed; the same two selects measure 243 px and 123 px.

**One `FilterBar`, used by nine list pages** — collections, expenses,
suppliers, users, stock, supplier vouchers, refunds, landowners, material
items. Search on the left, labelled content-width filters beside it, a Reset
that appears only when something is set, and the result count at the end.
Filters are labelled because an unlabelled select reading "Nokshi Green
Residence" gives no clue which field it filters — it is only self-explanatory
while it still says "All".

Reset renders only when a filter is active: a permanently visible Reset on an
unfiltered list is a button that does nothing, and it teaches people to ignore
it. Verified through the full cycle — hidden when clean, appears on filter,
clears every control and hides again.

**Two real sorting bugs, not just gaps.** `users.projects` sorted its count as
a *string*, so ten projects sorted before two; it is numeric now, with "All
projects" ranking above every count. `landowners.address` had no `sortValue` at
all and now sorts, with blank addresses last so the column opens on rows that
have one. Every other column that lacks sorting is an action column, which is
correct.

The expenses sort dropdown stays: that page renders `mobileCard`, and a card
stack has no column headers to click.

375 px re-measured on all eleven list pages — clean, except collections'
long-standing 406/375 from a single SVG path, which does not scroll and
predates this work.

### Still open from this

**`cn` now resolves conflicts app-wide.** That is the fix, but it means any
component whose base class was silently beating a caller's override now defers
to the caller. Nothing regressed in the sweep; worth remembering if something
looks different somewhere not covered by it.

---

## 0j. Tier 3.5 — bank accounts and cash position — done 2026-09-05

**Dexie v15** — `bank_accounts`, plus an indexed `account_id` on the four
tables that hold a money movement. **Tier 3 is complete.**

**A stores() spec replaces a table's whole index set.** The first draft of the
v15 `payments` line dropped `payment_method` and `received_by` without saying
so. Every v15 spec is now checked to be a superset of the earlier one — worth
repeating on any future version block.

**The definition, which §4.0 rightly asked for first.** The four tables are
*disjoint record sets* — a buyer receipt is never also a voucher — so adding
receipts and subtracting expenses, vouchers and refunds counts each taka once.
Not counted: `payment_installments` (what is owed, not what moved),
`stock_issues` and `stock_transfers` (material already paid for by the voucher
that bought it), budget lines (a plan). Refunds contribute `net_refund`, not
`amount` — the deduction never left the account.

**§4.0's predicted double count is real but is a data-entry duplicate.** A cost
recorded both as an expense and as a voucher is two records of one payment, and
no filter can distinguish it from two genuine payments of the same amount. It
belongs to whoever enters them, not to the arithmetic.

**The double count that can actually happen is a different one, and §4.0 does
not mention it:** movements dated before an account's opening balance are
already inside that balance, so counting both adds the same history twice.
Movements are filtered from the opening date, and a test asserts the naive
total differs.

`opening_balance` is not in the plan's schema and earns its place: without it a
"position" is only net movement since the software was installed, which
reconciles against nothing.

**Unattributed movement is reported separately and never folded into the
balance** — the same rule as unbudgeted spend in 3.2. A total that silently
absorbed rows with no account would reconcile against no bank statement, which
is the one thing the page exists for.

**The VAT/AIT rider is included, defined as memo fields.** `amount` stays what
actually left the account, so the cash position is right whether or not they
are filled in. Making `amount` gross and deriving the payment would have
changed the meaning of a column every existing screen already reads.

**Verified by reconciling against the database.** Every account balance,
the company total (89,136,550) and the unattributed bucket (1 movement,
1,280,000 out — the refund, left unattributed in the demo on purpose so the
warning has something to show) were computed independently from IndexedDB and
match the screen. The bKash statement adds up line by line: 850,000 opening +
500,000 + 400,000 + 400,000 − 85,800 = 2,064,200. Eleven domain cases pass,
including pre-opening exclusion, same-day inclusion and an idle account, with a
control proving they can fail.

Demo opening balances stand in for the equity and borrowing that bought the
land, which this prototype does not model. Without them the demo showed a
company tens of crore overdrawn — a figure that reads as broken rather than as
sample data.

### Still open from this

**Cheque realisation.** A cheque paid is treated as cash out on its payment
date. In practice it leaves the account when it clears, so a position taken
between the two is optimistic. The printed receipt already says a cheque is
subject to realisation; making the ledger agree needs a cleared-date column and
a state, which is its own decision.

**No transfers between accounts.** Moving money from the current account to
petty cash cannot be recorded, so it would have to be entered as a cost and a
receipt, which would overstate both. Needs its own table rather than a reuse of
the four money tables.

**VAT and AIT are recorded but not reported.** The columns and the form fields
exist; there is no return or deduction summary yet.

---

## 0i. Tier 3.2 — project budget / BOQ — done 2026-09-05 (batches A–B)

**Dexie v14** — `project_budget_lines`, keyed `[project_id+cost_category]`.
(v13 was the material catalogue; the shared block the plan wanted did not
happen, for the reason in 0h.)

**The plan does not mention the problem that shapes the feature: procurement
spend has no `cost_category`.** Project cost comes from two places — the
expense ledger, which is categorised, and `supplier_vouchers`, which is not
(§8.3 adds it at roll-up time). A budget covering only categorised expenses
would omit the largest line on most projects, the materials, while looking
complete.

So there is one reserved head, `_procurement`. The leading underscore is
load-bearing: `lookupRepository` slugifies a new cost category and strips
leading underscores, so a category named "Procurement" becomes `procurement`
and cannot collide. The head is unreachable by the generator, so it needs no
guard — better than adding one.

**`stock_issues` are deliberately not counted.** Material handed to a site was
already paid for by the voucher that bought it; adding it again as it moves
from store to tower is precisely the double count §8.3 warns about.

**Unbudgeted spend is surfaced, not absorbed.** A head with spend and no budget
line gets its own flagged row and a warning, and is still counted in Spent so
the percentage stays honest. A budget that quietly swallows uncategorised spend
reads as complete while money leaks — the one thing this screen must not hide.

**What the budget makes answerable.** The overview card still says "estimated
profit so far", which for a project mid-construction could only ever be a loss.
The budget tab says **profit at completion** — sales value less *planned* cost.
The two disagree on purpose and are labelled so.

**Verified by reconciling against the database, not the screen.** For Nokshi
Dhanmondi Court the panel's Spent (84,413,100) equals expenses by category
(6,950,000 + 70,000,000 + 5,850,000 + 320,000) plus vouchers (1,293,100),
summed independently from IndexedDB. Against a 78,500,000 budget it reports
5,913,100 over at 107.53%, contractor payment 950,000 over at 115.83%, land
payment at exactly 100%, and land extra cost flagged as the one unbudgeted
head. Profit at completion (22,300,750) equals a sales value of 100,800,750
computed independently from bookings, less the budget. The finance overview
reaches the same variance by a different path (`budgetedByProject` against
`byProject.total_cost`) and agrees.

Fourteen domain cases pass — over budget, unspent, unbudgeted, no budget at
all, zero-value heads not invented as rows, rows summing to their own totals —
with a control proving they can fail. A demo reload produces 8 budget lines
across two projects with no zero lines and no duplicate heads, which exercises
the upsert.

Demo budgets are deliberately seeded **over** on one head with another left
unbudgeted: a plan where everything is comfortably green demonstrates nothing.

### Still open from this

**The budget is flat, not a bill of quantities.** One amount per cost head per
project, because the actual side is only recorded per category — budgeting any
finer would produce variances that could never be computed. A real BOQ with
quantities and rates needs the actual side to carry the same structure first.

**No budget revision history.** Editing a budget overwrites it, so "what did we
originally plan" is not answerable. Same shape as the audit-log gap in 1.11.

---

## 0h. Tier 3.1 — material item catalogue — done 2026-09-05 (batches A–C)

**Dexie v13.** `material_items` plus a nullable `item_id` on the tables that
carried free-text item names.

**Two decisions, both taken here rather than deferred.**

*Stock identity moves from the spelling to the item, and the unit moves onto
the item.* Section 7.7 keyed a stock row `(project_id, item_name, unit)`, so a
material held as many rows as it had spellings, each with its own quantity and
its own weighted-average cost. The key is now `(project_id, item_id)`. Unit is
a property of the material — cement is stocked in bags — and having it in the
key was the third way one material could split; it is the component that could
be removed rather than merely improved. Buying in another unit is a conversion,
which is out of scope, and allowing two units per item would rebuild the
problem. Changing an item's unit is refused while it holds stock, because
`average_unit_price` is per unit and switching bag to ton would revalue the
store twentyfold.

*The migration back-fills; it does not leave progressive matching.* §3.1
proposed matching rows up over time. A half-migrated table is the worst of
both: `findRow` would key on the item for some rows and on the spelling for
others forever, and the two spellings this feature exists to merge would go on
holding separate stock in the meantime. The pass seeds the catalogue from
`stock` first — the rows that hold quantity and cost — then links issues,
transfers and order lines. It is additive: it inserts rows and fills a nullable
column, touching no quantity and no price. The name fallback stays in
`findRow`, so anything the pass missed keeps working, and a pre-catalogue row
reached by a catalogued receipt adopts the item from then on.

**Current state reads the new name; documents keep the old one.** Renaming an
item changes the stock page and the pickers, because stock says what is in the
store *now*. A purchase order still shows the name it was ordered under,
because it records what was ordered. That is why `item_name` stays on every
line row beside `item_id`.

**Duplicates are prevented, not merged.** Names are unique case-insensitively,
as in `lookupRepository.addOption`. Merging two catalogue items is deliberately
**not** built: it means combining two weighted averages, and Module 6 already
settled that a running average is not reversible (a deleted GRN does not rewind
it). A merge would have to invent a blended cost for material bought at neither
price. Recorded as open below.

**Three claims in the plan did not survive contact with the code.** §3.1 says
item names are written into six tables — `goods_receipt_items` has none, it
reaches its item through `po_item_id`, so it is five. "Item pickers on 5 forms"
is two: `StockIssueModal` and `StockTransferModal` already picked from existing
stock rows. And `project_budget_lines` was to share v13 with Tier 3.2;
declaring an empty table for an unbuilt feature would freeze indexes nobody has
designed, so **3.2 now takes v14 and 3.5 takes v15**.

**Verified against the database, not the screen.** The v12→v13 upgrade produced
21 catalogue items from exactly 21 distinct (name, unit) pairs, linked 67 of 68
rows across the five tables, with no dangling ids, no name mismatches and no
duplicate names; the name-match assertion was confirmed capable of failing. The
one unlinked row is "Site Office Container" — requested once, never ordered,
which is the rule working. Renaming "Cement (Shah Special)" left all three of
its stock rows linked, 2,030 bags intact and the average at 528, with no fourth
row created. A full demo reload reproduced the catalogue identically, which is
the fresh-database path: Dexie fires `.upgrade()` only on a version change, so
the back-fill also runs from the demo seed.

### Still open from this

**Merging two catalogue items.** Two rows that turn out to be the same material
cannot be combined. It needs a decision about what happens to two weighted
averages and to the stock rows under them — see the irreversibility note in the
Module 6 decisions. Prevention (unique names) covers the common cause; this
covers the case where two were created before anyone noticed.

**Requisition lines can still name an item the catalogue never had.** Rows
migrated from before v13 keep their free text and show as "(not in catalogue)"
in the picker, so they read correctly and can be re-pointed by editing. Nothing
forces that tidy-up.

---

## 0g. Land expense ↔ instalment connection — 2026-09-05 (client feedback)

Three points raised after 3.4 landed. One was a data bug, not a display gap.

**The Land picker is now disabled unless the category is land money, and the
plot is cleared when the category moves away.** `land_id` was never cleared on
a category change, so picking a plot under Land Payment and then switching to
Marketing saved a marketing cost carrying a `land_id`. `landPaymentSummary`
counts every expense against a land, so it turned up in that plot's "fees and
extras" — money the land never cost, and nothing on screen looked wrong. The
rule is enforced in `createExpense`/`updateExpense` as well as on the form.
Land fees are not stranded by it: `land_extra_cost` is the seeded category for
registration, mutation and legal fees, and it keeps the picker.

This reverses the call recorded in 0e. The objection there — that a user-added
category like "Legal & Registration" belongs in the land's fees bucket — did
not survive checking: `land_extra_cost` already **is** that bucket.

**The expense form is no longer blind to the plan.** With Land Payment and a
plot selected it shows the oldest unsettled instalment, how late it is, what is
outstanding on it, and the plan total still owed — plus what the amount being
typed would do. `landDueSummary` deliberately reports the oldest *unsettled*
line rather than `summariseSchedule.next_due`, which skips overdue lines: the
right answer on a dashboard, the wrong one at the counter, where the money
lands on the overdue line.

**`allocateOldestFirst` is now the single implementation of the waterfall**,
shared by `recalculateForLand` (which writes) and `previewLandPayment` (which
predicts). Two implementations of one rule drift, and the one that drifts is
the preview — the half somebody makes the decision on.

**Underpayment, the case the client asked about, keeps its behaviour and now
says so on screen.** Pay 1,500,000 against a 2,000,000 instalment and the
shortfall stays on *that* instalment, going overdue on its own date, rather
than moving to the end of the plan. Arrears read as arrears and the plan still
describes what was agreed. Renegotiating a shortfall onto a later instalment is
the existing per-line edit, which is the right place for it: a change to the
agreement, made deliberately.

**Overpayment warns and saves anyway.** The money left the account; refusing to
record it would make the ledger wrong to protect a plan that is merely out of
date. The excess shows as unallocated on the plan tab, as before.

Verified end to end: an 800,000 part payment produced exactly the 1,200,000
outstanding the preview promised, and deleting it rolled back to 70,000,000.
The panel sits above the fields — the modal body scrolls, and below them it sat
off-screen behind the very field it exists to inform.

---

## 0f. Tier 3.4 — land payment schedule — done 2026-09-04 (batches A–C)

**No schema change.** `SCHEDULE_ENTITY_TYPES` gains `land`; the column and the
`[entity_type+entity_id]` index were always there (Section 8.2). Closes 1.8
and 1.15.

**The plan's 🔴 does not hold, and it was tested rather than assumed.** §4.0
says `collectionRepository.list` and the finance dashboard have no
`entity_type` filter, so land instalments would appear in the buyer collections
queue and land money would be added to "Still due" and "Overdue". A land
schedule with four overdue lines worth 82,000,000 was inserted and the filter
then removed again: collections stayed at 156 rows, the dashboard stayed at
207,751,600 due and 5,558,712 overdue across 9 instalments, and no land line
ever appeared. Both readers join through `bookings` and drop anything whose
`entity_id` is not a booking id.

The filters went in regardless. The join drops land rows only as a side effect
of a land id never matching a booking id — an invariant nothing states and
nothing protects. What §4.0 got right is that this had to be settled before the
first land row existed. It was simply already true.

**Land needs its own generator**, as §4.0 correctly noted:
`generateForBooking` walks booking → unit → tower → the project's instalment
template, none of which a plot has. Terms are entered per land — advance
(bayna), monthly count, registration hold-back — because a plot is negotiated
once with one owner in taka rather than in percentages of a price list.
Direct purchase only, and only with a `final_agreed_amount`: a joint venture
pays the owner in units (Section 2.4), so there is no price to schedule, and
the tab says that rather than showing an empty table.

**Land instalments settle from the cost ledger, not from `payments`.**
`recalculateForLand` allocates `land_payment` expenses oldest-first — the same
waterfall as the buyer side, from the other direction. `amount_paid` stays
derived, so the plan and the ledger cannot drift apart; that is the argument
against letting Accounts tick lines by hand, which would put two numbers on one
fact. Nothing is written back to the expense row: a payment carries
`installment_id` so a receipt can name its instalment, an expense needs no such
column, and adding one would be a schema change for provenance nobody prints.

**All three expense write paths recalculate**, including edits that *move* a
cost. Verified in both directions on seeded data: recording 2,000,000 against
the Dhanmondi plot took instalment 5 from 5,500,000 to settled; switching that
cost's category out of `land_payment` put it straight back to 5,500,000 and
partially paid; deleting it left it there. Doing only the new side of an edit
would leave the old land showing an instalment settled by a cost no longer
against it.

**A cross-check worth keeping.** The Dhanmondi plot's plan totals 82,000,000
with 70,000,000 allocated, so it still owes 12,000,000 — the same figure the
land page's balance reaches through `landPaymentSummary`, which is a different
code path over the same ledger rows. When those two disagree, one of them is
wrong.

**One demo plan is seeded**, generated through `generateForLand` rather than
written by hand, following the rule the booking schedules already follow: a
hand-written plan would demonstrate a schedule the feature never produced. It
seeds part-paid, which is the state worth showing. A full demo reload
reproduces it exactly and leaves the dashboard figures unchanged.

`planLandInstallments` was checked on twelve cases — totals that do not divide
evenly, 31 Jan clamping to 30 Apr, four rejection cases — plus a control
proving the assertions can fail. Terms that do not total the agreement produce
no lines at all, because a plan that disagrees with the agreement leaves a
balance that never reaches zero however much is paid.

---

## 0e. Tier 3.3 — cost_category becomes a lookup list — done 2026-09-04 (A–C)

§1.2 always named `cost_category` a `lookup_values` category. It was a
hard-coded ENUM and Master Data did not list it, so adding "Legal &
Registration" needed a developer — the one thing Master Data exists to
prevent. This was a gap against the frozen scope, not a new idea.

**No Dexie version block.** Two nullable, non-indexed columns on
`lookup_values`: `code` (the stable key a record stores) and `is_system` (a
seeded option the code depends on). Same precedent as
`towers.current_progress_pct`.

**Why this one list stores a code and the other five store their label.**
`facing: 'South'` means renaming "South" renames it on every unit at once,
which is right for a typo. `cost_category` cannot work that way:
`expenseRepository.landPaymentSummary` and the expense form both key off
`land_payment`, so if the key were the label, a rename in Master Data would
silently change what a land's balance means. The label is renameable; the key
underneath it does not move. Verified: renaming "Land Payment" to "Payment to
Landowner" moved the label on every screen, left the code at `land_payment`,
and left the land's balance at 12,000,000 with fees at 5,850,000.

**System options can be renamed and reordered, never retired.** There is no
delete in Master Data, so deactivating is the only way a built-in could
vanish, and deactivating `land_payment` would leave no way to record money
paid to a landowner while the land page carried on reporting a balance as
though there were. The six carry a "Built-in" badge and a disabled retire
button; `deactivate()` routes through the guarded `setActive` so it cannot be
stepped around. The user-added seventh option stayed retireable, which is what
makes that check worth anything.

**A category added through Master Data gets a slug generated once** and
uniquified against the seeded codes, so "Other Costs" cannot collide with
`other`. It never follows a later rename — that is the point of having it.

**Two things found only by verifying:**

- A cost recorded under a category that was then retired lost its real name and
  fell back to a humanised code — "Legal Registration", ampersand and all,
  instead of "Legal & Registration". The label lookup was reading the *active*
  list. It now reads every option and the dropdowns filter for active, which is
  the only place a retired option genuinely must not appear.
- The repository guard held against retiring a built-in, but the confirm dialog
  sat open with no explanation and the error went to the console. The button is
  now disabled with the reason, and the dialog surfaces the error if it ever
  fires anyway.

**One claim in the plan's §4.0 does not hold.** It lists `ExpenseFormModal` as
a place that "shows the land picker only when the category is `land_payment` or
`land_extra_cost`". It does not — the picker is shown for every category and
always has been; those two names only change its hint text. Left exactly as it
is. Restricting it would have been a regression rather than a no-op:
`landPaymentSummary` splits money paid to the owner from everything else booked
against the land, and "everything else" is precisely where a user-added
category like "Legal & Registration" belongs. No seeded expense attaches a
non-land category to a land, so nothing depended on the looseness either way.

---

## 0d. Tier 3.6 — printed documents — done 2026-09-04 (batches A–D)

No schema change and no Dexie version block: every field the three documents
print was already stored. Entirely additive — there was no print code and no
CSV code anywhere in the app before this. `tsc` and `eslint` clean after each
batch; all three documents and all three register pages measure 375/375 with
no horizontal scroll.

**A — the layer underneath.** `lib/domain/document.ts` spells an amount in
words in crore/lakh (`amountInWords`), checked against eight cases plus a
control proving the comparison can fail. `lib/utils/csv.ts` quotes anything
that would change the file's shape and prefixes a quote to a cell starting
`=`, `+`, `-` or `@`, which Excel would otherwise evaluate as a formula; the
file carries a UTF-8 BOM (verified as bytes `EF BB BF`) so Bangla names do not
arrive as mojibake. `lib/repositories/print.repository.ts` does every read, so
the document pages stay off Dexie.

**The shell steps aside on a `/print` route** rather than hiding itself in
`@media print`. Suppressing the sidebar in print CSS still leaves the shell's
flex column and padding shaping the sheet. `MockSessionProvider` and
`AccessGate` deliberately stay: a document is a URL, and a pasted URL must
still obey §9.6. Checked in both directions — `site_manager` is refused both
the receipt and the voucher, `accounts` is admitted to the receipt.

**B — money receipt** at `/admin/collections/receipt/[paymentId]/print`,
reached from the booking's Payments tab. **C — booking form** at
`/admin/bookings/[id]/print` and **supplier voucher** at
`/admin/supplier-vouchers/[id]/print`, the latter reached from the register
(and repeated on the mobile card, since its column is not rendered at 375 px).
All three were reconciled against the seeded rows rather than read off the
screen.

**D — CSV export** on collections, expenses and the voucher register. It
exports the **filtered set, not the visible page** — the button says so and
carries the row count, because at a page size of 12 or 25 the difference is
easy to be wrong about silently. Verified as capable of failing: filtering the
register to one supplier took the export from 9 rows to 3. Amounts and dates
go out raw (numbers, ISO dates), not through `formatBdt` — a spreadsheet
cannot sum a cell reading "BDT 1,500,000".

**1.12 is closed.** Company Settings is back in the present tense: the
documents it describes now exist.

**Two things worth knowing:**

- The words on a receipt read "Taka Fifteen Lakh Only" while the figure beside
  them reads `BDT 1,500,000`. That is the open `formatBdt` grouping decision in
  §0b showing up on paper. Raised and deliberately left alone rather than
  changed in passing — see the Decision Log.
- An unfilled Settings field leaves **no line** on the letterhead rather than a
  blank one. A gap where the trade licence should be reads as a printing fault,
  not as missing data.

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

Re-run in full after the fixes below; every check listed passes on freshly
seeded data. A lesson worth keeping: a check that reports "0 failures" is
worth confirming it can fail at all — one here passed for months of reading
because both sides of the comparison were `undefined`.

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
- **Procurement:** the first run of this check was **vacuous** — it compared
  two misspelled field names, so both sides were zero and it passed without
  testing anything. Re-run against the real fields (`quantity_ordered` /
  `quantity_received`) it failed on 2 of 22 lines and exposed a money bug:
  the order line counted delivered quantity regardless of the quality check,
  while stock counted only what passed. PO-2026-008 read "Received" in full
  with all 150 kg of GI wire failed and nothing in stock, and the payable
  claimed BDT 19,200 for rejected material. Fixed — the line now counts
  accepted quantity only, symmetric on GRN delete. All 22 lines reconcile.
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
