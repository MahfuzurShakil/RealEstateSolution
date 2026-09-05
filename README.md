# Real Estate Developer Management Platform

> **New here? Start with the [Platform Handbook](PLATFORM-HANDBOOK.md).**
> What the eight modules do in business terms, how a record travels from a plot
> of land to money in the bank, and the rules the software enforces on the way.
> Written for a reader who does not know the code.

Phase A prototype: Next.js (App Router) + TypeScript + Tailwind CSS v4, data in
browser IndexedDB via Dexie.js.

```bash
npm run dev
```

- Admin Portal → http://localhost:3000/admin
- Public Portal → http://localhost:3000

Data lives in the browser only (device/browser-local, lost when site data is
cleared). No auth — the topbar has a mock "role" switcher.

## Structure

```
src/
  app/
    layout.tsx            root: fonts + DatabaseProvider only
    admin/                Admin Portal (sidebar + topbar shell)
    (public)/             Public Portal (own layout, own identity later)
  components/
    admin/                AdminShell, AdminSidebar, AdminTopbar, nav-config
    ui/                   Card, PageHeader
  lib/
    db/                   Dexie database, entity types, seed, DatabaseProvider
    repositories/         data-access layer (UI never touches Dexie directly)
    auth/                 mock role session (Phase A)
    utils/                id/code generation, formatting, cn
```

## Modules built

- **Module 1 — Land Management**: land list (filters, sort, grid/list), add/edit
  form with owner rows and conditional JV block, detail page with pipeline
  transitions, owners/JV/documents tabs, landowner master list.
- **Module 2 — Project Creation**: projects and their pipeline, towers, bulk
  unit generation and allocation, JV allocation check.
- **Module 3 — Sales / Lead / CRM**: leads with phone-based dedup, follow-up
  activity log, assignment, lost/revive.
- **Module 4 — Booking & Customer**: customers, bookings with the hold →
  confirmed pipeline, role-based discount approval, instalment plans, payments.
- **Module 5 — Site Progress**: per-tower WBS, the daily progress log with
  photos and GPS, planned-vs-actual roll-up, and material requests.
- **Module 6 — Procurement & Supplier Voucher**: suppliers, purchase orders,
  goods receipts (weighted-average costing, quality check gate), project and
  central stock, issues to site, transfers, supplier payments, and the
  project-wide cost chain of Section 7.11.
- **Module 7 — Finance**: instalment schedules generated from a project's plan
  when a booking is confirmed, receipts allocated across them oldest-first, a
  collections queue with read-time overdue, refunds on cancelled bookings, the
  generic cost ledger, and the per-project sales/cost/profit roll-up.
- **Module 8 — Users, Roles & Settings**: staff accounts with project-level
  scoping, the Section 9.6 permission matrix driving the sidebar and a route
  guard, editable master-data option lists, and the company profile.

All eight admin modules of the scope document are built. The Public Portal
(`Real-Estate-Developer-Platform_Public-Portal_v1.md`) is the next phase.

## Tables so far

Shared: `documents`, `lookup_values`, `company_settings`
Module 1 (Land): `lands`, `landowners`, `land_owner_mapping`, `land_jv_details`,
`land_status_history` (pipeline audit trail, Dexie v2)

Module 2 (Project): `projects`, `land_project_mapping`, `towers`, `units`,
`project_status_history` (v3, v6)
Module 3 (CRM): `users`, `leads`, `lead_activities` (v4)
Module 4 (Booking): `customers`, `bookings`, `discount_approval_rules` (v5),
plus `payments` and `installment_plan_templates` brought forward from Module 7 (v7)
Module 5 (Site Progress): `tower_work_items`, `site_progress_updates`,
`material_requests`, `material_request_items` (v8),
`material_request_status_history` (v9)
Module 6 (Procurement): `suppliers`, `purchase_orders`, `purchase_order_items`,
`goods_receipts`, `goods_receipt_items`, `stock`, `stock_issues`,
`stock_transfers`, `supplier_vouchers` (v10)
Module 7 (Finance): `payment_schedules`, `payment_installments`, `refunds`,
`expenses` (v11)
Module 8 (Users & Roles): `user_project_assignments` (v12) — `users` itself
arrived with Module 3

Later modules append a new Dexie version block; existing versions are never edited.

## Demo data

A fresh database seeds itself with a Bangladesh-context sample set covering
every module (`src/lib/db/demo-*.ts`, loaded by `demo-seed.ts`): lands across
every pipeline status and both acquisition types, projects with generated units,
leads and bookings, a construction log running ahead of and behind plan, a
procurement chain reaching every purchase-order status and quality check, and a
cost ledger with overdue collections and a part-settled refund, and staff
accounts scoped to different sets of projects.

Everything date-dependent is an offset from the day the demo is loaded, never a
fixed date, and the seed goes through the repositories the UI uses — so stock
levels, weighted average costs and request statuses are produced by the real
code rather than written into the tables.

The admin dashboard has a **Demo data** card to reload or clear it; clearing is
remembered, so it does not come back on reload.

## Deployment

### Vercel (recommended — Next.js needs no configuration there)

In Vercel: **Add New → Project → Import** `MahfuzurShakil/RealEstateSolution`.
The framework is detected as Next.js; leave the build command, output directory
and install command on their defaults and deploy. No environment variables are
needed — the app has no server-side secrets. Every push to `main` redeploys, and
pull requests get their own preview URL.

### Netlify

The repo carries a `netlify.toml`; Netlify installs the Next.js runtime plugin
itself. In Netlify: **Add new site → Import an existing project → GitHub →
MahfuzurShakil/RealEstateSolution**, keep the detected settings
(`npm run build`, publish `.next`) and deploy. Every push to `main` redeploys.

Remember what Phase A means for a hosted demo: all data lives in the visitor's
own browser (IndexedDB), so each visitor starts with an empty database and
nothing is shared between devices.
