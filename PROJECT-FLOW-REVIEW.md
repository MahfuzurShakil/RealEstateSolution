# Project Module: Flow Review (2026-10-10)

This review covers the client walkthrough feedback (13 points, mostly from a land-share
project) plus my own analysis of every project type against how Bangladesh developers
actually work. **The Project module is the focus**; other modules are touched only where
a project screen depends on them.

---

## A. Your feedback: finding and fix

| # | Feedback | Finding in current build | Fix |
|---|---|---|---|
| 1 | Project starts the life cycle, so put it first in the menu, Land below | Menu order is Land → Projects | Sidebar: Dashboard → **Projects** → Land → Sales… |
| 2 | Form asks for land info (Total Land Area, Area Unit) | Those fields sit in "Project Information" and are typed by hand | Project form = project info first, then **type**, then **type-specific fields**. Land area and unit move under Linked Land, **auto-filled from the land, read-only** |
| 3 | Picking land: confirm with key info, then show a summary instead of the full list | Toggle cards for every land; no confirmation | "Select land" opens a picker → **confirmation popup** with the land's key facts (code, location, mouza/dag, size, acquisition type, status, cost) → after confirm, a **read-only summary card**, with *Change land* / *Remove* buttons. Full list only inside the picker |
| 4 | Timeline only makes sense for building projects | Start/completion dates required for every type | **Built (apartment/commercial/mixed):** construction timeline (start, handover). **Plot:** development completion + plot handover date. **Land share:** sale period (sales open → target sold-out date), optional; no construction timeline |
| 5 | Share generation: land already linked, so no plot-size input; can it run twice? Total share must never exceed 100% | Generator asks for total land size and can be run again, adding more shares | Land size is **read from the linked land** (shown, not typed). Generator runs **once**; after that only "regenerate (no share sold yet)" or edit. A **guard keeps the total share ≤ 100%** (and the register must equal the land) |
| 6 | Direct purchase / inherited land has no landowner share, so no JV Allocation | "JV Allocation" tab shows on every project | Tab and landowner allocation **only when a linked land is a joint venture**. Same for "landowner share" options in unit editing |
| 7 | Estimate must depend on project type | Partly done: heads hide by type | Complete per type (see Section C): share = land + selling costs only; plot = land + development + approval + utilities + selling; built = full construction |
| 8 | Share shows Hold / Open, but what about Sold? Selling should capture the price | Unit status can be set by hand, including Sold, with no price or buyer | **Sold / Booked are never set by hand.** They come only from a Booking (buyer, price, payment plan). Manual statuses limited to Available / Hold. "Sell this share" button opens the booking form pre-filled |
| 9 | When all shares are sold, can the project status change? | Sales and project status are independent; Sold out is manual | When every company unit is booked, the system **suggests "Mark sold out"** (one click). For land share the project then moves to *Deeds registering → Closed* through deliveries, not by hand |
| 10 | "Transfer in" on Finance & Cost doesn't belong; procurement does that. A request from here is fine | Finance & Cost tab mixes stock transfer, issues, consumption and money | Remove **Transfer in** from the project page (it stays in Procurement → Stock). Keep **Request material** |
| 11 | Estimate should be high-level and type-focused; why office/admin heads, since one admin team covers many projects? | "Overhead & admin" and "Finance cost" heads in every estimate | Remove company overhead from project estimates (it's company-level, Phase 3). Keep only heads a project really spends. Finance cost becomes optional/hidden by default |
| 12 | Separate **Finance** and **Material** tabs. Finance = summary: total cost broken into main categories (land, design, construction…), sales, collected, receivable | One "Finance & Cost" tab, mostly procurement | **Finance tab:** cost breakdown by main category (Land / Design & approval / Construction / Utilities / Selling), sales value, collected, receivable, overdue. **Costing tab** stays the estimate-vs-actual plan (or merge: see decision D1) |
| 13 | Material tab: what was used, what it cost, which item, and current stock, simple | Mixed into Finance & Cost | **Materials tab** (built + plot only): items used to date (qty, cost), stock on site now, open requests. Simple tables, no transfers |

---

## B. Flaws I found (beyond the feedback)

1. **Units can be marked Sold by hand.** Revenue, collections and dashboards then disagree (a sold unit with no booking or money). *Fixed by A-8.*
2. **The demo has a project with 4 of 20 shares sold that reads "Deeds registering".** Project status runs ahead of sales. For land share, status should follow sales and deeds. *Fixed by A-9 plus a demo correction.*
3. **The project form shows towers/units fields for every type in places** (e.g. "Actual start date: stamped when Under Construction" on a share project). Form must be shaped by type.
4. **One land can be linked to two live projects** with only a small amber note. For land share and plot, the whole land is the product, so a land must not be in two **live** sales projects (a successor project is the exception, and it's created by the system).
5. **Land share price has no basis.** Price per share is typed freely. It should show **land cost per share** and a **suggested price** (cost + margin) so the owner sees the profit per share.
6. **Plot project:** plot sizes can be generated larger than the land (sum of plots ≤ saleable land after roads and open space). Needs the same ≤ 100% guard, with a "roads & common area %" field.
7. **Apartment on JV:** the landowner flat allocation check exists, but the estimate and revenue don't show the developer's real saleable share clearly. Revenue should say "developer share X of Y flats".
8. **Project status buttons allow skipping meaning** for land share (Design / Approval stages exist in data from older demo rows).
9. **Public "is_public" checkbox** sits in the project form for a project with no units or price. It should live on the Sales card ("Publish") once sales are open.
10. **Amenities and "Surroundings"** are asked on land-share projects where they mean little. Show per type (built: amenities; plot: road widths, utilities; share: surroundings only).

---

## C. Flow per project type (the target)

| | **Land share** | **Plot development** | **Apartment / Commercial / Mixed** |
|---|---|---|---|
| What is sold | Undivided shares of one land | Serviced plots | Flats / spaces |
| Form, type-specific fields | Number of shares, price per share (with land cost per share shown), sale period, construction after sale? | Plot layout: roads & common area %, plot sizes, road widths, approval body (RAJUK/Union/Pourashava) | Building: storeys (G+N), basement, units per floor, built-up area, approval body; for commercial: space type |
| Timeline | Sale period only | Development completion, plot handover | Construction start, handover |
| Inventory | Share register, generated once from the land | Plots, sum ≤ saleable land | Towers → units |
| Status path | Planning → Register open → Sold out → Deeds registering → Closed | Planning → Subdivision approval → Under development → Possession/registration → Closed | Planning → Design → Approval → Construction → Handover → Closed |
| Estimate heads | Land, legal & deed, marketing, sales commission | Land, design & approval, land development, utilities, marketing, commission | Land, design & approval, materials, contractor & labour, utilities, marketing, commission |
| Tabs | Overview · Shares · Finance · Documents | Overview · Plots · Development · Finance · Materials · Documents | Overview · Towers & Units · Site Progress · Finance · Materials · (JV Allocation if JV) · Documents |
| JV allocation | Only if land is JV | Only if land is JV | Only if land is JV |

---

## D. Decisions (client, 2026-10-10)

- **D1. One Finance tab.** Estimate vs actual by khat, plus sales, collected and receivable. The separate Costing tab goes.
- **D2. Share price by hand**, with land cost per share and profit per share shown live beside it.
- **D3. One land, one project.** A land cannot be linked to more than one project, for any type. The land-share successor (a building commissioned by the shareholders) **takes over** the land, and can only start once the share project is closed. B-4 becomes this hard rule.

---

## E. Build order (each batch browser-checked, one commit)

1. **Menu + project form:** menu order, form by type, land picker with confirmation popup and read-only summary, land area auto-filled, timeline by type, amenities and public flag moved (A-1 to A-4, B-3, B-9, B-10)
2. **Land share done right:** generate once from the linked land, ≤ 100% guard, cost-per-share pricing, Sold only through booking, sold-out suggestion, status follows sales, demo fix (A-5, A-8, A-9, B-1, B-2, B-5)
3. **Tabs by type:** JV Allocation only for JV, Finance summary tab, Materials tab, Transfer-in removed (A-6, A-10, A-12, A-13)
4. **Estimate by type:** heads per type, overhead/finance cost removed from project estimates (A-7, A-11)
5. **Plot and building checks:** plot area guard, one-land-one-live-project rule, JV developer-share revenue (B-4, B-6, B-7)

---

## F. Progress (2026-10-10)

| Batch | Status |
|---|---|
| 1. Menu + project form | Done: menu order, form by type, land picker with confirm, read-only land and area, timeline per type, publish on the Sales card, one land one project |
| 2. Land share | Done: register from the linked land, exactly 100%, no second register, cost and profit per share, Sell button to booking, sold-out suggestion, Sold Out stage blocked while unsold, realistic demo prices |
| 3. Tabs by type | Done: JV Allocation only on JV land, one Finance tab (estimate, where the money went, sales & collection), Materials tab, Transfer in removed |
| 4. Estimate by type | Done: overhead and finance cost out of project estimates; heads named per type (Legal & deed on a share, layout approval on a plot) |
| 5. Plot and JV checks | Done: plots can't exceed the land; JV revenue says developer share X of Y units. One land one project was done in batch 1 |

Still open: plot "roads & common area %" (no field yet; the guard compares against the whole land), and a market-value line for inherited land (its cost sheet is near zero, so its margin looks very high).

---

## G. Round 2 feedback (2026-10-11) and plan

| # | Feedback | Plan |
|---|---|---|
| 1 | Land confirm popup: "estimated / spent" cost is confusing | Show plain facts: **Land price** (agreed, asking or paid, with which), **Paid so far**, and **Still to pay** |
| 2 | Cover image: upload, not a link; surroundings and picture on separate lines | Image upload (stored as a project document, used as the display picture); the link field goes |
| 3 | Estimate must not depend on flats, bookings, generation or land actuals | Estimate is its own type-based plan, typed by the owner: land, construction, etc., and expected sales. Actual cost is tracked separately against the project. The two are compared, never mixed |
| 4 | Status moves must collect that stage's information and files | Each move asks for the stage's own details and documents; key documents are **compulsory** (decision) |
| 5 | Project Materials should not raise purchase orders; procurement does. Project only requests and **receives**; received value becomes cost | Materials tab: request, see the project's requests and incoming orders, **receive** (decision: site receives). Material cost is counted **when received** (decision) |
| 5* | All money in Finance: costs from any stage (land, project, materials, procurement, finance itself), sales, collections and payments, per project and per sector. No cost tab under Project | New **Finance → Projects** page per project. Project's Finance tab removed (a link to Finance stays) |
| 6 | Site Progress and Material Requests don't need their own menu | Removed from the menu; requests and site log updates are done from the project's tabs |
| 7 | Procurement sees every project's requests | Procurement keeps the all-project request list and purchase orders |

Batches: R2-1 popup + picture (1, 2) · R2-2 menu, materials request/receive, site log from project (5, 6, 7) · R2-3 Finance per project with standalone estimate (3, 5*) · R2-4 stage moves with details and documents (4) · R2-5 SQA pass.
