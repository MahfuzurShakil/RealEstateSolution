# Real Estate Developer Management Platform

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

## Tables so far

Shared: `documents`, `lookup_values`, `company_settings`
Module 1 (Land): `lands`, `landowners`, `land_owner_mapping`, `land_jv_details`,
`land_status_history` (pipeline audit trail, Dexie v2)

Later modules append a new Dexie version block; existing versions are never edited.

## Demo data

A fresh database seeds itself with a Bangladesh-context sample set for Module 1
(`src/lib/db/demo-data.ts`): 9 lands covering every pipeline status and both
acquisition types, 10 landowners, JV terms, pipeline history and a couple of
sample attachments. The admin dashboard has a **Demo data** card to reload or
clear it; clearing is remembered, so it does not come back on reload.

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
