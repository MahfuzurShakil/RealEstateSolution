# Real Estate Developer Management Platform — Public Portal
## v2.0 — Final scope after the Admin rework (2026-10-25)

> Companion to the Admin scope (`Real-Estate-Developer-Platform_Scope-Document_v3.md`).
> v1.0 froze P1–P4 on 2026-09-01, before Module 2's project types, the
> PLATFORM-REPLAN pipeline, the direct-purchase rework and the sales
> simplification. v2.0 re-checks every v1 rule against the code as it stands at
> `d7d71a6` and is the version to build from. The filename keeps `_v1` so the
> references in AGENTS.md and the code comments still resolve.
>
> Admin tables are referenced, not repeated. Field names are the ones in
> `src/lib/db/types.ts`.

---

## 0. What changed in Admin since v1, and what it does to the public site

| Admin change (where) | v1 assumed | v2 rule |
|---|---|---|
| **Five project types** with shapes (`PROJECT_TYPES`, `PROJECT_SHAPE`, Dexie v25–27) | Every project is towers of flats | Listing filters on type; the detail page renders per shape: towers of flats/spaces, blocks of plots, or a share register (§3.4) |
| **`sales_status`** `not_open / open / paused / sold_out` (v29) | Badge from build status only | A project is public only when `is_public = true` **and** `sales_status ≠ not_open`. The badge reads sales status first (§3.2) |
| **Publish switch moved to the Sales card** (`ProjectSalesCard`), disabled until sales open | Toggle on the project edit form | No change needed; the public repository repeats the same gate so old rows can't slip through |
| **Shape-aware status labels** (`projectStatusLabel`, `pipelineSteps`) | One mapping for all | Stage label mapping per shape (§3.3) |
| **Unit status `draft`** (v33, bulk generation with missing details) | Not in the enum | `draft` units never reach the public site, not even in the grid |
| **Unit booking flow**: hold → `reserved`, confirmed → `booked`; manual `hold` (S1, `applySideEffects`) | hold / reserved / booked all exist | Same mapping, all three show "Booked" |
| **Plots and shares on `units`**: `land_size`, `land_size_unit`, `share_pct`, `road_width_ft`, `is_corner`; `floor`/`size_sqft` nullable (v26) | Every unit has floor and sqft | Card fields come from `shapeUses()` / `unitSizeLabel()`, never hard-coded sqft |
| **Front road width moved to `lands`** (v33 → v39); plot blocks keep `towers.front_road_width_ft` | Tower specification row | "Front road" reads the linked land's `front_road_width_ft` (only that field crosses over) |
| **Tower size facts**: `basement_count`, `floor_area_sqft`, `staircase_count`; project `design_*` fields (2026-10-21) | Building type, units/floor, lift, backup | Specification block adds basements and typical floor area |
| **Uploaded cover image** `cover_image_document_id` (Blob in IndexedDB) | `cover_image_url` | Cover = that document if set, else `cover_image_url`, else a stock placeholder |
| **Site GPS only on `lands`** (`gps_lat`, `gps_lng`) | "See on map" from project GPS | Map link from the first linked land's coordinates; no project GPS field is added |
| **Progress per shape**: towers have WBS %; plots progress through land development; shares have none | Tower % for everyone | P3 shows tower % for built shapes only (§4) |
| **`progress.public.repository.ts`** already exists, returns latest photo per tower | Planned | Kept; gains a photo-feed method in batch PB4 |
| **`leadRepository.captureInquiry`** with phone dedup, `source` parameter | Planned | P4 calls it through a public wrapper; one gap to fix (§5.3) |
| **Lead → booking in one step, stage records** (d0c5d94) | — | Nothing to change: website leads enter at `new` like any other |
| **`blog_posts`** | New table | Still not built (only `EntityType 'blog_post'` exists). Needs a new Dexie version block (§2.3) |
| **Demo "clean start" mode** (969af30) | — | Every public page needs a real empty state ("No projects on sale yet") |

Nothing in the cost, procurement, direct-purchase, fund or partner modules
touches the public site, and none of it may: those tables never get a public
repository.

---

## 1. Architecture

- **One app, two portals.** Public routes live in `src/app/(public)/*`, with
  their own layout and visual identity (Design Reference Part B). They read the
  same Dexie database as Admin, so a project published in Admin shows on the
  site at once.
- **Public repositories only.** Public pages import from
  `src/lib/repositories/public/*` and nothing else. Each method returns a
  hand-built `Public*` object, never a spread of the Dexie row, so a new admin
  field can never leak by default.
- **Never public:** `base_price` of non-available units, discounts, bookings,
  customers, payments, any cost/budget/expense/fund/partner row, landowner
  identity or share, `allocation_type`, `allocated_to_owner_id`,
  `for_sale_by` (the value itself), WBS planned dates/weights/delay, land
  price, deed/khatian/DD data, lead data of other people.
- **One write:** the inquiry form, into `leads` / `lead_activities`, through
  `leadRepository.captureInquiry` with `source = 'website_form'` forced by the
  wrapper.
- **Phase A rendering:** pages are client components (IndexedDB is in the
  browser). Images stored as Blobs are shown through the shared `useBlobUrl`
  data-URL hook, as in Admin. A project with no picture gets a drawn
  placeholder, not a stock photo (a stranger's building on a real project's
  card would be a claim). Phase B moves these pages to server rendering for SEO; the
  repository signatures stay.
- **URLs:** `/projects/[code]` using `projects.code` (stable, already unique).
  No slug field is added for projects. Blog uses `blog_posts.slug`.

---

## 2. MODULE P1 — Core pages

### 2.1 Pages

| Route | Content | Source |
|---|---|---|
| `/` Home | Hero, trust strip, counts (projects on sale, completed projects), featured projects (3–4), "browse by type" tiles for the types that have public projects, latest 3 blog posts, contact CTA | `publicProjectRepository.featured()`, `.stats()`; `publicContentRepository` |
| `/about` | Company story, mission, completed-project count | `company_settings` website fields (§2.2) |
| `/contact` | Address, phone, email, WhatsApp, office hours, map link, general inquiry form | `company_settings`; form → P4 with no project |
| `/blog`, `/blog/[slug]` | Published posts | `blog_posts` (§2.3) |

### 2.2 `company_settings` addendum (unindexed, no version block — same precedent as `whatsapp_number`)

```
website_tagline     VARCHAR, nullable   -- hero line
about_text          TEXT, nullable      -- About page body (plain text / paragraphs)
office_hours        VARCHAR, nullable   -- e.g. "Sat–Thu, 10am–7pm"
facebook_url        VARCHAR, nullable
office_map_url      VARCHAR, nullable   -- Google Maps link for the head office
```

Edited in Admin → Settings → Company, in a new "Website" card. Empty fields
hide their section; the site never shows a blank label.

### 2.3 `blog_posts` (new table, new Dexie `version(n)` block)

```
blog_posts
 - id, created_at, updated_at, created_by      (BaseEntity)
 - slug           VARCHAR, UNIQUE, indexed
 - title          VARCHAR
 - excerpt        VARCHAR
 - content        TEXT        -- plain text with paragraphs in Phase A
 - author_id      UUID → users.id, nullable
 - status         ENUM: draft | published, indexed
 - published_at   DATE, nullable
```

Documents: `entity_type = 'blog_post'`, types `cover_image`, `content_image`,
`other` (lookup_values seed). Admin: a "Blog" page under a new **Website**
sidebar group, list + popup form + publish/unpublish (POPUP-SYSTEM.md rules),
roles `super_admin` and `management`.

---

## 3. MODULE P2 — Project listing and detail

### 3.1 Visibility gate (in the repository, every method)

```
public(project) = project.is_public === true
               && projectSalesStatus(project) !== 'not_open'
```

`is_featured` counts only when `public(project)` holds.

### 3.2 Sales badge (from `sales_status`)

| `sales_status` | Badge | Inquiry form |
|---|---|---|
| `open` | **On Sale** (green) | Yes |
| `paused` | **Bookings Paused** (amber) | Yes, message says sales will reopen |
| `sold_out` | **Sold Out** (gray) | Yes, framed as "register interest in our next project" |

### 3.3 Stage label (from `status` + shape)

| Shape | Upcoming | Ongoing | Ready / Completed |
|---|---|---|---|
| Tower (apartment, commercial, mixed) | planning, design, approval | under_construction, nearly_complete | handover_ongoing → "Ready", closed → "Completed" |
| Plot | planning, design, approval | under_construction ("Under Development") | handover_ongoing ("Possession"), closed → "Completed" |
| Share | — | planning ("Register Open") | nearly_complete and later → "Completed" |

`closed` projects stay public only if the admin leaves them published; they
appear under a "Completed projects" section as portfolio, without units.

### 3.4 Listing card — `PublicProjectCard`

```
code, name, project_type, type_label (PROJECT_TYPE_LABEL)
location_summary
cover            { kind: 'blob' | 'url' | 'placeholder', ... }
sales_badge, stage_label, is_featured
item_label       -- "Flats" / "Spaces" / "Plots" / "Shares" (shape labels)
price_from       -- MIN(base_price) of company-sold available units; null if none
available_count  -- COUNT of company-sold available units
size_range       -- "1,250–1,650 sqft" / "3–5 katha" / "5% per share" via unitSizeLabel
expected_completion_date  -- built shapes only, month + year
```

Company-sold = `for_sale_by = 'company'`. `draft` units are excluded from
everything.

**Filters** (`/projects`): type (multi), stage (Upcoming/Ongoing/Ready),
location (distinct `location_summary` values), price bucket
(`BUDGET_RANGE_OPTIONS`, matched against `price_from`), "available now" toggle.
Sort: featured first, then newest.

### 3.5 Detail page — `PublicProjectDetail` (per shape)

Common to every shape:

```
card fields +
surroundings (text, shown as bullets split on newlines)
amenities[]
gallery[]        -- documents: entity_type='project', document_type='gallery_image', is_public
brochure         -- latest public 'brochure' document → "Download Brochure"
floor_plans[]    -- public 'layout_floor_plan' / 'layout_plan' documents
map_link         -- first linked land's gps_lat/gps_lng → Google Maps URL; else none
front_road_ft    -- first linked land's front_road_width_ft
```

**Tower shapes** (apartment, commercial, mixed):

```
specification: building_type, floor_count, basement_count, unit_per_floor,
               lift_count, staircase_count, electricity_backup, floor_area_sqft
towers[]: { name, stage, progress_pct }               -- P3
unit_types[]: grouped by unit_type: { unit_type, size range, bedrooms,
               bathrooms, balconies, price_from, available_count }
grid[tower][floor] → { code, unit_type, size, facing, public_status,
               price (available only) }
```

Commercial hides bedroom/bathroom/balcony (shape fields). Mixed shows both.

**Plot shape** (`plot_development`): blocks instead of towers; a plot table/grid
per block with `land_size` + unit, `road_width_ft`, `is_corner`, `facing`,
`public_status`, price when available. Block-level road width from
`towers.front_road_width_ft`. No specification block.

**Share shape** (`land_share`): no grid. A register summary: total shares,
shares available, holding per share (`share_pct` and `land_size`), price per
share, and the plot's total land area (`projects.total_land_area`). The
`construction_after_sale = planned` case shows one line: "A building on this
land is planned after the shares sell."

### 3.6 Unit public status

| Admin `units.status` | Public |
|---|---|
| `draft` | not shown |
| `available` (company) | **Available** — price shown, click opens unit inquiry |
| `hold`, `reserved`, `booked` | **Booked** |
| `sold`, `handed_over` | **Sold** |
| any status, `for_sale_by = 'owner_direct'` | **Sold** — so the building is complete on screen without saying who sells it |

### 3.7 Pricing

`base_price` is shown for available company units ("From ৳ X" on cards).
Premiums, other charges and discounts are never shown; the inquiry is where a
final price is quoted. A company setting `public_show_prices` (unindexed,
default true) switches every price to "Call for price".

---

## 4. MODULE P3 — Construction progress

| Shape | What the visitor sees |
|---|---|
| Tower | Per tower: stage + rounded `current_progress_pct` bar; overall % = average; photo timeline (newest first) of `progress_photo` documents with `is_public = true`, each with date, tower name and caption |
| Plot | Stage stepper only (Planning → Layout Design → Subdivision Approval → Under Development → Possession). Land-development % stays internal in v2 |
| Share | No progress section |

Caption = `site_progress_updates.remarks` of the update the photo belongs to.
No work-item names, planned dates, weights or delay figures cross over
(`progress.public.repository.ts` already enforces this; it gains
`photoFeedForProject(projectId, limit)`).

Publishing a photo stays the existing `is_public` tick on the photo
(`ProgressPhotoGallery`, `PublicProgressPreview`). No separate workflow.

---

## 5. MODULE P4 — Inquiry and WhatsApp

### 5.1 Form

`name` (required), `phone` (required, BD mobile check via `normalizePhone`),
`email`, `message`, `budget_range` (`BUDGET_RANGE_OPTIONS`), plus hidden
`interested_project_id` / `interested_unit_id` from the page it was opened on.

### 5.2 Where it appears

- Project detail: sticky "Interested in this project?" bar → popup form
- Unit/plot cell (Available only) → same popup with the unit pre-filled
- Share register → "Ask about a share"
- Contact page → inline, no project
- Every page: floating WhatsApp button

### 5.3 Submission

`publicInquiryRepository.submit(input)` → `leadRepository.captureInquiry({...,
source: 'website_form'})`.

- New phone → new lead at `new`, unassigned; it lands in the Leads list where
  bulk assign already handles "this morning's website enquiries".
- Known phone → no new lead, a `lead_activities` row on the existing one.
  **Gap to fix:** today that note does not say which project or unit was asked
  about. The merged note must name them (`"… asked about PRJ-2026-003 · A-5B"`).
- Success message on the form, no redirect.

### 5.4 WhatsApp

`https://wa.me/{whatsapp_number digits}?text=Hi, I'm interested in {project name}{ - unit code}`.
No lead is created automatically (needs WhatsApp Business API, Phase 2). Hidden
when `whatsapp_number` is empty.

### 5.5 Spam

Phase A: honeypot field only. Phase B: rate limit per phone/IP.

---

## 6. Admin-side work this needs

1. Settings → Company: "Website" card (§2.2 fields + `public_show_prices`).
2. Sidebar group **Website**: Blog posts (§2.3) and a link "View public site".
3. Project page, Sales card: under the publish switch, a **"Ready for the website"
   checklist** — cover image, location summary, at least one public gallery
   image, at least one available unit with a price, brochure (optional).
   Warnings only, never a block.
4. Lead activity note fix (§5.3).
5. Demo seed: 3–4 published projects across apartment, plot and share, with
   public gallery images, a brochure, public progress photos, and website-form
   leads. Clean-start mode keeps none of them.

---

## 7. Build order (each batch browser-verified, seeded, pushed)

| Batch | Scope | Done when |
|---|---|---|
| **PB1** Foundation | Public layout (header, footer, WhatsApp float), palette and type per Design Reference Part B, `publicProjectRepository` (gate, card, detail per shape), `publicContentRepository` (company info), drawn image placeholder | Repository returns correct shapes for the 7 demo projects; non-public and `not_open` projects return nothing — **done 2026-10-25** |
| **PB2** Listing + Home | `/`, `/projects` with filters, cards, empty states | Publish/unpublish in Admin changes the site on reload |
| **PB3** Project detail | Gallery, specs, unit-type cards, floor grid / plot table / share register, brochure and floor-plan downloads, map link | Each of the three shapes renders with real demo data; no internal field in the page |
| **PB4** Progress | Tower bars + photo timeline; plot stepper | Ticking a photo public in Site Progress shows it on the project page |
| **PB5** Inquiry | Popup + contact form, WhatsApp links, lead note fix | A website inquiry appears in Admin → Leads as `website_form`; repeat phone adds an activity naming the project |
| **PB6** About, Contact, Website settings, readiness checklist | §2.1, §2.2, §6.1, §6.3 | Settings edits show on the site |
| **PB7** Blog | Dexie version block, admin Blog page, `/blog`, `/blog/[slug]`, home "latest posts" | A published post shows; a draft does not |

PB1–PB5 are the demo-able site. PB6–PB7 can follow.

---

## 8. Deferred (Phase 2)

- Customer login (own booking and payment history), wishlist
- WhatsApp Business API lead capture
- Bangla/English toggle
- Plot land-development % on the public page
- Structured `surroundings` (name + photo per landmark)
- Server rendering and SEO metadata per project (Phase B)

---

## 9. Decision log

- v2.0 (2026-10-25): public = `is_public` **and** sales open/paused/sold out,
  enforced in the public repository as well as the admin switch.
- v2.0: the detail page is per shape; plots and shares are first-class, not
  flats with missing fields.
- v2.0: `draft` units are invisible; owner-direct units show as Sold.
- v2.0: map and front road come from the linked land; only those two land
  facts are public.
- v2.0: company website text lives on `company_settings` (no new table); blog is
  the only new table.
- v2.0: prices on by default with a `public_show_prices` switch (was "open
  question" in v1 §2.9).
- v2.0: sold-out and paused projects stay listed with their badge; inquiries are
  still taken.
- Kept from v1: contact and project inquiries share `leads`; no
  `contact_messages` table. Unit nuance (hold/reserved/booked) collapses to
  "Booked". Brochure is its own CTA. No WBS detail or delay in public. WhatsApp
  is not auto-captured.
- v1 note kept for history: dpremiumhomes.com was checked live in Chrome and is
  the source of component ideas only (sticky inquiry bar, unit cards,
  specification block, landmarks, map, card badges), not of colours.
