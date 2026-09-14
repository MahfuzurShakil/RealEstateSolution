# BRD Alignment Plan

Against **Real Estate Development Management Platform — Detailed BRD v2.0 (September 2026)**,
the document received from the client on 2026-09-14.

This plan does **not** replace `Real-Estate-Developer-Platform_Scope-Document_v3.md`.
The scope document stays the build spec; this file records what the BRD adds on
top of it, in what order we will absorb it, and which questions need an answer
before code is written.

Design language, colour and shell are **unchanged** — the client confirmed those
are fine. Everything below is functional depth, not a visual redesign.

---

## 1. Where we stand

Eight modules are built and browser-verified: Land, Project/Tower/Unit, Lead/CRM,
Booking/Customer, Site Progress, Procurement, Finance, Users & Master Data.
The BRD describes **24 modules**. Most of the difference is not "screens we
forgot" — it is **depth inside the lifecycle we already have**.

The BRD's own lifecycle is:

```
Land Identification → Site Visit → Legal DD → Negotiation → Acquisition/JV
→ Land Development → Project Feasibility → Planning & Design → Approvals
→ Procurement → Construction → Inventory → Sales/Booking → Payment Plan
→ Collection → Handover → Profitability → JV/Investor Settlement → Closure
```

We have built the **middle and the right-hand side** (project → sales → collection).
The **left-hand side (land → legal → acquisition → development)** is where we
are thinnest, and that is exactly the part the client asked us to start with
(BRD §7–§11).

---

## 2. Coverage map — BRD's 24 modules vs. what exists

| # | BRD module | BRD IDs | Our module | State | What is missing |
|---|---|---|---|---|---|
| 1 | Land & Landowner | LAND-001…005 | Module 1 | **Partial** | upazila, classification, road access, source; per-owner area / agreed price / paid / due |
| 2 | Site Visit & Feasibility | SITE-001…003 | — | **Missing** | whole module; today it is one status click with a remark |
| 3 | Legal Due Diligence | DD-001…004 | — | **Missing** | checklist, evidence, review/waiver, acquisition blocking |
| 4 | Negotiation & Acquisition | ACQ-001…004 | Module 1 + 7 | **Partial** | offer/counter-offer history, acquisition cost sheet, per-owner settlement |
| 5 | Land Development | DEV-001…004 | — | **Missing** | activities, budgets, progress, readiness gate before project creation |
| 6 | Project & Planning | PROJ-001…003 | Module 2 | **Partial** | project types (LAND_SHARE, PLOT_DEVELOPMENT, JOINT_VENTURE), WBS phases, dependencies, baseline vs revised dates |
| 7 | Design & Professionals | PROJ-004 | — | **Missing** | architect / engineer / surveyor / consultant register |
| 8 | Approvals & Compliance | PROJ-005 | — | **Missing** | RAJUK-type approvals with expiry and renewal alerts |
| 9 | Construction & Site Ops | CONST-001…004 | Module 5 | **Partial** | weather/manpower/equipment on daily log, planned-vs-actual, quality checklist, NCR |
| 10 | Contractor & Consultant | CONT-001…005 | — | **Missing** | contract, BOQ, variation, RA bill, retention, advance recovery |
| 11 | Procurement & Vendor | PROC-001, 002 | Module 6 | **Partial** | PR → RFQ → quotation → comparison (we jump request → PO) |
| 12 | Material & Store | PROC-003, 004 | Module 6 | **Built** | BOQ-vs-consumed variance only |
| 13 | Budget, Cost & Finance | FIN-001…005 | Module 7 | **Partial** | cost centers, committed/forecast states, voucher types, reconciliation, no-silent-delete |
| 14 | **Investor Management** | INV-001…012 | — | **Missing** | entire first-class module (biggest single gap) |
| 15 | JV Management | JV-001…004 | Module 1 + 2 | **Partial** | allocation matrix, protected inventory, owner settlement, versioned amendments |
| 16 | Sales & Inventory | SAL-001…005 | Module 2 + 4 | **Built** | booking lock **expiry**; plot / land-share inventory types |
| 17 | Customer & CRM | — | Module 3 + 4 | **Built** | — |
| 18 | Payment Plans & Collection | COL-001…005 | Module 7 | **Built** | overdue penalty; reminders |
| 19 | Document Management | DOC-001…004 | Section 1.1 | **Partial** | versioning, expiry alerts, evidence links |
| 20 | Workflow & Approvals | WF-001…004 | — | **Missing** | maker-checker, threshold matrix, override-with-reason |
| 21 | Dashboards & Reporting | DASH-001…005 | Dashboard | **Partial** | CEO/portfolio, investor and legal dashboards |
| 22 | Notifications | NOT-001…003 | — | **Missing** | in-app notification centre + escalation |
| 23 | Audit & Security | SEC-001…005 | Module 8 | **Partial** | no audit log; RBAC is route-level, not query-level |
| 24 | AI & Analytics | — | — | **Phase 3** | out of scope for now, by the BRD's own sequencing |

---

## 3. Five cross-cutting gaps

These are not modules. They are **capabilities every module needs**, and if we
keep building modules without them we will retrofit them into twenty screens
later instead of five.

### 3.1 Workflow & approval engine (WF-001…004, BR-007, BR-010, BR-015)
Today each module invents its own approval: `discount_approval_rules` for
bookings, a status enum for material requests, nothing at all elsewhere.
The BRD wants **maker-checker with a configurable threshold matrix** (by amount,
project, department, transaction type) and **override with reason + audit**.

**Recommendation:** build one small generic engine (`approval_requests` +
`approval_rules`) and route new approvals through it. Do **not** rewrite the two
existing ones immediately — wrap them later.

### 3.2 Audit log (SEC-002, FIN-005, BR-022)
`OPEN-ITEMS 1.11` already records that we have none. The BRD makes it
non-negotiable: log create/update/delete/approve/reject/post/reverse/export,
and **posted financial transactions can never be silently deleted** — corrections
must be a reversal with a reason.

**Recommendation:** one `audit_log` table written from the repository layer (not
the UI), so it cannot be bypassed. This is cheap now and expensive in six months.

### 3.3 Document versioning, expiry and evidence (DOC-001…004)
We have a universal vault already — that part matches the BRD. Missing:
version chain on a document, reviewer/approval state, **expiry dates with alerts**
(critical for approvals and licences), and the ability for a legal/financial
workflow to *reference a document as evidence*.

### 3.4 Cost centers and four financial states (FIN-001, FIN-002, BR-011)
The BRD wants every cost tagged to a **cost center** (LAND, LAND_DEVELOPMENT,
DESIGN, APPROVAL, PILING, BASEMENT, STRUCTURE, ELECTRICAL, PLUMBING, FINISHING,
MARKETING, ADMIN) and tracked in four separate states:

```
Budget → Committed (PO raised) → Actual (GRN / invoice / payment) → Forecast
```

We store `cost_category` on expenses and a single `budgeted_amount` per line.
Committed and forecast do not exist as concepts. This is the backbone of
DASH-001/002 and of the "budget control" acceptance scenario, so it has to be
settled before Investor and Contractor modules land on top of it.

### 3.5 Party model (BRD §26)
The BRD proposes `Party → PartyRole → LandOwner / Customer / Contractor / Vendor /
Professional / Investor`. We have four independent tables instead.

**Recommendation: do not retrofit this in Phase A.** It is a Phase B (Postgres)
decision. Retrofitting a party table into a working Dexie app buys nothing the
client can see and risks every existing screen. Record it as a Phase B design
rule instead — the repository layer already hides table shape from the UI, which
is exactly why AGENTS.md insists on it.

---

## 4. Decisions needed before we cut code

| # | Question | Our recommendation |
|---|---|---|
| D1 | Land status names: adopt the BRD's `SOURCED / UNDER_REVIEW / DD_IN_PROGRESS / NEGOTIATION / AGREED / ACQUIRED / REJECTED / DISPOSED`, or keep ours? | **Keep our keys, change the labels**, and add `disposed`. Mapping in §5.3. Zero data migration, exact BRD semantics. |
| D2 | Is Investor Management in this phase? It is 12 requirements + a full settlement engine and the BRD calls it first-class. | **Yes, but after Land.** It is the largest gap and the one a CEO notices. |
| D3 | Contractor & Billing (RA bills, retention, variation) — separate module or extension of Procurement? | **Separate module.** Contract → BOQ → Variation → RA Bill → Payment is a different shape from PO → GRN → Voucher. |
| D4 | Do we add PR → RFQ → Quotation → Comparison before PO? | **Later.** Our Material Request already plays the PR role; RFQ/comparison is a refinement, not a gap in the money trail. |
| D5 | DD checklist configuration — `lookup_values` or its own master table? | **Own master table.** A checklist item carries `is_mandatory` + category; `lookup_values` is for flat option lists. |

---

## 5. Module 1 (Land) — the detailed plan for BRD §7–§11

This is the work we start with. It turns Land from a **status tracker** into the
**controlled acquisition lifecycle** the BRD describes.

### 5.1 What exists today

| Piece | Status |
|---|---|
| `lands`, `landowners`, `land_owner_mapping`, `land_jv_details` | built |
| 9-step status pipeline with a confirmation dialog per step | built |
| `land_status_history` audit trail + Timeline tab | built |
| Land payment schedule + instalments (Tier 3.4) | built, **per land** |
| Land expenses linked to an instalment (Section 0g) | built |
| Documents tab (9 land document types) | built |
| Site visit | one status click, one free-text remark |
| Legal due diligence | one status click, one reference number |
| Negotiation | one status click, one amount |
| Acquisition cost build-up | not modelled |
| Land development | not modelled |

### 5.2 Requirement-by-requirement gap

**§7 Land Management**

| ID | Requirement | State | Action |
|---|---|---|---|
| LAND-001 | registry incl. upazila, classification, road access, source | partial | add 4 fields: `location_upazila`, `land_classification`, `road_access`, `source` |
| LAND-002 | per-owner ownership %, **ownership area, agreed price, paid, due** | partial | add `ownership_area`, `agreed_amount` to the mapping; per-owner settlement schedule |
| LAND-003 | deeds/khatian/mutation/tax/maps/survey **with versioning** | partial | covered by cross-cutting §3.3 |
| LAND-004 | 8 statuses incl. `DISPOSED` | partial | add `disposed`; relabel per D1 |
| LAND-005 | GIS-ready lat/long + map reference | partial | fields exist; map view stays Phase 2 |

**§8 Site Visit & Feasibility — new**

| ID | Requirement | Action |
|---|---|---|
| SITE-001 | visit date, visitors, access, road width, utilities, drainage, soil/lowland, surroundings, price observations, photos, video, GPS | new `site_visits` table, **many per land** |
| SITE-002 | estimated acquisition cost, development cost, expected revenue, risks, assumptions, recommendation | new `land_feasibility` table |
| SITE-003 | configurable feasibility approval **before** acquisition negotiation | gate G1 |

**§9 Legal Due Diligence — new**

| ID | Requirement | Action |
|---|---|---|
| DD-001 | configurable checklist: ownership, title, deed chain, mutation, khatian, tax, encumbrance, mortgage, litigation, boundary, agreement, authority approvals | `dd_checklist_items` (master) + `land_dd_items` (per land) |
| DD-002 | every item may reference one or more evidence documents | documents with `entity_type = 'land_dd_item'` |
| DD-003 | assignment, submission, review, rejection, conditional approval, waiver | status machine on `land_dd_items` |
| DD-004 | **acquisition blocked** when mandatory items fail or are incomplete, unless an authorised waiver exists | gate G2 (this is BR-001) |

**§10 Negotiation & Acquisition**

| ID | Requirement | Action |
|---|---|---|
| ACQ-001 | offers, counteroffers, agreed price, owner terms, broker/agent, conditions, history | new `land_negotiations` table (one row per round) |
| ACQ-002 | total acquisition cost = land price + registration + legal + taxes/fees + broker + other | new `land_acquisition_costs` (estimated), actuals rolled up from `expenses` |
| ACQ-003 | owner settlement schedules; **every payment links to land/owner/acquisition** | extend `payment_schedules.entity_type` with `land_owner` |
| ACQ-004 | every acquisition transaction links to voucher, payment method, party, cost center | partly built (method + bank account); cost center from §3.4 |

**§11 Land Development — new**

| ID | Requirement | Action |
|---|---|---|
| DEV-001 | filling, boundary wall, internal roads, drainage, soil improvement, utilities, gate, security, landscaping, site clearing | `land_development_activities`; activity type from `lookup_values` |
| DEV-002 | activity budget vs committed/actual/forecast | budget now; committed/actual arrive with §3.4 |
| DEV-003 | quantity, % completion, contractor, date, evidence, cost | `land_development_progress`; contractor = `suppliers` where `type = 'contractor'` (already supported) |
| DEV-004 | **project creation blocked** until readiness criteria are satisfied | gate G3 |

**Business rules landed by this work:** BR-001 (DD blocks acquisition),
BR-002 (owner percentages valid and reconciled), BR-003 (owner settlement
references acquisition and owner).

### 5.3 Target pipeline

Keys stay, labels change, one status is added — so nothing in IndexedDB has to
be migrated and the BRD's vocabulary is still honoured:

| BRD status | our key | new label |
|---|---|---|
| SOURCED | `new` | Sourced |
| UNDER_REVIEW | `site_visit_done` | Under Review |
| DD_IN_PROGRESS | `legal_verification` | Due Diligence |
| NEGOTIATION | `negotiation` | Negotiation |
| AGREED | `decision` | Agreed |
| ACQUIRED | `acquired` / `jv_signed` | Acquired / JV Signed |
| REJECTED | `rejected` | Rejected |
| DISPOSED | `disposed` **(new)** | Disposed |
| — | `linked_to_project` | Linked to Project |

Three gates sit on top of it:

```
G1  Under Review → Due Diligence
    requires an approved feasibility record            (SITE-003)

G2  Agreed → Acquired / JV Signed
    requires every mandatory DD item passed or waived  (DD-004 / BR-001)

G3  land → project link
    requires land-development readiness sign-off       (DEV-004)
```

Each gate is **configurable on/off** in Company Settings, because the BRD says
"configurable" and because a land bought before the system existed must still be
recordable.

### 5.4 New tables (Dexie v19 onward — new version blocks, never edits)

```
site_visits                 land_id, visit_date, visited_by, participants,
                            access_note, road_width_ft, utilities, drainage,
                            soil_condition, is_lowland, filling_required_ft,
                            surroundings, price_observation, gps_lat, gps_lng,
                            recommendation, remarks

land_feasibility            land_id, version_no, est_acquisition_cost,
                            est_development_cost, est_other_cost,
                            expected_revenue, assumptions, risks,
                            recommendation (proceed|hold|reject),
                            status (draft|submitted|approved|rejected),
                            approved_by, approved_at, remarks

dd_checklist_items          code, label, category, is_mandatory, sort_order,
                            is_active                  -- master, Master Data screen

land_dd_items               land_id, item_id, status (pending|in_progress|
                            passed|failed|waived|not_applicable),
                            assigned_to, submitted_by, submitted_at,
                            reviewed_by, reviewed_at, finding,
                            waiver_reason, waived_by, waived_at

land_negotiations           land_id, owner_id?, round_no, party (us|owner),
                            amount, offer_date, terms, conditions,
                            broker_name, status (open|accepted|rejected|
                            superseded), recorded_by, remarks

land_acquisition_costs      land_id, cost_head, estimated_amount, remarks
                            -- actuals roll up from `expenses`

land_development_activities land_id, activity_type, contractor_id?, unit,
                            planned_qty, budget_amount, start_date,
                            target_date, status, notes

land_development_progress   activity_id, progress_date, qty_done, pct_complete,
                            amount_incurred, recorded_by, remarks
```

Field-only additions (no index, therefore no version block, per the precedent
already set by `towers.current_progress_pct`):

- `lands`: `location_upazila`, `land_classification`, `road_access`, `source`
- `land_owner_mapping`: `ownership_area`, `agreed_amount`
- `SCHEDULE_ENTITY_TYPES`: add `land_owner`

New document entity types: `site_visit`, `land_dd_item`, `land_development_activity`.

### 5.5 Screens

The land detail page keeps its shape (sidebar cards + tabbed main column) and
gains tabs. Nothing about the teal shell changes.

| Tab | State |
|---|---|
| Overview | existing + the 4 new registry fields |
| Owners | existing + ownership area, agreed amount, **paid / due per owner** |
| **Site Visits** | new — list of visits, one form, photo upload |
| **Feasibility** | new — cost/revenue sheet, recommendation, approval action |
| **Due Diligence** | new — checklist with per-item status, evidence, waiver |
| **Negotiation** | new — offer/counter-offer ladder with the agreed round marked |
| **Acquisition Cost** | new — estimated vs actual build-up |
| Joint Venture | existing |
| Payment plan | existing + a per-owner breakdown |
| **Development** | new — activities, budget, progress |
| Documents | existing |
| Timeline | existing, now also showing DD, feasibility and negotiation events |

Plus: a **Land pipeline board** on the Lands list (Kanban by status) so the
"acquisition pipeline" KPI in BRD §32 has a screen behind it.

### 5.6 Build order

Each batch ends browser-verified with BD demo data seeded, then pushed —
the working pattern we have used for every module so far.

| Batch | Contents | Why this order |
|---|---|---|
| **L1** | Registry fields, `disposed` status, relabelling, per-owner area + agreed amount | smallest change, unblocks the owner settlement work |
| **L2** | Site Visits + Feasibility + gate G1 | first new tab; proves the pattern |
| **L3** | DD checklist master + per-land checklist + evidence + gate G2 (BR-001) | the client's stated priority inside §7–11 |
| **L4** | Negotiation ladder + acquisition cost sheet | completes ACQ-001/002 |
| **L5** | Per-owner settlement schedule + payment linkage (ACQ-003, BR-003) | needs L1 and L4 |
| **L6** | Land development activities, progress, gate G3 (DEV-004) | last, because it gates project creation |

Demo data: every batch back-fills the BD demo lands so the client opens a land
and sees a real visit, a real checklist, a real offer ladder — not empty tabs
(`demo-seed.ts`, plus the back-fill rule already in force).

---

## 6. Roadmap after Land

| Phase | Scope | Maps to |
|---|---|---|
| **A** | Land lifecycle (§5 above) | BRD §7–11, MVP-1 |
| **B** | Audit log + document versioning/expiry + cost centers & four financial states | §3.2, §3.3, §3.4 |
| **C** | Investor Management — onboarding → agreement → capital → allocation → profit → multi-stage settlement → closure | BRD §17, INV-001…012 |
| **D** | JV depth — allocation matrix, protected inventory, owner settlement, versioned amendments | BRD §18, JV-001…004 |
| **E** | Contractor & Billing — contract, BOQ, variation, RA bill, retention, advance recovery | BRD §14, CONT-001…005 |
| **F** | Project depth — WBS phases, dependencies, baseline vs revised, professionals, approvals with expiry | BRD §12, PROJ-003…005 |
| **G** | Workflow engine + notifications + role dashboards | BRD §20, §22, §21 |
| **H** | AI & analytics | BRD §30, explicitly last in the BRD's own sequencing |

Phases B and C can be argued either way — B is plumbing the client cannot see,
C is the module a CEO opens first. B is listed first because Investor settlement
depends on cost centers and on an audit trail, and building it twice costs more
than waiting one batch.

---

## 7. What this plan deliberately does not do

- **No visual redesign.** The client approved the look; colour, shell and
  typography are untouched.
- **No party-table retrofit** (see §3.5) — Phase B decision.
- **No microservices.** The BRD itself recommends a modular monolith, which is
  what we have.
- **No AI work** until the transactional model is stable, which is also the
  BRD's own instruction.
