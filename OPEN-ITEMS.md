# Open Items

Known-open work that is **not** a blocker for what is already shipped. Add to
this as modules land; delete an entry when it is done.

Last reviewed: 2026-09-02, after Modules 6 (Procurement), 7 (Finance) and 8
(Users, Roles, Master Data, Settings) — the last of the eight admin modules.

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
