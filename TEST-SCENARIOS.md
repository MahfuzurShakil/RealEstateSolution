# Land module — test scenarios

What to check after batches L1–L6 (BRD v2.0 §7–11). Commits `7984371` → `6e9a46b`,
all pushed to `main`.

**Before you start.** The demo database only rebuilds itself when it is empty, and
these batches added a lot to it. Open the app, then in the browser console:

```
indexedDB.deleteDatabase('realestate_platform')
```

…and reload. Without that you will be testing new screens against old data.

**The three gates ship OFF.** That is deliberate — land recorded before this
existed has no feasibility study, no checklist and no development record, so
switching a gate on would strand it mid-pipeline. To test them, turn them on
first: **Administration → Company Settings → Pipeline gates**.

---

## 0. The five meeting points (commit `7984371`)

| # | Where | What to check |
|---|---|---|
| 0.1 | Lands → Add Land | The first field is **Land Name**, not "Reference Name", with a hint under it |
| 0.2 | same form | The unit dropdown is **Measuring Unit**, not "Size Unit" |
| 0.3 | same form | **No Negotiated Price field anywhere.** Also gone from the land's Overview tab |
| 0.4 | same form | **No Final Agreed Amount** on Add Land — a line says the pipeline records it. Switch Acquisition Type to Joint Venture and the whole Commercials card disappears |
| 0.5 | Edit an existing land | Final Agreed Amount **is** there (needed for old plots and typos) |
| 0.6 | same form, Location & Notes | Nearby Facilities and Remarks sit **side by side**, equal width |
| 0.7 | Any land → Pipeline card → click a status button | The dialog has an **Attachments** drop zone at the bottom, with a prompt specific to that step ("Khatian copy, search report…" for Due Diligence, "Site photos…" for the visit) |
| 0.8 | Attach 2–3 files and confirm the step | They appear on the **Timeline** tab under that step, and on the **Documents** tab filed under a real type (Khatian Copy, Dolil Deed…) with a note saying which step they arrived at |
| 0.9 | Click an attachment chip on the Timeline | It opens the same preview the Documents tab uses |

---

## 1. L1 — registry fields and the status rename

| # | Where | What to check |
|---|---|---|
| 1.1 | Lands list → Status filter | Reads **Sourced / Under Review / Due Diligence / Negotiation / Agreed / Acquired / JV Signed / Rejected / Disposed / Linked to Project** |
| 1.2 | Any land → Overview | New rows: **Classification** (in Bangla — নাল, ভিটি…), **Source**, **Upazila / Thana**, **Road access** |
| 1.3 | Add / Edit Land | Land Classification and Source are **dropdowns from Master Data**, not free text |
| 1.4 | Administration → Master Data | Both lists are there and editable; add one and it shows up in the form |
| 1.5 | Any land → Owners tab | Each owner shows **share %, area, agreed amount** and what is still due |
| 1.6 | same tab, bottom | A reconciliation block: shares vs 100%, owner areas vs plot size, agreed amounts vs land total |
| 1.7 | **Mirpur DOHS adjacent plot** → Owners | Only one of the two owners has an area, so it says **"not recorded for every owner"** and does *not* report a shortfall |
| 1.8 | Edit a land, change Measuring Unit to Bigha | The per-owner Area label follows it — "Area (Bigha)" |
| 1.9 | A land at **Acquired** or **JV Signed** | The pipeline offers **Disposed**. Confirm it with an amount received |
| 1.10 | after 1.9 | The land's **Final Agreed Amount does not change** — the sale proceeds do not overwrite what you paid for it |

> **Migration check (only if you have an old database):** do *not* wipe first.
> Open an old land and confirm the Timeline reads "Due Diligence — from Under
> Review", with no blank or broken status anywhere.

---

## 2. L2 — Site Visits, Feasibility, gate G1

| # | Where | What to check |
|---|---|---|
| 2.1 | **Narayanganj Fatullah plot** → Site Visits | One visit, with road width, soil, drainage, surroundings, price observed nearby |
| 2.2 | same | Utility chips show three states — green "Electricity", red "Gas — none", grey "— not checked". Grey is a real answer, not a blank |
| 2.3 | same | **Lowland · 4 ft fill** badge |
| 2.4 | Record a visit | Leave "Lowland" unticked — the **Filling required** field is not shown. Tick it and it appears |
| 2.5 | Save the visit | It lands **above** the existing one (newest first) |
| 2.6 | On a saved visit → "Photos & files" | Upload a photo; it belongs to *that visit*, not to the land |
| 2.7 | **Uttara Sector 13** → Feasibility | **Two versions.** Version 1 rejected ("margin under 30%"), version 2 approved after negotiating the price down |
| 2.8 | **Chattogram Khulshi** → Feasibility | A **draft** recommending Hold |
| 2.9 | Any land → Feasibility → New version | It **starts from the last version's numbers**. Change one and the Total cost / Margin update live |
| 2.10 | Save it | It becomes **Version N+1** and is marked **Current**; the old one stays readable |
| 2.11 | Submit → Approve | Approving with an **empty decision note is refused** |
| **Gate G1 — turn it on first** | | |
| 2.12 | Narayanganj (Under Review, study *submitted*) | The **Due Diligence** button is disabled, with: *"Version 1 has been submitted and is waiting for approval."* **Rejected** stays enabled |
| 2.13 | Approve that study (recommendation Proceed) | The button unlocks **immediately, without a reload** |
| 2.14 | Record a new version recommending **Reject** and approve it | The gate shuts again: *"…was approved but recommends reject, not proceeding."* The approval dialog warns you **before** you approve |

---

## 3. L3 — Legal Due Diligence and gate G2 (BR-001)

| # | Where | What to check |
|---|---|---|
| 3.1 | Any land → Due Diligence | **17 checks in 6 groups** — Ownership, Title & deed chain, Encumbrance, Tax & statutory, Physical & boundary, Authority approvals. Each has guidance under it |
| 3.2 | header | Counts **mandatory outstanding** separately from "x of 17 settled" — the mandatory number is the one that blocks |
| 3.3 | **Chattogram Khulshi** | **Mutation (namjari) complete** is **failed** — "still in the deceased father's name". Two more are In progress |
| 3.4 | **Bashundhara Block K** | Everything settled, including a **waived** holding-tax item with the reason and date |
| 3.5 | Any item → Update → status **Failed**, no finding | **Refused**: "a failure with no finding is not a record" |
| 3.6 | status **Waived**, no reason | **Refused**: the reason is the authorisation BR-001 asks for |
| 3.7 | Waive it with a reason | The count drops by one and the reason shows on the row with your name and the date |
| 3.8 | status **Not applicable** | A note explains it is *not* the same as passed |
| 3.9 | Any item → paperclip icon | Evidence upload for that item specifically |
| 3.10 | Master Data → **Legal Due Diligence checklist** | Expands to all 17, grouped, "13 mandatory" |
| 3.11 | Add an item there, then reopen any land's DD tab | The new item appears on the existing checklist, with findings already recorded left untouched |
| 3.12 | Retire an item that lands have used | The confirm says **how many lands** have a finding against it |
| 3.13 | Untick "mandatory" on an item in Master Data | **Existing lands do not change** — each land snapshots what was mandatory when its checklist was built |
| **Gate G2 — turn it on first** | | |
| 3.14 | **Savar highway-side land** (at Agreed) | **JV Signed** is disabled: *"13 mandatory due-diligence checks are still outstanding."* |
| 3.15 | Settle some items | The number counts down live |
| 3.16 | Mark one mandatory item **failed** | The message changes to lead with the **failure**, not the count |

---

## 4. L4 — Negotiation ladder and acquisition cost

| # | Where | What to check |
|---|---|---|
| 4.1 | **Uttara Sector 13** → Negotiation | **3 rounds**, newest first, with a green banner: *"Agreed at BDT 36,000,000 · round 3 … negotiated down BDT 3,000,000 from the opening round"* |
| 4.2 | same | Each round shows payment terms, conditions, broker and commission — not just an amount |
| 4.3 | **Gazipur Tongi** → Negotiation | A round still **On the table** and no accepted one |
| 4.4 | Record a round | It defaults to the **opposite party** from the last one and carries the previous terms forward |
| 4.5 | Save it | The previous round becomes **Superseded** automatically |
| 4.6 | Accept a round | The dialog warns if it will **replace** an agreed amount the payment plan is built from |
| 4.7 | Confirm | The land's **Price / agreed amount** changes to that round's figure, and every other round becomes Superseded (not Rejected) |
| 4.8 | A land at Sourced / Under Review | **No Acquisition Cost tab** — it only appears from Agreed onward |
| 4.9 | **Dhanmondi Road 27** → Acquisition Cost | Land price estimated 82,00,000 vs actual 70,00,000 from the ledger, variance shown |
| 4.10 | same, bottom | A note: *"BDT 5,850,000 of land extra costs is in the total but not on a line above"* — money the ledger cannot split yet, said out loud |
| 4.11 | **Uttara** → Acquisition Cost | Estimates on every line, **no actuals**, and the variance column shows **dashes** with "nothing paid yet" on the total. Not a green "under budget" |
| 4.12 | Edit any line | Set an estimate and a note; the total updates |

---

## 5. L5 — Per-owner settlement

| # | Where | What to check |
|---|---|---|
| 5.1 | **Savar highway-side land** → Payment plan | A **Settlement by owner** card under the land plan (it does *not* appear on single-owner plots) |
| 5.2 | same | Abdul: 3,00,000 agreed, **15,00,000 paid**, 15,00,000 outstanding. Shahida: 20,00,000 agreed, **0 paid** — the demo payment counts against *him only* |
| 5.3 | Abdul → **Build plan** | Terms dialog (bayna, monthly count, balance at registration) |
| 5.4 | Save it | The instalments appear **and the 15,00,000 already in the ledger is allocated to the bayna line automatically** — marked Paid |
| 5.5 | Shahida → Build plan | Works independently; her plan has nothing paid against it |
| 5.6 | Owners tab | Same figures inline: agreed and what is due, per owner |
| 5.7 | Finance → Expenses → Add, category **Land Payment**, land **Savar** | A **"Paid to which owner"** dropdown appears, showing each owner's outstanding balance |
| 5.8 | Pick Shahida, save | Her paid figure moves; Abdul's does not |
| 5.9 | Same form, category **Land Extra Cost** | **No owner dropdown** — a registration fee is paid to an office, not an owner |
| 5.10 | Same form, a single-owner land | **No owner dropdown** — nothing to choose |
| 5.11 | Edit Land → change an owner's agreed amount so they no longer total the land's agreed amount | The settlement card reports the mismatch in amber. It **warns, it does not block** |

---

## 6. L6 — Land development and gate G3

| # | Where | What to check |
|---|---|---|
| 6.1 | **Narayanganj Fatullah plot** → Development | 4 activities: Site clearing **completed**, Earth filling **in progress (56%)**, Boundary wall **planned**, Drainage **on hold** |
| 6.2 | header | *"3 of 4 activities still unfinished · BDT 1,571,500 spent of BDT 3,890,000 budgeted · 1 on hold"* |
| 6.3 | each row | Progress bar, contractor, quantity in its own unit (cft / rft / sft), and the last report's remark |
| 6.4 | Add activity | Work type is a **Master Data dropdown**; contractor list is **contractors only** from the vendor master |
| 6.5 | Any activity → **Report** | Note says each report is a **running total**, not that day's figures |
| 6.6 | Report 100% (or tick "This activity is finished") | The activity flips to **Completed** on its own |
| 6.7 | Report a *lower* percentage than before | It **accepts the correction** — the panel shows the latest report, not the highest |
| 6.8 | **Uttara Sector 13** → Development | The **"needs no development work"** box is ticked |
| **Gate G3 — turn it on first** | | |
| 6.9 | Projects → New Project, tick a land with **no development record** (e.g. LND-2026-010 Agrabad), fill the form, save | **Refused**, naming the plot: *"…has no land-development record. Add the activities it needs on the Development tab, or mark the plot as needing no development."* |
| 6.10 | Untick it, tick **LND-2026-001** (marked as needing none) and save | **Goes through** |
| 6.11 | Edit an **existing** project and save it unchanged | **Not blocked** — lands already linked are exempt, so an old project does not become unsaveable |
| 6.12 | Tick two unready plots | **Both** are named, not just the first |

---

## 7. Nothing should have broken

| # | Where | What to check |
|---|---|---|
| 7.1 | **Sales & CRM → Leads** | A lead's pipeline still reads New → Contacted → Site Visit Scheduled → **Site Visit Done** → Negotiation. This string is shared with the old land enum and must *not* have been renamed |
| 7.2 | Projects, Bookings, Site Progress, Procurement, Finance | Open each; nothing land-related leaked in |
| 7.3 | Delete a land (make a throwaway one first) | Its visits, feasibility, checklist, negotiation rounds, cost sheet, owner plans, development activities **and all their files** go with it |
| 7.4 | Browser console on any land page | No errors |

---

## What is deliberately not here

- **Map view of a plot.** Coordinates are stored and the location card renders; a
  mouza-map overlay is Phase 2, as the BRD places it.
- **Document version history and expiry alerts.** A platform capability, planned
  once in `BRD-ALIGNMENT-PLAN.md` §3.3 rather than six times in six modules.
- **Splitting `land_extra_cost` across registration / legal / stamp duty.** Needs
  a cost head on the expense itself — the cost-center work in §3.4. Until then
  the acquisition sheet says how much it cannot attribute instead of hiding it.
- **Committed and forecast cost states** on a development budget (BRD DEV-002).
  Same reason: §3.4.
