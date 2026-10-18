# Direct Purchase, Work-Item Budget and Fund — Plan

Client meeting, 2026-10-18. Status: **B1–B6 built (2026-10-18); B7 (demo walkthrough) next.** Partner "used" = their share of what projects paid out of partners' money (paid cash split pro rata across capital, loans and buyer payments); opening account balances count as partners' existing equity by share. Decisions in §9 taken as proposed.

## 1. Why

Procurement (request → approve → PO → receive → bill → voucher → pay) suits a
large developer with a store and a purchase team. Most of our target customers
are **small developers**: the owner or site engineer buys what the work needs,
pays from the project's money, and wants to see:

- what each piece of work was supposed to cost,
- what it has actually cost so far,
- how much money is left and whose it is.

So we add a second, simpler path — **Direct Purchase** — and make it the focus
of the demo. Both paths stay; a company switch decides which menus are shown.

```
Project → Planning / Design / Approval → Construction
                                            │
                     Tower → Work items (Foundation, Structure, …)
                                            │
                       Budget per work item (template + own lines)
                                            │
                Direct purchase (cost + attachment)  ── actual cost
                                            │
                     Payments: Pending → Paid (from a fund account)
                                            │
                Cash position / Fund: who put in how much, what is left
```

## 2. Work-item budget

**Today:** a work item has name, weight %, planned dates, progress. No money.

**New:** each work item gets budget lines.

| Field | Note |
|---|---|
| `work_item_id` | the Foundation of Tower A, etc. |
| `cost_type` | enum: `material`, `labour`, `machinery_rent`, `transport`, `subcontract`, `utility`, `other` |
| `description` | "Piling", "Rod 16mm", "Excavator rent" |
| `quantity`, `unit`, `rate` | optional — a line can also be a lump sum |
| `budgeted_amount` | the figure that counts |

**Templates.** When a work item is opened for budgeting, the screen offers the
usual lines for that kind of work (Foundation: excavation, piling, shuttering,
rod, cement, sand, stone chips, machinery rent, labour…), each with a typical
rate. The user ticks the ones that apply, edits amounts, adds own lines. The
templates live in Master Data (`work_item_budget_templates`), so the company
can tune them; rates are per sqft / per floor so a bigger tower scales up.

The tower's budget = sum of its work items; the project's construction budget
= sum of its towers. This feeds the existing Finance project page as the
`construction` head.

## 3. Direct Purchase (the actual cost)

Recorded from the Construction workspace, against a work item (and optionally
one of its budget lines).

| Field | Note |
|---|---|
| `code` | `DP-2026-001` |
| `project_id`, `tower_id`, `work_item_id`, `budget_line_id?` | where the cost goes |
| `cost_type` | same enum as the budget, so budget vs actual lines up |
| `description` | "Excavator rent, 3 days" |
| `vendor_name` / `supplier_id?` | free text for small vendors; a supplier when one exists |
| `quantity`, `unit`, `rate` **or** lump sum | same per-unit / lump-sum choice as PO lines |
| `amount` | the cost |
| `purchase_date` | |
| `is_asset` | machinery **bought**, not rented: kept as a company asset, not charged to the work item in full |
| attachment | **required** — bill, challan, muster roll, photo. Cannot save without one |
| `payment_status` | derived: `pending` → `part_paid` → `paid` |

Rules:
- **Actual cost = the direct purchase when it is recorded**, not when it is paid.
  Paying later does not change the cost, it only clears the liability.
- Labour is a direct purchase with `cost_type = labour` (a weekly muster roll
  as the attachment) — no separate labour module for now.
- Material bought this way can optionally add to site stock later; for the demo
  it is charged straight to the work item.

## 4. Payments menu

New menu **Payments** (Finance group, shown first):

- **Pending** — every direct purchase with money still owed: vendor, work item,
  amount, paid, due, age.
- **Pay** — pick the account, amount (part or full), method, reference.
  Refused if the account does not hold the money; the dialog shows the
  account's balance before you choose.
- **Paid** — history, with the payment voucher printable.

Table `direct_purchase_payments`: `purchase_id`, `account_id`, `amount`,
`payment_date`, `payment_method`, `reference_no`, `paid_by`.

## 5. Fund — where the money comes from

The terms from the meeting, in plain words:

| Term | Meaning here |
|---|---|
| **Account** | where money physically sits: a bank account, bKash, cash box (exists today). |
| **Fund / source of amount** | why the money is there: a partner's capital, a loan, customer collections. |
| **Partner / contribution** | 2–3 people run the business; each puts in capital, possibly in different amounts and % shares. |
| **Parent fund** | the company pool. Money is allocated from it to a project; the project spends from its allocation. |
| **Remaining** | allocated/received for a project − paid out of it. |
| **Who spent how much** | every payment records the user who made it. |
| **Asset** | something bought that keeps value (a mixer machine) — kept on the books, not lost into one work item. |
| **GL (general ledger)** | the full book where every taka in and out is posted as debit/credit. Phase 2 of this plan derives a simple ledger view; full double-entry GL is later. |

New tables:

- `partners` — name, phone, NID, `share_pct` (company level).
- `project_partners` — per project override: partner, `share_pct` (a project
  may have different partners or %).
- `fund_receipts` — money in that is not a sale: `source_type`
  (`partner_capital`, `loan`, `other`), `partner_id?`, `project_id?`,
  `account_id`, `amount`, `date`, attachment.
- `fund_allocations` — parent → project: `project_id`, `amount`, `date`.

Screens (all under **Cash Position**, which becomes the fund home):

1. **Accounts** — balance per account (opening + collections + fund receipts −
   payments − expenses − refunds). The "can I pay?" check reads this.
2. **Project fund** — per project: received (capital + collections +
   allocations), spent (direct purchase payments + expenses), remaining.
3. **Partners** — per partner: contributed, share %, share of cost so far
   (cost × share %), balance (contributed − share of cost). Answers "whose part
   has been used and how much is left".
4. **Ledger** — every movement in date order with running balance (the simple
   GL view).

## 6. Alerts

Computed on read, shown as a bell in the top bar, on the Construction list and
on each work item:

| Alert | When |
|---|---|
| Budget nearly used | actual ≥ 80% of a work item's budget |
| Over budget | actual > budget (never blocks — transparency, not restriction) |
| Spending ahead of work | spent % − progress % ≥ 15 points |
| Payment overdue | a pending direct purchase older than N days (setting) |
| Low fund | a project's remaining fund < its pending payments |

## 7. Hiding procurement for the demo

Company Settings → **Purchase mode**: `direct` (default) / `procurement` /
`both`.

- `direct`: hide Procurement menu, Supplier Vouchers, the Materials-tab request
  and receive actions, and Finance pages tied to POs. Data stays; nothing is
  deleted.
- `procurement`: today's behaviour.
- `both`: everything.

## 8. Build order

| Batch | What | Demo-able result |
|---|---|---|
| **B1** | Purchase-mode switch; hide procurement | Clean menu for the demo |
| **B2** | Work-item budget lines + templates | Foundation budget from template, own lines added |
| **B3** | Direct purchase with required attachment | Machinery rent, labour, material costs on Foundation; budget vs actual |
| **B4** | Payments menu (pending → paid), account balance check | Pay the excavator rent part now, rest later |
| **B5** | Partners, fund receipts, allocations, project fund, partner view, ledger | "Karim put in 60 lakh, Rahim 40 lakh; 35 lakh spent; Karim's part left…" |
| **B6** | Alerts | Foundation shows "92% of budget used, work 60% done" |
| **B7** | BD demo data + walkthrough script | One project told end to end through direct purchase |

Each batch: new Dexie `version(n)` block, repositories only, demo seed updated,
browser-checked, pushed.

## 9. Decisions needed

1. **Partners: company level or per project?** Proposed: company level with a
   per-project override.
2. **Cost recognised on record, not on payment?** Proposed: on record.
3. **Payment with not enough money:** block, or allow with a warning?
   Proposed: block (a negative cash box is not real).
4. **Template rates:** per sqft of the tower's floor area, or a fixed figure
   per work item? Proposed: per sqft, so templates scale.
5. **Bought machinery (asset):** charge a rent-like share to each project, or
   just list as an asset for now? Proposed: list as asset for now.
