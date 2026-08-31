<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:project-rules -->

# Real Estate Developer Platform — project rules

Source of truth for scope/schema/workflow (do not invent fields):
- `Real-Estate-Developer-Platform_Scope-Document_v3.md` — Admin Portal, 8 modules
- `Real-Estate-Developer-Platform_Public-Portal_v1.md` — Public Portal, P1–P4
- `Real-Estate-Developer-Platform_Design-Reference_v1.md` — visual language

Architecture:
- One Next.js app, two portals. Admin = `src/app/admin/*` (teal UrbanHub-style shell);
  Public = `src/app/(public)/*` (its own visual identity, built later).
- Both share ONE Dexie/IndexedDB database (`src/lib/db/database.ts`).
- **UI never calls Dexie directly.** Always go through `src/lib/repositories/*`,
  so Phase B (Postgres + REST/tRPC) only rewrites that layer.
- Public routes must use dedicated public repositories that whitelist fields —
  never expose internal/financial data (cost, discount, landowner info).
- Table and field names match the scope documents exactly, in both phases.
- Adding a module = new Dexie `version(n).stores({...})` block; never edit an
  existing version block.
- Workflow statuses stay ENUMs in code; option lists live in `lookup_values`.
- Every entity carries `id`, `created_at`, `updated_at`, `created_by`, plus a
  display `code` (e.g. `LND-2026-001`) where the scope doc specifies one.
<!-- END:project-rules -->
