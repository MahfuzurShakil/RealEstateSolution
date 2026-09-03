# Module-wise Analysis Report — Admin Portal

**Date:** 2026-09-02 · **Build:** `main` @ `97b30a2` (all eight admin modules)
**Method:** live testing in the browser against the seeded demo database
(dev server on port 3001, viewport 1200–1600 px desktop and 375 px mobile),
plus source reading where a screen's number needed a root cause.
No code was changed in this session.

Three passes, all three reported per module:

- **SQA** — end-to-end flows, UI/UX, mobile, edge cases, cross-module
  consistency, data integrity.
- **Client (owner of the developer company)** — can I run the business on
  this, do I understand what I am looking at, would I go live.
- **Future scope** — what a real developer's platform needs that is not in
  the scope document at all. Items already in `OPEN-ITEMS.md`
  (audit log, notification, supplier return, period close, scoping
  enforcement) are taken as read and not repeated.

**Severity:** Critical (blocks a business flow, or shows a money/stock number
that is wrong) · Major (misleading figure, or a real user gets stuck) ·
Minor (friction) · Cosmetic.

---

## Executive summary

The build is in far better shape than a Phase A prototype usually is. Every
pipeline works end to end, the side effects fire correctly, the empty states
and not-found pages are written by somebody who cared, and there is no
horizontal overflow anywhere at 375 px. Verified live this session: approving
a discount on `BOOK-2026-003` moved the booking to `confirmed`, flipped the
unit to `booked`, flipped the lead to `booked`, generated a 39-line instalment
schedule, and a subsequent BDT 337,000 receipt filled the first line exactly
and cleared its overdue flag. That chain is the heart of the product and it
works.

What is not right falls into four groups:

1. **Money is rounded until it stops reconciling.** `BDT 10M`, `BDT 8M`,
   `BDT 660K` on the pages an accountant and an owner actually live on.
2. **Three numbers on the same card contradict each other** on Site Progress
   (actual 37.3 %, planned 37.7 %, variance **+0.7 %**).
3. **The dashboard is a developer's status page, not an owner's.** It has no
   money on it at all.
4. **Dead controls in the chrome of every page** — the search box, four
   topbar icons and "Help and Support" do nothing.

Nothing found this session corrupts stored data. The Critical items are about
numbers being *presented* wrongly, which for a finance product is close
enough to the same thing.

---

# Module 1 — Land Management

### SQA

Walked `/admin/lands` → filters (status, acquisition type, district) → sort →
`LND-2026-009` detail → Overview / Owners / Joint Venture / Documents /
Timeline → pipeline transition options → `/admin/landowners`.

| # | Severity | Finding |
|---|---|---|
| L-1 | Minor | Land detail says "Payments and instalments against this land are tracked in the Finance module" but there is no link to it and no figure. `final_agreed_amount` shows `—` while `EXP-2026-*` rows of category *Land Payment* worth BDT 70M exist in the ledger. **Expected:** agreed amount, paid to date and balance on the land page, linking to the filtered expense list. Today you go to Expenses and search by hand. |
| L-2 | Minor | Default page size is 6 on lands and 5 on landowners. With 11 lands that is two pages for a list that would fit on one screen. Same default across the app. |
| L-3 | Cosmetic | "Delete" sits next to "Edit" with equal visual weight on a record that may be linked to a project. |
| L-4 | — | Works well: the pipeline card offers only the legal next transitions (`Site Visit Done` / `Rejected` from `new`); the JV tab shows a proper empty state ("No JV terms recorded yet — add them from the edit form") rather than a blank; the OpenStreetMap panel with GPS is genuinely useful; owner count and share are on the summary rail. |

### Client

Land acquisition is the part I understand best and this screen speaks my
language — mouza, dag, khatian, katha/bigha, "owner is abroad, discussions
over WhatsApp". The map is worth more than it looks: my land officer sends a
link and I know where the plot is.

What is missing for me is **money**. I approved BDT 70M of land payments;
this page does not know that. When I open a plot I want one line: *agreed
BDT 4.2 crore, paid BDT 3.0 crore, balance BDT 1.2 crore, next payment due
15 October.* Right now that lives in my head and in the accountant's register.

I also cannot see **how long a plot has been stuck**. `LND-2026-004` has been
in Negotiation since March. Nothing on the list tells me; I have to open the
Timeline tab of each one.

**Score: 7 / 10.** Good record-keeping, no money, no ageing.
**Would I go live without a fix?** Yes.

### Future scope

| Gap | What actually goes wrong | Priority | Size | Schema |
|---|---|---|---|---|
| Land payment schedule | We agree BDT 4.2 crore in four instalments against deed registration. That agreement lives nowhere; the third instalment is missed and the owner stops taking calls. | Must-have before launch | Medium | Reuse `payment_schedules` / `payment_installments` — `entity_type` is an ENUM already waiting for a second value (OPEN-ITEMS 1.8) |
| Pipeline ageing / stalled-deal alert | A plot sits in Legal Verification for five months because the lawyer is waiting on a mutation certificate nobody chased. | Should-have | Small | None — derive from `land_status_history` |
| Document expiry dates | The tax receipt on file expired in June and we find out at registration. | Should-have | Small | `documents.valid_until DATE` |

---

# Module 2 — Project Creation

### SQA

Walked `/admin/projects` → `PRJ-2026-001` → all seven tabs (Overview, Towers
& Units, Site Progress, Finance & Cost, JV Allocation, Timeline, Documents).

| # | Severity | Finding |
|---|---|---|
| P-1 | Minor *(corrected — see note)* | **Unit statuses and booking records disagree.** The Inventory rail on `PRJ-2026-001` reads Available 24 / Hold 1 / Reserved 2 / Booked 2 / Sold 3 — eight units spoken for — while the Finance tab of the same project says **1 booking**. **This is demo seed data, not an application defect:** `src/lib/db/demo-projects.ts:200` and `:490–491` use `unit_status_overrides` to mark units `sold` / `handed_over` directly, so the inventory rail shows every status without a booking behind it. What *is* a real (small) hole: `UnitEditModal` lets any editable unit be set to `booked` or `reserved` by hand, so the application enforces no invariant between `units.status` and `bookings`. **Expected:** either the seed creates bookings for pre-sold units, or the unit form drops the statuses that only a booking should write. |
| P-2 | Major | **The unit stack shows no price.** `Towers & Units` renders a floor-by-floor grid with code, size and unit type — and no `base_price`. A sales executive picking a flat for a walk-in has to open every unit. **Expected:** price (or price per sqft) on the tile, and a total inventory value per tower. |
| P-3 | Minor | Tower A is `B+G+10 · 11 floors · 2/floor` — 22 units — but the grid holds 18 and starts at floor 2. Bulk generation left a hole and nothing flags it. **Expected:** "18 of 22 generated" on the tower card. |
| P-4 | Minor | The project list carries no commercial information — no sold %, no value, no collection. To compare four projects I must open Finance. |
| P-5 | Cosmetic | The 7-tab strip overflows and scrolls silently at a 1200 px viewport; `Documents` is off-screen with no affordance. |
| P-6 | — | Works well: the **JV Allocation** tab is the best single screen in the application. Target vs actual by flat count, tolerance ±1 flat, gap in both directions, per-landowner breakdown — `Developer 17.6 target / 18 actual / +0.4`, verdict "Matches". That is exactly the check a JV project needs and most commercial software does not have it. Public-website flags (`Published` / `Featured`) with the whitelist note are clear. |

### Client

The JV Allocation tab alone would sell me this software. In a joint venture
the single fight is "which flats are yours and which are mine", and this
settles it with a number instead of an argument. Keep it.

The unit stack is how I think about a building and I like seeing it laid out
floor by floor in colours. But I cannot use it in front of a customer,
because it does not show price — the one thing the customer asks.

On the project list I cannot tell which project is doing well. I get
"Completion 31 May 2029, 32 units · 24 available". I need "24 of 32 unsold,
BDT 12 crore booked, BDT 1.6 crore collected".

**Score: 7.5 / 10.** JV handling excellent; the inventory screen is
half-finished because it hides the price.
**Would I go live?** Yes, but P-2 within the first month.

### Future scope

| Gap | What actually goes wrong | Priority | Size | Schema |
|---|---|---|---|---|
| Project budget / BOQ (deferred in §3.8) | We start a 32-unit tower with no budget line, so "estimated profit −BDT 3M" cannot be read against anything. Am I 10 % over on steel or 60 %? Nobody can say. | Must-have before launch | Large | New `project_budget_lines` (project, cost head, budgeted amount) |
| Price list / price revision history | Prices rise twice a year. `units.base_price` is overwritten and the old price is gone, so a booking made in March cannot be defended in September. | Should-have | Medium | New `unit_price_history` (the booking already snapshots) |
| Unit hold expiry | A flat sits `reserved` for four months because a sales executive forgot. Nothing releases it. | Should-have | Small | `bookings.hold_expires_at` |

---

# Module 3 — Sales / Lead / CRM

### SQA

Walked `/admin/leads` → the "Today's follow-ups: 2 overdue · 1 due today"
banner → Show overdue / Show today → six filters → sort by follow-up.

| # | Severity | Finding |
|---|---|---|
| C-1 | Major | **A converted lead stays on the follow-up worklist.** `LEAD-2026-012` (Dr. Mahbub Alam) shows on the dashboard's "Follow-ups due" panel as *Negotiation · Overdue* while a booking already exists for that customer. After I approved `BOOK-2026-003` the lead correctly flipped to `Booked` — so the rule fires on confirm, but a lead sitting at `pending_approval` keeps nagging the sales desk about somebody who has already paid BDT 10 lakh. **Expected:** a lead with a live booking drops out of the follow-up queue, or reads "booking in progress". |
| C-2 | Major | **Two leads have no owner.** `LEAD-2026-003` and `LEAD-2026-010` are `Unassigned`, one a website enquiry from three days ago. Nothing counts or warns about unassigned leads; the filter exists but you have to know to use it. **Expected:** an "unassigned" figure on the leads banner beside the overdue count, since §9.6 makes assignment a manager's job. |
| C-3 | Minor | The lead card shows no last-activity date, only "Added" and "Follow-up". A sales manager cannot see at a glance who has gone cold. |
| C-4 | Minor | No bulk assignment. Assigning a morning's website enquiries means opening each lead. |
| C-5 | — | Works well: source, budget range and interested project on the card; overdue / due-today / upcoming badges; the banner doubles as a filter shortcut; phone-based dedup is implemented in the repository as specified. |

### Client

This is a working lead register and the "who do I call today" list is real.
My sales manager could use it tomorrow morning.

What I cannot get is the **funnel**. Twelve leads came in this month — from
where, and how many became bookings? Facebook ads cost me money and this
software cannot tell me whether they work. The `source` field is captured on
every lead and then never counted anywhere.

I also want to know **which of my five sales people is performing**. Their
names are on every lead and every booking, and no screen adds it up.

**Score: 6.5 / 10.** Good register, no reporting, and it keeps telling my
team to chase a customer who has already booked.
**Would I go live?** Yes.

### Future scope

| Gap | What actually goes wrong | Priority | Size | Schema |
|---|---|---|---|---|
| Sales funnel / source ROI | We spend BDT 3 lakh a month on Facebook and cannot prove a single booking came from it, so the budget is set by guesswork. | Must-have before launch | Medium | None — `leads.source` + `bookings` already carry it |
| Per-executive performance | Two of five executives bring in most of the business and nobody can prove which two. Commission arguments follow. | Should-have | Medium | None — `booked_by` / `assigned_to` exist |
| Site-visit calendar | Three families are booked for a Friday site visit at overlapping times and one is turned away at the gate. Follow-up dates exist; there is no day view. | Should-have | Medium | None — `lead_activities.activity_date` |
| Call / WhatsApp logging from the phone | A follow-up call happens on the road and is written up three days later, or never. | Nice-to-have | Large | Integration only |

---

# Module 4 — Booking & Customer

### SQA

Full end-to-end run: opened `BOOK-2026-003` at `pending_approval`, approved
the discount through the modal, watched every side effect, then recorded a
payment and checked the waterfall. Also examined `BOOK-2026-005` (rejected
discount) and the customer list.

| # | Severity | Finding |
|---|---|---|
| B-1 | **Critical** | **A confirmed booking is born overdue.** On confirming `BOOK-2026-003`, the generated schedule's line 1 "Booking Amount" is **BDT 1,337,000** (10 % of final price, from the project template) while the booking's own `booking_amount` — the money actually negotiated and received — is **BDT 1,000,000**. The schedule opens with BDT 337,000 unpaid, dated the booking date, and the buyer is instantly *"5 days late · Overdue"*. **Expected:** the template's booking-amount line reconciles with the booking's agreed `booking_amount`, and the first instalment is never dated in the past. Reproduce: confirm any booking whose `booking_amount` ≠ 10 % of `final_price`, open the Instalments tab. |
| B-2 | Major | **No printable money receipt.** BDT 1,000,000 is taken by cheque, recorded, and the buyer gets nothing. Company Settings even advertises *"Printed documents — the booking form, money receipt and supplier voucher carry the name, address and licence numbers"* — there are no printed documents anywhere in the application. Build them or stop promising them. |
| B-3 | Minor | The Refunds page lists refunds but has no "Record refund" button, unlike every other list page. A refund can only be created from the booking, and nothing on the Refunds page says so. |
| B-4 | Minor | A negative amount in the payment dialog is rejected with *"Enter the amount received"*, which reads as "you left it blank". **Expected:** "Amount must be greater than zero". (Over-payment is rejected properly: *"That is more than the outstanding balance"*.) |
| B-5 | Cosmetic | A rejected discount leaves the booking at `hold` with the message *"adjust it and submit again"*, but the only route back is the Edit form; there is no "Resubmit for approval" action on the status card. |
| B-6 | — | Works well, and this is the strongest chain in the build: the gating logic of §5.2 is honoured exactly; the "Before this can confirm" checklist names precisely what is blocking; `BOOK-2026-005` correctly sits at `hold` with a rejected 10.23 % discount and the Bangla rejection note preserved verbatim, showing *"No schedule yet — a schedule is drawn up when the booking is confirmed"*; on approval the unit went `reserved → booked`, the lead `negotiation → booked`, `Approved by` filled in, and 39 instalments totalling exactly BDT 13,370,000 appeared; the oldest-first waterfall then absorbed BDT 337,000 into line 1 and the overdue figure went to `—`. |

### Client

This is the module I would demo to my board. It matches how we actually sell:
verbal confirmation, unit blocked, money not yet in, discount argued over,
sign-off from the sales manager. The "Before this can confirm" box is the
clearest thing in the software — it tells my staff what is missing instead of
leaving them to guess.

Two things stop me being happy.

First, the receipt. When a customer hands over a BDT 10 lakh cheque he wants
a piece of paper with my company's name on it. This software takes the money
and gives him nothing. My accountant will keep his own receipt book, and
within a month the two will not agree.

Second, the moment I approved that booking the system told me the customer
already owes me BDT 3,37,000 and is five days late. He does not. He paid
exactly what we agreed. If my collections officer rings him about that, I
lose the customer. **This one I would not go live with.**

**Score: 7 / 10** — would be 9 without B-1 and B-2.
**Would I go live?** Not until the booking amount stops creating a fake
arrear (B-1) and I can print a receipt (B-2).

### Future scope

| Gap | What actually goes wrong | Priority | Size | Schema |
|---|---|---|---|---|
| Printed booking form, money receipt, customer statement | A buyer's bank asks for a stamped payment statement before releasing a home loan and we cannot produce one. | Must-have before launch | Medium | None — `company_settings` already holds the letterhead |
| Unit transfer / name change | A buyer sells his allotment to his brother before handover. Everyday in this market, and the only route is cancel-and-rebook, which destroys the payment history. | Must-have before launch | Medium | New `booking_transfers`, or `bookings.transferred_from_id` |
| Co-applicant / nominee | Flats are bought jointly by husband and wife, and a nominee is named on the deed. `customers` holds one person. | Must-have before launch | Small | New `booking_applicants`, or `customers.co_applicant_*` |
| Handover, snag list, possession letter | `units.status` has `handed_over` and nothing ever writes it. The last mile of the business is missing. §10 parks this — worth confirming it is genuinely Phase 2. | Should-have | Large | New `handovers`, `snags` |
| Sales commission | Excluded at the client's request per the Decision Log. Worth re-asking now that `booked_by` is on every booking. | Should-have | Medium | New `commission_rules`, `commission_entries` |

---

# Module 5 — Site Progress Update

### SQA

Walked `/admin/site-progress` (all four projects, "Needs attention" banner,
schedule filters) → `PRJ-2026-001` detail → the work breakdown for both
towers → the material-request tabs.

| # | Severity | Finding |
|---|---|---|
| S-1 | **Critical** | **Three numbers on the same card contradict each other.** `PRJ-2026-001` shows **37.3 %** actual, **planned 37.7 % by today**, and a variance of **+0.7 %**, badged **On Track**. 37.3 is *below* 37.7; the variance should read −0.4 and the badge should not say On Track. Root cause is in `src/lib/domain/site-progress.ts` (`rollUp`, ~lines 125–145): `actual_pct` is weighted across **all** work items, but `planned_pct` and `comparableActual` are re-based on only those items that carry plan dates (`plannedWeight`). Tower A's *External Works* (weight 6 %, 0 % done, "no planned dates") is excluded from the planned side, inflating `comparableActual` to ≈38.8 and producing a positive variance beside a smaller actual. The code is self-consistent; the screen is not. **Expected:** show the same actual the variance was computed from, or exclude no-plan items from both sides. Reproduce: open `/admin/site-progress` and read the `PRJ-2026-001` card. |
| S-2 | Major | The same page reports Tower A as **37 %** in the tower chip and **"Tower progress 36.50 %"** in the formula line at the foot of its own work breakdown. Two figures for one tower, six lines apart. |
| S-3 | Minor | `External Works` has weight 6 % and no planned dates, and renders with no percentage badge while every sibling shows one. It is the item causing S-1 and the UI gives no hint it is being left out of the schedule maths. |
| S-4 | Minor | "Quiet 19d" sits beside a green **On Track** badge. A site nobody has reported from in three weeks is not on track; it is unknown. |
| S-5 | — | Works well, and this is the best-designed module in the build: the "sites that need you first" ordering; the *Needs attention* banner (`1 active site with no update in 14 days · 1 work item behind schedule · 2 material requests waiting`); per-work-item planned-vs-today (`Superstructure 55 % vs planned 67 % → −11.7 %`); the actual-vs-planned chart rebuilt from the log; and the `Σ (progress × weight ÷ 100)` formula printed under the table so a project manager can check the arithmetic himself. |

### Client

If I only got one screen from this project, I would take this one. "Which of
my sites is behind, and why" is the question that costs me the most money,
and this page answers it in one look — the delayed project at the top, the
work item that is dragging, the photograph, who last reported and when.

But I cannot trust the headline. It says my Bashundhara project is On Track
and 0.7 % ahead, while the same page shows it is behind its own plan and
nobody has reported from the site in nineteen days. If I believe that badge I
will not visit the site, and I will find out in November.

**Score: 8 / 10** for the design, **5 / 10** for the number at the top.
**Would I go live?** Not until the headline percentage and its badge agree
with the numbers beneath them (S-1, S-2).

### Future scope

| Gap | What actually goes wrong | Priority | Size | Schema |
|---|---|---|---|---|
| Revised / baseline schedule | Rain delays the roof by two months. The plan dates are edited, the original baseline is lost, and "we are on schedule" becomes true by editing. | Must-have before launch | Medium | `tower_work_items.baseline_start_date` / `baseline_end_date` |
| Labour and machinery on the daily log | The daily report records % complete but not "42 masons, 1 mixer, half-day rain". At a delay meeting nobody can say whether it was manpower or weather. | Should-have | Small | `site_progress_updates.labour_count`, `weather`, `machinery_note` |
| Safety incident log | A worker falls. There is no place to record it and no way to answer the insurer. | Should-have | Small | New `site_incidents` |
| Quality checkpoint / inspection sign-off | Concrete is poured before the engineer signs off the reinforcement, and the only trace is a photo. | Should-have | Medium | New `work_item_inspections` |

---

# Module 6 — Procurement & Supplier Voucher

### SQA

Walked `/admin/purchase-orders` (KPI rail, six filters, five sorts) →
`PO-2026-010` detail with its GRN → `/admin/stock` (on hand, issues,
transfers) → `/admin/suppliers` → `/admin/supplier-vouchers`.

| # | Severity | Finding |
|---|---|---|
| PR-1 | **Critical** | **Supplier payable includes purchase orders that were never placed.** The suppliers list shows *BSRM Steels — Dhaka Depot · 2 orders · Ordered BDT 6,405,600 · Paid BDT 0 · **BDT 6,405,600 due***. Of that, BDT 4,672,800 is `PO-2026-011`, still in **Draft**. On top of that, "due" is computed on ordered value rather than on what has actually been received, so even the live order overstates the liability. **Expected:** payable = value of goods *received* on non-draft orders, less vouchers paid. Reproduce: `/admin/suppliers`, BSRM row; compare with `/admin/purchase-orders` filtered to BSRM. |
| PR-2 | Major | **The rate column rounds and the line no longer multiplies out.** `PO-2026-010` line 1 reads *40000 piece · BDT 14 · line total BDT 540,000*. 40000 × 14 = 560,000. The true rate is BDT 13.50, displayed as 14. A clerk reconciling against the supplier's bill finds a BDT 20,000 discrepancy that does not exist. **Expected:** money rates to two decimals. |
| PR-3 | Major | **The supplier voucher register is not in date order.** Rows run 26 Aug, 12 Aug, **07 Aug, 13 Aug**, 25 Jul — sorted by voucher code descending, and there is no sort control on the page. A payment ledger that will not sort by date is not a ledger. |
| PR-4 | Major | `VCH-2026-005` pays BDT 52,200 against `PO-2026-004`, which is **Cancelled**. This is OPEN-ITEMS 1.5; worth restating that the *supplier* row gives no hint of it — nothing anywhere says "you have money sitting with Meghna Sand against an order you cancelled". |
| PR-5 | Minor | On the PO list, "BDT 660K due" sits directly beneath "59.08 % received". The first is money owed, the second is goods delivered, and they read as one sentence. |
| PR-6 | Minor | A `Draft` order displays "**Ordered** 30 Aug 2026". A draft has not been ordered. |
| PR-7 | Minor | The KPI rail (*Open orders 3 · BDT 3M*) excludes drafts, so a BDT 4.67M draft is invisible on the summary while being counted in the supplier's payable (PR-1). The two are inconsistent with each other. |
| PR-8 | — | Works well: the full chain is visible and correct on the project's Finance tab — *Ordered → Received → In store → Consumed → Paid out* — with an explicit note that transferred material is not counted in "Ordered" and why (§7.8a). Weighted-average cost is carried consistently (Cement Shah Special at BDT 528 across the central store and two projects). Stock filters by store; the quality-check gate keeps failed batches off stock. `Central purchases carry no project` is a good, plain label. |

### Client

The material chain is honest, and I like that it tells me what is *consumed*
rather than what was bought. "Ordered BDT 27.6 lakh / Consumed BDT 4.7 lakh"
is the difference between money spent and money used, and most software does
not bother with it.

Two things I would not sign off on. My supplier list says I owe BSRM
BDT 64 lakh. I do not — most of that is an order my procurement officer has
not even placed. If I look at that number before a cash-flow meeting I make a
bad decision.

And I cannot answer "how much do I owe, and when is it due" for anybody,
because there are no payment terms on a purchase order — no credit days, no
due date. Suppliers ring and my officer checks a diary.

**Score: 7 / 10.** The chain is right; the payables are not.
**Would I go live?** Not until the payable number is correct (PR-1) and the
voucher register sorts by date (PR-3).

### Future scope

| Gap | What actually goes wrong | Priority | Size | Schema |
|---|---|---|---|---|
| Payment terms and a payables ageing report | We take 30-day credit from nine suppliers and track it in a diary. Nobody can produce "what falls due this week". | Must-have before launch | Medium | `suppliers.credit_days`, `purchase_orders.payment_due_date` |
| Item catalogue instead of free text | "Cement (Shah Special)", "Cement (Fresh)" and "cement shah special" become three items and stock reporting quietly falls apart. §6.6 already calls free text temporary. | Must-have before launch | Medium | New `material_items` (name, unit, category), referenced from request / PO / stock lines |
| Re-order level and stock ageing | Already OPEN-ITEMS 1.4 — restated only because it belongs with the payables work. | Should-have | Small | `stock.reorder_level` |
| Rate history / comparison | Cement is bought at 512 in June and 568 in August and nobody notices until the year-end accounts. | Should-have | Small | None — derivable from `goods_receipt_items` |
| Material wastage / return-to-store | 200 bags go to site, 180 are used, 20 come back. Today they are consumed cost forever. | Should-have | Medium | Reverse entry on `stock_issues`, or new `stock_returns` |

---

# Module 7 — Finance

### SQA

Walked `/admin/finance` (both tabs, by-project roll-up) →
`/admin/collections` (filters, overdue-only, 102 instalments) →
`/admin/expenses` (category chart, filters, date range) → `/admin/refunds`.
Also verified the receipt→instalment waterfall live (see Module 4).

| # | Severity | Finding |
|---|---|---|
| F-1 | **Critical** | **Money is rounded to millions on the pages where money is the point.** The by-project table reads `BDT 98M / BDT 10M / BDT 88M / BDT 8M / BDT 84M / BDT 13M`. The columns cannot be added, cannot be checked, and do not reconcile with the exact figures on the same screen (`Overdue collections: BDT 8,424,000`). Recording a BDT 337,000 receipt during this session produced **no visible change anywhere on the Finance Overview**. **Expected:** full figures in tables, abbreviation only in headline tiles. Reproduce: `/admin/finance` — compare the banner's 8,424,000 against the Overdue column's "BDT 8M". |
| F-2 | Major | **Two pages, one word, two different numbers.** Finance Overview says *Collected **BDT 14M** — money actually received*; the Collections page it links to says *Collected **BDT 10M** — allocated to instalments*. The gap is money taken on `hold` bookings that have no schedule yet (verified on `BOOK-2026-005`: BDT 2,500,000 received, "No schedule yet"). The sub-labels are accurate and no owner will read them that carefully. **Expected:** one figure, with the unallocated portion broken out ("BDT 4M received against bookings not yet confirmed"). |
| F-3 | Major | **There is no "this month".** Collections offers *Due this month*, but the ledger has only a raw From/To pair — no month presets, no "collected this month vs last month", no trend. The owner's first question has no button. |
| F-4 | Major | **Nothing in Finance is exportable or printable.** No CSV, no PDF, no customer statement, no supplier statement. The accountant re-keys everything into Excel, and from that moment the two disagree. |
| F-5 | Minor | The collections worklist defaults to 5 rows across 102 instalments — 21 pages, and the first page is five rows belonging to one customer. **Expected:** default 25 for a worklist. |
| F-6 | Minor | Collections has no "record payment" action in the row. From the queue you open the booking, then the Payments tab, then the dialog — four steps from the screen built for exactly that job. |
| F-7 | Minor | The expenses list has no sort control at all (it happens to return date-descending) and the category chart is not clickable as a filter. |
| F-8 | Cosmetic | "Showing 1–1 of 1 refunds". |
| F-9 | — | Works well: the oldest-first waterfall is correct and demonstrable; overdue is derived at read time with day counts (`247 days late`); the "cost that belongs to no single project" footnote is an honest, well-written explanation of why the rows do not sum to the total; the `for_sale_by = company` revenue filter is applied as the Decision Log requires; the refund breakdown (settled / charge kept / paid out) is right. |

### Client

The accounting logic underneath is sound. Oldest instalment first, a lump
payment clearing several lines, the overdue count moving the moment money
lands — that is how it should work, and I checked it.

What I cannot do is *read* it. Everything is BDT 10M, BDT 8M, BDT 13M. I
cannot verify a row, I cannot add a column, and when a lakh and a half comes
in nothing on the screen moves. My accountant will not use a page whose
numbers he cannot tie out; he will keep his own book, and then I have two
sets of accounts.

And my daily question — *"এই মাসে কত টাকা আসল, কত বাকি?"* — has no answer
here. There is a total-of-all-time and a date box. No month, no comparison
with last month, no chart.

**Score: 6 / 10.** Right arithmetic, unreadable presentation.
**Would I go live?** Not until F-1 (full figures) and F-3 (this month) are
done. Both are small changes and together they roughly double the value of
the module.

### Future scope

| Gap | What actually goes wrong | Priority | Size | Schema |
|---|---|---|---|---|
| Cash-flow / bank position | Money comes in from buyers and goes out to suppliers, contractors and landowners, and no screen shows the net. I cannot answer "can I pay BSRM on Thursday". | Must-have before launch | Medium | New `bank_accounts` + `account_id` on `payments` / `expenses` / `supplier_vouchers` / `refunds` |
| Export to Excel / PDF; customer and supplier statements | Covered in F-4. Home-loan banks demand a stamped payment statement before disbursement and we cannot produce one. | Must-have before launch | Medium | None |
| Month-on-month collection trend | Collections fell 30 % in July and we noticed in September. | Must-have before launch | Small | None |
| Late-payment interest / penalty | The contract says 2 % per month on arrears. The software neither calculates nor shows it, so it is never charged and buyers learn that being late is free. | Should-have | Medium | `payment_installments.penalty_amount` plus a rate in project settings |
| Cost category as master data | §1.2 explicitly names `cost_category` as a `lookup_values` category. It is a hard-coded ENUM (Land Payment / Land Extra Cost / Contractor / Marketing / Admin / Other) and Master Data does not list it, so adding "Legal & Registration" needs a developer. **This is a scope-conformance gap, not a new idea.** | Must-have before launch | Small | Already in the schema — just not wired |
| VAT / AIT deduction at source | 5 % VAT and AIT are deducted from every contractor bill by law. Neither exists, so every voucher is entered gross and the return is prepared by hand. | Must-have before launch | Medium | `expenses.vat_amount` / `ait_amount`, same on `supplier_vouchers` |

---

# Module 8 — Users, Roles, Master Data & Settings

### SQA

Switched roles through the topbar (super_admin → accounts and back), read the
sidebar under each, tried a forbidden URL directly, walked `/admin/users`,
`/admin/master-data`, `/admin/settings`.

| # | Severity | Finding |
|---|---|---|
| U-1 | **Critical** | **The acting role does not survive a page load.** `MockSessionProvider` holds it in `useState('super_admin')` with no persistence (`src/lib/auth/mock-session.tsx`). Switch to Accounts, then reload or open any URL directly, and you are silently super_admin again. This defeats the route guard — a blocked page opens on refresh — and it makes role testing unreliable, because the tester believes they are still in the other role. **Expected:** persist to `localStorage`. Reproduce: set Accounts in the topbar, navigate to `/admin` by URL, read the topbar. |
| U-2 | Major | **The dashboard is not role-aware.** Acting as Accounts, the dashboard still shows Lands, Landowners and the lead follow-up queue — three things that role cannot open — and no money at all, which is the only thing that role wants. The sidebar filters correctly; the page it lands on does not. |
| U-3 | Major | **The topbar search does nothing.** `<input type="search" placeholder="Search anything">` has no handler at all (`src/components/admin/AdminTopbar.tsx:39–43`). Typing "Zubair" and pressing Enter produces nothing — no results, no navigation, no message. It is the most prominent control on every page. |
| U-4 | Major | **Four dead icons in the topbar.** Bell, Message, Calendar and Moon are rendered from a literal array with no `onClick` and no `aria-label` (`AdminTopbar.tsx:46–55`). They look like notifications, messages, a calendar and a dark-mode toggle. None of them is any of those. Unlabelled buttons are also a screen-reader failure. |
| U-5 | Minor | **"Help and Support" in the sidebar is inert** — it renders as plain text, and the `/admin/help` route it names in `nav-config.ts` returns a Next.js 404 if typed. |
| U-6 | Minor | Sidebar groups are an accordion, all collapsed on load, one open at a time. From the dashboard, reaching any page takes two clicks and you cannot see two modules' menus at once. |
| U-7 | Minor | Every staff account shows "Added 02 Sept 2026" — the seed stamps `created_at` at load time instead of offsetting it like every other demo record. |
| U-8 | Cosmetic | **Company Settings advertises features that do not exist**: "Printed documents — the booking form, money receipt and supplier voucher carry the name, address and licence numbers." There are none. (See B-2.) |
| U-9 | — | Works well: the route-guard message is genuinely good — *"Master Data / Settings is not open to this role — Accounts: Collections, the cost ledger and supplier payments. Switch role from the topbar, or ask a Super Admin for access"*, with "Acting as Accounts" underneath. Sidebar filtering matches `PERMISSION_MATRIX` exactly (verified as Accounts: Land Management, Site Progress and Administration disappear, Leads disappears, Bookings/Customers remain). Master Data is complete, and its explanation of why workflow statuses are *not* editable is the clearest paragraph in the application. |

### Client

I like that I can see, in one table, what each of my ten roles can touch. And
the message when somebody opens the wrong page is polite and useful — it
tells them who to ask.

But my accountant logs in and gets a dashboard about land plots and sales
follow-ups, with no money on it. That is the wrong screen for him.

I was told this is not real security yet and I understand that. What I did
not expect is that changing role and refreshing puts me back as the super
admin. If I hand this to my team as a demo, someone will do exactly that and
see everything.

**Score: 7 / 10.** The matrix is well done; the shell around it is half
finished.
**Would I go live?** Yes for this module, provided the dead controls
(U-3, U-4, U-5) are either wired up or removed before anyone outside sees it.

### Future scope

| Gap | What actually goes wrong | Priority | Size | Schema |
|---|---|---|---|---|
| Role-aware dashboard | Covered in U-2. Each role wants a different first screen: owner → money, site manager → his sites, accounts → collections due. | Must-have before launch | Medium | None |
| Working global search | Somebody rings quoting flat "D-4A" or cheque "CHQ 0043117" and there is no way to find it except guessing which module it lives in. | Must-have before launch | Medium | None |
| Two-person approval on large payments | A single procurement officer can raise and pay a BDT 46 lakh voucher alone. The Decision Log says supplier vouchers deliberately have no approval; worth re-confirming with the client now that real money is in the chain. | Should-have | Medium | `supplier_vouchers.approved_by` + a threshold in settings |

---

# Cross-cutting

### Data integrity — what did not reconcile

| Where | Number A | Number B |
|---|---|---|
| `PRJ-2026-001` inventory rail vs its Finance tab *(demo seed, not a code defect — see P-1)* | 8 units booked/sold | 1 booking |
| `PRJ-2026-001` site progress card | actual 37.3 %, planned 37.7 % | variance **+0.7 %**, "On Track" |
| Tower A chip vs its own formula line | 37 % | 36.50 % |
| Finance Overview vs Collections | Collected **BDT 14M** | Collected **BDT 10M** |
| Suppliers payable vs purchase orders | BSRM due BDT 6,405,600 | BDT 4,672,800 of it is a **Draft** |
| PO line arithmetic | 40000 × BDT 14 | line total BDT 540,000 |

### What is genuinely good and should not be touched

Empty states everywhere ("No JV terms recorded yet — add them from the edit
form"; "No schedule yet — a schedule is drawn up when the booking is
confirmed"). Not-found handling is consistent across every detail route
(`/admin/bookings/<bad-id>` → "This booking no longer exists · Back to
bookings"; the same for projects, customers, suppliers). Explanatory
footnotes that pre-empt the obvious question rather than leaving it hanging.
Zero horizontal overflow at 375 px on every page checked, including the wide
tables, which scroll inside their own containers. The console is clean apart
from one 404 resource.

### Mobile

No layout breaks anywhere. But the data tables — collections, expenses,
vouchers, users — are the *desktop* tables in a scroll box (collections:
889 px of table inside a 299 px window, three swipes to reach the outstanding
amount) while the list pages use proper cards. The screens a site engineer
and a collections officer would actually use on a phone are the ones still in
table form.

---

# What to fix, in order

### Tier 1 — before anyone outside the team sees it (all small, all high return)

1. **F-1** — stop rounding money in tables; full figures everywhere below the
   headline tiles. *This single change does more for the client's confidence
   than anything else on this list.*
2. **S-1 / S-2** — make the site-progress actual, planned and variance come
   from the same weighting, and make the tower chip agree with its own
   formula line.
3. **B-1** — reconcile the generated "Booking Amount" instalment with the
   booking's agreed `booking_amount`, and never date the first instalment in
   the past. A confirmed booking must not be born overdue.
4. **PR-1** — supplier payable excludes drafts and is based on received
   value, not ordered value.
5. **U-3 / U-4 / U-5** — wire up or delete the search box, the four topbar
   icons and "Help and Support". Dead chrome on every page is the first thing
   a client notices and the cheapest thing to fix.
6. **U-1** — persist the acting role to `localStorage`.

### Tier 2 — before go-live

7. **F-3** — month presets and a month-on-month collection figure.
8. **B-2 / F-4** — printed money receipt and booking form; CSV export;
   customer statement. (Company Settings already claims these exist.)
9. **U-2** — a role-aware dashboard, with money on the owner's version.
10. **PR-2 / PR-3** — two decimals on money rates; date sort on the voucher
    register.
11. **P-1** — reconcile unit status against bookings (or fix the seed).
12. **P-2** — price on the unit stack.
13. **Cost category → `lookup_values`**, as §1.2 already specifies.
14. **C-1 / C-2** — drop converted leads out of the follow-up queue; surface
    the unassigned count.

### Tier 3 — the next scope conversation with the client

15. Land payment schedule (reuse `payment_schedules`).
16. Project budget / BOQ, so "estimated profit" has something to be measured
    against.
17. Material item catalogue, before free-text names make stock reporting
    unusable.
18. Supplier payment terms and a payables ageing report.
19. Cash-flow / bank position.
20. Unit transfer and co-applicant — both everyday events in this market,
    neither expressible today.
21. VAT / AIT deduction on contractor and supplier payments.
22. Sales funnel and per-executive performance reporting.
23. Handover / snag / possession — §10 parks this; confirm it is genuinely
    Phase 2.

### Scores at a glance (client's view)

| Module | Score | Blocker for go-live |
|---|---|---|
| 1 Land | 7.0 | — |
| 2 Project | 7.5 | — |
| 3 Sales / CRM | 6.5 | — |
| 4 Booking & Customer | 7.0 | B-1, B-2 |
| 5 Site Progress | 8.0 design / 5.0 headline | S-1, S-2 |
| 6 Procurement | 7.0 | PR-1, PR-3 |
| 7 Finance | 6.0 | F-1, F-3 |
| 8 Users & Settings | 7.0 | U-3, U-4, U-5 |

---

*No application code was changed in this session. Demo data was modified by
testing: `BOOK-2026-003` was approved and confirmed (unit `D-2A` → booked,
`LEAD-2026-012` → booked, 39 instalments generated) and a BDT 337,000 receipt
was recorded against it. Use "Reload sample data" on the dashboard to reset.*
