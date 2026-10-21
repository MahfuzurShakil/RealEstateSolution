# Developer Suite — Real Estate Developer Platform

## Project title
Developer Suite

## Client
**Nokshi Properties Ltd.** *(company name used in the app's demo data. Swap in the real client name if it can be named publicly.)*
A Bangladeshi real estate developer that buys or joint-ventures land and builds and sells apartments, plots and land shares.

## Project type
SaaS dashboard (operations / ERP admin portal)

## Highlight
Land-to-handover operations in one platform

## Excerpt
An all-in-one operations platform for a real estate developer in Bangladesh. It follows every plot from first contact with a landowner through construction, sales, procurement and finance, with each staff role seeing only the screens that are theirs.

## Challenge
The developer ran its pipeline across spreadsheets, paper files and phone calls. A land deal could sit for weeks waiting on a site visit, a feasibility sign-off or a landowner's reply, and nobody could see what each plot was waiting on. Joint-venture terms, owner shares and settlement payments were tracked by hand.

Once a project broke ground, the gaps widened. Site engineers reported progress informally, material requests went missing between the site and the purchasing desk, and finance could not say what a project had sold, collected, spent or was owed without days of reconciliation. Management had no single view of which sites were behind schedule or which buyers were overdue.

## Solution
We built Developer Suite, a single web platform with eight modules: Land Management, Projects, Sales & CRM, Bookings & Customers, Site Progress, Procurement, Finance, and Users & Settings. Each land moves through a pipeline (sourced, site visit, due diligence, negotiation, JV signed or acquired, then linked to a project), and every card shows what that land is waiting on. Projects declare whether they sell flats, plots or land shares, then generate their towers and units from a floor pattern.

On the sales side, leads are de-duplicated by phone number and carry a follow-up queue showing overdue, due-today and unassigned leads. Bookings move from hold to confirmed, with role-based discount approval. A confirmed booking generates its instalment schedule automatically, and receipts are allocated oldest instalment first. The Site Progress module breaks each tower into weighted work items and keeps a daily log with photos and GPS. It also charts actual progress against plan, so sites that are behind schedule or have stopped reporting come to the top.

Procurement closes the loop: purchase orders, goods receipts with a quality-check gate and weighted-average costing, central and project stock, transfers and supplier payments. Finance rolls everything up per project (sales, collected, due, overdue, cost against budget and estimated profit), alongside a collections queue, expenses, cash position and refunds. A permission matrix decides which modules each of the 10 staff roles can open, and it drives both the sidebar and the route guard. The interface is fully responsive, down to phone width.

## Results
- **8** — integrated business modules, from land acquisition to finance
- **50** — admin screens
- **10** — role-scoped staff roles with a permission matrix

## Services
- Web development
- UI/UX design
- Custom software

## Industry
Real estate & property development

## Technologies
- **Framework:** Next.js 16.3 (App Router), React 19.2, TypeScript 5
- **Styling:** Tailwind CSS v4, Inter (via `next/font`), Lucide icons, clsx + tailwind-merge
- **Data:** Dexie.js 4 over IndexedDB (browser-local, Phase A prototype) with `dexie-react-hooks` live queries, behind a repository layer so Phase B can switch to Postgres + REST/tRPC without touching the UI
- **Maps:** Leaflet + React Leaflet
- **Hosting:** Vercel (deployed from GitHub `main`); a Netlify config is also included
- **AI provider:** none, as the project has no AI features

## Live URL
Not confirmed. The app deploys to Vercel from GitHub, but the production URL isn't recorded in the repo. Add it here if it can be shared publicly. The data is browser-local demo data that loads on first visit.

## Brand colours
- **#0D919C** — primary teal (`--color-admin-500`, sidebar, buttons, progress bars)
- **#14202E** — ink navy-charcoal (`--color-ink`, headings and body text)

## Screenshot list
| File | Shows |
|---|---|
| `01-dashboard-desktop.png` | Overview dashboard: record counts across all modules, money collected/due/overdue, and construction progress against plan |
| `02-dashboard-mobile.png` | The same dashboard at phone width, with the sidebar collapsed into a menu |
| `03-site-progress-desktop.png` | Site Progress for one project: overall % against plan, actual-vs-planned chart, per-tower progress and the weighted work breakdown |
| `04-site-progress-mobile.png` | The same Site Progress screen on a phone, as a site manager would use it |
| `05-finance-overview-desktop.png` | Finance roll-up: sales value, collected, due, refunds, total cost and estimated profit, with a per-project table showing overdue amounts and budget overruns |
| `06-land-pipeline-desktop.png` | Land pipeline in grid view: each land's stage, size, price, acquisition type and what it is waiting on |
| `07-project-detail-desktop.png` | Project detail: project information, linked land, the status stepper and unit inventory by status |
| `08-bookings-desktop.png` | Bookings list with discount-approval alerts, unit, price, discount, payment state and assigned salesperson |

*All names, phone numbers and amounts in the screenshots are fictional demo data seeded by the app. No real customer data is shown.*
