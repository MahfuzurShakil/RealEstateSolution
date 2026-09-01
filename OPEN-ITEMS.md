# Open Items

Known-open work that is **not** a blocker for what is already shipped. Add to
this as modules land; delete an entry when it is done.

Last reviewed: 2026-09-02, after Module 5 (Site Progress) and its clean-up pass.

---

## 1. Open

### 1.1 `.claude/launch.json` dev port
Changed from 3000 to 3001, because port 3000 belongs to another project on this
machine. The file is tracked, so the change ships to everyone who clones the
repo. Harmless for a solo repo; revisit if anyone else starts working on it.

### 1.2 Public Portal will exercise `progress.public.repository.ts` properly
`src/lib/repositories/public/progress.public.repository.ts` implements
Section 6.7 (tower-wise `current_progress_pct` + latest public photo,
field-whitelisted).

It is no longer untested code — the **"On the public website" preview** on the
project's Site Progress tab and Photos tab reads through it, so both gates
(project not published, photo not marked public) are exercised by real screens.
But it has still never been rendered by an actual public page, so re-check the
shape it returns when P2 is built.

### 1.3 Module 6 owns the rest of the request lifecycle
`material_requests` reaches `approved` in Module 5. `ordered` and `fulfilled`
are currently marked by hand from the status card. Module 6 (Procurement)
replaces those with real Purchase Order and Goods Receipt steps, and should
write into `material_request_status_history` the same way.

---

## 2. Schema addenda — recorded in the scope document

All Module 5 addenda are now written into
`Real-Estate-Developer-Platform_Scope-Document_v3.md` (Section 11, Decision
Log). The full cross-module list, for reference:

| Table | Field | Why |
|---|---|---|
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

## 3. Closed in the Module 5 review — kept as a record

**Bugs found and fixed**

- **Approved quantities were wiped on edit.** Re-saving an already-approved
  material request without changing anything cleared every `quantity_approved`
  while leaving the status "Approved". The edit form does not carry that field,
  and the repository read its silence as "set to null".
- **Deleted records hung on "Loading…"** — `useLiveQuery` reports its pending
  state as `undefined` and the repositories also returned `undefined` for "no
  such row", so a detail page could not tell them apart. Fixed in Module 5 and
  in Modules 1–4 (`land`, `project`, `lead`, `booking`, `customer`).
- **Project roll-up summed towers instead of averaging them**, giving 176%
  across five towers. 6.3 says the project figure is the average of its towers.
- **Progress bar disagreed with its own badge** — the bar derived "behind" by
  subtracting two numbers that are not comparable at roll-up level.
- **Board sorted finished projects above active ones**, because a completed
  project sits at exactly 0.0% variance forever.
- **Pagination overflowed on mobile** — shared component, so every list page.
- **Documents panel gave land-specific advice everywhere** — "upload khatian
  copies, deeds" followed a site photo and a booking around. The hint is now
  scoped by entity, like the Document Type dropdown already was.

**Gaps closed**

- Material request lifecycle now has an audit trail (see 2 above), and the
  request page shows a **Decision trail** card.
- The "Gone quiet" badge is demonstrable — one demo project is deliberately
  past the 14-day threshold, so the state can be seen rather than just
  reasoned about.
- Staleness wording no longer calls a design-stage project an "active site".
- `progress.public.repository.ts` is exercised by real screens (see 1.2).

**Verified by hand in the browser**

Roll-up arithmetic (log to 100% → tower +6 pts → project average → delete →
full rollback), milestone derivation, every board filter and both sort
controls, empty states, weight-imbalance warning, reject-reason guard, GPS
picker, manual photo upload with the public/internal flag, not-found pages
across all six entity types, and mobile at 375px with no horizontal overflow.
