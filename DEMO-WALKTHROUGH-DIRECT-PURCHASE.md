# Demo walkthrough — Direct Purchase, end to end

About 15 minutes. It tells one story for a small developer: **the work has a
budget → the site buys and records each cost with its bill → finance pays from
an account that has the money → the owners see whose money it was and what is
left → the system warns before things go wrong.**

Plan and design notes: `DIRECT-PURCHASE-PLAN.md` (batches B1–B7).

---

## 0. Before the meeting (5 minutes)

1. Open the app and go to **Dashboard → Reload sample data**, then confirm.
   Wait until the dialog closes. Keep the browser window in front, because the
   reload is slow when the window is hidden.
2. **Administration → Company Settings → How you buy**: make sure **Direct
   purchase** is selected.
3. Keep a small image or PDF on the desktop to attach as a "bill" in step 3.
4. Stay signed in as **Super Admin**. You only switch role in step 7.

What the audience will see is the procurement-free menu: Projects, Land,
**Construction**, Sales, **Accounts (Payments, Fund & Partners, Cash Position)**, Administration. The old Finance menu is hidden while the company buys directly.

The figures below are from the sample data. They move a little with today's date.

---

## 1. The project is under construction (1 min)

**Construction → Construction Sites.**

- Three sites are under construction. Each card shows its progress against the
  plan, and its **budget alerts**. For example, Nokshi Green Residence shows
  "2 over budget".
- *Say:* "A project reaches this list once planning, design and approval are
  done and construction starts. Everything about the site happens here."

Open **Nokshi Green Residence**.

## 2. Every piece of work has a budget (3 min)

Open the **Budget & Cost** tab.

- The top tiles show the budget, what has been spent, what is still to pay, and
  how many items need attention.
- Tower A's work items run Foundation, Ground Floor, Superstructure, Roof and so
  on. Each row shows its budget, what it has cost, a bar of the budget used, and
  a thin marker for how much of the work is done.
- Point out the three states:
  - **Foundation: Over budget**, about 108% spent with the work done.
  - **Superstructure: Spending ahead of work**, about 72% of the budget gone
    with only 55% of the work done. *Say:* "Money is going faster than the
    work. That is the leak we want to catch early."
  - **Roof: On budget**, nothing spent yet.
- Click any work item name to open its own page: budget line by line
  against what each line has cost, every cost with its paper, and its
  progress readings. **Budget** there edits the lines; nothing is ever
  filled in for you.

## 3. Add work the way a building goes up (3 min)

Open the **Work Breakdown** tab and click **Add work item** on Tower A.

1. The top line shows the building as designed: *1 basement + ground + 10
   floors · 3,050 sqft a floor · built-up 36,600 sqft* (recorded on the
   tower at design/approval).
2. Twelve kinds of work, in the order a BD building goes up: Site
   Preparation, Piling, Foundation, **Floor Structure** (column, beam and slab
   casting — basements included), **Brick Work & Plaster**, Electrical,
   Plumbing & Sanitary, **Finishing** (tiles, doors and windows, paint), Roof
   Top, Lift & Generator, External Works, Other. The ones with the layers
   icon go floor by floor.
3. Pick **Brick Work & Plaster**, tick **1st, 2nd and 3rd floor**, set the
   planned start and end, weight `0` (the demo tower is already at 100%).
   *Say:* "One work item per floor; the dates are shared out floor by floor."
4. **Next: budget.** Nothing is filled in. The usual items come as chips
   with their units — or **Add all**. Each line reads like a sentence:
   - Mason and helper: `60` person-day × `900` per person-day
   - Brick: `14000` piece × `13.5` per piece
   - **Add your own item** → `Curing water`, switch to **Fixed amount**, `5000`
   - For anything counted in sqft, *Fill quantity: one floor · 3,050* fills
     it from the building size.
5. **Add 3 work items.** Click anywhere on a card to open it.

## 4. Record costs, each in its own way (3 min)

Click the **Brick Work & Plaster — 1st floor** card. Its own page opens with its plan, its
budget line by line, its costs and its progress readings.

Click **Add cost**. You first choose what **kind** of cost it is, and each
kind asks its own questions:

1. **Labour:** Mason, paid to `Abdul Sardar`, `8` workers × `6` days ×
   `850` daily wage gives BDT 40,800. Only the labour budget line is offered
   (Mason and helper).
   Click **Save cost** *without* attaching anything. It is refused:
   "Attach the muster roll". *Say:* "No paper, no cost." Attach a file and
   save.
2. **Machinery rent:** Concrete mixer, per **hour**, `10` hours × `2500`.
   Tick "operator and fuel included" if it applies.
3. Also mention:
   - **Transport** is counted as trips × rate per trip.
   - **Material** is quantity × rate, with the challan number.
   - **Subcontract** is measured work or a lump sum, with the bill number.
   - **Utility** is a monthly bill.

What changes on the page:

- **Budget, line by line** now shows the 40,800 spent against *Mason and
  helper*.
- **Costs** lists both, as **Pending**, with their attachments.
- The tiles update: spent, left in budget, still to pay.

*Say:* "This is the actual cost. It counts the day it is recorded, whether it
is paid today or next month."

## 4b. Costs before construction (1 min)

Open **Projects → Nokshi Green Residence → Costs**.

- Planning, design and approval cost money before there is a building:
  soil test and survey (Planning), architect and structural design (Design),
  land use clearance and RAJUK plan approval fees (Approval). Each stage shows
  its total, and Construction links to the work items.
- Pick **Approval stage → Add cost → Government fee**: authority `RAJUK`,
  fee for `Occupancy certificate fee`, `150000`, attach the pay order, save.
- *Say:* "Every taka from the first soil test to the last tile is on the
  project — and it goes to Payments like any other bill."

## 5. Pay it — Payments (3 min)

**Accounts → Payments.**

- The tiles show what is owed to vendors (about 5.1 crore), what has been owed
  for over 30 days, the money in the accounts, and what has been paid.
- **Pending** lists the oldest bills first, with their age. Find your
  **Mason labour / Abdul Sardar** cost.
- Click **Pay**. The dialog lists every account **with its balance**.
  1. Pick **Site petty cash** (about BDT 10 lakh) and try to pay a larger bill.
     For example, Tower A Superstructure Rod `DP-2026-015` still owes about
     30.9 lakh. The button stays off and a red line explains: "Site petty cash
     holds … — not enough". *Say:* "You cannot pay from a box that does not
     have the money."
  2. Change the amount to a part payment, or pick **DBBL Current**, and pay.
- The bill moves to **Part paid** or **Paid**. The **Paid** tab shows who paid,
  from which account, by which method and with what reference. **Undo** puts
  the amount back as owed.

## 6. Whose money — Fund & Partners (3 min)

**Accounts → Fund & Partners.**

- The tiles show partners' capital (14.8 crore), loans, buyers' payments, cost
  recorded against paid out, and the company pool not yet given to a project.
- **Project fund** tab: for each project, money put in directly + given from
  the pool + paid by buyers, minus what was paid out, gives **Remaining**,
  shown next to what is **still owed**.
  - **Nokshi Dhanmondi Court** shows **Low fund**: about 77 lakh left against
    2.37 crore owed. *Say:* "Before you promise a vendor, you know the project
    cannot cover it."
  - **Nokshi Lakeview Residence** shows **own split**, Karim 60% and Rahim 40%,
    while the company split is 50/30/20. Click the pie icon to show the split
    can be set per project.
- **Partners** tab:
  - **Karim Uddin (50%)**, **Rahim Chowdhury (30%)**, **Selina Akter (20%)**.
  - Each card shows **Put in** (capital plus their share of the money the
    company already had), **Used from their money**, **Unspent of theirs**, and
    a bar.
  - Selina's capital is **below her share**. *Say:* "This answers the question
    partners always ask: who put in how much, how much of mine has been used,
    and how much is left."
- **Ledger** tab: every taka in and out, oldest first, with the running
  balance. This is the simple general ledger.
- Optional: **Money in** to record partner capital or a loan, and **Give to
  project** to move pool money to a project. A grant larger than the pool is
  refused.

## 7. The system warns you — Alerts (1 min)

Click the **bell** in the top bar.

- It lists **Over budget**, **Spending ahead of work**, **Payment overdue**
  and **Low fund**, urgent first, with a filter by type.
- Click an alert and it opens the screen where you deal with it.
- *Say:* "Nothing is blocked. You can always record a real cost. But nobody
  can say they didn't know."

## 8. Different people, different views (1 min)

Switch the role in the top bar (under the name) to **Site Manager**.

- The bell now shows only budget alerts. Money alerts belong to finance.
- The site manager records costs; Accounts pays them.

Switch back to **Super Admin**.

## 9. Close: both ways of buying (30 sec)

**Administration → Company Settings → How you buy**: Direct purchase,
Procurement, or Both.

- *Say:* "A small developer buys directly, which is what you just saw. A larger
  one with a store and a purchase team switches on Procurement: requests,
  purchase orders and receiving. Nothing recorded is lost when you switch."
- Switch back to **Direct purchase** if you changed it.

---

### If something looks off during the demo

| Symptom | Fix |
|---|---|
| Pages show "Loading…" for a long time right after a reload | The reload is still running. Wait for the dialog to close |
| Procurement or Finance menu is showing | Settings → How you buy → Direct purchase → Save |
| Bell has no number | Settings are still loading, or the mode is Procurement |
| Numbers differ a little from this script | They move with today's date; the story is the same |
