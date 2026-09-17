# L7 — Land detail page redesign (BRD-driven)

Agreed with the client 2026-09-16, replacing the reverted L7 attempt. Source of
truth: BRD v2.0 §7–11 (Land, Site Visit & Feasibility, Legal DD, Negotiation &
Acquisition, Land Development). Land create/edit and the land list stay as they
are.

## Page structure

| Tab | Holds | BRD |
|---|---|---|
| Overview | land record, commercials, notes, status history | LAND-001/004/005 |
| Owners | owners, share/area/price/paid/due, reconciliation | LAND-002 |
| Joint Venture *(JV only)* | JV terms; "Record JV signing" | JV-001 |
| Documents | document vault | LAND-003 |
| **Timeline** | four sub-tabs ↓ | |
| ↳ Site Visit & Feasibility | visits (planned + done) and study versions, each as a timeline item | SITE-001/002/003 |
| ↳ Legal Due Diligence | checklist, evidence, review | DD-001…004 |
| ↳ Negotiation & Acquisition | offer rounds (timeline), registration, acquisition cost, payment plan, owner settlement | ACQ-001…004 |
| ↳ Land Development | activities and progress (timeline) | DEV-001…004 |

Records that repeat inside a sub-tab are shown as a timeline; clicking an item
opens its full details.

**Right-side card — read-only progress.** One row per step, ticked when done,
with a small count where there are several records. Clicking a row opens that
sub-tab. It cannot change status.

## Status — follows the work (decision A)

| Status | Set when |
|---|---|
| Sourced → Under Review | the first site visit is recorded as done |
| Under Review → Due Diligence | the first due-diligence item is worked on |
| Due Diligence → Negotiation | the first negotiation round is recorded |
| Negotiation → Agreed | a round is accepted |
| Agreed → Acquired | registration is recorded in Negotiation & Acquisition |
| Agreed → JV Signed | signing is recorded on the Joint Venture tab |
| Rejected / Disposed / Reopen / Correct | decisions — a "Status" action in the page header, reason required |

Every change writes a status-history row saying what caused it.

## Validations

- **SITE-003:** no negotiation round until a feasibility study recommending
  Proceed is approved. Always on.
- **DD-004:** registration / JV signing blocked while a mandatory DD item is
  failed or incomplete, unless waived. Always on (no longer a Settings switch).
- **ACQ-003:** a payment plan can be created from Agreed onwards; a direct
  purchase cannot be marked Acquired without one.
- **Land development** only on land that is Acquired, JV Signed or linked to a
  project.
- **DEV-004:** project creation readiness stays a configurable gate (G3).

## BRD gaps closed in this batch

- SITE-001 — visit **plans** (planned visits) and **video** evidence.
- DD-003 — **submitted for review** and **conditional approval** item states.
- SITE-003 — gate moved to where the BRD puts it (before negotiation).

## Deferred (recorded in OPEN-ITEMS.md)

- LAND-003 document versioning.
- DEV-002 committed/forecast cost and ACQ-004 cost centers — need the
  cost-center work (FIN-001/002).

## Status set (client decision 2026-09-18)

Twelve statuses, extending BRD LAND-004. The BRD's eight are kept except
`JV_SIGNED`, which folded into `ACQUIRED` (how it became ours is
`acquisition_type`); `UNDER_DEVELOPMENT`, `READY_FOR_PROJECT` and `ON_HOLD`
are new.

| Status | Set by |
|---|---|
| Sourced | land created |
| Under Review | first site visit done |
| Due Diligence | first checklist item worked |
| Negotiation | first offer round |
| Agreed | a round accepted |
| Acquired | registration, or JV signing (labelled "JV Signed" on a JV) |
| Under Development | first development activity |
| Ready for Project | all development complete, or "no development required" |
| Linked to Project | Module 2 |
| On Hold | a person, with a reason; "Resume" returns it to where it was |
| Rejected / Disposed | a person, with a reason |

Not statuses, shown as **waiting on** instead: a submitted feasibility study, a
settlement schedule, an unfinished checklist. The land list filters by stage
(Sourcing · Legal · Deal · Owned · Closed), by status, and by what each land is
waiting on.

## Delivery

Commit per part: (1) status engine + validations, (2) BRD gaps, (3) page
restructure + progress card + timelines, (4) demo data. Browser-verified.
