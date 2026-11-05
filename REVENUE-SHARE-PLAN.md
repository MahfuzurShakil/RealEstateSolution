# Revenue Share, Owner Equity, Sales Organisation & Commission — Plan

| | |
|---|---|
| **Version** | 0.1 (draft for review) |
| **Date** | 4 November 2026 |
| **Builds on** | PROJECT-SHARE-SALE-PLAN.md (share offerings, holdings, Customer Portal), DIRECT-PURCHASE-PLAN.md B5 (Partners, Fund), SALES-FLOW-PLAN.md (bookings) |
| **Status** | Plan only — nothing built. Section 9 lists the decisions to confirm before R1 starts. |

The client asked for four things that belong together:

1. **Revenue share** — a project that earns money (hotel, rented commercial floors, a resort) records its
   income and cost, works out profit or loss for a period, and shares the profit among everyone who
   owns it.
2. **Owner equity** — the part of the project not sold to the market belongs to the founders/owners,
   each by their own percentage, and they get profit from that part.
3. **Customer side** — each share buyer sees, in the Customer Portal, what every project earned them,
   and can ask for the money once their balance reaches a set amount.
4. **Sales organisation & commission** — a flexible hierarchy (founders → team leads → sales people,
   any depth) and commission paid in stages as the buyer pays.

---

## Contents

1. [How a real business runs this](#1-how-a-real-business-runs-this)
2. [Part A — Income, cost and the profit period](#2-part-a--income-cost-and-the-profit-period)
3. [Part B — Loss and how it was covered](#3-part-b--loss-and-how-it-was-covered)
4. [Part C — Who owns the project (cap table)](#4-part-c--who-owns-the-project-cap-table)
5. [Part D — Distribution, balances and withdrawal](#5-part-d--distribution-balances-and-withdrawal)
6. [Part E — Sales organisation (hierarchy)](#6-part-e--sales-organisation-hierarchy)
7. [Part F — Commission](#7-part-f--commission)
8. [Data model (Dexie v48)](#8-data-model-dexie-v48)
9. [Decisions to confirm](#9-decisions-to-confirm)
10. [Screens](#10-screens)
11. [Build batches](#11-build-batches)
12. [Worked example (demo data)](#12-worked-example-demo-data)

---

## 1. How a real business runs this

How hotels, rental buildings and shared-ownership projects in Bangladesh actually handle profit
sharing, and the two separations that keep it workable:

**Recording is daily; sharing is periodic.** A hotel's front desk closes the day's sales every night,
and bills arrive daily. But no one distributes profit daily — the paperwork, bank charges and tax
withholding would eat it. So the platform separates:

- **Entry frequency** — how income/cost is typed in: daily, or one total per month/quarter. A hotel
  types daily; a building rented to three tenants types monthly.
- **Distribution frequency** — how often profit is worked out and shared: monthly, quarterly,
  half-yearly or yearly. Each project chooses its own (the client's "project jevabe share korte chai").

**Profit is not the same as cash.** A period can show profit while the bank is empty (a loan
instalment is due, or a big repair is coming). So every period passes two checks before anything is
shared: *how much profit is there to share* (after past losses and reserves) and *how much cash can
actually go out*. Management declares an amount up to that limit — never above it, and it may keep
some back.

**Nothing is shared until someone approves it.** A period is prepared by Accounts, checked, then
approved and declared by management. Once declared, the split is frozen: a share bought tomorrow does
not change today's distribution.

**Everyone gets the same rate per share.** Customers and owners are paid from the same distribution,
in proportion to ownership. Owners are not paid "what is left" — they are paid for the shares they
still hold, exactly like a customer.

**Money is credited first, paid later.** A declared distribution credits each holder's profit
balance. The customer asks for payment (from the portal) once the balance is at least the minimum;
Accounts pays and records it. This avoids sending 300 bank transfers of Tk 1,215 every quarter.

---

## 2. Part A — Income, cost and the profit period

### 2.1 Revenue settings (per project)

Turned on per project from a new **Income & Profit** tab on the project page. A project without
revenue settings never shows the tab, so apartment/plot projects are unaffected.

| Setting | Options | Default |
|---|---|---|
| Entry frequency | Daily · Monthly totals · Quarterly totals | Daily |
| Distribution frequency | Monthly · Quarterly · Half-yearly · Yearly | Quarterly |
| First period starts | date (operation start) | — |
| Reserve (keep back) | % of profit, kept for repairs/sinking fund | 10% |
| Management fee | % of income or of profit, or a fixed taka per period, paid to the operator | none |
| Tax withheld on profit paid | % (source tax on payouts to holders) | 10% |
| Past losses | Recover first (no sharing until past losses are covered) · Ignore | Recover first |
| Who shares | Fully paid holders only · Signed holders, in proportion to what they have paid · All signed holders in full | Signed holders, in proportion to what they have paid |
| Bought mid-period | Share from the record date · Count days held in the period | Count days held |
| Minimum withdrawal | taka | Tk 5,000 |
| When customers can withdraw | Any time · Only after a period is declared, within N days · A fixed day each month | Any time |
| Unpaid dues | Pay out in full · Adjust against overdue installments first | Adjust against overdue first |

Income and cost **heads** are lookup lists (`revenue_income_head`, `revenue_expense_head`) so each
business type keeps its own: Room rent, Food & beverage, Hall booking, Shop rent, Service charge,
Parking … / Salary, Utilities, Maintenance, Marketing, Government fees, Loan interest, Other.

### 2.2 Recording income and cost

One entry form, both directions:

- date, **income or cost**, head, amount, the bank/cash account it went into or came out of,
  reference (invoice/voucher no.), note, attachment (bill photo).
- A **daily sheet** view for daily-entry projects: one row per day with a column per head, typed like
  a register. A monthly-entry project gets one row per month.
- Entries are locked once their period is approved; corrections after that go in the next period as
  an adjustment line, never by editing a closed period.
- Income/cost reaches **Cash Position** through its account, like every other receipt and payment.

Revenue entries are kept apart from construction costs on purpose: building the hotel is
capital cost (Costs tab, Fund); running it is operating cost (this tab). A project can have both.

### 2.3 The period and its profit statement

Periods are generated from the settings (Q1 Jan–Mar, Q2 Apr–Jun …). Each period shows:

```
  Income (by head)                                   50,00,000
− Operating cost (by head, incl. loan interest)      32,00,000
= Operating profit / (loss)                          18,00,000
− Past loss still to recover                                 0
− Reserve 10% (of profit after past loss)             1,80,000
− Management fee                                             0
− Loan principal due this period (cash check)         3,00,000   ← only if "repay loans first"
= Available to share                                 13,20,000
  Declared by management                             13,20,000   (≤ available; may keep back)
```

Status flow (ENUM in code):

```
open → closed (Accounts) → approved (Management) → declared → (all paid shows as "settled", read, not stored)
          ↑ reopen allowed until approved            ↘ cancelled (before declared only)
```

- **closed**: no more entries for the period; the statement is frozen for review.
- **approved**: the figures are accepted; the declared amount is set.
- **declared**: the **record date** is fixed, the cap table is snapshotted, and every holder's share
  is written (Part D). This is the point of no return; a mistake after this is fixed by an adjustment
  in the next period.

---

## 3. Part B — Loss and how it was covered

The client: *"Lub ba loss hoite pare. Abar loss koi theke ene oita chalailo, human theke loan niche bank theke niche."*

When a period closes with a loss, two separate things are recorded, because they are separate in
real life:

**1. The loss itself** is carried forward. Under "Recover first", later profit first fills the hole
before anything is shared. The statement shows *past loss still to recover* until it reaches zero.
No one is asked to pay back a loss — holders simply receive nothing until the project is back in
profit.

**2. The cash that kept the business running** — where the money to pay salaries and bills came
from. The period's loss screen asks *"How was this covered?"* and takes one or more lines:

| Source | Records |
|---|---|
| **Loan from a person** | lender name, phone, NID (optional), amount, interest % (0 allowed — common between relatives), repay by |
| **Loan from a bank** | bank, branch, loan/OD account no., amount, interest %, tenure, instalment |
| **Owner / partner put money in** | which partner; as a **loan** (paid back first, before profit) or as **extra capital** (raises nothing, just recorded) |
| **From the reserve** | the reserve kept from earlier profitable periods |
| **From company funds** | the company pool (existing Fund) |

Each loan becomes a **loan record** (`LON-2026-001`) with its own repayment schedule. Taking the money
writes the existing fund receipt (`source_type: loan`) so the cash appears in the account exactly as
today; the loan record adds what was missing — who, at what interest, and how much is still owed.

Repayments: interest is an operating cost of the period it is paid in; principal is not a cost but
comes out of cash, so with **"repay loans first"** on, principal due in the period is deducted from
what can be shared (the cash check in §2.3). A **Loans** list shows every loan across projects:
lender, taken, repaid, outstanding, next due.

---

## 4. Part C — Who owns the project (cap table)

Today ownership is spread across two places that already work and are reused, not copied:

- **Share Sale** — what customers bought: each holding's `share_pct` (offering's % ÷ shares × shares
  bought).
- **Partners** — who owns the rest: company partners by their company %, and project-only investors
  (`splitProject` in fund.repository.ts).

The **cap table** puts them on one page per project, always adding to 100%:

| Holder | Type | Shares / basis | Ownership |
|---|---|---|---|
| Market — 2,500 shares sold | customers (list below) | 2,500 × 0.01% | 25.00% |
| Unsold from open/closed offerings | owners | 1,500 × 0.01% | 15.00% |
| Never offered | owners | — | 60.00% |
| **Owners' part (75%), split by partner %** | | | |
| Karim (50% of company) | partner | | 37.50% |
| Rahim (30%) | partner | | 22.50% |
| Selina (20%) | partner | | 15.00% |

Rules:

- **Owners' part = 100% − shares held by customers.** Unsold shares and never-offered parts both
  belong to the owners. A share that is released or cancelled returns to the owners automatically.
- The owners' part is split by the existing partner rule: project-only investors take their % first,
  company partners share the rest in their company proportions. The client's "20 people started the
  business" is 20 company partners, each with their %, set on the Partners page as today.
- The cap table can be read **as of any date**, which is what a declaration snapshots on its record
  date.
- Changes to partner % take effect from a date (`effective_from`) so an old period is never re-split
  by a later change. *(New: partner share history — see §8.)*

---

## 5. Part D — Distribution, balances and withdrawal

### 5.1 Declaring

On **Declare**, for the declared amount *D*:

```
each holder's gross = D × holder's ownership % on the record date × eligibility factor
eligibility factor  = 1                                  (fully paid / all signed)
                    = paid ÷ price on the record date    (pro-rata by payment)
                    × days held in period ÷ days in period   (if "count days held")
```

What a customer cannot receive because of eligibility (unpaid part, days not held) goes to the
**owners**, since they carried that part of the project. The figures always add back up to *D*.

Each line then takes **tax withheld** (policy %) → **net credited**. One row per holder per period is
written to `profit_allocations`, frozen.

### 5.2 Profit balance

Every holder (customer **and** partner) has a profit balance per project:

```
balance = net credited − paid out − in a pending withdrawal − adjusted against dues
```

If "adjust against overdue dues first" is on and the customer has overdue installments on that
project's holding, the credit pays the overdue installment first (as a payment through the existing
share ledger, method `profit_adjustment`) and only the remainder reaches the balance.

### 5.3 Withdrawal request (Customer Portal)

The client: *"ekta specific time, ekta amount hoile customer request korte pare tar tk gula niyar jonno."*

- The portal's new **Earnings** page shows: balance per project, every period's figures for each
  project (income, cost, profit, the customer's share, tax, net), and a chart over time.
- **Request payout** is enabled only when the balance ≥ minimum withdrawal **and** the request window
  is open (§2.1). The customer picks the amount (up to balance) and the receiving method — their bank
  account on file, or a mobile wallet number.
- Status: `requested → approved → paid` or `rejected` (with reason). The amount is held from the
  balance while requested.
- Accounts pays from **Share Sale → Profit Withdrawals**: account paid from, date, reference.
  The customer gets a notification and a downloadable **payout advice** (also showing the tax
  withheld for their tax return).
- Partners don't use the portal; Accounts records partner payouts from the Partners page
  (same table, holder type partner).

### 5.4 What changes on the customer profile

- Portal **Profile / Investments**: per holding — ownership %, profit earned to date, last period,
  balance.
- Admin **Customer** page: an Earnings tab with the same figures plus withdrawal history.
- Portal home: "Your Q3 2026 profit from Grand Palace Resort: Tk 1,215 credited" notification.

---

## 6. Part E — Sales organisation (hierarchy)

The client's example: 20 founders; under each founder one team lead; under each lead, sales people.
Other businesses will want two levels, or five. So the hierarchy is a **free tree**, not fixed roles.

- **Designations** are a lookup list with a rank (Founder, Director, GM, Team Lead, Senior Sales,
  Sales Executive, Freelance Agent …). The client edits names and order; nothing in code depends on
  a particular name.
- **Members** (`org_members`, `ORG-001`): name, phone, designation, **reports to** (another member,
  or top level), joined/left dates, status. A member may be linked to:
  - a **User** — staff who log in to the admin portal (existing users table), and/or
  - a **Partner** — a founder who also owns part of the company, and/or
  - nobody — an outside agent who earns commission but never logs in.
- **Org chart** screen: collapsible tree, drag a person under someone else, add a member under a
  node, filter by designation, team size and sales totals per branch.
- **Moving someone keeps history.** A move records the effective date; commission on a sale is always
  worked out from the tree **as it was on the sale date**, so moving a sales person to a new lead does
  not move their old commissions.
- Every sale gets a **sold by** member: share purchases (`share_sales.sold_by_member_id`, new) and
  bookings (`bookings.sold_by_member_id`, new, defaulting from the existing `booked_by` user's member).

---

## 7. Part F — Commission

### 7.1 Commission plan

A **plan** (`CMP-001`) says how much is earned and when it is released. Plans are flexible because the
client will want different rules per project and per kind of sale.

| Field | Options |
|---|---|
| Applies to | Share sales · Unit/plot bookings |
| Scope | All projects (default plan) · one project · one share offering |
| Seller earns | % of sale price · fixed taka per share · fixed taka per unit/sale |
| Released in stages | ordered list of stages, each: **when** + **how much** |
| Uplines also earn (override) | per designation: % of sale price or fixed taka, released by the same stages |
| If the sale is cancelled | unreleased stages are void; released-but-unpaid is void; already paid is **recovered from future commission** (or written off — option) |
| Effective from / to | date range; the plan in force on the sale date applies |

Stage triggers (read from the existing payment ledgers, no manual marking):

- Agreement signed / booking confirmed
- Down payment received
- Paid ≥ X% of price (any X: 25, 50, 75 …)
- Fully paid
- Handover / certificate issued

"How much" per stage is either a **% of that person's total commission** or a **fixed taka**.

The client's example, written as a plan: *share sold, 10% commission; booking + down payment → part,
half paid → part, full paid → the rest.*

| Stage | Release | On a Tk 1,00,000 share: seller 10% = Tk 10,000 | Team Lead override 1% = Tk 1,000 | Founder override 0.5% = Tk 500 |
|---|---|---|---|---|
| Agreement + down payment | 20% | 2,000 | 200 | 100 |
| 50% paid | 30% | 3,000 | 300 | 150 |
| Fully paid | 50% | 5,000 | 500 | 250 |

Or fixed: Tk 100 per share, released Tk 20 / Tk 30 / Tk 50.

### 7.2 How commission flows

1. On the sale, the plan in force is attached and the **chain snapshotted** (seller, their lead, the
   founder above — from the tree on the sale date). One **commission line** per person per stage is
   created as `pending`.
2. When a payment pushes the sale past a stage, that stage's lines become **earned** automatically.
3. Accounts approves earned lines (single or in bulk) → **payable**.
4. A **payout** (`CPO-2026-001`) pays a member all their payable lines at once (monthly is typical),
   with tax withheld if set (AIT on commission), from an account; Cash Position sees it.
5. Cancellation applies the plan's rule; recovered amounts show as a negative line on the member's
   next payout.

Line status (ENUM): `pending → earned → approved → paid`, or `void`, `recovered`.

### 7.3 Commission screens

- **Commissions** list: by member, project, sale, stage, status; totals earned/approved/paid.
- **Member statement**: each sale, its stages, what is released, paid and still to come.
- **Team view** on the org chart: a lead sees their branch's sales and commissions.
- *(Later, if wanted: sales people see their own statement by logging in — see decision 9.)*

---

## 8. Data model (Dexie v48)

New tables only, one new `version(48)` block (AGENTS.md rule). All entities carry `id, created_at,
updated_at, created_by`. Statuses are ENUMs in code; heads and designations are `lookup_values`.

| Table | Code | Key fields |
|---|---|---|
| `revenue_policies` | — | project_id (unique), entry_frequency, distribution_frequency, first_period_start, reserve_pct, mgmt_fee_type/value, tax_withholding_pct, loss_rule, eligibility_rule, prorate_days, repay_loans_first, min_withdrawal, withdrawal_window, withdrawal_window_days, adjust_overdue_first |
| `revenue_entries` | `REV-2026-0001` | project_id, entry_date, direction (income/cost), head, amount, account_id, reference_no, notes, period_id (set when the period closes) |
| `revenue_periods` | `RVP-2026-001` | project_id, period_start, period_end, label, status, totals snapshot (income, cost, operating_profit, loss_brought_in, loan_principal_due, reserve, mgmt_fee, available, declared, loss_carried_out), record_date, approved_by/on, declared_by/on |
| `loss_coverings` | — | period_id, source (person_loan, bank_loan, partner_loan, partner_capital, reserve, company_fund), loan_id?, amount |
| `loans` | `LON-2026-001` | project_id, lender_type (person/bank/partner), lender_name, partner_id?, phone, bank_branch, loan_account_no, principal, interest_pct, taken_on, repay_by, instalment, fund_receipt_id, status (active/repaid/written_off) |
| `loan_repayments` | `LRP-2026-001` | loan_id, paid_on, principal, interest, account_id, period_id? |
| `partner_share_history` | — | partner_id, share_pct, effective_from |
| `profit_allocations` | — | period_id, project_id, holder_type (customer/partner), customer_id?, partner_id?, share_sale_id?, ownership_pct, eligibility_factor, gross, tax_withheld, adjusted_to_dues, net_credited |
| `profit_withdrawals` | `WDR-2026-001` | holder_type, customer_id?, partner_id?, project_id, amount, method, bank/wallet snapshot, status, requested_on, decided_by/on, reject_reason, account_id, paid_on, reference_no |
| `org_members` | `ORG-001` | name, phone, designation, parent_id, user_id?, partner_id?, joined_on, left_on, status |
| `org_moves` | — | member_id, from_parent_id, to_parent_id, effective_date |
| `commission_plans` | `CMP-001` | name, applies_to, project_id?, offering_id?, seller_basis/value, stages[], overrides[], cancel_rule, effective_from/to, status |
| `commission_lines` | — | plan_id, sale_kind (share/booking), share_sale_id?, booking_id?, project_id, member_id, role (seller/override), designation_at_sale, stage_key, amount, status, earned_on, approved_by/on, payout_id |
| `commission_payouts` | `CPO-2026-001` | member_id, lines_total, recovered, tax_withheld, net, account_id, paid_on, reference_no |

Additions to existing tables (new fields; the two indexed ones go in v48's store strings):
`share_sales.sold_by_member_id` (indexed), `bookings.sold_by_member_id` (indexed),
`share_payments.method` gains `profit_adjustment`.

Repositories (UI never calls Dexie): `revenue.repository.ts`, `loan.repository.ts`,
`cap-table.repository.ts`, `profit-distribution.repository.ts`, `org.repository.ts`,
`commission.repository.ts`, plus whitelisted portal reads in `repositories/investor/`.
Pure maths in `domain/revenue-share.ts` and `domain/commission.ts`, unit-tested. Upgrade path test
updated (dexie-upgrade-path rule).

Public website: none of this is public. The investor-facing figures go through the Customer Portal's
own repositories, which show a customer only their own holdings, their share of each period, and the
period's headline totals — never partner splits, loans or other holders.

---

## 9. Decisions to confirm

Each has a recommended default so the build can start; the client can change any of them later
because they are settings, not code.

1. **Which projects earn revenue?** Any project where revenue is switched on (recommended), or only
   share-sale projects.
2. **Who shares in a period** — recommended: signed holders in proportion to what they have paid,
   counting days held. Alternative: fully paid only.
3. **Past losses** — recommended: recover first, then share.
4. **Loan repayment before sharing** — recommended: yes, principal due in the period comes off first.
5. **Reserve %** and **management fee** — numbers from the client per project.
6. **Tax withheld** on profit and on commission — % to confirm with their accountant.
7. **Minimum withdrawal and window** — recommended Tk 5,000, any time.
8. **Unpaid installments** — recommended: profit pays overdue installments first.
9. **Do sales people log in** to see their commission? Recommended: not now; statements are printed
   or shared from admin. A sales/agent portal can follow.
10. **Do owners/partners log in** to see their profit? Recommended: not now; they see it in admin.
11. **Commission on bookings too**, or share sales only first? Recommended: build the engine for both;
    switch on bookings when the client gives a plan.
12. **Cancellation after commission paid** — recover from future commission (recommended) or write off.

---

## 10. Screens

**Admin**

| Where | Screen |
|---|---|
| Project → **Income & Profit** tab | Settings · Daily/monthly register · Periods list → Period statement (close, approve, declare, loss covering) · Cap table · Loans for this project |
| Share Sale → **Profit Distributions** | All declared periods across projects, per-holder lines, export |
| Share Sale → **Profit Withdrawals** | Requests queue (approve / reject / pay), paid history |
| Accounts → **Loans** | All loans, repayments, outstanding, next due |
| Partners page | Partner profit balance and payouts; share % history |
| **Sales Team** (new menu) | Org Chart · Members · Commission Plans · Commissions · Payouts |
| Customer page | Earnings tab |
| Owner dashboard | Profit this period, declared to date, loans outstanding, commission payable |

**Customer Portal**

| Page | Content |
|---|---|
| **Earnings** (new) | Balance per project, period-by-period table, chart, Request payout |
| Investments | Ownership %, earned to date, last period per holding |
| Notifications | Period declared, payout approved/paid/rejected |
| Receipts | Payout advice PDFs alongside payment receipts |

All popups follow POPUP-SYSTEM.md.

---

## 11. Build batches

Each batch: built, unit-tested, browser-verified once, demo data added, pushed — same workflow as
before.

| Batch | Scope | Depends on |
|---|---|---|
| **R1** | Dexie v48, types, lookups; revenue settings; income/cost entry + daily register on the project's Income & Profit tab; entries reach Cash Position | — |
| **R2** | Periods: generate, close, statement with the full waterfall; approve; past-loss carry-forward | R1 |
| **R3** | Loss covering + Loans (person/bank/partner), repayments, Loans list; cash check in the statement | R2 |
| **R4** | Cap table (as of a date), partner share history; Declare → allocations; Profit Distributions list; partner balances | R2 |
| **R5** | Customer Portal Earnings + Request payout; admin Profit Withdrawals (approve/reject/pay); adjust against overdue; notifications; payout advice | R4 |
| **R6** | Sales organisation: designations, members, org chart with moves and history; sold-by on share sales and bookings | — (can run beside R1–R5) |
| **R7** | Commission plans; lines created on sale; stages earned from payments; approve; payouts; cancellation rule; member statement | R6 |
| **R8** | Owner dashboard tiles, demo data for the worked example, demo walkthrough doc, QA pass | all |

R6–R7 do not touch the revenue tables, so they can be built in parallel with R1–R5 if wanted.

---

## 12. Worked example (demo data)

**Grand Palace Resort** (existing share-sale demo project). Offering round 1: 40% offered as 4,000
shares of 0.01% each at Tk 1,00,000. 2,500 shares sold → customers hold 25%, owners 75%
(Karim 50% / Rahim 30% / Selina 20% of company → 37.5% / 22.5% / 15%).

Settings: daily entry, quarterly sharing, reserve 10%, tax 10%, recover losses first, repay loans
first.

**Q1 2026** — income 50,00,000, cost 32,00,000 → operating profit 18,00,000. Bank loan principal due
3,00,000. Reserve 10% of 18,00,000 = 1,80,000. Available 13,20,000; declared 13,20,000.

| Holder | Ownership | Gross | Tax 10% | Net credited |
|---|---|---|---|---|
| Customer A, 10 shares, fully paid | 0.10% | 1,320 | 132 | 1,188 |
| Customer B, 20 shares, half paid | 0.20% | 2,640 × 50% = 1,320 | 132 | 1,188 (other 1,320 → owners) |
| All customers | 25% | ≤ 3,30,000 (less unpaid parts) | | |
| Owners (Karim/Rahim/Selina) | 75% + unpaid parts | ≥ 9,90,000 | | |

**Q2 2026** — income 30,00,000, cost 36,00,000 → **loss 6,00,000**. Covered by Rahim, partner loan
4,00,000 at 0%, and Sonali Bank OD 2,00,000 at 12%. Nothing shared; loss carried forward 6,00,000.

**Q3 2026** — operating profit 10,00,000 − past loss 6,00,000 = 4,00,000; − reserve 40,000 − loan
principal 2,00,000 → available 1,60,000. Customer A's 0.10% → 160 − 16 tax = 144 credited. Balance now
1,332 — below the Tk 5,000 minimum, so **Request payout** stays disabled with "Tk 3,668 more to reach
the minimum".

**Commission** — Sales Executive Tania (under Team Lead Imran, under founder Karim) sold Customer A's
10 shares (Tk 10,00,000) on the plan in §7.1: Tania 10% = 1,00,000 (20,000 released at down payment,
30,000 at half, 50,000 at full); Imran 1% = 10,000; Karim 0.5% = 5,000, released by the same stages.
