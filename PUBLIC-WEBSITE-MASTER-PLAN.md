# Public Website — Master Plan (design, content, motion, data)

## Context
Admin portal is nearly done. The public site has a Hously-style theme (green, rounded cards,
League-Spartan-like geometric sans) with `/home`, `/projects`, `/projects/[code]` built
(PB1–PB2 done, PB3 partly). Client likes the theme but wants **the best developer website in
the market**: professional, industry-standard UI/UX, purposeful animation, very user friendly.
All project data must come from Admin (same Dexie DB, through `src/lib/repositories/public/*`).

This plan is the single reference for building it (approved 2026-10-25). It extends — never
contradicts — `Real-Estate-Developer-Platform_Public-Portal_v1.md` (v2.0 scope: visibility gate,
whitelisted public repositories, unit public status, pricing rules), which stays the data-rules
source. Where this plan's build order differs from v2 §7, this plan wins.

**Status: final (2026-10-26).** Includes the live review of the current site and a full code and
data audit (§0, §10.1–10.3). Next step: build W0.

### Decisions confirmed with the client (2026-10-25)
- Look: **Evolved Hously** (§5). Motion: **Balanced** (§6).
- Bangla: **Phase 2, but ready from the start** — all public copy goes through one text
  dictionary (`src/components/public/i18n/en.ts`), `lang` set on `<html>`, layouts tested with
  ~30% longer strings, Bangla fonts reserved but not loaded yet.
- Extras in scope: **Landowner / JV page**, **testimonials + team + awards**, **site-visit
  booking**. A separate `/progress` page is **not** in scope; progress stays on the project page
  and as a home strip linking to each project's progress section.

### What exists today (reviewed live on :3001, desktop + mobile)
- Home: hero slider (featured project + right-side project rail) → search card (type tabs, area,
  budget) → stats counters → projects on sale (type chips) → explore by area (bento) → how buying
  works (6 steps) → payment planner (sliders) → why buy with us → buyers abroad (dark) → FAQ → footer.
- Listing: left filter chips (type, stage, budget, area, "only available"), 3-col cards.
- Detail: breadcrumb, badges, price, big cover, sticky section tabs, fact tiles, sticky inquiry card
  (Call / WhatsApp), apartment type cards, facilities, nearby, floor-wise availability grid with
  tower tabs, specification tables, construction progress ring + bars, brochure, location card,
  payment plan, more projects. Mobile: bottom Call/WhatsApp bar.
- Weak spots seen: demo cover is a "Sample document — demo data" text image showing in the hero
  and cards; hero text low contrast over image; counters render "0" until animated (bad for no-JS/
  SEO and they showed wrong mid-values on mobile); green buttons (#16a34a-ish) with white text fail
  WCAG AA (≈3.3:1); thin header nav (only Home/Projects); no About/Contact/Progress/Blog pages;
  mobile hero very tall with text over busy image; price block alignment odd on mobile; no gallery
  lightbox / floor-plan viewer / map; no route transitions.
- Code audit (2026-10-26) adds:
  - `/projects` never got the Hously restyle (only colours swapped); its filter column isn't sticky.
  - No visible focus styles anywhere; filter sheet, mobile menu and lightbox don't trap focus or
    close on Esc.
  - Hero slider: no pause button, no swipe, keeps rotating under reduced motion.
  - Availability shows status by colour + hover tooltip only.
  - "Every taka" badge overflows its image on tablets, so the page scrolls sideways.
  - Unit details panel (`top-28`) hides under the section nav (~138px).
  - Area bento leaves holes with 2/4/5 tiles; zero stats hide and leave a gap in a 4-col row.
  - "Bookings Paused" white-on-amber is ≈2.1:1; sales badge is always green in hero/detail header.
  - No shared Button/Badge/SectionHeader; date/phone formatting copied 3–4 times.
  - `featured()`, `stats()`, `locations()` exist in the repository but are unused (pages
    recompute in the browser).
  - No `not-found`, `error`, `loading`, sitemap or OG files; tab titles are static.
  - "Book a site visit" is only a `tel:` link; there is no enquiry form anywhere.
  - Hard-coded copy: why-us bullets, NRB cards, buying steps, FAQ, footer blurb, planner defaults
    (10/20/10%, 24 months, ৳30 L–5 Cr range, which breaks cheaper plots/shares), area list (22
    Dhaka areas only).

---

## 1. Product principles (every decision is checked against these)
1. **Trust first** — big money decision. Show papers, approvals, live availability, real progress
   photos, every taka against a receipt. Never fake numbers or stock photos on real projects.
2. **Answer in 5 seconds** — every project card and detail header answers: where, what, how big,
   how much, when ready, how many left.
3. **One clear next step per screen** — Call · WhatsApp · Book a site visit · Enquire. Always
   reachable in one tap on mobile.
4. **Mobile-first for Android on 4G** — Bangladesh traffic is ~80% mobile. Budgets in §9.
5. **Motion with meaning** — animation explains (continuity, hierarchy, feedback), never delays
   reading; respects reduced-motion.
6. **Admin is the source** — no hard-coded project facts. Static marketing copy lives in Website
   settings so the client can edit it.

## 2. Audiences and what each needs
| Persona | Needs | Served by |
|---|---|---|
| Local family buyer (Dhaka, 30–50, phone, WhatsApp) | price, size, location, handover, instalments, trust | cards, detail, calculator, site-visit booking |
| NRB buyer (Gulf/Europe/NA) | video walk-through, documents by email, remote payment, POA | NRB page, WhatsApp, timezone-aware callback |
| Investor (plots / land shares) | land size, road, corner, papers, appreciation, share register | plot table, share register, land facts |
| Landowner (joint venture) | how JV works, sharing ratio, trust | `/landowners` page + offer form |
| Existing buyer | progress photos, (Phase 2) own payments | progress pages, customer portal later |

## 3. Market analysis → ideas adopted
(Research summary filled from the competitor scan — BD: Shanta, bti, Assure, Navana, Sheltech,
Rancon, Edison, Anwar Landmark, JCX, dpremiumhomes; global: Emaar, Sobha, DAMAC, Godrej, Lodha,
Prestige, Aldar, Ellington, Omniyat; portals: Zillow, Rightmove, Property Finder, Bayut,
Bproperty; Awwwards real-estate winners.) See §3.1–3.3.

### 3.1 Patterns the best sites converge on (adopt)
- Image-led hero with one strong statement + search directly below (Emaar, Hously, Bayut).
- Big, honest numbers band: years, projects delivered, families handed over (bti, Assure, Navana).
- Project cards with status badge, key facts and "from" price (Godrej, DAMAC, Property Finder).
- Filter bar with URL-synced filters, result count, sort, grid/list/**map** view (Zillow, Rightmove).
- Detail page: gallery mosaic + "View all photos" lightbox, sticky sub-nav, sticky enquiry card,
  configurations/unit types, floor plans with zoom, amenities icon grid, location map with
  nearby landmarks + distance, construction progress photos, payment plan, similar projects
  (Sobha, Lodha, Godrej, Emaar).
- Interactive availability / stacking plan with colour + legend (dpremiumhomes, Ellington).
- Construction updates feed with dated photos (bti, Sobha "construction updates").
- Lead capture everywhere but light: WhatsApp, click-to-call, callback, **book a site visit with
  date/slot** (Godrej, Lodha), brochure download.
- Landowner / joint-venture page with offer form (bti, Assure, Navana, Rancon — very common in BD).
- Trust: RAJUK approval no., REHAB membership, awards, testimonials (video), bank loan partners.
- NRB section (Assure, Navana, Shanta).
- Editorial luxury moments: full-bleed renders, slow image scale, mask reveals (Shanta, Omniyat).

### 3.2 Anti-patterns to avoid
Splash/intro loaders (Shanta's typed intro delays content); scroll-jacking; autoplay video with
sound; popups on entry; gated brochures before seeing anything; "price on request" everywhere;
tiny grey text on photos; carousels hiding key content; heavy 3D on mobile; stock photos
presented as the real project.

### 3.3 Where we beat them
Live availability straight from the sales desk, honest prices, published progress photos, plots
and land shares as first-class products, every enquiry lands in Admin → Leads instantly.

---

## 4. Sitemap and navigation

```
/                      Home (production). Demo portal chooser moves to /portal
/projects              All projects (filters, grid | list | map)
/projects/[code]       Project detail (tower / plot / share shape) ?unit=A-5B opens unit drawer
/completed             Delivered projects portfolio (closed / handover, published)
/landowners            Joint-venture page + land offer form
/buyers-guide          Buying steps, papers checklist, costs, calculator, FAQ
/nrb                   Buying from abroad
/about                 Story, values, numbers, milestones, leadership, certifications, awards
/contact               Offices, map, hours, form, WhatsApp
/blog, /blog/[slug]    News & articles (PB7)
/privacy, /terms       Legal
/my (Phase 2)          Customer portal
```
Header (desktop): Logo · **Projects ▾** (mega menu: by type with counts, by area, 1 featured
project card) · Completed · Landowners · About ▾ (Company, Leadership, Awards) ·
Buyer's guide ▾ (Process, NRB, Calculator, FAQ) · Contact | hotline · `EN | বাং` (Phase 2) ·
**Book a visit** (primary button).
Mobile: logo + hotline icon + menu → full-screen sheet (big links, contact buttons at bottom).
Persistent mobile bottom bar on detail pages: **Call · WhatsApp · Book visit**.
Footer: brand + tagline + REHAB/RAJUK badges · Projects (by type) · Company · Help (guide, NRB,
FAQ, contact) · Contact (address, phone, email, hours, map) · social · legal row.

---

## 5. Design system ("Nokshi Green" — evolved Hously)
Keep what the client liked (green, airy white, rounded cards, friendly geometric sans) and add
premium depth (deeper green, warm neutrals, brass accent, dark "forest" sections). Scoped to the
public layout only (`.site` scope / public `@theme`), Admin teal untouched.

### 5.1 Colour tokens
| Token | Hex | Use |
|---|---|---|
| brand-50 | #ECF8F1 | tinted backgrounds, available cell bg |
| brand-100 | #D3F0DF | chips, hover fills |
| brand-300 | #74CB9D | decorative, progress track glow |
| brand-500 | #1E9A5E | icons, large text, progress fill |
| **brand-600** | **#157F4C** | **primary buttons/links (white text 5.0:1 AA)** |
| brand-700 | #11663E | hover / pressed |
| brand-900 | #0B3F28 | headings on tint |
| forest-900 | #0D1F17 | dark sections, hero overlay, footer |
| forest-950 | #07120D | footer bottom bar |
| brass-400 | #C9A35A | accent on dark (eyebrows, awards, rating) |
| brass-700 | #8A6420 | accent text on light (5.3:1) |
| ivory | #FBFAF7 | page background |
| sand | #F4EFE6 | alternate section background |
| white | #FFFFFF | cards |
| ink-900 | #1C1917 | headings |
| ink-600 | #57534E | body text |
| ink-400 | #A8A29E | meta text (large only) |
| line | #E7E5E4 | borders, dividers |
| amber-700 / amber-50 | #B45309 / #FEF3C7 | Booked, Bookings paused |
| stone-600 / stone-100 | #57534E / #F5F5F4 | Sold, Sold out |
| danger | #B91C1C | errors |
Ratio: 60% ivory/white, 25% ink/forest, 10% green, ≤5% brass.
Availability never colour-only: Available = green + ✓, Booked = amber + clock icon, Sold = grey +
strike-through code.

### 5.2 Typography
- Headings: **League Spartan** (kept from Hously) 600/700, tight tracking (-0.02em).
- Body/UI: **Plus Jakarta Sans** 400/500/600 (more readable than Spartan at small sizes).
- Accent: **Instrument Serif italic** for 1–3 emphasised words in big headlines only
  ("Homes you can *book today*") — premium touch without changing the theme.
- Bangla (Phase 2 toggle, load only then): Hind Siliguri (body), Anek Bangla (headings).
- All via `next/font` (self-hosted, `display: swap`), max 3 families on first load.
- Scale (desktop / mobile): Display 64/40, H1 48/34, H2 36/28, H3 24/20, H4 20/18, body 16/16,
  small 14, micro 12 (uppercase eyebrow, +0.12em). Line-height 1.1 headings, 1.6 body.
- Numbers: `tabular-nums`; money as `৳ 1.41 Cr`, `৳ 36 Lakh`; sizes `1,120 sqft`, `3 katha`.

### 5.3 Layout, shape, depth
- Container 1280px, 12-col grid, gutters 24px (16px mobile). Section padding 112/80/56px.
- Radius: cards 20px, images 16px, inputs 12px, buttons + chips full pill, hero 28px inset.
- Shadows (green-tinted): s1 `0 1px 2px rgb(13 31 23/.06)`; s2 `0 10px 30px -12px rgb(13 31 23/.18)`;
  s3 `0 24px 60px -20px rgb(13 31 23/.28)`.
- Icons: lucide-react, 1.75 stroke, 20/24px, in 40px tinted rounded squares for feature lists.
- Imagery: 4:3 cards, 16:9 heroes, warm grade; real Admin uploads first; demo uses curated stock
  renders (never text-document images); no picture → drawn placeholder (existing rule).

### 5.4 Component library (`src/components/public/ui/*`)
Button (primary, secondary-outline, ghost, on-dark, icon, WhatsApp), Badge (sales, stage,
featured), Chip/FilterChip, Input/Select/PhoneInput, Card shells, SectionHeader (eyebrow + title
+ lead + action), Tabs (sliding indicator), Accordion, Drawer (right on desktop) / BottomSheet
(mobile), Modal, Toast, Tooltip, Carousel, Lightbox, ZoomViewer, Stepper, ProgressRing/Bar,
StatCounter, Map + Pin, StickyCTA, Breadcrumb, Pagination/Load more, Skeleton, EmptyState.

---

## 6. Motion system

### 6.1 Tokens
Durations: 120 (press), 200 (hover/UI), 320 (drawers/tabs), 500 (reveals), 800 (hero/images),
1200 (counters, slow image scale). Easing: out `cubic-bezier(.22,1,.36,1)`; in-out
`cubic-bezier(.65,0,.35,1)`; exits `cubic-bezier(.4,0,1,1)`. Stagger 60ms (max 6 items).
Distance 16–24px. Only `transform`/`opacity`/`clip-path` animate.

### 6.2 Where each animation goes
| Place | Animation | Notes |
|---|---|---|
| Page load (all) | Header fades in 200ms; H1 lines rise from a mask (600ms, 80ms stagger) | content visible without JS |
| Home hero | Slide crossfade + image scale 1.06→1 over 6s (Ken Burns), autoplay 7s with progress line on active dot, swipe on mobile | pause on hover/focus/hidden tab; no autoplay if reduced motion |
| Search card | rises 24px after hero text (delay 300ms); tab indicator slides | |
| Stats band | count-up 1.2s when 50% visible | final number in HTML (fixes "0") |
| Section headers | fade-up 16px, once | |
| Card grids | stagger fade-up; hover: lift -4px, s3 shadow, image zoom 1.05 (600ms), arrow nudges 4px | |
| Filter change / type tabs | results crossfade (React `ViewTransition`, same-route) + count updates with aria-live | |
| Card → detail | **shared-element morph** of cover image into detail hero (React `<ViewTransition name>`, 400ms, slight blur), header anchored | Next 16 native, no library |
| Forward/back nav | 60px directional slide (`transitionTypes` nav-forward/back) | |
| Area bento | image clip-path reveal on scroll; hover darkens + label slides up | |
| Feature images ("why us") | inset clip-path reveal 800ms + 8% parallax via CSS scroll-driven animation | fallback: static |
| Buying steps | connecting line draws left→right as you scroll, step icons pop in | |
| Availability grid | on tower switch, cells fade bottom-up per floor ("building rises", 10ms/floor); selected unit gets ring pulse; unit drawer slides in (bottom sheet on mobile, drag to close) | |
| Floor plans | tab crossfade; pinch/scroll zoom | |
| Progress | ring and bars fill 0→value on view (900ms); photo timeline reveals | |
| Gallery | lightbox opens zooming from the thumbnail (PhotoSwipe), swipe/pinch | |
| Map | pins drop in staggered; hovering a landmark bounces its pin | |
| Sticky sub-nav | active underline slides (scrollspy) | |
| Mobile CTA bar | slides up once the hero leaves the viewport | |
| Header | transparent over hero → solid + blur + s1 after 80px | no hide-on-scroll |
| Buttons | press scale .98; WhatsApp FAB gentle pulse once at 8s, then never | |
| Forms | success: check-mark draws (SVG stroke 600ms) + message; errors: field outline + text (no shake loop) | |
| Calculator | numbers tween 300ms on slider move | |
| Trust strip (logos) | slow marquee 40s, pause on hover | reduced motion → static wrap |
| Loading | skeletons with shimmer; Suspense reveal slide-up | |
Reduced motion: no transforms, no autoplay, no parallax/marquee; fades ≤150ms.

### 6.3 Tooling (minimal)
CSS + existing IntersectionObserver `motion.tsx` (extend: `Reveal`, `Stagger`, `CountUp`,
`MaskText`); React `<ViewTransition>` for routes (see `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`);
CSS scroll-driven animations for parallax (progressive). Add only: `embla-carousel-react`
(sliders), `photoswipe` (lightbox + zoom), `vaul` or `motion` (bottom sheet with drag) — one of
the two, chosen at build time. All heavy widgets (map, lightbox, calculator) lazy-loaded on view.

---

## 7. Page blueprints (top → bottom; data source in brackets)

### 7.1 Home `/`
1. **Hero** (inset 16px, radius 28, 88vh desktop / 72vh mobile): featured project slides
   [`publicProjectRepository.featured()`]; left: eyebrow (company tagline [settings]), project name
   (H1), sales + stage badges, location, 3 key facts, "From ৳ X", buttons *Explore project* /
   *Book a site visit*; right rail (desktop): 4 other featured project thumbs; bottom: dots +
   progress. Dark gradient overlay forest-900 → transparent for readable text. Mobile: image top
   55%, text card below (no text over busy image).
2. **Smart search** overlapping hero bottom: type tabs (only types that exist), Area, Budget,
   Beds/size (flats) → `/projects?...`; quick chips: *Ready to move*, *Under ৳1 Cr*, *Corner plots*.
3. **Trust band**: years in business, projects delivered, families handed over, sqft delivered
   [settings + computed], REHAB / RAJUK badges.
4. **Projects on sale**: type tabs, 6 cards, *View all projects* [`featured()`/`list()`].
5. **Explore by area** bento [`stats by location`].
6. **Live from our sites**: horizontal strip of latest public progress photos with project, date,
   % [`progress photoFeed()`] → that project's `#progress` section.
7. **Why buy with us**: image + 5 checklist points + floating "Every taka against a receipt" card
   [settings text].
8. **How buying works** (6 steps, line draws) → link to buyer's guide.
9. **Payment planner** compact (existing, polished).
10. **Buyers abroad** dark band → `/nrb`.
11. **Testimonials** (video thumb + quotes) [new `testimonials`] — hidden if empty.
12. **Delivered projects** strip [completed projects] — hidden if empty.
13. **Landowner CTA** band: "Have land? Let's build together" → `/landowners`.
14. **Latest news** 3 cards [blog] — hidden if empty.
15. **FAQ** top 5 + call/WhatsApp CTA; footer.

### 7.2 Projects `/projects`
Title band ("{n} projects in Dhaka"). Desktop: horizontal sticky filter bar with popovers (Type,
Stage, Area, Budget, Size/Beds, Available only) + sort (Featured, Newest, Price ↑↓, Handover
soonest) + view toggle Grid | List | Map. Mobile: "Filters (3)" button → bottom sheet, sort
select, sticky. Active filters as removable chips; URL-synced. Results grid 3/2/1 cols, load
more 12. Map view: Leaflet, clustered pins (from linked land GPS), pin → mini card. Empty state:
illustration + "Tell us what you want" quick form. Completed projects as a separate section.

**Project card**: cover 4:3 with sales badge (top-left), type (top-right), heart/shortlist
(Phase 2); name; location; facts row (size range · units left · handover); divider; "Starting
from ৳ X" + stage chip; whole card is the link; "Only 1 left" urgency label when ≤3 (true data).

### 7.3 Project detail `/projects/[code]`
Header block: breadcrumb · badges · name (H1) · location (→ map) · price from + size range ·
actions: Share (WhatsApp/copy link), Download brochure, Save.
1. **Gallery mosaic** (1 large + 4 small, "View all N photos", tabs Photos | Video | 360° | Plans
   when present) → PhotoSwipe.
2. **Sticky sub-nav** (scrollspy): Overview · Availability · Plans · Specs · Amenities · Location ·
   Progress · Payment.
3. **Overview**: highlights chips [new `highlights`], fact tiles (type, stage, handover, land
   area, front road, units, floors, approval no.), description.
4. **Unit types** cards (beds/baths/balconies, size range, from price, available count, *See
   plan*, *Show these units* → filters grid).
5. **Availability** — tower: tabs + stacking plan (floors × units, legend with counts, filter by
   type/facing); click → unit drawer: code, floor, type, size, facing, beds/baths, price (if
   available), unit-type plan, *Enquire about A-5B*, *WhatsApp*, *Book visit*; deep link `?unit=`.
   Plot: block tabs + plot table/grid (size, road, corner, facing, status, price).
   Share: register summary + "16 of 20 shares left" meter + *Ask about a share*.
6. **Floor plans**: tabs per unit type, zoom viewer, download.
7. **Specifications**: accordion groups [tower fields + new `specifications` list].
8. **Amenities**: icon grid (icon map per amenity lookup value).
9. **Location**: map with project pin + nearby landmarks list with distances (parsed from
   `surroundings` lines now; structured landmarks later), *Get directions*, *Book a visit*.
10. **Construction progress**: overall ring, per-tower bars, dated photo timeline, last updated
    (tower); stage stepper (plot); none (share).
11. **Payment plan**: calculator prefilled with this project's price; disclaimer.
12. **Papers you can inspect** checklist + developer trust mini-block.
13. **Similar projects** carousel.
Desktop right column: sticky enquiry card (price from, n available, Call, WhatsApp, short form,
"Book a site visit"). Mobile: bottom bar Call · WhatsApp · Visit.

### 7.4 Other pages
- **/completed**: portfolio grid with handover year; detail uses same page in "portfolio" mode
  (no units).
- **/landowners**: hero ("Your land, our expertise"), why develop with us, how JV works (5
  steps: offer → site survey → papers check → agreement & signing money → handover of your
  share), what you receive, past JV projects, FAQ, **land offer form** (name, phone, land
  location, size + unit, road width, papers available, message).
- **/buyers-guide**: steps, documents checklist, cost breakdown (registration, stamp, VAT
  examples), full calculator, full FAQ (accordion with search).
- **/nrb**: process for buyers abroad, video-call booking, remittance/payment notes, POA,
  timezone callback form.
- **/about**: hero statement, story, mission/vision/values, numbers, milestones timeline,
  leadership cards, certifications & memberships, awards, CTA.
- **/contact**: office cards (map link, hours, phone, email, WhatsApp), embedded map, form.
- **/blog**: featured post + grid, categories; post: reading progress bar, share, related.
- **Site-visit booking** (modal from anywhere): project → date (next 14 days) → slot (morning /
  afternoon / evening) → name + phone → success.
- **404 / empty / offline** states with search + contact.

---

## 8. Enquiries and conversion
| Intent | Fields | Lands in Admin |
|---|---|---|
| Project / unit enquiry | name*, phone* (BD check), email, message, budget | lead `website_form`, note names project + unit |
| Site visit | project, date, slot, name*, phone* | lead + activity "Site visit requested 12 Nov, morning" |
| Callback / NRB | name*, phone* (any country), country, best time | lead, note with timezone |
| Brochure | direct download (no gate); optional "send to my WhatsApp" | click tracked |
| General (contact) | name*, phone*, message | lead, no project |
| Land offer | owner, phone*, location, size, road, papers | new `land_offers` → Lands module prospect list |
WhatsApp prefill: "Hi, I'm interested in {project} – {unit}. Code {code}". Honeypot now, rate
limit in Phase B. Success = inline message + "We reply the same day". Analytics events:
`view_project, view_unit, click_call, click_whatsapp, submit_enquiry, book_visit,
download_brochure, use_calculator, filter_projects`.

## 9. Quality bars
- **Performance** (mid Android, 4G): LCP < 2.5s, CLS < 0.05, INP < 200ms, JS < 180KB gz per
  route, hero image ≤ 200KB AVIF/WebP, `next/image` with sizes, lazy below the fold.
- **Accessibility** WCAG 2.2 AA: contrast (§5.1), visible focus ring (brand-600 2px offset),
  keyboard-operable grid (arrow keys), drawers/lightbox focus-trapped, aria-live result counts,
  44px tap targets, labels + error text on forms, alt text from document captions.
- **SEO/sharing** (full in Phase B server render): per-page titles/description, OG image per
  project, sitemap/robots, JSON-LD (Organization, Residence/Offer, BreadcrumbList, FAQPage).
- **Privacy**: never show internal fields (v2 §1 list); add a test asserting public objects
  contain only whitelisted keys.

## 10. Data: Admin → public
Existing (already in public repositories): project card/detail per shape, units + public status,
towers spec, amenities, surroundings, gallery/brochure/floor-plan documents with `is_public`,
progress % and public photos, land GPS + front road, company settings (name, phone, WhatsApp,
address, email), `captureInquiry`.

New Admin "Website" area (each new table = new Dexie `version(n)` block + public repository that
whitelists fields):
| Data | Where in Admin | Shape |
|---|---|---|
| Website settings: tagline, hero line, about text, office hours, social links, map URL, `public_show_prices`, established year, delivered/handed-over overrides, REHAB no. | Settings → Company → Website card | `company_settings` unindexed fields |
| Project marketing: highlights, description, video URL, 360-tour URL, specifications list, RAJUK approval no., SEO title/description | Project page → Website tab | unindexed fields on `projects` |
| Unit-type floor plans | documents `layout_floor_plan` + `unit_type` tag | document field |
| Structured landmarks (name, category, distance) | Project → Website tab | Phase 2 (`surroundings` lines until then) |
| Testimonials, Team, Awards/Certifications, FAQ items | Website menu | small tables |
| Blog posts | Website → Blog | v2 §2.3 |
| Land offers | Lands → Prospects inbox | new table, one public write |
| "Ready for the website" checklist | Project Sales card | v2 §6.3 |

### 10.1 Data that already exists but isn't used yet
- **RAJUK/CDA permit no.** — on the `project_status_history` event that completes Approval
  (`reference_no`, `details.permit_no`, `details.authority`; plot: `approval_no`), and the
  **occupancy certificate no.** on the Finishing event. Expose through a public reader, never
  `remarks`.
- **Standard payment plans** — `installment_plan_templates` are still seeded per shape (flat 10/60
  over 24 months/20/10; plot 10/20/55 over 48 months/15; share 20/40 over 6 months/40). The
  calculator reads these instead of hard-coded numbers; small editor on the project page.
- `company_settings.trade_license_no` (footer trust line), `logo_url` (header logo).
- `projects.architect` (often advertised), `actual_start_date` ("construction started").

### 10.2 Admin gaps to close before the matching batch
| Gap | Fix | Batch |
|---|---|---|
| `is_public` can't be changed after upload; progress photos from the update dialog are always internal | "Show on website" toggle on every document/photo row + in the progress dialog | W0 |
| Progress captions would come from engineer remarks (contain delay notes) | unindexed `documents.public_caption`; empty → date + tower only | W4 |
| No project description/tagline/highlights field | unindexed `projects.description`, `tagline`, `highlights[]` | W3 |
| Floor plans are per project, not per unit type | new `project_unit_types` table (type, description, plan document, render) | W3 |
| Repeat-phone enquiry returns another person's lead and its note omits project/unit | public wrapper returns only `{ ok }`; merged note names project + unit | W5 |
| Progress repository gate checks only `is_public`, not sales status | reuse the project visibility rule | W4 |
| No advisor data on users (photo, title, WhatsApp, show-on-website) | defer; enquiry card shows company hotline | Phase 2 |
| Amenity lookup has no icon | unindexed `lookup_values.icon` | W3 |
| Lead attribution | unindexed `leads.page_url`, `utm_*` | W5 |

### 10.3 Demo data fixes (W0)
Replace the teal "Sample document" PNGs used as covers/gallery with curated stock renders; give
every public project 4–6 gallery images, a floor plan and public progress photos; move Lakeview's
land GPS (it duplicates Uttara Heights); hide the 0% progress section on Upcoming projects; seed
"Residential Plot"/"Land Share" unit types; remove leftover "Nokshi Agrabad Trade Centre"
references in demo-site-progress, demo-bookings and demo-leads.

## 11. Technical structure
- Routes under `src/app/(public)/*`; public home moves to `/`, chooser to `/portal`.
- `src/components/public/{ui,layout,sections,project,forms,motion}`; tokens in a public-scoped
  `@theme` block in `globals.css` (or `public.css` imported by the public layout).
- Reuse: `useBlobUrl`, `SiteImage`, `useCompanyInfo`, `motion.tsx`, `ProjectCard`, `Availability`,
  `InstalmentPlanner`, `progress.public.repository.ts`, `leadRepository.captureInquiry`,
  `unitSizeLabel` / `shapeUses` / `projectSalesStatus`.
- Phase A pages stay client components (IndexedDB); repository signatures stay so Phase B can
  server-render for SEO.

## 12. Build roadmap (each batch browser-verified desktop + mobile, demo seeded, pushed)
| Batch | Scope |
|---|---|
| W0 Foundation | tokens, fonts, UI primitives (Button, Badge, SectionHeader, focus ring), motion utilities, new header (mega menu) + footer, `/` vs `/portal`, `not-found`/`error`/`loading`, shared formatters, document "show on website" toggle, demo data fixes (§10.3) |
| W1 Home | all §7.1 sections that have data today; hero/search/stats fixes |
| W2 Listing | filter bar + bottom sheet, sort, list + map views, URL sync |
| W3 Detail v2 | gallery + lightbox, sub-nav, unit drawer + deep link, floor-plan viewer, map + landmarks, view-transition morph |
| W4 Progress | detail progress polish (ring, bars, dated photo timeline, lightbox) + home "Live from our sites" strip |
| W5 Enquiries | enquiry modal, site-visit booking, callback, WhatsApp templates, lead note fix |
| W6 Company pages + Website settings | About, Contact, Buyer's guide, NRB, legal, Website card, readiness checklist |
| W7 Trust content | testimonials, team, awards, FAQ tables + admin screens + home sections |
| W8 Landowners | page + `land_offers` + Lands inbox |
| W9 Blog | v2 PB7 |
| W10 Polish | route transitions everywhere, a11y audit, performance pass, SEO prep |
| Phase 2 | Bangla toggle, customer portal, shortlist/compare, WhatsApp Business API, structured landmarks |

## 13. Verification (per batch)
- Browser at 1440 / 1024 / 768 / 375; reduced-motion on; keyboard-only pass.
- Lighthouse mobile ≥ 90 performance / 100 accessibility on home, listing, detail.
- Publish/unpublish, unit status change, public photo tick in Admin → reload → site reflects it.
- Whitelist test: no internal key in any `Public*` object; `draft` units and `not_open` projects
  never appear.
- Enquiry → appears in Admin → Leads with source and project/unit in the note.
