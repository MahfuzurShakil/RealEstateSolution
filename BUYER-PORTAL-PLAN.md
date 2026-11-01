# Buyer Customer Portal & Share Sale on the Website — Plan

| | |
|---|---|
| **Date** | 1 November 2026 |
| **Status** | Draft — needs the decisions in §8 before building |
| **Builds on** | `PROJECT-SHARE-SALE-PLAN.md` (Investor portal, shipped 463ae85 → 53c4b1c), `SALES-FLOW-PLAN.md` |

Five things are asked:

1. Track a buyer's (Booking) money the **same way** Share Sale tracks an investor's money.
2. Booking agreement screens use Bangla words (চুক্তি, kisti) — make them proper English.
3. Show the **two customer types** (Buyer, Investor) in the Customers area in one consistent way.
4. A **Customer Portal for Buyers**, like the one for Investors.
5. Should the **Public website** show Share Sale too, with a "Buy shares" request?

---

## 1. Where we are today — the gap

| | Share Sale (Investor) | Booking (Buyer) |
|---|---|---|
| Schedule | **Stored rows** — `share_installments` written at signing | **Not stored** — terms on the booking row, dates worked out on read (`expectedLines`) |
| Per-installment status | Paid / part-paid / due / overdue per row | Only "behind by X" for the whole booking |
| Payment applied to | Late fee first, then oldest installment (`allocations` on the receipt) | The booking as a lump; no link to a kisti |
| Late fee | `late_fee_pct` + `grace_days` per offering | None |
| Receipt | `SRC-…` with channel office / online | `payments` row, prints a money receipt |
| Cash Position | **Not linked** — `share_payments` has no `account_id` | Linked via `account_id` |
| Finish line | `fully_paid` → certificate | Nothing — booking stays `confirmed` until delivery |
| Signing | Wizard: KYC, witnesses, stamp, papers checklist | One form: date, no., mode, kisti, handover, terms |
| Dues list | Share Sale → Investors & Dues | Collections (per booking, not per installment) |
| Online payment | Customer Portal + gateway | — |

Note: "no generated buyer kisti" was a client decision on **2026-10-22** (SALES-FLOW-PLAN S3).
Doing item 1 **reverses that decision** — confirm with the client (§8, D1). The reason it is
needed now: a portal must show the buyer a fixed schedule with a status per row and let them
pay a specific installment; a schedule that is recomputed from terms can't do that reliably.

---

## 2. Item 1 — Track Booking money like Share Sale

### 2.1 One ledger engine for both

Move the money logic out of Share Sale into a shared domain module, so both trackers are
literally the same code:

- `src/lib/domain/installment-ledger.ts` (new) — `buildSchedule`, `viewLedger` (row statuses,
  overdue, late fee as of a date), `allocatePayment` (late fee → oldest row), `maxPayable`.
- Share Sale keeps working through it (its current `viewSale` / `allocateSharePayment` become thin
  wrappers). Its tests must still pass unchanged — that is the proof nothing moved.

### 2.2 Data (Dexie **v45**, a new `version()` block — no existing block edited)

- New table **`booking_installments`**: `id, booking_id, seq, kind, label, due_date, amount`
  + base fields. `kind` = `booking_money | down_payment | installment | full_balance`.
- **`payments`** (existing table, non-indexed fields, so no store change): add
  `principal`, `late_fee`, `allocations[]`, `channel ('office'|'online')`, `method_detail`.
  `account_id` stays — buyer money keeps flowing into Cash Position.
- **`bookings`**: add `fully_paid_on` (date, null until the last row is paid). Booking **status
  ENUM is not changed** (`hold | confirmed | cancelled`); "fully paid" is a derived flag, so
  delivery/handover and every existing status rule keep working.
- **Late fee rule**: `late_fee_pct` + `grace_days` on the **project** (sales settings), copied onto
  the booking at signing so a later change does not rewrite old agreements.

### 2.3 Flow

1. Booking created → booking money row only (as today, the booking money confirms the unit).
2. **Agreement signed** → schedule rows written from the terms (full: one balance row; installments:
   N rows from the first date, monthly). Same validation as Share Sale's `checkPlan`.
3. Plan edited after signing → only **unpaid** rows are rewritten (paid rows never move).
4. Each receipt → allocated late fee first, then the oldest row; the receipt shows which
   installment(s) it paid.
5. Last row paid → `fully_paid_on` set → booking page shows "Fully paid — ready for registration /
   handover".

### 2.4 Admin screens

- Booking → **Payments** tab: the same schedule table as Share Sale (row, due date, amount, paid,
  late fee, status), "Record payment", "Undo latest payment".
- Sales & CRM → **Buyers & Dues** (new menu item, like *Investors & Dues*): due this week,
  overdue, by project, with reminders. *Collections* stays as the receipts register.

### 2.5 Existing data

The v45 upgrade builds rows for every booking that has agreement terms (using today's
`expectedLines`) and replays its existing payments oldest-first to fill `allocations`. Per the
upgrade-path rule, the v45 upgrade only touches tables that exist at v45. Add a case to
`upgrade-path.test.ts`. The demo seed writes schedules for its bookings (some buyers behind).

### 2.6 Also, to make the two truly the same

Add `account_id` to `share_payments` so investor money also lands in **Cash Position** — today it
does not. Small change, same batch.

### 2.7 Optional: same signing wizard for bookings (§8, D2)

Reuse the Share Sale wizard shape for bookings: KYC (NID, father/spouse, address, nominee),
witnesses, stamp/notary, papers checklist. Worth it if the buyer portal will show the
agreement and papers; otherwise keep today's single form.

---

## 3. Item 2 — English instead of Bangla on the booking agreement

| Where | Now | Change to |
|---|---|---|
| `AgreementPanel.tsx` title | Agreement (চুক্তি) | Agreement |
| `AgreementPanel.tsx` rows | Kisti / First kisti | Installments / First installment |
| `AgreementPanel.tsx` empty text | "…(full or in kisti)…" | "…(in full or in installments)…" |
| `AgreementFields.tsx` | Number of kisti / Each kisti (BDT) / First kisti due + errors | Number of installments / Each installment (BDT) / First installment due |
| `PaymentPanel.tsx` | "…to track kisti dates" | "…to track installment dates" |
| `domain/booking.ts` | `Instalments (kisti)`, `Kisti 1 of N` | `Installments`, `Installment 1 of N` |
| `bookings/[id]/print` | "monthly kisti of…" | "monthly installments of…" |
| `customers/[id]` | "· N kisti" | "· N installments" |
| `DemoDataCard`, demo seed terms | "kisti" | "installment" |
| `lead-stages.ts` option | `Kisti` | `Installments` (old saved answers "Kisti" are shown as "Installments") |

Spelling: use **installment** (American, as Share Sale already does); the code currently mixes
"instalment" and "installment". Code comments and variable names (`kistiAmount`) may be renamed
in the same pass. Land module words (dolil, bayna) are out of scope unless asked (§8, D5).

---

## 4. Item 3 — Two customer types in Customers

**Problem:** `customer_type` holds one value, but one person can book a flat **and** buy shares.

**Rule:** a customer's roles are **worked out from their records** — has a booking → Buyer; has
a share purchase or request → Investor; both → both badges. `customer_type` stays as the type
chosen when the customer was created (for the new-customer form and filters with no records yet).

### Customers list
- Tabs: **All · Buyers · Investors** with counts (a "both" customer appears under both).
- Columns change with the tab: Buyers → units, total price, received, due, overdue.
  Investors → projects, shares / %, paid, due, overdue. All → combined total, received, due, and
  type badges.

### Customer detail
- Header: name, code, badges (Buyer / Investor), portal access status (login sent / not).
- Tabs shown only when they apply:
  **Overview** (combined tiles + split by type) · **Flats & Plots** (bookings) ·
  **Shares** (share purchases) · **Payments** (one ledger across both, filter by type) ·
  **Documents** (one list: booking papers + KYC uploads — `CustomerShareFile` widened).
- Actions: "New booking", "Reserve shares", "Send portal login".

---

## 5. Item 4 — Customer Portal for Buyers

**One portal, one login, for both types.** Same phone + OTP sign-in. What the customer sees
depends on their roles: a buyer-only customer never sees "Shares", an investor-only one never
sees "My homes".

| Section | Buyer sees |
|---|---|
| Home | Next payment card, total paid / due, construction progress of their building |
| My homes | One card per booking: project, tower, floor, unit, size, price, % paid |
| Home detail | Schedule table (same component), receipts, agreement summary, handover status (from Delivery), site progress photos |
| Payments | Pay an installment online — same mock gateway, receipt recorded with `channel: 'online'` into the gateway's account |
| Documents | Booking form, agreement, money receipts, allotment / handover papers, own uploads |
| Notifications | Due soon, overdue, payment received, handover scheduled |

### Build notes
- **Routes:** move the portal to `/customer/*` (Customer Portal for both), keep `/investor/*`
  redirecting so old links keep working.
- **Data access:** new `src/lib/repositories/customer-portal/buyer.repository.ts` that
  **whitelists** fields — never cost, discount approval notes, `booked_by`, commission, landowner
  or JV data. A test like `public-whitelist.test.ts` guards it.
- Reuse existing portal parts: `ScheduleTable`, `NextPaymentCard`, `CheckoutSteps`,
  `GatewayScreen`, `ReceiptPage`, `DocumentList`.
- Portal chooser card becomes "Customer Portal — for buyers and investors". Demo buyer login is
  seeded alongside the investor one.

---

## 6. Item 5 — Share Sale on the Public website?

### Recommendation
Yes, but **behind a website switch, off by default**, and built **after** the buyer portal.

Why behind a switch: offering ownership shares to the general public may be treated as a public
offer of securities in Bangladesh (BSEC rules). The client should confirm with their lawyer
before turning it on. Until then the investor portal (by invitation) keeps working as now.

### What it would look like
- New public page **/invest** (menu item shows only when the switch is on), plus an "Invest in
  this project" strip on the project page when it has an open round.
- The **same card** as the Investor portal's open rounds (`OpportunityCard` look): project, % on
  offer, price per share, shares left, minimum/maximum, plan options, closing date.
- **"Request to buy shares"** opens the same dialog (shares, plan, price worked out), plus:
  - **Signed-in customer** → request goes in exactly as today.
  - **Visitor** → name, phone, email added; the request is saved with these prospect details.
    No account is created — the office calls, then reserves (which creates the Investor customer,
    as Reserve already does) and sends the portal login.
- Admin → Share Sale → **Customer Requests** shows these with a "Website visitor" badge.

### Data (in the same or next Dexie version)
- `share_requests`: `customer_id` becomes nullable; add `prospect_name`, `prospect_phone`,
  `prospect_email`, `source ('portal'|'website')`.
- New public repository `share-offer.public.repository.ts` that whitelists: round code, project
  public info, % offered, price per share, shares left, min/max, down-payment minimum, max
  installments, frequency, closing date. **Never**: NAV / premium breakdown, who bought,
  late-fee internals, owner's retained share.
- Website settings: `show_share_sale_on_website` (default off).

---

## 7. Build order

| Batch | Work | Size |
|---|---|---|
| **B1** | English labels (§3) | small |
| **B2** | Shared ledger engine, `booking_installments` v45, payment allocation, late fee, booking Payments tab, Buyers & Dues, upgrade + tests, share payments → Cash Position (§2) | large |
| **B3** | *(if D2 = yes)* Booking signing wizard with KYC + papers | medium |
| **B4** | Customers list & detail for two types (§4) | medium |
| **B5** | Customer Portal for buyers, `/customer` routes, buyer repository + whitelist test, online pay (§5) | large |
| **B6** | *(if D4 = yes)* Public /invest page, visitor requests, website switch (§6) | medium |

Each batch: browser-verified once, demo seed updated, pushed.

---

## 8. Decisions needed

| # | Question | Recommended |
|---|---|---|
| D1 | Store a fixed installment schedule for bookings (reverses the 2026-10-22 decision)? | **Yes** — the portal needs it |
| D2 | Use the Share Sale signing wizard (KYC, witnesses, papers) for bookings too? | Yes, if buyers should see their papers in the portal |
| D3 | Late fee on buyer installments — same rule shape as Share Sale, set per project? | Yes, default 0% (off) |
| D4 | Share Sale on the public website? | Yes, behind a switch that stays off until legal sign-off |
| D5 | Also replace land-module Bangla words (dolil, bayna)? | No — they are accepted trade terms; only the sales side now |
