# Prompt for the next session: Phase 2, the construction material flow

Copy everything between the lines into a fresh session in this project folder.

---

We are on **Phase 2 (Construction)** of `PLATFORM-REPLAN.md`. Steps 1–3 are built and pushed
(commit `e3f5955`): Construction menu, construction list, and a workspace per project with
Overview, Work Breakdown, Site Log, Materials, Photos & Documents and Activity tabs.

This session is about the **material flow inside Construction**. **Analyse first, then plan,
then build.** Don't take my words below as the design: think through how a Bangladeshi
developer's site, procurement team, suppliers and accounts actually work, find the gaps, and
propose the flow. Ask me only the decisions that are genuinely mine, then build in batches,
verify each in the browser, and commit each.

## Read first
- `PLATFORM-REPLAN.md`: the Phase 2 section, plus Phase 2 direction "transparency, not
  restriction"
- `PROJECT-FLOW-REVIEW.md`: sections G and F (decisions so far: material is cost **when
  received at site**; the site receives; all money lives in Finance)
- `OPEN-ITEMS.md` §0s, and the memory notes
- The code: `src/app/admin/site-progress/[projectId]/page.tsx` (workspace),
  `src/components/admin/procurement/ProjectProcurementSummary.tsx` (Materials tab),
  material requests (`site-progress.repository.ts`), purchase orders, goods receipts,
  supplier vouchers and stock (`procurement.repository.ts`), and Finance
  (`finance.repository.ts`, `/admin/finance/projects/[id]`)

## My feedback

1. **No cost in Construction.** The Materials "Overview" (material flow with money: ordered,
   received, paid…) isn't needed there. Cost calculation and display belong in **Finance,
   per project**. Construction shows quantities and status, not money.

2. **One request-to-payment flow.** Construction raises a material request, and it has a
   status from the start. Then: approve the request → raise an order → the supplier's
   voucher/bill is recorded in the system and a **final billable voucher** is prepared →
   **Finance pays the bill against that voucher**. Think through what really happens:
   - partial approval and partial delivery;
   - price differences between order and bill;
   - three-way match (order, receipt, bill);
   - who approves what, and returns.

   Then plan the statuses and the hand-offs.

3. **Delivery can go straight to the site.** Material doesn't have to pass through the main
   store; the supplier can deliver directly to the site. The flow must support both
   central-store delivery and direct-to-site delivery.

4. **Receiving at site:**
   - When procurement sends material against my request, I get a **Receive** option.
   - Procurement may also send material **without any request** from me (sent ahead), and I
     must be able to receive that too.
   - Rename "Stock on site" properly.
   - Don't keep "Stock on site" and "Used" as separate tabs: make them **one tab**, where
     received / in use / used are **statuses** of the same items.

5. **Using and returning material:**
   - I must be able to update an item as **used** (partly or fully).
   - When the project's work is done, I must be able to **send leftover material back**.

   This can be planned in more depth later; get the **basic flow right first**.

## How to work
- Analysis and plan first, written into `PLATFORM-REPLAN.md` (Phase 2, step 4 "material and
  money chain"). Show me the flow (statuses, who does what, which screen) before building.
- Keep the project rules in `AGENTS.md`: UI goes through repositories; a new Dexie version
  block for any schema change (never edit an old one); ENUM statuses in code.
- Update the demo data so every new status and screen opens with realistic Bangladeshi
  records.
- Browser-check each batch, commit each batch, and ask me before pushing.
