# Share Sale feedback plan (2026-11-02)

> **Status: all batches S1–S8 shipped** (2026-11-03). Changes from the plan
> while building: the offering's close date has no 30/60/90-day buttons and
> the premium stays a dropdown with clearer names (client, round 2); the
> schedule has no totals strip of its own, since the Money card / booking
> tiles already show them; the booking Payments tab keeps its receipt table
> for print and delete. Waiting items are in OPEN-ITEMS §0u.

Client feedback on **New share offering**, **Sign agreement**, a new
**offline payment** flow on the Customer Portal, and (second round, part D) the
**purchase page**: menu highlight, Agreement tab, documents design, long
payment schedules, and hiding cancel/undo. Each point is weighed against
common practice. Where the plan differs from what was asked, it says why.

Files in play:
- `src/components/admin/share-sale/OfferingForm.tsx`: new / draft offering
- `src/components/admin/share-sale/SignAgreementWizard.tsx`: share agreement
- `src/components/admin/bookings/SignBookingWizard.tsx`: the booking twin (B3). **Every wizard change below applies to both** so the two stay alike.
- `src/components/admin/share-sale/ShareDocuments.tsx`: papers checklist (also used by bookings and the customer page)
- `src/components/investor/pages/CheckoutPage.tsx`, `src/lib/repositories/investor/investor.repository.ts`: portal payments
- `src/app/admin/share-sale/requests/page.tsx`: Customer Requests inbox

---

## A. New share offering

### A1. Premium: clearer than a "% of NAV" dropdown
**Feedback:** the dropdown wording is unclear.
**Plan:** replace the dropdown with a two-option toggle in the field, **"৳ Amount" | "% of NAV"**, labelled **"Premium over NAV"**.
Always show the other form underneath, e.g. typing 25% shows "= ৳22.5 Cr" and typing ৳22.5 Cr shows "= 25% of NAV".
When an existing draft is edited, the form opens in amount mode with the % shown underneath. Today the % is lost on reload.
*Practice:* valuation forms usually take an absolute premium and show it as a % markup, so both numbers stay visible.

### A2. "Valid for (days)" → date picker
**Feedback:** use a date.
**Plan:** **"Offer closes on"** date picker (earliest: tomorrow), with quick chips **+30 / +60 / +90 days**. The hint shows "Open for N days".
One catch: an offering is a *draft* until someone opens it, and **Open offering** already asks for "Opens on". So:
- The draft stores the chosen `closes_on` (the field already exists on `ShareOffering`).
- The Open modal shows *Opens on* plus *Closes on*, pre-filled from the draft and editable. If the date has already passed, the modal asks for a new one.
- `validity_days` stays as a derived number (closes − opens + 1) so existing records, Extend and the portal keep working.
*Practice:* subscription and offer periods are published as open and close **dates**, not as a day count.

### A3. Late fee: two types now, a third later
**Decided (2026-11-02):** build **two** types now. The third waits for the client's confirmation.
**Plan:** a **"Late fee type"** select:
| Type | Example | How it is charged |
|---|---|---|
| % of the late installment (today) | 2% | Once, when the grace days run out |
| Fixed amount | ৳2,000 | Once per late installment |

Grace days apply to both types.
The likely third type is a monthly rate on the overdue amount, with a cap. It goes to OPEN-ITEMS. The enum leaves room for it, so adding it later is a small change.

Data: `ShareOffering` gains `late_fee_type` (`pct_once` | `fixed_once`, an enum in code) and `late_fee_amount`. `late_fee_pct` stays as is. A missing type reads as `pct_once`, so no back-fill is needed. These fields are not indexed, so no new Dexie version is needed.
`installment-ledger.ts` `FeeRule` learns both types, with unit tests for each.
Bookings keep their own `late_fee_pct` for now and can adopt the types later (OPEN-ITEMS).

### A4. Buttons under the form
**Plan:** move **Cancel** (outline) and **Save as draft** (primary) to a right-aligned footer under the last card in the left column, the way the other forms do it. Any error shows just above the buttons.
The "Offer at a glance" card stays sticky on the right with no buttons, and its "Saved as a draft…" note moves to the footer.

---

## B. Sign agreement wizard (share + booking)

### B1. Save buttons: names, colours, position
Today the top bar holds *Start over · Save · Save and exit*, and the bottom holds *Back / Next*. Plan, with **one footer under the form**:

```
[← Back]                       [Save draft & exit]  [Next: Customer →]
                                 outline / grey       primary teal
```
- **Remove the separate "Save".** Every step change already saves, and leaving the page saves too (the code does both today).
- **"Save and exit" → "Save draft & exit"** (outline). It says what happens to the work.
- The last step's primary button is **"Sign agreement"** (B5).
- A small status line stays above the footer ("Draft saved 2 min ago").
- **"Start over" is removed**, as asked. A wrong value is simply edited. Throwing away a whole draft is rare and risky, and the draft also goes when the reservation is cancelled.

### B2. Field alignment and sub-groups (steps 2 and 3)
**Problem:** the small grey capital-letter labels ("NOMINEE") don't separate the groups, and the column counts change from group to group (3, then 4, then 3), so fields don't line up.
**Plan:**
- A shared **`FormGroup`** block: a **bold title** (`text-sm font-semibold`), an optional one-line hint, and a thin divider above. The fields sit under it.
- **One grid for every group:** 2 columns on tablet, 3 on desktop. Addresses always span the full width. Fields then line up from group to group.
- **Step 2, Customer:** *Identity* (name, father's/spouse's name, NID, date of birth, e-TIN, profession) → *Contact & address* (email, present address, permanent address with a **"Same as present address"** tick) → *Nominee* (name, relation, mobile, NID) → *Bank account for payouts* → *KYC* (checked on).
- **Step 3, Signatures:** *Company signatory* (name, designation) → *Witness 1* and *Witness 2* as two side-by-side mini cards (name, NID/mobile, address) → *Customer's attorney* (optional, collapsed behind "Signed under a power of attorney?") → *Stamp & notary*.
- Step 1 uses the same blocks: *Signing* → *Payment plan*.

### B3. Step 4, papers
This step uses the **one document design from D3**, the same as the purchase page's Documents tab, so it is built once:
- **Required asterisk:** each required paper's title gets a red `*`, and the "Required papers" heading stays.
- **Upload always opens the shared Upload dialog**, for required and other papers alike. The paper type is fixed when a row's Upload is used.
- **File actions on the same line as the file:** **View** (the shared preview popup) · **Replace** · **Remove**. The separate wrapped line that is easy to miss goes away.
  - *Remove* asks for confirmation. It works on files the office uploaded.
  - A file the **customer** sent from the portal can't be removed; the office uses **Send back** with a reason instead, which keeps the audit trail (usual KYC practice).
- **Other papers** use the same rows and the same dialog.

### B4. Step 5: "Review" (not "Review & sign")
- Rename the step to **Review**.
- A full read-only summary, **grouped the same way as the steps**. Each group gets a card with its title and an **Edit** link that jumps back to that step:
  1. Agreement & plan, with the **full installment schedule** table
  2. Customer: Identity / Contact / Nominee / Bank / KYC
  3. Signatures, witnesses, stamp & notary
  4. Papers: each paper, its status, and View
- The page scrolls; the right-hand "Ready to sign?" card stays.
*Practice:* multi-step legal forms end with a "review all answers, edit by section" page before the binding action.

### B5. Confirm before signing
The **Sign agreement** button opens a confirmation dialog, following POPUP-SYSTEM.md (`ConfirmDialog`):
> **Sign agreement SHR-2026-014?**
> Rahim Uddin · 10 shares (2.00%) · ৳45,00,000 · ৳9,00,000 down + 12 monthly installments
> After signing, the plan is fixed, the payment schedule starts, and the customer sees the agreement on their portal.
> ☐ The signed paper copy has been checked
> [Cancel] [Sign agreement]

The tick must be ticked before *Sign agreement* can be pressed.

### B6. Down payment taken out of signing
**Feedback:** the down payment is recorded automatically at signing, and it looks like user input. It should come after the agreement, either from the investor or recorded by admin.
**Agree.** Signing records the agreement; money is a separate, auditable event. Plan:
- Remove the down-payment block (checkbox, method, reference, account) from the wizard and from `signAgreement`.
- After signing, the down payment is **installment 0, due on the signing day**, in the schedule like any other installment.
- **It can be paid in three ways:** office **Record payment** on the sale page, customer **online**, or customer **offline slip** (part C).
- In BD the buyer often hands over a pay order or cheque at the table. To keep that fast, the success dialog after signing offers **"Record down payment now"**, which opens the usual Record payment modal pre-filled. It is a choice, not something that happens on its own.
- **Decided:** a late down payment carries **no late fee**. The share fee rule exempts `seq === 0`, the same way bookings already do.

---

## C. Offline payment from the Customer Portal

**Feedback:** the customer deposits at a bank, uploads the slip, the admin verifies it, and only then is the payment recorded.
**Agree, and it is the standard pattern:** the payment stays *pending* until reviewed, proof is attached at submission, the admin checks it against the bank statement, a rejection comes with a reason, the customer is told when the status changes, and every action is logged.

### C1. Customer side (`/customer/payments/new`)
The page keeps steps **1 Pay towards + amount** and **2 Review** as they are. Step 2 adds a **"How are you paying?"** choice:
- **Pay online now:** the existing dummy gateway, unchanged.
- **I paid at the bank / offline:** this opens the form:
  - **Paid by:** bank deposit (cash/cheque at the counter), bank transfer (NPSB/BEFTN/RTGS), pay order / DD, mobile banking to the company merchant account
  - **Paid into:** the company account the money went to, showing only bank, branch, account name, account no. and routing no. (whitelisted in the portal repository). **Decided:** for now this is a dummy demo list of the seeded bank accounts. The real list, and whether bKash/Nagad are included, comes later (OPEN-ITEMS).
  - **Payment date** (the date on the slip; it can't be in the future), **amount** (pre-filled, can be changed), **transaction / slip reference no.**
  - **Slip or receipt photo / PDF** (required, ≤10 MB, previewed before sending), and a **note**
  - **Submit for verification**
- Result page: "Submitted, we'll confirm within 1 working day", with the reference **PSB-2026-001**.
- On the holding, schedule and overview pages, a **"৳X under verification"** pill is shown. The installment is **not** marked paid and no receipt is issued yet.
- An amount under verification is taken off what can still be paid, so the customer can't pay the same installment twice.
- The customer can **withdraw** a submission while it is still under verification.
- If it is sent back, a notification shows the reason, with **Submit again** pre-filled.

### C2. Admin side
- **Customer Requests** gets a third tab, **Payments to verify**, with a count badge. The Collections page and the sidebar show the same count.
- **Each row shows:** customer, holding (share purchase or booking), amount, method, paid into, payment date, reference, submitted at, and the **slip preview**.
- **Confirm** opens a modal showing *how it will be applied*, using today's allocation (late fees first, then the oldest installment). The received-into account is pre-filled and can be changed.
  - Confirming records the real payment through the existing `recordPayment`.
  - **The payment date is the customer's deposit date, not the approval date**, so a slip deposited on time but approved late doesn't attract a late fee.
  - The receipt number is issued, and the customer is notified with a link to the receipt.
- **Send back** requires a reason ("amount doesn't match the bank statement", "slip unreadable"…), and the customer is notified.
- **Duplicate guard:** the same reference, or the same amount + date + account as another submission or payment, shows a warning before Confirm.
- **Who can confirm (decided):** Accounts, meaning users with edit rights on `finance_collection`. For the demo, Admin has all access.

### C3. Data (Dexie v47, new block, existing ones untouched)
New table **`payment_submissions`**: `id, code (PSB-YYYY-NNN), customer_id, sale_id | booking_id, holding_code, amount, method, paid_on, paid_into_account_id, reference, note, slip_upload_id, status, reviewed_by, reviewed_at, review_note, payment_id, created_at, updated_at, created_by`.
- `status` is an enum in code: `submitted | confirmed | rejected | withdrawn`.
- The slip file reuses `customer_uploads` / `customer_upload_files` with a new kind `payment_slip`, so it also shows in the customer's file.
- Tests: the upgrade-path test for v47 (rules in `dexie-upgrade-path-rule`), repository tests for submit / confirm / reject / withdraw / duplicate guard, and a check that pending amounts reduce `maxPayable`.
- Demo seed: one submission under verification and one sent back, for the demo investor (01711223344).

---

## D. Purchase page (second round of feedback, 2026-11-02)

### D1. Wrong menu highlighted
**Problem:** clicking a row in **Investors & Dues** opens `/admin/share-sale/sales/[id]`. The sidebar marks a menu item active by URL prefix, and **Share Offerings** has the prefix `/admin/share-sale`, so it lights up instead of Investors & Dues.
**Plan:**
- Nav items get an optional `activeFor` list of paths (`nav-config.ts` / `AdminSidebar.tsx`).
  - **Investors & Dues** is active on `/admin/share-sale/investors` and `/admin/share-sale/sales/*`.
  - **Share Offerings** is active on `/admin/share-sale` (exact) and `/admin/share-sale/offerings/*`.
- The same check covers other places where a detail page sits outside its list's path.
- The back link follows where the user came from: opened from a customer's page (`?from=customer`), it reads "← Customer name". Otherwise it stays "← Investors & Dues".

### D2. New **Agreement** tab (signing record)
**Problem:** the signing record is a small card at the end of Overview, and much of what was entered at signing isn't shown.
**Rule: every detail is shown in one place only.** Each tab owns its own facts and links to the others; it never copies them.

| Fact | Its one home |
|---|---|
| Plan: shares, price, down payment, installments, late fee rule | **Overview → Purchase** card |
| Customer: identity, contact, KYC, nominee, payout bank | **Overview → Customer** card (stored once, on the customer record) |
| Money: paid, due, overdue | **Payments** tab and the side card |
| Papers, including the signed copy | **Documents** tab |
| **Signing event:** agreement no., date, place, company signatory, customer or attorney, witnesses, stamp, notary | **Agreement** tab (new) |

**Plan:**
- The purchase page gets an **Agreement** tab, shown once signed, between Overview and Payments. It holds **only the signing event**, which today is a small card squeezed into Overview:
  1. **Agreement:** agreement no., signed on, signed at.
  2. **Signatures:** company signatory and designation; signed by the customer, or by an attorney under a power of attorney.
  3. **Witnesses:** Witness 1 and Witness 2 as two side-by-side cards (name, NID/mobile, address).
  4. **Stamp & notary:** stamp value and serial no., notarized on, notary public.
  - A single line, "Signed copy: on file · View", links to the paper in the **Documents** tab rather than listing the papers again.
- The **Signing record card moves out of Overview** into this tab; it is moved, not copied. Overview's Purchase card subtitle keeps the agreement no. as a link to the tab.
- No plan, customer or paper details are repeated here.
- **Before signing**, the wizard's **Review** step (B4) still shows everything at once. That is a one-time check before a binding action, not a stored page. It is **built from the same blocks** (Overview's Purchase and Customer cards, the Agreement blocks, and the Documents progress strip), so each block exists once in code too.
- The customer page's **Shares** tab gets a "View agreement" link on each signed purchase.
- **Bookings:** the booking `AgreementPanel` is trimmed to the same rule, keeping the signing event and linking to buyer details and papers instead of repeating them.

### D3. Documents tab: one design across the app
**Problem:** the share Documents tab uses its own card checklist, while Lands, Projects, Suppliers, Leads and others use the shared `DocumentsPanel` (list rows, an **Upload Document** dialog, a **View** preview popup, Delete with confirmation). The customer page even shows **both designs on one tab** ("Customer file" plus "Other documents").
**Agree:** it should be one way to upload and one way to view.
**Plan:**
- Split `DocumentsPanel` into shared pieces: `DocumentRow`, `DocumentUploadModal`, `DocumentPreviewModal`. Lands and every other user keep looking exactly as now.
- Rebuild `ShareDocumentChecklist` with those pieces:
  - The progress strip stays on top ("3 of 5 required papers on file").
  - **Required papers:** one `DocumentRow` per paper with a red `*`. A paper with no file shows a "Missing" state and an **Upload** button in place of View.
  - **Other papers:** a plain `DocumentRow` list with the panel's usual **Upload Document** button.
  - Only papers sent from the portal get the extra badges: *To review* with **Accept** / **Send back**, or *Sent back* with the reason.
- The **View** action opens the same preview popup as Lands (image or PDF shown inline, with Download), not a new browser tab.
- **Customer page Documents tab:** one list, grouped as *Customer papers* → *Purchase SHR-…* → *Booking BKG-…* → *Other documents*, all in the same row design.
- Storage stays as it is: `customer_uploads` for portal-aware papers and `documents` for the rest. Only the look and the steps become one.
- Wizard step 4 (B3) uses the same component.

### D4. Payment schedule for long plans (e.g. 100 installments)
**Problem:** one long table followed by a second **Payments received** list means long scrolling, and the two have to be matched by eye.
**Plan:** one **Payment schedule** card:
- **Summary strip on top:** paid x of N, paid ৳ / total ৳, overdue (count and ৳), next due (date and ৳). The progress bar moves here from the side card.
- **Filter chips:** **Due & upcoming** (the default: everything overdue, plus the next 12) · **Overdue** · **Paid** · **All**. Each chip shows its count.
- **Paging:** 12 rows a page, using the existing `Pagination`. The page with the next due installment opens first.
- **Action column, "View":** on any row with money against it. It opens a **Payment details** popup with:
  - the installment: amount, due, paid, late fee, status
  - each receipt applied to it: receipt no., date, method, reference, channel (office, portal online, portal slip), the amount applied, and the late fee part
  - "This receipt also paid Installment 4, 5" when one receipt covered several installments
  - **View receipt** (print)
- **The separate "Payments received" table is removed** from this tab.
  - The full receipt list stays available on the customer's **Payments** tab and in **Collections**.
  - A small **"Receipts (n)"** link in the card header opens the same list in a popup, for the rare case of finding a receipt by number.
- The same schedule component is used on the booking page.
- The Customer Portal schedule (`ScheduleTable`) gets the same filter chips and paging.
*Practice:* loan and installment statements show a summary, then a filtered, paged schedule, with each payment's details one click away rather than in a second table.

### D5. Cancel purchase and Undo last payment: hidden for now
- Remove **Cancel purchase** and **Undo last payment** from the purchase page header, and from the booking page if they show there. The repository functions stay, unused.
- **Later, its own plan (OPEN-ITEMS):** a **Cancellation & refund procedure**:
  - a cancellation request with a reason
  - approval
  - a refund worked out under the agreement (the BD Act summary cited below mentions a 10% deduction and a refund within 3 months; to be checked against the Act)
  - refund payments recorded in accounts
  - the shares released back to the offering
- **Later, also in OPEN-ITEMS:** "Undo last payment" becomes **Reverse payment**, done by Accounts with a reason, keeping the original receipt and adding a reversal entry instead of deleting.

---

## Build order

| Batch | Scope | Notes |
|---|---|---|
| **S1** | A1–A4 offering form + two late fee types; down payment exempt from late fee | Unit tests for the fee rules |
| **S2** | D1 menu highlight + D5 hide cancel/undo | Small, quick wins |
| **S3** | B1 + B2 wizard footer and field groups, both wizards | Shared `FormGroup` and `WizardFooter` |
| **S4** | D3 one document design (split `DocumentsPanel`, rebuild the checklist, customer Documents tab) + B3 | Lands and other users must look unchanged |
| **S5** | B4 Review + D2 Agreement tab (signing event only, each detail in one place), B5 confirm dialog, B6 down payment out of signing | Update the demo walkthrough text |
| **S6** | D4 payment schedule (summary, filters, paging, View popup), admin + booking + portal | Seed one demo purchase with a long plan to check paging |
| **S7** | C1 + C3 portal offline submission + data | Dexie v47 |
| **S8** | C2 admin verification queue + notifications + seed | End-to-end browser pass |

Each batch gets one browser pass on :3000, then a commit and push.

## Decisions (answered 2026-11-02)
1. **Late fee:** keep % and fixed amount. The third type comes after the client confirms it.
2. **Down payment:** no late fee.
3. **Offline payment approval:** Accounts. Admin has all access for the demo.
4. **Company accounts on the portal:** a dummy list for now, confirmed later.

## Goes to OPEN-ITEMS
- The third late fee type (likely a monthly rate with a cap); late fee types for bookings.
- The real list of company accounts on the portal, including bKash/Nagad.
- The cancellation & refund procedure, and Reverse payment (D5).

Sources:
- [Rights of a flat buyer under the Real Estate Development and Management Act 2010](https://shossainandassociates.com/articles/flat-buyer-rights-real-estate-act-2010/)
- [Collexo: upload offline payment proof](https://help.collexo.com/portal/en/kb/articles/upload-offline-payment-proof)
- [Meritto: approving offline payments](https://help.meritto.com/portal/en/kb/articles/marking-payment-as-approved-for-offline-applications)
- [OTCnet uploader and approver roles (US Treasury)](https://www.fiscal.treasury.gov/otcnet/training/wbt/content/_resources/userguides/ckp_ug_ch06_cap_man_cks_off.docx)
