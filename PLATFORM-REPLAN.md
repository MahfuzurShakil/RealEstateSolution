# Replan: Project-first flow, flexible land, and cost visibility

## Context

Today the only way to a project is through land. A land has to be sourced, visited, put through DD and negotiation, and registered before it is "held", and only a held land can be linked to a project (`ProjectForm.tsx:98-104`, `landIsHeld` in `land.ts:583`). That fits a developer buying new land. It does not fit the most common Bangladesh cases:

- **Land already owned.** A developer bought the plot years ago, or it is family land. They want to record it, start a project, publish it and take bookings.
- **Land-share sale.** A developer owns land and sells it as shares, for example in Purbachal, Keraniganj or Savar. Later the shareholders may or may not commission a building.
- **JV (landowner) deal.** This is still the dominant Dhaka model. The project is often announced while the JV deed is still being finalised.
- **Off-plan launch.** Bookings and instalments fund construction. Sales open around design/approval, well before construction starts.

The owner (malik) cares most about two numbers per project: **what it costs** and **what it will earn**. They also need confidence that nobody can pass an inflated bill. Right now no total land cost exists anywhere. The land feasibility study has no construction line. `financeRepository.byProject()` ignores land cost entirely. And the project has no budget or revenue estimate of its own.

**Goal:** restructure the whole platform, not just one module. Nothing already built is thrown away: Modules 1–8 and the land pipeline L1–L7 stay. The work is to reorganise what exists into **one end-to-end pipeline with the Project at its centre**, at an industry-standard, professional level. Within that:
- the land pipeline becomes **optional**;
- every land and every project gets **one cost sheet** the owner can read;
- every taka spent can be traced back to its source.

## The platform as one pipeline

Every module hangs off the project. The work flows left to right, and Administration frames all of it.

```
                     ┌────────────── PROJECT (centre) ──────────────┐
 1 SETUP             2 SALES              3 CONSTRUCTION          4 FINANCE              5 HANDOVER
 Land (optional,     Leads/CRM →          Site progress →         Collections ←──┐       Delivery per shape
 owned or pipeline)  Booking →            Material/service req →  Payments against│      (keys / possession
 Project + type      Instalment plan      Purchase (PO/GRN) →     voucher         │       / deed), successor
 Costing estimate    (sales_status open)  Voucher (scan+digital)──┘ Project P&L    │       project
                                                                  Owner dashboard─┘
 ─────────────────── ADMINISTRATION: users · roles · approvals · master data · settings · audit log ───────────────────
```

| Stage | Existing modules reused | What changes |
|---|---|---|
| 1 Setup | M1 Land, M2 Project | Project-first creation, owned-land entry, sales status, cost sheets (Phase 1) |
| 2 Sales | M3 Sales/CRM, M4 Booking | The user considers these good enough. They only get wired to `sales_status` and project readiness. |
| 3 Construction | M5 Site Progress, M6 Procurement | Site progress stays as the construction heartbeat. Spend gets a complete request → voucher → payment chain. |
| 4 Finance | M7 Finance | Payments are made against vouchers, project P&L includes land, and there is an owner dashboard. |
| 5 Handover | M2 Phase 3 deliveries | Unchanged, apart from OPEN-ITEMS §0q leftovers. |
| Admin | M8 | Roles and sidebar regrouped around the pipeline stages, approval records, and an audit log so every change has a who and when. |

**Decisions confirmed by the user (2026-10-06):**
- A project can be saved with no land.
- The sales gates are warnings, with a Company Settings switch that makes them blocking.
- JV cost shows both cash cost and the landowner's share value.
- The project cost and revenue estimate is part of Phase 1.

## Proposed programme (5 phases)

| Phase | Focus | Outcome for the owner |
|---|---|---|
| **1. Project & Land** (this plan, detailed below) | Project-first creation, two land entry modes, project lifecycle per type, land cost sheet, project cost and revenue estimate, Sales/CRM wired to `sales_status` | "What will this project cost, and what will it earn?" |
| 2. Construction | **Replanned 2026-10-11, see the Phase 2 section:** a Construction area for projects in construction (work breakdown, site log, materials, photos), separate from the project page; one traceable chain for every spend: request → purchase → voucher (scan uploaded **and** digital voucher entered) → finance pays against that voucher; every step tagged with project and cost head (khat) | "I can see the work done and every transaction per khat" |
| 3. Finance & owner view | Actual vs estimate per head, project P&L including land, cash flow (collections vs payments), owner dashboard across projects | "Where did the money go, and what is left?" |
| 4. Administration | Sidebar and roles regrouped by pipeline stage, an approval record on requests/vouchers/payments, an audit log (who changed what, when), master data tidy-up | "Everything is accountable to a person" |
| 5. Public portal | P1–P4 from the public-portal doc, fed by the Phase 1 publish rules | Customers see launched projects |

Sales & CRM gets no phase of its own, because the user rates it good enough. It is touched only where Phase 1 needs it. Only Phase 1 is detailed here. Phases 2–5 each get their own plan when we reach them.

**Phase 2 direction (user clarified 2026-10-06): transparency, not restriction.** Nothing blocks a bill for going over budget. What matters is that every transaction leaves a complete, linked record:

1. **Request.** Someone raises a request under a project. Module 5's material request exists, and Phase 2 extends it to services and labour.
2. **Purchase.** Procurement buys. Module 6's PO and GRN exist.
3. **Voucher.** The scanned voucher or bill is uploaded, and a matching digital voucher is entered with items, amounts, supplier and cost head. Module 6 has `supplier_vouchers` and `documents`.
4. **Payment.** Finance pays against that voucher. Module 7 has expenses and payments, and Phase 2 links each payment to its voucher.

From any taka paid, the owner can walk back to who requested it, what was bought, the voucher image and who approved it. They can also see spend per project per khat. Phase 2 starts by auditing where this chain is already linked in Modules 5–7 and where it breaks. Budget figures from Phase 1 appear next to actuals for information only.

---

## Phase 1 — Project & Land

### 1.1 Project lifecycle per type

The current statuses (`PROJECT_STATUSES`, `types.ts:997`) are planning → design → approval → under_construction → nearly_complete → handover_ongoing → closed. Shape-aware labels already exist (`projectStatusLabel`, `domain/project.ts:70`). We keep that enum and add two things:

- **`sales_status`**: a new field, separate from the build status. Values are `not_open | open | paused | sold_out`. In Bangladesh, sales open at design/approval time, not at a fixed build stage, so this must not be tied to status.
  - Bookings (`BookingForm.tsx:138`) only list projects whose sales are open.
  - `is_public` publishing requires `sales_status !== 'not_open'`.
- **Land readiness**: a read-out on the project, not a stored status. It is derived from the linked lands: *No land yet / Land in acquisition / Land secured (owned or JV signed) / Ready to build*.
- **Soft gates** (warnings, each with a Company Settings switch, following the pattern of the existing gate G3):
  - Opening sales with land not yet secured
  - Opening sales before the `approval` stage is passed. This reflects the plan-approval requirement in the Real Estate Development & Management Act 2010.
  - Moving to `under_construction` with land not secured. This one **blocks**.

Life cycle per type (wording comes from the existing `PROJECT_SHAPE`):

| Type | Typical path |
|---|---|
| Apartment / Commercial / Mixed | Planning → Design → Approval → *(sales open)* → Construction → Handover → Closed |
| Plot development | Planning → Subdivision approval → *(sales open)* → Land development → Possession/registration → Closed |
| Land share | Planning → *(sales open)* Register open → Sold out → Deed → Closed → *optional* successor construction project (`startSuccessor`, already built) |

Land share gains a `construction_after_sale` field: `no | planned | undecided`. When it is `planned`, a "Start construction project" prompt appears once the share project is sold out. The successor already reuses land links.

### 1.2 Project-first creation

- `ProjectForm` stops requiring a land (remove the `landIds.length === 0` error at `ProjectForm.tsx:178-206`). A project can be saved as a draft with no land.
- The land picker gets three options:
  1. Link existing land: any status, not only held land.
  2. **Quick-add owned land**: an inline dialog, see 1.3.
  3. **Start acquiring a new land**: creates a `sourced` land through the full pipeline, already linked.
- The project detail page gets a **Land card** showing each linked land's status, its cost-sheet total and a "Complete land record" checklist link. This is where the developer finishes the land process "aste aste" (gradually).

### 1.3 Two land entry modes

- **Mode A: Acquisition pipeline.** Unchanged (L1–L7).
- **Mode B: Already owned (quick record).** This is a new `entry_mode` field on `lands`: `pipeline | owned`.
  - **Required:** name, location, size, mouza/dag/khatian (optional), how it was acquired (`direct_purchase | joint_venture | inherited | other`, which means two new `ACQUISITION_TYPES`), and acquisition date.
  - **Actual costs paid**, entered against the existing `land_acquisition_costs` heads, plus an "historic actual" amount. See 1.4.
  - The land is created directly as `acquired`. The history row is tagged `source: 'owned_entry'`. This replaces today's create → "Correct status" workaround (`correctStatus`, `land-pipeline.repository.ts:527`).
  - Pipeline steps (site visit, DD, negotiation) show as "Not applicable – owned land" in `LandProgressCard`. DD can still be recorded voluntarily. Deed and mutation documents remain recommended.
- **Decouple linking from status.** Today linking overwrites the land status with `linked_to_project` (`project.repository.ts:545-574`). That would destroy pipeline status for land still in acquisition.
  - `linked_to_project` stops being stored. A Dexie migration re-derives those lands via `syncFromWork` back to `acquired`, `under_development` or `ready_for_project`.
  - "In project PRJ-…" becomes a badge read from `land_project_mapping`.
  - Land list filters and `landIsHeld` are updated to match.

### 1.4 Land cost sheet (one number per land)

`AcquisitionCostPanel` / `sheetForLand` (`negotiation.repository.ts:144`) is extended into a full **Land Cost Sheet** with Estimated, Actual and Balance columns. It shows on the land Overview and is reused on the project Land card.

| Group | Source (existing unless marked) |
|---|---|
| Land price / signing money | `land_acquisition_costs.land_price`; actual = `land_payment` expenses |
| Registration, stamp, VAT/tax, mutation, legal, survey, broker | `land_acquisition_costs` heads; actual = `land_extra_cost` expenses classified by **new `expenses.land_cost_head`** (removes today's "unclassified actual") |
| Land development (filling, boundary, roads) | `land_development_activities.budget_amount` / `progress.amount_incurred` |
| Holding cost (khajna/land tax, guard, utilities) | new head `holding_cost` |
| Owned-land historic cost | entered once in Mode B as actuals |
| **JV only:** landowner's share | non-cash line: landowner units × average price (from `land_jv_details` share). Shown separately, so cash cost and economic cost are both visible |

Fix the existing bug where the cost card is hidden once a land enters development. `costSheetRelevant` still lists `jv_signed` (`lands/[id]/page.tsx:214-221`).

### 1.5 Project cost & revenue estimate (owner view, v1)

This adds a **"Costing" tab** on the project page, using the existing `project_budget_lines` + `budget.repository.ts`. It is not a new system.

- **Cost heads (estimate):**
  - Land (auto, from linked lands' cost sheets; split by `land_project_mapping` share if one land feeds several projects)
  - Design & approval
  - Construction (per-sqft × built area quick estimate, or line items)
  - Utilities/connections
  - Marketing & sales commission
  - Finance cost
  - Overhead
  - Contingency %
  - Land-share and plot shapes hide construction heads.
- **Revenue (estimate):**
  - Sellable units × list price, from `units`, plus the premiums already in v27.
  - Before units exist, a quick input: saleable area × rate.
  - For a JV, the landowner's units are excluded.
- **Read-outs:**
  - Total cost
  - Expected revenue
  - Expected margin and %
  - Cost per sqft or per katha
  - Break-even sales %
  - **Actual to date**: the existing `financeRepository.byProject()` extended to include land cost, so the estimated-profit figure stops overstating.
- Phase 1 only shows the numbers. The full transaction trail behind the actuals comes in Phase 2. Nothing is ever blocked for going over budget.

### 1.6 Schema (one new Dexie version; existing blocks untouched)

- `projects`: `sales_status`, `construction_after_sale`, `est_saleable_area?`, `est_avg_rate?`, `contingency_pct?`.
- `lands`: `entry_mode`, `acquired_on?`. `ACQUISITION_TYPES` gains `inherited` and `other`.
- `expenses`: `land_cost_head?`.
- `land_acquisition_costs` cost heads gain `holding_cost`.
- Migration:
  - Set `entry_mode='pipeline'` on all lands.
  - Set `sales_status` from existing data: `open` if the project has bookings, else `not_open`.
  - Re-derive `linked_to_project` lands.
- The scope doc (§2.x land, §3.x project) is updated to match, as was done for v25. OPEN-ITEMS gets the Phase 2/3 deferrals.

### 1.7 Demo data

`demo-seed.ts` gets these cases (following [[demo-seed-backfill-rule]]):

- An owned-land apartment project with sales open and land "secured", not yet in construction.
- A land-share project on owned land with `construction_after_sale='planned'`.
- A project created with land still in negotiation.

The fully populated pair LND-2026-018 / PRJ-2026-007 (OPEN-ITEMS 0r) keeps every field filled, including the new ones.

### Critical files

- `src/lib/db/database.ts`, `src/lib/db/types.ts`: new version block and fields
- `src/lib/domain/project.ts`: sales status, land readiness, new gates
- `src/lib/domain/land.ts`: `entry_mode`, `landIsHeld`, `linked_to_project` removal, progress steps
- `src/lib/repositories/project.repository.ts`: `setLandsForProject` no longer writes status; new costing summary
- `src/lib/repositories/land-pipeline.repository.ts`: owned entry
- `src/lib/repositories/negotiation.repository.ts` (`sheetForLand`), `budget.repository.ts`, `finance.repository.ts` (`byProject` + land)
- `src/components/admin/projects/ProjectForm.tsx`, a new `ProjectLandCard`, `ProjectCostingTab`
- `src/components/admin/lands/LandForm.tsx` (mode switch), `LandProgressCard.tsx`, `AcquisitionCostPanel.tsx`
- `src/components/admin/bookings/BookingForm.tsx`: sales-open filter
- `src/lib/demo/demo-seed.ts`

### Suggested build order (one commit each, browser-verified, as usual)

0. **Freeze the current work as v0.0.1** before any change:
   - Set `"version": "0.0.1"` in `package.json`.
   - Commit it on `main` at the current HEAD `9b150ea`. `portfolio-screenshots/` stays untracked.
   - Create an annotated git tag `v0.0.1` ("Modules 1–8 + Land L1–L7 + Module 2 phases 1–3, before the project-first replan").
   - Push the commit and the tag to GitHub.
   - All later work happens on top of it.
1. Schema plus the decoupling of `linked_to_project`, with the migration.
2. Owned-land quick entry plus project-first form and land card.
3. Sales status, land readiness and gates, plus the booking filter.
4. Land cost sheet.
5. Project Costing tab plus `byProject` land inclusion.
6. Demo data, scope-doc update and OPEN-ITEMS.

## Phase 2 — Construction (replanned 2026-10-11)

### Why the change
Site work begins only when a project reaches construction. Keeping site progress and material
requests as tabs on every project page mixed **what the project is** (land, type, stages, sales)
with **day-to-day site work**, and showed construction tabs on projects that are still in
planning or are land shares. The client proposed a separate **Construction** area; that is the
standard split (project master record vs. site operations), and most of it already exists
(the site-progress project page has work breakdown, timeline, requests and photos).

### Target
**Menu:** Projects → All Projects · **Construction** (renamed from Site Progress).

**Construction list:** only projects whose construction has started:
`under_construction`, `nearly_complete`, `handover_ongoing` (the existing `isSiteActive`).
Closed projects are under a "Completed" filter. Planning, design and approval projects and land
shares never appear.

**Construction workspace** (open a project from the list):

| Tab | Content | Source today |
|---|---|---|
| Overview | progress vs plan, towers, behind-schedule items, latest on site, materials at a glance | project Site Progress overview |
| Work breakdown | work items per tower, weights, planned dates | site-progress page |
| Site log | Log update at the top; every update in a paged table | project Site Progress → Log updates |
| Materials | Requests · Orders (Receive) · Stock on site · Used | project Materials tab |
| Photos & documents | site photos, uploads | site-progress page Photos |
| Activity | the activity timeline | site-progress page |

**Project page** loses its Site Progress and Materials tabs. A building project in construction
shows an **Open construction** button and a small progress card on Overview.

**The money chain** (the original Phase 2 goal) runs through the Materials tab: request →
procurement order → site receives (cost) → finance pays the supplier against the voucher →
shown in Finance → project. Phase 2 also audits that every step links to the one before it.

### Build order
1. Rename to Construction, move under Projects, list only construction projects.
2. Workspace tabs: Overview, Work breakdown, Site log, Materials, Photos & documents, Activity.
3. Project page: remove Site Progress / Materials tabs; add Open construction.
4. Money-chain audit: request ↔ order ↔ receipt ↔ voucher ↔ payment links, gaps fixed.
5. Demo data and docs.

**Decisions (2026-10-11):** name "Construction"; list from construction start (closed under
"Completed"); plot projects not included yet.
**Progress:** steps 1–3 done 2026-10-11. Next: step 4, the money-chain audit.

### Step 4 — The material flow: request to payment (plan, 2026-10-11)

#### 4.1 How it works on a Bangladeshi site today

- **Site.** The site engineer writes a requisition (*chahida patra*) from the work plan:
  "450 bags cement, 6 ton 16 mm rod for 5th-floor slab". The Project Manager checks it against
  the drawings and the progress, and often cuts it ("300 bags now, the rest next week").
- **Procurement.** Procurement gets quotes, places the order (*karyadesh*) and tells the
  supplier where to unload. Cement, rod, sand and brick normally go **straight to site** from
  the dealer or brickfield. Tiles, fittings, electrical and anything bought in bulk at a good
  rate often go to the **main store** (central godown) first and are sent to sites later.
- **Delivery.** The lorry comes with a **challan** (delivery note). The site storekeeper
  counts and checks, signs the challan, writes it in the site store register, and turns back
  wet cement or under-size rod. Deliveries come in parts: 6 ton ordered, 4 today, 2 next week.
- **Bill.** Days or weeks later the supplier submits a **bill** (invoice), often for several
  challans together and sometimes at a different rate ("rod went up ৳2,000 a ton").
- **Checking.** Procurement or accounts checks the bill against the order and the signed
  challans (the **three-way match**: ordered × received × billed). They prepare a **bill
  voucher** with "prepared by / checked by / approved by" signatures. Management (MD or a
  director) approves it. This is the **final billable voucher**.
- **Payment.** Accounts pays by cheque or bank transfer **against that voucher**, often in
  parts (an advance, a running payment, then the final payment). VAT and AIT are deducted at
  source.
- **On site.** The storekeeper hands material out to the mason or sub-contractor's foreman
  (**in use**). The engineer records what went into which slab or wall (**used**). At the end
  of the job, leftovers (half a pallet of tiles, rod off-cuts) go **back to the main store**
  for the next project.

#### 4.2 What the system has and where the chain breaks

| Step | Built today | Gap |
|---|---|---|
| Request | `material_requests`, line `quantity_approved` (partial approval exists), status history | Procurement approves the requests it then buys against (no separation). No partly-received state: a request is "received" or not. |
| Order | `purchase_orders` + lines | No **delivery point**: a project PO always lands in the project's store, a central PO always in the main store. |
| Delivery | `goods_receipts`, quality check, site presses Receive | Material sent from the main store (`stock_transfers`) arrives **instantly**. The site never confirms it, so there is nothing to Receive and shortages go unseen. Material sent ahead with no request has no place on the site's screen. |
| Bill | — | **Missing.** `supplier_vouchers` *is* the payment. The supplier's bill, its scan, the match and the approval are not recorded anywhere. |
| Payment | `supplier_vouchers` (paid against a PO, any amount) | Paid against an order, not a checked bill. A bill at a higher rate, or for more than arrived, is paid without anyone seeing it. |
| Site stock | stock row (site store) + issues → site balance → used / back to store / written off | Shown as separate "Stock on site" and "Used" tabs, with money. Leftovers can only go back to the site's own store, not to the main store. |
| Cost | material cost = received at site at order price (decision 2026-10-11) | A price difference on the bill never reaches the project's cost. |

#### 4.3 The flow (target)

```
 SITE                       PROJECT MGR         PROCUREMENT                 MAIN STORE        ACCOUNTS / MANAGEMENT        FINANCE
 Request ───────────────▶  Approve (full /  ─▶ Order PO ─ deliver to ─┬──▶ site: site Receives (challan, accepted/rejected)
 (Pending)                  part / reject)      (Ordered)              └──▶ main store: store Receives ─▶ Send to site ─▶ site Receives
                                                Send ahead (no request) ──────────────────────────────▶ site Receives
                                                Record supplier bill + scan ─▶ 3-way match ─▶ Verify ─▶ Approve = payable voucher ─▶ Pay (part / full)
 Site materials: Received ─▶ In use ─▶ Used          leftovers: Send back ─▶ main store Receives
```

**Material request status** (shown from the moment it is raised):

| Status | Meaning | Set by |
|---|---|---|
| Pending approval | raised by the site | Site engineer / site manager |
| Approved / Rejected | each line approved in full, cut down (partial approval) or rejected, with a note | **Project Manager** (see 4.6) |
| Ordered | procurement has ordered it or is sending it from the main store | automatic, from the PO or dispatch |
| In main store | arrived at the main store, not sent yet (main-store route only) | automatic, from the store receipt |
| On the way | sent to the site, waiting for the site to receive | automatic, from the dispatch |
| Partly received | the site has received some of the approved quantity | automatic, from the site's receipts |
| Received | the site has received everything approved (or closed it short with a note) | automatic, or **Close short** by the site |
| Cancelled | withdrawn before ordering | requester |

"Partly received" and "Received" are worked out per line: approved quantity against what the
site actually received for that request.

**Delivery point on every order.** A PO says **Deliver to: Site** (a project's site) or
**Main store**. A main-store PO may still name the project it is meant for, for information.

**Receiving.**
- **At site:** the Materials tab gets an **Incoming** list holding three kinds of delivery:
  - site-delivered POs (with or without a request);
  - material sent from the main store against a request;
  - material **sent ahead** with no request, labelled as such.

  **Receive** records the challan no., date, and the accepted and rejected quantity per line.
  A short receipt leaves the rest pending.
- **At the main store:** the same Receive, on the Stock page.
- **Sent between stores:** a dispatch is **On the way** until the other side receives it. Only
  then does the stock move. A shortage (sent 100, received 96) is recorded on the dispatch.

**Site materials** (renamed from "Stock on site"): one tab, one row per item.

| Item | Received | In store | In use | Used | Sent back |
|---|---|---|---|---|---|
| Cement (bag) | 1,200 | 180 | 120 | 900 | 0 |

The status chips filter the table: **In store** (received, not handed out), **In use** (handed
out to the work), **Used**. The row actions are:
- **Hand out** (In store → In use)
- **Mark used**, partly or fully, against a work item. It can be done straight from In store
  too, because most sites hand out and use the same day.
- **Back to store** (In use → In store)
- **Send back to main store** for leftovers. It is On the way until the main store receives it.
- **Write off**, which stays as today.

There is no money anywhere in Construction: quantities and statuses only. The money Overview
sub-tab goes, and the Work breakdown's "৳ of material used" becomes a quantity.

**Supplier bill → payable voucher → payment.** This adds a new record, the **supplier bill**
(`BILL-2026-001`).
1. **Recorded** (procurement): supplier, PO, the supplier's bill no. and date, the scan
   (compulsory), and per PO line the billed quantity and billed rate, plus VAT and AIT.
2. **Three-way match**, worked out on screen per line: ordered vs received (accepted) vs
   billed, quantity and rate. The flags are:
   - **Billed more than received**
   - **Rate above order**
   - **Billed twice** (the quantity already billed on an earlier bill)
   - **Matched**
3. **Verified** (accounts): confirms the match. The **payable amount** defaults to the matched
   value: billed rate × the quantity that is both received and not billed before. The verifier
   may change it, and must write a note when they do.
4. **Approved = final billable voucher** (management): the voucher prints with the prepared,
   checked and approved names and dates. **Rejected / returned to supplier** is the other
   outcome, with a reason.
5. **Paid** (Finance): Finance → **Bills to pay** lists approved vouchers with the balance due.
   - **Pay** records a supplier payment against the voucher: account, method, cheque or
     reference, VAT/AIT deducted. Part-payments are allowed.
   - The voucher's status follows the payments: **Approved → Part paid → Paid**.
   - A payment can no longer be made against a bare PO. Old payments with no bill stay
     readable, marked "paid before bills were recorded".

Rules, following "transparency, not restriction":
- Nothing blocks a bill for being over budget or above the order rate.
- Every difference is shown on the bill, on the voucher and in Finance, and needs a note from
  whoever accepts it.

**Returns.**
- *Rejected at delivery* is the GRN's rejected quantity. It never enters stock and can never
  be billed (the match uses accepted quantity).
- *Site leftovers* go back to the main store (above).
- *Return to supplier after acceptance*, a debit note against a bill, is deferred to
  OPEN-ITEMS. It is rare, and the bill note covers it for now.

**Cost in Finance** (per project, never in Construction):
- **Material cost** is material received at site, at order price (unchanged decision). That
  covers direct site deliveries, plus dispatches the site received from the main store at
  store cost, less leftovers sent back.
- **Bill price difference** is new: approved payable minus order value for what that bill
  covers, shown on its own line.
- **Paid / still owed** comes from the approved vouchers and the payments against them.

#### 4.4 Who does what, and which screen

| Who | Screen | Actions |
|---|---|---|
| Site engineer / site manager | Construction → project → Materials (Requests · Incoming · Site materials) | raise request, receive, hand out, mark used, back to store, send back, close short |
| Project Manager | same Requests sub-tab, and Procurement → Material Requests | approve, cut down or reject lines |
| Procurement | Material Requests · Purchase Orders · Stock (main store) · **Supplier Bills** | order (deliver to site or main store), receive at main store, send to site, send ahead, record bills |
| Accounts | **Supplier Bills** (verify) · Finance → **Bills to pay** · Supplier Payments | verify the match, pay against vouchers |
| Management | Supplier Bills (to approve) | approve bills into payable vouchers |

Menu changes:
- **Procurement → Supplier Bills** is new.
- "Supplier Vouchers" becomes **Finance → Supplier Payments**.
- **Finance → Bills to pay** is new.

#### 4.5 Schema (Dexie v30, one new block; old blocks untouched)

- `supplier_bills` (new): `code, po_id, supplier_id, project_id, bill_no, bill_date, status,
  billed_amount, vat_amount, ait_amount, payable_amount, payable_note, verified_by/at,
  approved_by/at, decision_note, notes`.
  - Status ENUM: `recorded | verified | approved | part_paid | paid | rejected`.
- `supplier_bill_items` (new): `bill_id, po_item_id, quantity_billed, rate_billed`.
- `supplier_vouchers` + `bill_id` (indexed). This table is now the payment against a voucher.
- `purchase_orders` + `deliver_to: 'site' | 'main_store'`. Migration: project POs become
  `site`, central POs become `main_store`.
- `goods_receipts` + `challan_no`.
- `stock_transfers`:
  - adds `status: 'on_the_way' | 'received'`, `quantity_received`, `received_date`,
    `received_by`;
  - `to_project_id` may be null (main store);
  - migration: existing transfers become `received`.
- `material_requests` status ENUM gains `partially_received` and `cancelled`. The labels are
  renamed to the table above. `received` keeps meaning "in main store", and `fulfilled` is
  "received at site".
- No new `item_name` table, so `backfillMaterialItems` is unchanged. `supplier_bill_items`
  points at PO lines.

#### 4.6 Decisions (client, 2026-10-11)

1. **The Project Manager approves material requests** and can cut lines. Procurement buys only
   what was approved.
2. **Accounts verify a bill and Management approves it** into the payable voucher.
3. **A bill rate above the order rate is allowed with a note.** It is flagged on the bill and
   the voucher, and shown in Finance.

#### 4.7 Build batches (each browser-checked, one commit each)

1. **Schema v30 and domain:** statuses, match calculation, request progress per line,
   repositories for bills, deliver-to and on-the-way dispatches.
2. **Construction Materials tab:** Requests (status, approve and cut for the PM), Incoming with
   Receive, and Site materials as one tab with statuses and actions. All money removed from
   Construction.
3. **Procurement:** PO deliver-to, main-store receiving, Send to site and Send ahead,
   receiving leftovers back at the main store.
4. **Supplier bills:** record with scan, three-way match, verify, approve, printable payable
   voucher.
5. **Finance:** Bills to pay, pay against a voucher, Supplier Payments moved to Finance, the
   project finance page with the bill price difference and paid / owed.
6. **Demo data** for every status (a part-approved request, a part delivery, a main-store
   dispatch on the way, something sent ahead, a bill at a higher rate, a bill billed twice, a
   part-paid voucher, leftovers sent back), plus OPEN-ITEMS and the scope-doc addendum.

## Verification

- `npx tsc --noEmit` and lint. Do not run `next build` while the dev server on 3001 is running.
- In the browser on the running dev server (port 3001), after a demo reload:
  - Create a project with no land.
  - Quick-add an owned land from inside the project form and confirm it lands as Acquired with its costs on the cost sheet.
  - Link a land still in negotiation and confirm its pipeline status is unchanged and it carries an "In project" badge.
  - Try to open sales and move to construction, and see the warning and the block.
  - Confirm bookings list only sales-open projects.
  - On the Costing tab, check that land cost plus estimate heads add up, and that revenue excludes JV landowner units.
  - Mark a land-share project `planned`, sell it out, and confirm the successor prompt appears.
- Regression: the existing pipeline land (LND-2026-018) still walks all L7 steps unchanged.
