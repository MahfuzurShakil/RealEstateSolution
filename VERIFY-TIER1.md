# Verification checklist — Tier 1 (batches 1A–1E)

Dev server is running on **port 3001** (`.claude/launch.json`, config `dev`).
Nothing is committed — 43 source files are modified in the working tree.

**Before you start:** on the `/admin` dashboard, click **Demo data → Reload
sample data**. The seed takes roughly **40–60 seconds** and **navigating away
mid-seed kills it**, leaving half a dataset (that is what an empty Purchase
Orders list means, not a bug). Stay on the dashboard until the tiles read
Leads 12 · Bookings 9 · Site Updates 25 · Material Requests 6.

---

## 1A — Money is readable

**`/admin/finance`** — every column should now add up by eye:

- Sales value `BDT 158,740,000` = 97,590,000 + 44,830,000 + 16,320,000 + 0
- Collected `BDT 13,800,000` = 9,500,000 + 4,300,000 + 0 + 0
- Total cost `BDT 110,813,450` = the four project costs **+** the
  `BDT 6,292,550` unallocated line at the foot
- Estimated profit `BDT 47,926,550` = sales − total cost
- The red banner (`BDT 4,541,111 across 7 instalments`) matches the Overdue
  column exactly — it used to say `BDT 8M` next to `BDT 8,424,000`

**`/admin/collections`** — the second tile now reads **"Allocated to
instalments · confirmed bookings only"**, with a note underneath explaining why
it is lower than the Finance Overview's "Collected". Both pages should show
`BDT 4,541,111` overdue.

**`/admin/purchase-orders/<PO-2026-010>` → Items tab** — the First Class Bricks
rate should read **BDT 13.50**, not BDT 14, and 40,000 × 13.50 should equal the
BDT 540,000 line total. Check the same on `/admin/stock` (Avg. cost column).

**Mobile, 375 px** — the thing this change could have broken. Check
`/admin/finance`, `/admin/collections`, `/admin/purchase-orders`,
`/admin/stock`, `/admin` for horizontal page scroll and for money figures cut
off with an ellipsis inside the KPI tiles. I measured `scrollWidth` = 375 on all
five and found no clipped tile, but this is the one worth your own eyes.

---

## 1B — Site progress

**`/admin/site-progress`** — the Nokshi Green Residence card should read:

> 37.3% · **planned 37.8% by today vs 38.4% on the 97% of work that has dates ·
> +0.6%** · `Quiet 20d` · **On Track · unconfirmed** (amber, not green)

The three numbers in that caption are now arithmetically consistent
(38.4 − 37.8 = +0.6). It used to say "planned 37.7% · **+0.7%**" beside a 37.3%
headline. The other three projects have full plan coverage and should show the
short form — `planned 1.9% by today · +0.4%` — with no extra clause.

**Please confirm these did NOT move** (they read the same `ProgressRollup`):

- the ordering of the project list — most delayed still at the top
- the **Behind schedule** filter still returns the same project
- the dashboard headline still reads `35.4%`

**`/admin/site-progress/<Nokshi Green Residence>` → Work Breakdown** — the
Tower A chip and the `Σ (progress × weight ÷ 100)` line at the foot of its table
should both say **36.5%**. They used to say 37% and 36.50%.

---

## 1C — A confirmed booking is no longer born overdue

**The main one.** On a fresh demo set, open `BOOK-2026-003` (Dr. Mahbub Alam,
Pending Approval) and **Approve discount**, then open the **Instalments** tab:

| | Before | After |
|---|---|---|
| Instalment 1 "Booking Amount" | BDT 1,337,000 | **BDT 1,000,000** |
| Its status | Overdue, "5 days late" | **Paid** |
| Overdue on the schedule | BDT 337,000 | **—** |
| Monthly instalments | BDT 222,833 | BDT 229,074 |

The BDT 337,000 is spread proportionally across the later lines rather than
dumped on the handover milestone. **Check the schedule still totals BDT
13,370,000** — it does in my run, but it is the one number that must be exact.

Company-wide, overdue collections should have fallen from **BDT 8,424,000 across
11 instalments** to **BDT 4,541,111 across 7**. The difference was arrears the
software had invented.

---

## 1D — Payables

**`/admin/suppliers`**:

- **BSRM Steels** — Orders `1 · +1 draft`, Ordered `BDT 1,732,800` (with
  "BDT 1,732,800 not yet delivered"), Received `BDT 0`, due `BDT 1,732,800`.
  It used to claim **BDT 6,405,600 due**, of which BDT 4,672,800 was a draft
  order nobody had placed.
- **Meghna Sand** (page 2) — Ordered `BDT 0`, Received `BDT 52,200`, Paid
  `BDT 52,200`, **no due and no advance**. Their only order was cancelled after
  part of it had arrived; the delivered part is still legitimately billable, so
  the account is settled.
- New **Received** column throughout.

**`/admin/purchase-orders`** — `PO-2026-004` (cancelled) no longer shows a
"BDT 258,600 unpaid" badge; its balance is void, not owed. Open it and the
Payment card says **"Order cancelled"** rather than "Still due", with no false
"held by the supplier" note (the BDT 52,200 paid bought material that arrived).
A draft now says "Drafted", not "Ordered".

**`/admin/supplier-vouchers`** — there is a **Date** column and the register
opens newest-date-first: 27 Aug, 14 Aug, 13 Aug, 08 Aug, 26 Jul. It used to sort
by voucher code, giving 26 Aug, 12 Aug, **07 Aug, 13 Aug**, 25 Jul.

> **One decision I did not take on my own.** The report also argued payables
> should be based on goods *received* rather than *ordered*. `paymentSummary`
> takes the opposite position deliberately and says why — a PO is a ledger
> entry, not a bill, and advances are normal in this trade. I changed what
> counts as an order (drafts out) but left that policy alone. **Moving to a
> received-value basis is a call for you and the client**, and it would also
> change what the "Pay supplier" dialog pre-fills.

---

## 1E — The shell

**Role persistence** — switch the topbar to **Accounts**, then hard-reload the
page (or type a URL). You should still be Accounts. Previously you silently
became Super Admin, which also meant a blocked page opened on refresh.

**Role-aware dashboard** — as **Accounts**, `/admin` should show Projects,
Units, Bookings, Documents and the **Money** card, and should *not* show Lands,
Landowners, Leads, the follow-up queue, Site Progress or the build manifest.
Switch to **Site Manager** and check it narrows differently. As Super Admin
everything is back.

**Money card** — collected / still due / overdue / due this month, with a link
into the collections queue. Shown to the roles Section 9.6 gives `dashboard` or
`finance_collection` to.

**Topbar** — the search box and the four icons (bell, message, calendar, moon)
are gone; none of them did anything and none had an accessible name. The avatar
now shows the acting user's initials (`MR`, `FA`) instead of a hardcoded "DU".
The inert **Help and Support** entry is gone from the sidebar — its
`/admin/help` route returns a 404.

> If you would rather keep the search box and the icons as visible placeholders,
> say so and I will put them back disabled with tooltips instead of removing
> them.

**Leads** — `/admin/leads` banner now also counts **unassigned** leads with a
"Show unassigned" button. And a lead that already has a live booking is out of
the follow-up queue on both this page and the dashboard, so the desk is no
longer told to chase Dr. Mahbub Alam after he has paid.

---

## What I did not touch

- **Tier 2** (minor + cosmetic) and **Tier 3** (features worth building in now)
  from `REMEDIATION-PLAN.md` — untouched.
- **P-1** turned out to be demo seed data, not a defect — corrected in the
  analysis report.
- No schema change, no new Dexie version, no commit.

`npx tsc --noEmit` and `npx eslint src` are both clean. I did **not** run
`next build`, because the dev server is holding `.next`.

Tell me when you have looked, and I will either fix what you find, start
Tier 2, or commit this batch.
