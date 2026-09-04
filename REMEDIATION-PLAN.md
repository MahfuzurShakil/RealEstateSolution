# Remediation & Enhancement Plan

Companion to `ANALYSIS-REPORT_2026-09-02.md`. Written after tracing every
proposed change through the code, so the blast radius of each one is known
before any of it is started.

**Re-tiered as requested:**

- **Tier 1 — Critical + Major defects.** Wrong numbers and broken behaviour.
- **Tier 2 — Minor + Cosmetic defects.** Friction and polish.
- **Tier 3 — Future-scope features worth building into the prototype now**,
  chosen by *rework cost avoided*, not by how nice they sound.

Nothing here has been implemented yet. No code was changed to produce this
plan (two corrections were made to the analysis report — see §0).

---

## 0. Corrections to the analysis report, made before planning

Two findings did not survive verification and would have sent work in the
wrong direction. Both are now fixed in the report.

**P-1 was not a code defect.** The eight booked/sold units against one
booking on `PRJ-2026-001` come from the demo seed:
`src/lib/db/demo-projects.ts:200` (`sold: ['A-2A','A-2B','A-3B']`) and
`:490–491` set `unit_status_overrides` directly, so the inventory rail can
show every status. Downgraded to Minor. The genuine (small) hole underneath
it is that `UnitEditModal` lets an editable unit be set to `booked` /
`reserved` by hand — the application enforces no invariant between
`units.status` and `bookings`.

**U-2 was observed under the wrong role.** The first time I read the
dashboard "as Accounts", the role had silently reset to `super_admin`
(that reset is U-1). Re-verified properly by switching role and navigating
client-side: role stayed `accounts`, the greeting correctly changed to
*"Hello, Faruk Ahmed"* — so identity **does** follow role, which the report
had not claimed either way — and the dashboard still showed Lands 11,
Landowners 10, Leads 12 and the lead follow-up queue to a role that cannot
open any of them. **U-2 confirmed.**

---

## 1. Blast-radius analysis

The thing that makes this codebase safe to change is the architecture rule
that has been held to: **the UI never touches Dexie**, everything goes
through `src/lib/repositories/*`, and the arithmetic lives in
`src/lib/domain/*`. Every fix below lands in one of three layers, and the
layer tells you the risk.

| Layer | Risk profile |
|---|---|
| `app/**` + `components/**` (display) | Cannot corrupt data. Worst case is a layout regression. |
| `lib/domain/**` (pure functions) | Changes numbers on several screens at once. Deterministic, no I/O — easy to reason about, easy to get wrong quietly. |
| `lib/repositories/**` + `lib/db/**` (data) | The only layer that can damage stored records. |

**Nothing in Tier 1 or Tier 2 writes to the database.** Every Tier 1 fix is
display or pure-domain arithmetic, except U-1 (adds a `localStorage` read)
and B-1 (changes what a *new* schedule is generated with — it never rewrites
an existing row). Only Tier 3 touches the schema.

### Per-fix blast radius (traced in code)

| Fix | Layer | Files | What else moves | Risk |
|---|---|---|---|---|
| **F-1** money rounding | display | 17 files, 34 call sites of `formatBdt(..., {compact:true})` | Nothing computational. `formatBdt` is the *only* money formatter in the codebase (192 call sites, one function) — a clean seam. | **Low, one caveat:** full numbers are wider than `BDT 98M`. The app currently has zero horizontal overflow at 375 px; widening table cells is exactly how that gets lost. Must re-measure at 375 px after. |
| **S-1** progress variance | domain | `lib/domain/site-progress.ts` (`rollupProgress`, `rollupAcrossTowers`) | `ProgressRollup` is read by 4 display components **and** by `site-progress.repository.ts:773` (the "behind schedule" filter) and `:845` (the sort that orders the site list). Changing `actual_pct` would silently reorder the "sites that need you first" list. | **Medium if done wrong, Low if done additively** — see the recommendation below. |
| **S-2** tower chip rounding | display | `TowerProgressPanel.tsx` | None. | Low |
| **B-1** booking-amount instalment | domain + repo | `lib/domain/finance.ts` (`planInstallments`), `lib/repositories/finance.repository.ts` (`generateForBooking`) | Changes the schedule of every **newly confirmed** booking, which flows to the Instalments tab, the collections queue, finance overview due/overdue, and the project finance card. All of those are derived at read time — **there is no stored aggregate to go stale.** | **Medium.** Highest-value and highest-reach change in Tier 1. Existing seeded schedules are not retro-fixed; a demo-data reload regenerates them. |
| **PR-1** supplier payable | repo (read path) | `procurement.repository.ts` `SupplierRepository.list` / `getWithStats` | `SupplierWithStats` is read by exactly two pages (`/admin/suppliers`, `/admin/suppliers/[id]`). `poTotals()` **already computes `receivedValue`** — the fix is to use the field that exists rather than write new maths. | **Low.** |
| **U-1** role persistence | display/context | `lib/auth/mock-session.tsx` | Every role-dependent screen. | **Low, one real trap:** reading `localStorage` during render causes a Next.js hydration mismatch. Must initialise in `useEffect`. |
| **U-3/U-4/U-5** dead chrome | display | `AdminTopbar.tsx`, `nav-config.ts` | None. | Low |
| **F-2** collected vs allocated | display | `app/admin/finance/page.tsx:48`, `app/admin/collections/page.tsx:185` | None — both figures are already computed correctly and separately; only the labelling misleads. | Low |
| **PR-2/PR-3** rate decimals, voucher sort | display | PO detail, vouchers page | None. | Low |

### Two design decisions that need making before code is written

**S-1 — how to fix it without moving the headline.** Root cause confirmed in
`rollupProgress` (`lib/domain/site-progress.ts:122–145`): `actual_pct` is
weighted over **all** work items, while `planned_pct` and the internal
`comparableActual` are re-based on only the items that carry plan dates
(`plannedWeight`). Tower A's *External Works* (weight 6 %, no dates) is
excluded from the planned side, so `comparableActual` becomes ≈38.8 against
a displayed actual of 37.3.

- ❌ *Make variance = actual_pct − planned_pct.* Wrong: it compares two
  different weight bases, and every item without dates permanently flatters
  the site.
- ❌ *Include no-plan items as 0 % planned.* Wrong in the other direction —
  `External Works` would make the project look eternally ahead of schedule.
  The original author excluded them deliberately and was right to.
- ✅ **Recommended: add `comparable_actual_pct` to `ProgressRollup` and
  render the caption from it.** `actual_pct` keeps its current meaning, so
  the cached `towers.current_progress_pct`, the dashboard headline, the
  public-portal repository and the list sort are all untouched. Only the
  "planned X % · ±Y %" caption changes, and it becomes internally
  consistent. Additive change, no existing consumer breaks.

**B-1 — where the 337,000 goes.** Confirmed in
`lib/domain/finance.ts:149–174`: the `on_booking` line takes
`total × percentage / 100` and ignores `bookings.booking_amount` entirely.
The `due_date` rule (`= booking_date`) is correct per §8.2 and should stay —
once the amount is right, a fully-received booking amount marks the line
`paid` and the fake arrear disappears on its own.

- Pass `bookingAmount` into `planInstallments`; when an `on_booking` line
  exists and `booking_amount > 0`, set that line to the amount actually
  agreed.
- Redistribute the difference **proportionally across the remaining lines**,
  not into the last line. The existing "last line absorbs the drift" step
  (`:178–184`) then only handles rounding, as intended. Dumping 337,000 onto
  the Handover milestone would be technically correct and commercially
  absurd.
- Guard: if `booking_amount > final_price`, fall back to the template rather
  than generating negative instalments.

---

## 2. Tier 1 — Critical and Major defects

Ordered so that each batch is independently verifiable in the browser, and
so the riskiest change lands while attention is on it rather than at the end.

### Batch 1A — money is readable (F-1, F-2, PR-2)

1. **F-1** Add `formatBdt` usage discipline: full figures in every table and
   detail row; `compact` retained only in headline KPI tiles. 34 call sites
   across 17 files; the finance, collections, purchase-orders and stock
   pages carry 20 of them.
2. **F-2** Relabel the two "Collected" tiles so they cannot be read as a
   contradiction, and surface the unallocated remainder explicitly
   ("BDT 4M received against bookings not yet confirmed").
3. **PR-2** Money **rates** to two decimals so `40000 × 13.50 = 540,000`
   multiplies out. Quantities and totals keep their current precision.

*Verify:* `/admin/finance`, `/admin/collections`, `/admin/purchase-orders/<PO-2026-010>`
— then **re-measure `document.documentElement.scrollWidth` at 375 px on all
four money pages**, because this batch is the one that can reintroduce
horizontal overflow.

### Batch 1B — site progress tells the truth (S-1, S-2)

4. **S-1** Add `comparable_actual_pct` per the decision above; render the
   caption trio from one consistent base in all four components that show it
   (`site-progress/page.tsx`, `site-progress/[projectId]/page.tsx`,
   `ProjectProgressSummary.tsx`, `TowerProgressPanel.tsx`).
5. **S-2** Tower chip to one decimal so it agrees with its own
   `Σ (progress × weight ÷ 100)` footer.
6. **S-4** (Minor, but it belongs in this batch) A site with no update for
   more than 14 days does not get a green **On Track** badge.

*Verify:* `PRJ-2026-001` must stop reading "37.3 % / planned 37.7 % / +0.7 %
/ On Track". Check `PRJ-2026-003` (2.3 % vs 1.8 %) still reads `+0.5 %` —
that one is currently correct and must not regress. Confirm the site-list
ordering and the "Behind schedule" filter are unchanged.

### Batch 1C — a confirmed booking is not born overdue (B-1)

7. **B-1** as designed above.

*Verify:* reload demo data, confirm a booking whose `booking_amount` is not
10 % of `final_price`, and check that instalment 1 equals the booking amount,
shows `Paid`, and the schedule still totals `final_price` to the taka. Then
re-check the collections overdue total and the finance overview move
consistently.

### Batch 1D — payables are real money (PR-1, PR-3, PR-4)

8. **PR-1** Skip `draft` orders as well as `cancelled`; compute the payable
   from `poTotals().receivedValue` rather than `.value`. Add an explicit
   "ordered but not yet received" figure so nothing is hidden, and keep the
   PO-page KPI rail consistent with it (PR-7).
9. **PR-3** Sort the supplier voucher register by date, and give the page a
   sort control.
10. **PR-4** Where vouchers paid exceed value received (the cancelled
    `PO-2026-004` / Meghna case), show it as **advance held with the
    supplier** instead of a negative "due".

*Verify:* BSRM must no longer show `BDT 6,405,600 due` while
`PO-2026-011` is a draft. Meghna must show the advance rather than a
negative.

### Batch 1E — the shell stops lying (U-1, U-2, U-3, U-4, U-5, C-1, C-2)

11. **U-1** Persist the acting role to `localStorage`, initialised in
    `useEffect` to avoid a hydration mismatch.
12. **U-3/U-4/U-5** Remove the non-functional search box, the four
    unlabelled topbar icons and the inert "Help and Support" entry. *(Search
    returns as a real feature in Tier 3; a dark-mode toggle can be wired if
    wanted, otherwise the icon goes.)*
13. **U-2** Make the dashboard role-aware: hide the cards a role cannot open,
    and give the owner/management and accounts views their money figures.
14. **C-1** A lead with a live booking leaves the follow-up queue.
15. **C-2** Surface the unassigned-lead count on the leads banner.

*Verify:* switch to Accounts, **reload the page**, confirm the role holds and
the dashboard shows finance rather than land and lead cards. Switch to Site
Manager and confirm the same.

---

## 3. Tier 2 — Minor and Cosmetic defects

Cheap, no design decisions, safe to batch together and verify in one pass.
None of these touch the domain or repository layers.

| # | Fix |
|---|---|
| L-1 | Land detail shows agreed / paid / balance and links to the filtered expense list *(depends on Tier 3.4; ship the link first, the schedule with 3.4)* |
| L-2, F-5 | Sensible default page sizes — 25 for worklists (collections, expenses, vouchers), 12 for card lists |
| L-3 | De-emphasise `Delete` next to `Edit` on detail headers |
| P-3 | Tower card shows "18 of 22 generated" when bulk generation left a gap |
| P-4 | Project list card carries sold % and booked value |
| P-5 | Tab strip gets a scroll affordance below ~1280 px |
| P-1 | Seed creates bookings for pre-sold units; unit form drops statuses only a booking should write |
| C-3 | Last-activity date on the lead card |
| C-4 | Bulk assignment of leads |
| B-3 | "Record refund" action on the Refunds page |
| B-4 | "Amount must be greater than zero" instead of "Enter the amount received" |
| B-5 | "Resubmit for approval" on a rejected-discount booking |
| S-3 | A work item with no plan dates says so, and says it is outside the schedule maths |
| PR-5 | Separate "goods outstanding" from "money due" on the PO card |
| PR-6 | A draft says "Created", not "Ordered" |
| F-6 | "Record payment" straight from a collections row |
| F-7 | Sort control on expenses; category chart clickable as a filter |
| F-8 | "Showing 1–1 of 1 refund" |
| U-6 | Sidebar groups: allow more than one open, remember what was open |
| U-7 | Seed offsets `users.created_at` like every other demo record |
| U-8 | Settings copy stops promising printed documents *(or Tier 3.6 lands and the promise becomes true)* |
| Mobile | Collections, expenses, vouchers and users render as cards below `md`, matching the list pages |

---

## 4. Tier 3 — features to build into the prototype now

Selected on one criterion: **what costs more to add later than to add now.**
That is either data migration (rows already accumulating in the wrong shape)
or analytical rework (screens that must be rebuilt once the feature exists).

Everything else from the future-scope section stays deferred, and §4.7 says
so explicitly.

> **Re-validated 2026-09-04 against the code as it now stands.** This section
> was written before Tier 1, and roughly twenty-five commits have landed since
> (Tier 1, Tier 2, the F1–F4 client feedback, the project pipeline guard, the
> rejected-delivery fix). The direction still holds and the Dexie numbering is
> still right — the database is on **v12**, so the next block really is v13.
> Two things did not survive contact with the current code: one claim in §3.4
> is wrong, and one breakage nobody had looked for is real. Both are recorded
> in §4.0 below, which should be read before starting any of these.

### 4.0 What re-validation found

Per-item risk against the code as it is today. 🟢 nothing existing is
disturbed · 🟡 existing code must be adjusted as part of the work · 🔴 a
specific thing breaks unless it is handled first.

| # | Schema | Risk | What it touches that already exists |
|---|---|---|---|
| 3.6 Printed documents | none | 🟢 | Nothing. There is no print code in the app at all — not one `window.print` or `@media print`. Entirely additive. |
| 3.2 Project budget / BOQ | v13 | 🟢 | New table read by new screens. |
| 3.3 Cost category → lookups | none | 🟡 | Three places key off the ENUM — see below. |
| 3.1 Material item catalogue | v13 | 🟡 | Stock identity — see below. |
| 3.5 Bank accounts | v14 | 🟡 | Double-counting risk — see below. |
| 3.4 Land payment schedule | none | 🔴 | **Collections and the dashboard have no `entity_type` filter.** |

#### 🔴 3.4 — the one that breaks something

`collectionRepository.list` and the finance dashboard both read
`db.payment_schedules.toArray()` with **no `entity_type` filter anywhere**.
The moment the first land schedule row exists, land instalments appear in the
buyer collections queue, and land money is added to "Still due" and "Overdue"
on the dashboard — figures that are supposed to mean *what buyers owe us*.

The fix is small (filter in two places) but it has to land **before** the
first land schedule is written, not after, because nothing about the wrong
numbers would look wrong.

**And one claim in §3.4 below is overstated.** "This feature needs no schema
change at all — it reuses the instalment engine that Module 7 already proved"
is only half true. `payment_installments` and the `[entity_type+entity_id]`
compound index are genuinely ready and need no migration. But
`paymentScheduleRepository.generateForBooking` is booking-shaped throughout —
it reads `bookings`, then `units`, then `towers`, then the project's
instalment template. Land needs its **own generator**, not a reuse of that
function, and `SCHEDULE_ENTITY_TYPES` (still `['booking']`) needs its second
value. Size is Small–Medium as stated; the reasoning was just wrong about why.

#### 🟡 3.3 — three places assume the ENUM

Making `cost_category` dynamic is right and cheap, but three pieces of code
read specific values and would quietly misbehave:

1. `COST_CATEGORY_META` (`domain/finance.ts`) is a `Record<CostCategory, …>`
   of label and badge tone. A category added through Master Data has no entry,
   so every screen showing a cost needs a fallback.
2. `ExpenseFormModal` shows the land picker only when the category is
   `land_payment` or `land_extra_cost`.
3. `expenseRepository.landPaymentSummary` — added for L-1 — separates
   `land_payment` from fees so the land page's balance means "still owed to
   the owner". Lose that distinction and the land balance silently changes
   meaning.

So the six seeded categories have to stay as **system categories**: renameable,
not deletable, with unknown categories falling back to a neutral label. Good
news: `LookupCategory` already declares `'cost_category'`, and the Master Data
screen renders whatever categories exist, so seeding the rows makes the screen
work with no UI change.

#### 🟡 3.1 — decide what a stock row is keyed by

Stock is keyed `[project_id + item_name + unit]`, and the weighted average
cost lives on that row. Adding a nullable `item_id` beside free text is
additive and safe, but it does not by itself answer what happens when two
spellings of one item both hold stock. Until the key moves to the item, a
rename splits both the quantity and the average cost. Settle the identity
question before writing the migration, not after.

#### 🟡 3.5 — write the definition down first

§8.3 already says supplier vouchers are added at roll-up time so nothing is
counted twice. A cash position that adds payments in and takes expenses,
vouchers and refunds out can double-count the same taka if a cost is recorded
both as an expense and as a voucher. The arithmetic is easy; the definition is
the work.

### 3.1 Material item catalogue — *highest migration cost of anything on the list*

**Why now.** Item names are free text today, and they are already written
into **six** tables: `material_request_items`, `purchase_order_items`,
`goods_receipt_items`, `stock`, `stock_issues`, `stock_transfers`. §6.6
itself calls free text temporary. Every week of operation adds rows that
have to be reconciled by hand later — "Cement (Shah Special)",
"Cement (Fresh)" and "cement shah special" silently become three items and
weighted-average costing, stock valuation and rate comparison all quietly
stop meaning anything. This is the one item where deferring has a *compounding*
cost.

**Schema.** New `material_items` (`id`, `code`, `name`, `unit`, `category`,
`is_active`) + a nullable `item_id` on the six line tables. Dexie **v13**.
Nullable and additive, so existing rows keep their free text and are matched
up progressively — no big-bang migration.

**Size:** Medium. **Touches:** procurement repository, material-request
repository, and the item pickers on 5 forms.

### 3.2 Project budget / BOQ — *highest analytical rework cost*

**Why now.** The project Finance tab already says "Estimated profit so far
−BDT 3,092,800" with an honest footnote that it is cost-so-far, not
cost-to-complete. Without a budget that number cannot be acted on: nobody can
say whether we are 10 % over on steel or 60 %. Added later, every cost screen
built between now and then — project finance card, finance overview,
procurement summary — has to grow a budget-vs-actual column, which means
rebuilding them rather than extending them.

**Schema.** New `project_budget_lines` (`project_id`, `cost_category`,
`budgeted_amount`, `notes`). Dexie **v13** (same block as 3.1).

**Size:** Medium–Large. **Touches:** project detail Finance tab, finance
overview, a new budget editor.

### 3.3 Cost category → `lookup_values` — *scope conformance, and cheap today*

**Why now.** §1.2 names `cost_category` as a `lookup_values` category
explicitly. It is a hard-coded ENUM and the Master Data screen does not list
it, so adding "Legal & Registration" needs a developer — which is precisely
the thing Master Data exists to prevent. **This is a gap against the frozen
scope, not a new idea.** With 18 expense rows it is trivial; with 1,800 it is
a migration.

**Schema.** None — `lookup_values` exists, `expenses.cost_category` is
already a string. Seed the rows, point the dropdown at them.

**Size:** Small.

### 3.4 Land payment schedule — *zero schema cost, closes the biggest Module 1 gap*

**Why now.** `payment_schedules.entity_type` is an ENUM of one, and
OPEN-ITEMS 1.8 already records that it is a column doing nothing until a
second entity needs it. The `[entity_type+entity_id]` compound index is
already in place. **This feature needs no migration** — `payment_installments`
takes land instalments as they are. It does need a land-shaped generator of
its own and a second value in `SCHEDULE_ENTITY_TYPES`; see §4.0, which
corrects the "reuses the instalment engine" claim this paragraph used to
make, and flags the collections filter that must land first. It also answers the
client's loudest Module 1 complaint (agreed / paid / balance on the land
page, L-1).

**Schema.** None.

**Size:** Small–Medium. **Touches:** land detail (a payments tab), a thin
wrapper over `paymentScheduleRepository`.

### 3.5 Bank accounts and cash position — *back-fill cost*

**Why now.** Money enters through `payments`, leaves through `expenses`,
`supplier_vouchers` and `refunds`, and no screen shows the net. The owner
cannot answer "can I pay BSRM on Thursday". If `account_id` is added later,
every row already recorded has no account and has to be back-filled by hand
or written off as unattributable.

**Schema.** New `bank_accounts`; nullable `account_id` on `payments`,
`expenses`, `supplier_vouchers`, `refunds`. Dexie **v14**.

**Optional rider, near-free while the version block is open:**
`vat_amount` / `ait_amount` on `expenses` and `supplier_vouchers`. VAT and
AIT are deducted from every contractor bill by law; without the columns every
voucher is entered gross and the return is prepared by hand. Non-indexed
columns need no version bump at all.

**Size:** Medium.

### 3.6 Printed documents — *no rework cost, but Settings already promises it*

**Why now.** Company Settings tells the user that "the booking form, money
receipt and supplier voucher carry the name, address and licence numbers".
They do not exist. This is the client's stated blocker (B-2), it needs **no
schema change**, and it is the single most visible thing that separates a
demo from something an office can actually use. Included on client value, not
on rework — and because the software currently makes a claim that is untrue.

**Scope for the prototype:** print-styled money receipt, booking form and
supplier voucher; CSV export on collections, expenses and the voucher
register.

**Size:** Medium.

### 3.7 Deliberately still deferred

Recorded so the decision is visible rather than forgotten. All of these are
additive later — new tables that do not disturb existing rows — so deferring
them costs little:

- Unit transfer / name change, co-applicant & nominee *(new tables; high
  business value, but no migration penalty for waiting)*
- Handover, snag list, possession — §10 already parks these
- Sales commission — excluded at the client's request per the Decision Log
- Global search, role-aware dashboards beyond Tier 1's version
- Sales funnel / source-ROI and per-executive reporting *(no schema needed —
  `leads.source` and `booked_by` are already captured, so the data is
  accumulating correctly and the reports can be built any time)*
- Revised/baseline schedule, safety log, inspection sign-off
- Re-order level, rate history, material wastage
- Late-payment penalty, period close, audit log *(OPEN-ITEMS)*

---

## 5. Sequencing, and the rules to work under

**Order:** Tier 1 batches 1A → 1E *(done)*, Tier 2 *(done)*, then Tier 3.

**Tier 3 order, revised 2026-09-04:**

> **3.6 → 3.3 → 3.4 → 3.1 → 3.2 → 3.5**

The original order opened with 3.3 and 3.4 because they need no schema change.
That reasoning still holds, but 3.6 now goes first for two better ones: it is
the only item on the list that cannot break anything (there is no print code
in the app to conflict with), and it is the client's stated blocker — the
thing that separates a demo from something an office can use. It also closes
the honesty gap Tier 2 opened, where Company Settings had to be reworded to
admit the documents do not exist yet.

3.3 then comes before 3.4 so the cost-category work and the collections
`entity_type` filter — both in the same finance repository — land together,
before any land schedule row exists to be mis-counted. 3.1 and 3.2 still share
one Dexie **v13** block so the version history stays clean, and 3.5 still
opens **v14** last, once the cost model is settled.

The admin portal is finished at the end of 3.5. The Public Portal (P1–P4) is
deliberately after all of it — today it is a placeholder page, and it should
read a schema that has stopped moving.

**Rules to hold to while doing it**

- Every module's schema addendum gets written into
  `Real-Estate-Developer-Platform_Scope-Document_v3.md` §11 Decision Log,
  and `OPEN-ITEMS.md` updated — the pattern the last eight modules followed.
- A new Dexie `version(n).stores({...})` block per schema change. **Never
  edit an existing version block.** Non-indexed columns need no bump.
- UI never calls Dexie. New reads and writes go through
  `lib/repositories/*`, arithmetic through `lib/domain/*`.
- Browser-verify each batch before starting the next, seeded with the BD
  demo data, including 375 px.
- **Do not run `next build` while the dev server is running** — same `.next`
  folder, and it destroys the Turbopack cache.
- Commit per batch, so any single change can be reverted without unpicking
  the rest. Nothing pushed until you say so.

**Suggested checkpoints for your review:** after 1B (the progress numbers),
after 1C (the booking money), and after 3.2 (budget), because those three
change what the numbers *mean* rather than how they look.
