# Real Estate Developer Management Platform — Public Portal
## v1.0 — Living Document (module-wise confirmed scope, for direct implementation)

> এই ডকুমেন্ট **Admin Portal ডকুমেন্ট** (`Real-Estate-Developer-Platform_Scope-Document_v3.md`)-এর companion — Public-facing website-এর জন্য। একই living-document নিয়ম প্রযোজ্য: শুধু freeze হওয়া module থাকবে, field-level detail সহ। Admin-এর কোনো table reference করলে সেটা v3.md-এর schema, এখানে আবার পুরোটা লেখা হয় না — শুধু যা নতুন বা public-portal-specific সেটাই।

---

## 0. Architecture Decision (v3.md-এর সাথে shared)

- **একই app, আলাদা route:** Admin (`/admin/*`) ও Public Portal (বাকি সব route) একই Next.js app-এর অংশ — একই IndexedDB (Phase A) share করবে, তাই demo-তে Admin-এ data দিলে Public site-এ সাথে সাথে reflect হবে
- Public route থেকে Admin-এর table **read করা যাবে, কিন্তু শুধু নির্দিষ্ট public-safe field** — internal/financial field (booking discount, cost, landowner info) কখনো public route-এ expose হবে না, এটা service-layer-এই enforce হবে (repository ভিন্ন — `publicProjectRepository` শুধু whitelisted field রিটার্ন করবে)
- Public থেকে Admin-এর কোনো table-এ **write** শুধু একটা জায়গায়: `leads` (Module 3, v3.md) — নতুন inquiry submit হলে

---

## 1. MODULE P1: Core Pages ✅ FROZEN

### 1.1 Purpose
Home, About, Contact, Blog — site-এর ভিত্তি pages। বেশিরভাগ static content, কিছু jaygay admin data থেকে dynamic pull।

### 1.2 Pages ও Data Source

| Page | Content | Data Source |
|---|---|---|
| **Home** | Hero banner, trust indicators (static text/copy), "Active Projects" count, Featured Projects (কার্ড, ৩-৪টা) | `projects` (v3.md) WHERE `is_public = true` — count ও `is_featured = true` filter |
| **About** | Company story, mission — mostly static content | `company_settings` (v3.md, Section 1.3) থেকে company_name; বাকি static copy (hardcoded, DB লাগবে না) |
| **Contact** | Address, phone, email, map, office hours, general inquiry form | Info: `company_settings`। Form submit → Module P4 (Lead Capture)-এর একই mechanism ব্যবহার করবে (`leads` table-এ, `interested_project_id = null`, general inquiry হিসেবে) — logic detail P4-তে, এখানে শুধু page বলা হলো |
| **Blog listing** | সব published blog post-এর card (cover, title, excerpt, date) | `blog_posts` table (নিচে) WHERE `status = 'published'` |
| **Blog detail** | একটা post-এর পুরো content | `blog_posts` by slug |

### 1.3 `blog_posts` table (নতুন — content marketing-এর জন্য, Admin থেকে manage হবে)

```
blog_posts
 - id             UUID, PK
 - slug           VARCHAR, UNIQUE   -- URL-friendly, e.g. "real-estate-investment-bd-2026"
 - title          VARCHAR
 - excerpt         VARCHAR   -- listing card-এ short summary
 - content           TEXT      -- markdown/rich text
 - author_id           UUID → users.id, nullable
 - status               ENUM: draft | published
 - published_at           DATE, nullable
 - created_at              TIMESTAMP
```

### 1.4 Document types for `entity_type = 'blog_post'`
`cover_image`, `content_image`, `other`

### 1.5 Admin-side management (এই module-এর জন্য যা Admin Portal-এ যোগ হবে)
- Admin Portal-এ একটা simple "Blog" section — `blog_posts` create/edit/publish। কোনো নতুন role লাগবে না, `super_admin`/`management`-এর permission-এই যথেষ্ট (v3.md Module 8 permission matrix-এ ছোট addition হিসেবে ধরা হবে যখন Admin-side UI বানানো হবে)
- Project-এর `is_public`/`is_featured` toggle — Project edit page-এই থাকবে (নতুন page লাগবে না)

### 1.6 Open / deferred
- Contact form-এর general inquiry ঠিক কোন lead source ধরা হবে (`source = website_form` ধরেই রাখছি, P4-তে confirm হবে) — blocking না, P4-তে চূড়ান্ত হবে

---

## 2. MODULE P2: Project & Unit Listing ✅ FROZEN

### 2.1 Purpose
Project listing page + Project detail page (gallery, floor-wise unit availability) — Admin-এর `projects`/`towers`/`units` (v3.md) থেকে read-only, শুধু public-safe field।

### 2.2 Public Project Card (listing page) — whitelisted shape

```
PublicProjectCard (computed/read view, no new table)
 - code, name, project_type
 - location_summary        -- addendum, v3.md
 - cover_image_url
 - status_label             -- মাপা (নিচে mapping)
 - is_featured
 - price_range               -- MIN/MAX(units.base_price) WHERE unit.status='available' AND unit.for_sale_by='company'
 - available_unit_count       -- COUNT(units) WHERE status='available' AND for_sale_by='company'
```

Query: `projects` WHERE `is_public = true`, project ID দিয়ে join করে উপরের aggregate বের হবে।

### 2.3 Status Label Mapping (presentation-layer, নতুন DB field না — শুধু display mapping)

| Admin `projects.status` | Public label |
|---|---|
| planning, design, approval | Upcoming |
| under_construction, nearly_complete | Ongoing |
| handover_ongoing, closed | Ready |

### 2.4 Public Project Detail — whitelisted shape

```
PublicProjectDetail (computed/read view)
 - সব PublicProjectCard field +
 - surroundings, amenities (full text/list)
 - towers[]: { name, status, current_progress_pct }   -- current_progress_pct আসবে P3 থেকে (towers.current_progress_pct, v3.md Module 5)
 - floors[] → units[]: { code, floor, unit_type, bedroom_count, bathroom_count, balcony_count, size_sqft, facing, base_price, public_status }
 - gallery: documents WHERE entity_type='project', entity_id=X, is_public=true
 - brochure_url: documents WHERE entity_type='project', entity_id=X, document_type='brochure', is_public=true (latest one — prominent "Download Brochure" button/CTA, generic list-এ merge না করে আলাদা রাখা হলো)
 - downloadable_docs: documents WHERE entity_type IN ('project','unit'), is_public=true, document_type IN ('layout_floor_plan')
```

### 2.5 Unit Public Status Mapping (presentation-layer)

| Admin `units.status` | Public `public_status` |
|---|---|
| available | Available |
| hold, reserved, booked | Booked |
| sold, handed_over | Sold |

> Internal nuance (hold vs reserved vs booked) কেন public-এ দেখানো হচ্ছে না — customer-এর জন্য এই পার্থক্য অর্থহীন, শুধু "available কিনা" জানা দরকার।

### 2.6 Owner-direct Units
`for_sale_by = 'owner_direct'` unit-গুলো `price_range`/`available_unit_count` calculation থেকে **বাদ** — কারণ এগুলো company-র sale না। তবে floor-plan grid-এ unit হিসেবে দেখানো হবে (visitor পুরো building দেখতে চায়), status শুধু "Sold"/"Booked" হিসেবে দেখাবে (owner নিজে বিক্রি করছে এই detail public-এ প্রকাশের দরকার নাই) — booking না থাকলেও visually "not available for company booking" বোঝানো এভাবেই possible।

### 2.7 Floor-wise Availability Grid (UI concept, no new schema)
Project detail page-এ Tower select করলে সেই Tower-এর floor-by-floor grid — প্রতিটা floor-এ unit code + `public_status` রঙ দিয়ে (Available=green, Booked=amber, Sold=gray)। ডেটা সরাসরি ২.৪-এর `floors[]` থেকে।

### 2.8 Document types used (v3.md Module 2/3-এ যোগ, public visibility flag `is_public` দিয়ে নিয়ন্ত্রিত)
`layout_floor_plan`, `brochure` (নতুন type — v3.md-এর project document type list-এ যোগ), `gallery_image` (নতুন type)

### 2.9 Open / deferred
- Price hidden করে শুধু "Call for price" দেখানোর option — এখন price range দেখানো হচ্ছে (reference site-এর "Transparent pricing" trust-indicator অনুযায়ী), client চাইলে পরে toggle করা যাবে

### 2.10 Live Site Verification (dpremiumhomes.com, Chrome দিয়ে সরাসরি দেখা হয়েছে)
আগের text-only review ভুল ছিল (সেটা ভুলভাবে stale/demo বলে মনে হয়েছিল) — সংশোধন করে সঠিক তথ্য: এটা একটা সম্পূর্ণ professional, well-built real site। যা confirm হলো, আমাদের design-এর সাথে মিলিয়ে:

- **Sticky "Interested in this property?" bar** — Project detail scroll করলে top-এ sticky হয়ে থাকে, "Login to Save Property" (Wishlist — Phase 2 customer feature) + "Contact Agent" button — আমাদের P4 inquiry CTA এভাবেই sticky রাখা উচিত
- **"Available Units" card section** — Unit A, Unit B ইত্যাদি card আকারে Size/Bedrooms/Bathrooms/Balcony দেখায় (এখন `bedroom_count`/`bathroom_count`/`balcony_count` addendum দিয়ে সাপোর্টেড, v3.md-এ যোগ হয়েছে)
- **"Specification" section** — Building Type, Total Unit, Unit Per Floor, Front Road, Passenger Lift, Electricity Backup (এখন `towers` addendum দিয়ে সাপোর্টেড)
- **"Nearby Landmarks" gallery** — শুধু text bullet না, প্রতিটা landmark-এর ছবি+নাম card আকারে (Jamuna Future Park, Bashundhara City ইত্যাদি) — আমাদের `surroundings` field (এখন plain TEXT) থেকে এই richer presentation বানানো UI-layer-এর কাজ, তবে চাইলে ভবিষ্যতে `surroundings` structured (list of {name, image}) করা যায় — **এখন TEXT-ই রাখছি, over-engineering এড়াতে**
- **"Location" section** — map image + "SEE ON MAP" button (Google Maps link, `gps_lat`/`gps_lng` দিয়ে তৈরি হবে)
- **Inquiry form fields** — হুবহু মিলেছে: Full Name, Phone Number, Email, Message (Optional) — P4 design সঠিক ছিল
- **Filters (Project listing)** — Communities (checkbox multi-select), Price Range (checkbox বাকেট), এবং "Under Construction" (status checkbox) — আমাদের filter design এটার সাথে সামঞ্জস্যপূর্ণ
- **Project card badge** — "On Sale" (সবুজ) / "Sold Out" (লাল) কোণায় — আমাদের status_label mapping-এর সাথে মিলে যায়

---

## 3. MODULE P3: Construction Progress Showcase ✅ FROZEN

### 3.1 Purpose
Project detail page-এ Tower-wise progress % ও public-marked site photo/timeline দেখানো — Admin-এর Site Progress module (v3.md Module 5) থেকে read-only, কোনো নতুন table ছাড়াই।

### 3.2 Data Source (নতুন table না, existing schema-ই যথেষ্ট)
- Tower-level % ইতিমধ্যে P2-এর `PublicProjectDetail.towers[]`-এ আছে (`towers.current_progress_pct`)
- Project overall % = towers-এর average (v3.md-এর মতোই)
- Progress photo/timeline: `site_progress_updates` (v3.md, `tower_work_items.tower_id → towers.project_id`) join `documents` (entity_type='site_progress_update', `is_public=true`)

### 3.3 Public Progress Update Feed — whitelisted shape

```
PublicProgressUpdate (computed/read view, no new table)
 - update_date
 - tower_name
 - photo_url        -- documents.file_url যেখানে is_public=true
 - caption            -- site_progress_updates.remarks (admin publish করার আগে edit/trim করে নেবেন)
```

Query: `site_progress_updates` join `documents` WHERE `documents.is_public = true`, project অনুযায়ী filter, `update_date DESC` করে সাজানো — সবচেয়ে সাম্প্রতিক update উপরে।

### 3.4 Granularity সিদ্ধান্ত
Admin-side WBS (Foundation/Electrical/Plumbing আলাদা %) public-এ **দেখানো হবে না** — শুধু Tower-এর overall % + photo timeline। কারণ: এত granular operational detail visitor-এর কাজে লাগে না, বরং confusion তৈরি করতে পারে (Unit status simplification-এর মতোই একই নীতি)।

### 3.5 Publishing Control
Site engineer/Admin প্রতিটা `site_progress_updates`-এর সাথে upload করা photo-কে `documents.is_public = true` করলেই সেটা website-এ চলে যাবে — আলাদা কোনো "publish" button/workflow লাগবে না, existing flag-ই যথেষ্ট (v3.md addendum, P2-তে যোগ করা হয়েছিল)।

### 3.6 Open / deferred
- Public-এ "Planned vs Actual delay %" দেখানো হবে না (admin dashboard-only থাকবে) — visitor-কে delay নিয়ে confuse/worried করার দরকার নাই

---

## 4. MODULE P4: Lead Capture & Inquiry ✅ FROZEN

### 4.1 Purpose
Project/Unit-context inquiry form + WhatsApp click-to-chat — Public থেকে Admin-এর `leads` table (v3.md Module 3)-এ একমাত্র সত্যিকারের write connection।

### 4.2 Inquiry Form Fields

```
InquiryFormInput (submission payload, লেখা হবে leads table-এ)
 - name              (required)
 - phone              (required)
 - email                (optional)
 - message                (optional)
 - interested_project_id   (auto-filled, যদি project detail page থেকে submit হয়)
 - interested_unit_id       (optional, unit-specific inquiry হলে)
 - budget_range               (optional dropdown)
```

### 4.3 Submission Behavior (v3.md Module 3-এর dedup rule অনুসরণ করে, নতুন logic না)
- `phone` দিয়ে existing lead lookup
- **Match পেলে** → নতুন lead তৈরি হবে না, existing lead-এ একটা `lead_activities` entry যোগ হবে (`activity_type = other`, notes-এ নতুন message)
- **Match না পেলে** → নতুন `leads` record (`source = 'website_form'`, `status = 'new'`)
- Submit-এর পর UI-তে confirmation message ("ধন্যবাদ, আমরা শীঘ্রই যোগাযোগ করবো") — কোনো page redirect লাগবে না

### 4.4 WhatsApp Click-to-Chat

```
WhatsApp link = https://wa.me/{company_settings.whatsapp_number}?text={prefilled message}
prefilled message উদাহরণ: "Hi, I'm interested in [Project Name] - [Unit Code, if applicable]"
```

> WhatsApp-এ পাঠানো message সরাসরি company-র WhatsApp account-এ যায়, আমাদের `leads` table-এ automatic entry হয় না (WhatsApp Business API integration ছাড়া সম্ভব না) — v3.md Module 3-তেই আগে এই সিদ্ধান্ত নেওয়া হয়েছিল, Phase 2-তে automate করা যাবে। এই ক্ষেত্রে sales team manually lead entry করবেন।

### 4.5 Where the form appears
- Project detail page (P2) — floating/inline CTA, `interested_project_id` auto-fill
- Unit-specific (floor grid-এ কোনো Available unit click করলে) — `interested_unit_id`-ও auto-fill
- Contact page (P1) — কোনো project/unit context ছাড়া general inquiry

### 4.6 Spam Prevention (Phase B note)
Phase A (demo)-তে দরকার নাই। Phase B-তে honeypot field বা simple rate-limiting (same phone/IP থেকে ঘন ঘন submit ঠেকানো) যোগ করা হবে — blocking না, শুধু note করে রাখা হলো।

### 4.7 Open / deferred
কিছু নেই — এই module সম্পূর্ণরূপে v3.md Module 3-এর existing rule reuse করে।

---

## 5. Roadmap
Public Portal-এর পরিকল্পিত সব module (P1–P4) এখন frozen। Phase 2 বিবেচনা (এখনই না):
- Customer login/self-service portal (payment history দেখা) — v3.md-এ আগেও Phase 2 হিসেবে চিহ্নিত ছিল
- WhatsApp Business API integration (automatic lead capture)
- Multi-language (বাংলা/English toggle)

---

## 6. Decision Log

- Contact form ও P4-এর project-inquiry form একই `leads` mechanism ব্যবহার করে — আলাদা `contact_messages` table বানানো হয়নি, duplication এড়ানোর জন্য
- Blog-এর জন্য নতুন `blog_posts` table — About/Home static রাখা হয়েছে (DB লাগেনি) কারণ সেগুলো ঘন ঘন বদলায় না, কিন্তু Blog নিয়মিত নতুন post পাবে বলে content-managed
- `projects.is_public`/`is_featured` — admin doc-এ addendum হিসেবে যোগ হয়েছে (v3.md Decision Log-এও note করা আছে)
- `projects.location_summary` ও `documents.is_public` — admin doc addendum, marketing address ও document public-visibility control-এর জন্য
- Unit-এর internal status nuance (hold/reserved/booked) public-এ simplify করে "Booked" — customer-এর জন্য অপ্রয়োজনীয় detail লুকানো হলো
- `for_sale_by = 'owner_direct'` unit company revenue/availability count-এ বাদ, কিন্তু floor-grid-এ visually দেখাবে (building সম্পূর্ণ দেখানোর জন্য)
- Brochure download আলাদা prominent CTA (`brochure_url`) — generic `downloadable_docs` list-এ merge না করে, কারণ এটা sales-এর জন্য গুরুত্বপূর্ণ button
- Construction Progress Showcase কোনো নতুন table লাগেনি — সম্পূর্ণ existing admin schema (towers, site_progress_updates, documents) পুনর্ব্যবহার, শুধু WBS granularity বাদ দিয়ে simplify
- `company_settings.whatsapp_number` — admin doc addendum, click-to-chat-এর জন্য
- Lead Capture (P4) v3.md Module 3-এর dedup/assignment rule হুবহু reuse করে — নতুন কোনো business logic তৈরি হয়নি
- **Correction:** dpremiumhomes.com সম্পর্কে আগের assessment ("demo/unconfigured WordPress theme") ভুল ছিল — Chrome দিয়ে সরাসরি দেখার পর confirm হলো এটা একটা সম্পূর্ণ, professional real site। P2 এখন এই verified তথ্য অনুযায়ী updated (Section 2.10)
- Unit bedroom/bathroom/balcony count এবং tower building specification — verified real site থেকে confirm হয়ে admin doc addendum হিসেবে যোগ হলো
