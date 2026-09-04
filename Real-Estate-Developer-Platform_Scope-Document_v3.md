# Real Estate Developer Management Platform — Build Plan
## v3.0 — Living Document (module-wise confirmed scope, for direct implementation)

> **এই ডকুমেন্টের নিয়ম:** এখানে শুধু সেই module-গুলো থাকবে যেগুলো discussion করে **freeze/confirm** করা হয়েছে। প্রতিটা module-এ entity schema, field-level detail, relationship, এবং status pipeline থাকবে — যাতে সরাসরি এই ডকুমেন্ট পড়ে Claude Code দিয়ে coding শুরু করা যায়। নতুন module confirm হলে এই ডকুমেন্টে যোগ হবে (v3.1, v3.2... বা section append)।

---

## 0. Tech Stack & Conventions

### Phase A — Prototype/Demo (এখন এইটা করা হচ্ছে)
- **Storage:** Browser IndexedDB (via **Dexie.js** wrapper — raw IndexedDB API ব্যবহার না করে)
- **Frontend:** TypeScript + Next.js/React
- **Auth:** নাই — role simulate করার জন্য simple "Switch Role" dropdown (mock, real security না)
- **Architecture rule:** Data access একটা আলাদা **Service/Repository layer**-এ থাকবে (UI component থেকে সরাসরি Dexie call না করে) — যাতে Phase B-তে migrate করার সময় শুধু এই layer বদলালেই হয়, UI/business-logic আবার লিখতে না হয়
- **সীমাবদ্ধতা (client-কে জানানো জরুরি):** data browser-local, device/browser বদলালে বা cache clear হলে হারিয়ে যাবে; multi-user real-time sync নাই — এটা demo purpose, production না

### Phase B — Production (Demo approve হলে)
- **Database:** PostgreSQL
- **Backend/Frontend:** TypeScript (Node.js + Next.js/React), REST/tRPC API
- **Auth:** প্রকৃত Role-based access control (RBAC), JWT/session
- এই document-এর schema (table/field names) দুই Phase-এই অভিন্ন থাকবে — Phase A-তে IndexedDB object store হিসেবে, Phase B-তে Postgres table হিসেবে। তাই design কাজ নষ্ট হচ্ছে না, শুধু storage backend বদলাবে।

### Conventions (উভয় Phase-এ প্রযোজ্য)
- **ID convention:** প্রতিটা human-facing entity-র internal UUID `id` + display-friendly `code` (e.g. `LND-2026-001`) — sequential per year
- **Every table has:** `created_at`, `updated_at`, `created_by`
- **Money fields:** decimal, BDT, no float
- **Percentages:** `decimal(5,2)`
- **File uploads:** generic `documents` table (Section 1) — Phase A-তে file নিজেই store না করে শুধু filename/placeholder রাখা যেতে পারে (browser storage-এ বড় ফাইল রাখা ঠিক না); Phase B-তে actual file storage (S3-compatible)
- **Enum vs Master Data (গুরুত্বপূর্ণ distinction):**
  - **Workflow status** (Lead status, Booking status, PO status ইত্যাদি) — এগুলো ENUM-ই থাকবে, code-এ business logic এর সাথে বাঁধা (status বদলালে side-effect ঘটে)
  - **Option/Dropdown list** (Document Type, Cost Category, Amenities, Unit Facing) — এগুলো `lookup_values` (Section 1) থেকে আসবে, Admin future-এ code-change ছাড়াই নতুন option যোগ করতে পারবে

---

## 1. Shared/Generic Components (used by every module)

### 1.1 `documents` table (generic — reused across all modules, not a separate top-level module)

```
documents
 - id                 UUID, PK
 - entity_type        ENUM: 'land' | 'project' | 'unit' | 'customer' | 'contractor' | 'supplier' | 'booking' | 'expense' | ... (extendable)
 - entity_id           UUID, references the specific record
 - document_type       VARCHAR — sourced from `lookup_values` (category='document_type', scoped by entity_type)
 - file_url            VARCHAR
 - is_public            BOOLEAN, default false   -- addendum (Public Portal P2/P3): true হলে Public Portal-এ visible/downloadable (brochure, floor plan, site progress photo); internal doc (RAJUK approval, khatian) default false-ই থাকবে
 - uploaded_by         UUID → users.id
 - uploaded_at         TIMESTAMP
 - notes               TEXT (optional)
```

Frontend behavior: প্রতিটা entity-র detail page-এ একটা "Documents" tab থাকবে। Upload করার সময় Document Type dropdown-এর options context অনুযায়ী filter হবে (Land page-এ Land-এর options, Project page-এ Project-এর options) — এই options `lookup_values` থেকে আসবে, Admin future-এ Settings থেকে নতুন type যোগ করতে পারবেন।

### 1.2 `lookup_values` table (Master Data — Admin-configurable dropdown/option-lists)

```
lookup_values
 - id             UUID, PK
 - category       VARCHAR   -- 'document_type', 'cost_category', 'amenity', 'unit_type', 'facing', 'land_size_unit'...
 - scope          VARCHAR, nullable   -- category='document_type' হলে কোন entity_type-এর জন্য (land/project/customer/booking/expense...)
 - value          VARCHAR
 - is_active      BOOLEAN, default true
 - sort_order     INTEGER
```

> **কোনটা এখানে যায়, কোনটা যায় না** — Workflow status (Lead status, Booking status, PO status ইত্যাদি) এখানে না, ওগুলো ENUM-ই থাকে (code-এ business logic বাঁধা)। শুধু "option pick করা" টাইপ dropdown (Document Type, Cost Category, Amenities, Facing) এখানে আসে। Settings module থেকে Admin এই list manage করবেন — নতুন option যোগ/inactive করা যাবে, কোনো code-change ছাড়াই।

### 1.3 `company_settings` table (single row — company profile)

```
company_settings
 - id                 UUID, PK   -- একটাই row থাকবে
 - company_name       VARCHAR
 - logo_url           VARCHAR, nullable
 - address            TEXT, nullable
 - phone              VARCHAR, nullable
 - whatsapp_number     VARCHAR, nullable   -- addendum (Public Portal P4): click-to-chat button-এর জন্য
 - email              VARCHAR, nullable
 - website            VARCHAR, nullable
 - trade_license_no   VARCHAR, nullable
 - tax_id             VARCHAR, nullable   -- BIN/TIN
 - default_currency   VARCHAR, default 'BDT'
 - notes              TEXT, nullable
```

---

## 2. MODULE 1: Land Management ✅ FROZEN

### 2.1 Purpose
Land opportunity থেকে শুরু করে acquisition/JV পর্যন্ত পুরো pipeline track করা, এবং পরে Project-এর সাথে link করা।

### 2.2 Status Pipeline
```
new
  → site_visit_done
  → legal_verification
  → negotiation
  → decision
      ├─ acquired          (direct purchase)
      ├─ jv_signed
      └─ rejected
  → linked_to_project      (once mapped to a Project)
```

### 2.3 `lands` table

```
lands
 - id                    UUID, PK
 - code                  VARCHAR, e.g. "LND-2026-001", auto
 - name                  VARCHAR — internal reference name
 - location_division     VARCHAR
 - location_district     VARCHAR
 - location_area         VARCHAR
 - road                  VARCHAR
 - mouza                 VARCHAR
 - dag_number             VARCHAR
 - khatian_number         VARCHAR
 - land_size              DECIMAL         (value)
 - land_size_unit         ENUM: katha | bigha | decimal
 - asking_price           DECIMAL
 - negotiated_price       DECIMAL, nullable
 - final_agreed_amount    DECIMAL, nullable   -- reference amount for future Finance module (payment/installment tracked there)
 - gps_lat                DECIMAL, nullable
 - gps_lng                DECIMAL, nullable
 - nearby_facilities      TEXT
 - acquisition_type       ENUM: direct_purchase | joint_venture
 - status                 ENUM (per pipeline above)
 - assigned_to            UUID → users.id
 - remarks                TEXT
```

### 2.4 `landowners` table (master list — reusable, an owner can be linked to multiple lands)

```
landowners
 - id            UUID, PK
 - name          VARCHAR
 - phone         VARCHAR
 - nid           VARCHAR
 - address       TEXT
 - notes         TEXT
```

### 2.5 `land_owner_mapping` table (many-to-many: land ↔ landowner)

```
land_owner_mapping
 - id                    UUID, PK
 - land_id               UUID → lands.id
 - owner_id              UUID → landowners.id
 - ownership_share_pct   DECIMAL(5,2)      -- if multiple owners, their share of the land
 - is_primary_contact    BOOLEAN
```

> Owner info সবসময় capture হবে (acquisition_type যাই হোক না কেন)। `acquisition_type = joint_venture` হলে নিচের JV-specific fields UI-তে দেখানো হবে।

### 2.6 JV-specific fields (conditional — শুধু `acquisition_type = joint_venture` হলে ব্যবহৃত)

```
land_jv_details
 - id                     UUID, PK
 - land_id                UUID → lands.id
 - developer_share_pct    DECIMAL(5,2)
 - landowner_share_pct    DECIMAL(5,2)
 - agreement_date         DATE
 - power_of_attorney      BOOLEAN
 - poa_reference          VARCHAR, nullable
```

### 2.7 Document types for `entity_type = 'land'`
`khatian_copy`, `dolil_deed`, `mutation_certificate`, `tax_receipt`, `location_map`, `site_photo`, `jv_agreement`, `power_of_attorney`, `other`

### 2.8 Open / deferred (not blocking Module 1 build)
- Land-এর জন্য payment/installment logic এখনো নাই — Finance module-এ পরে detail হবে, `final_agreed_amount` field তার জন্য preparation হিসেবে রাখা হয়েছে
- Land-related extra cost (registration fee, mutation cost ইত্যাদি) — Finance module discussion-এর সময় যোগ হবে

---

## 3. MODULE 2: Project Creation ✅ FROZEN

### 3.1 Purpose
Acquired/JV-signed land(s)-এর against-এ Project তৈরি করা, Tower ও Unit-level detail সহ।

### 3.2 Status Pipeline
```
planning
  → design
  → approval
  → under_construction
  → nearly_complete
  → handover_ongoing
  → closed
```

### 3.3 `projects` table

```
projects
 - id                    UUID, PK
 - code                  VARCHAR, e.g. "PRJ-2026-001", auto
 - name                  VARCHAR
 - project_type          ENUM: residential | commercial | mixed
 - total_land_area       DECIMAL, nullable   -- can be pulled/summed from linked lands, editable
 - location_summary       VARCHAR, nullable   -- addendum (Public Portal P2): marketing-friendly address (e.g. "Bashundhara R/A, Dhaka"), separate from linked land's cadastral location (mouza/dag/khatian stays internal)
 - expected_start_date   DATE
 - expected_completion_date DATE
 - actual_start_date     DATE, nullable
 - status                ENUM (per pipeline above)
 - project_manager       UUID → users.id, nullable
 - architect              VARCHAR, nullable   -- simple reference field until Contractor module exists
 - surroundings           TEXT       -- school/hospital/market/main road distance, for public site
 - amenities               TEXT[] / multi-select  -- Lift, Generator, Parking, Security, Community Space...
 - cover_image_url         VARCHAR, nullable
 - is_public                BOOLEAN, default false   -- addendum (Public Portal P1): website-এ দেখানো হবে কিনা
 - is_featured               BOOLEAN, default false   -- addendum (Public Portal P1): Home page-এ highlight করা হবে কিনা
```

### 3.4 `land_project_mapping` table (many-to-many: land ↔ project)

```
land_project_mapping
 - id            UUID, PK
 - land_id       UUID → lands.id
 - project_id    UUID → projects.id
```

> সাধারণ case (1 land = 1 project) স্বাভাবিকভাবেই কাজ করবে (একটা mapping row)। একাধিক land মিলে এক project, বা একটা land থেকে একাধিক project — দুটোই এই structure support করে।

### 3.5 `towers` table

```
towers
 - id             UUID, PK
 - project_id     UUID → projects.id
 - name           VARCHAR   -- "Tower A", "Block 1", or "Main Building" for single-building projects
 - floor_count    INTEGER
 - status         ENUM: planning | under_construction | complete
 - building_type          VARCHAR, nullable   -- addendum: e.g. "B+G+8" (Basement+Ground+8 floors)
 - unit_per_floor           INTEGER, nullable
 - lift_count                 INTEGER, nullable
 - electricity_backup           BOOLEAN, nullable
 - front_road_width_ft            DECIMAL, nullable
```

### 3.6 `units` table

```
units
 - id                  UUID, PK
 - code                VARCHAR, e.g. "A-501"  (Tower-Floor-Number pattern)
 - tower_id             UUID → towers.id
 - floor                INTEGER
 - unit_type            VARCHAR   -- e.g. "3 Bed", "2 Bed"
 - bedroom_count         INTEGER, nullable   -- addendum (Public Portal review): real reference site দেখায় "Bedrooms: 3, Bathrooms: 3, Balcony: 2" আলাদা fact হিসেবে, শুধু unit_type text না
 - bathroom_count         INTEGER, nullable
 - balcony_count            INTEGER, nullable
 - size_sqft             DECIMAL
 - facing                 VARCHAR, nullable
 - base_price             DECIMAL
 - parking_allocated      INTEGER, default 0
 - status                 ENUM: available | hold | reserved | booked | sold | handed_over
 - allocation_type        ENUM: developer_share | landowner_share
 - allocated_to_owner_id  UUID → landowners.id, nullable   -- required if allocation_type = landowner_share
 - for_sale_by             ENUM: company | owner_direct
```

### 3.7 Document types for `entity_type = 'project'`
`architectural_plan`, `structural_drawing`, `rajuk_approval`, `environmental_clearance`, `fire_safety_certificate`, `layout_floor_plan`, `brochure`, `gallery_image`, `other`

### 3.8 Open / deferred
- এখনো decide হয়নি: Tower/Unit level-এ কি detailed BOQ/budget লাগবে — Phase 2/3-তে
- Public website-এ tower-wise progress % দেখানো — Site Progress module discuss হলে এই দুইটা connect হবে

---

## 4. MODULE 3: Sales / Lead / CRM ✅ FROZEN

### 4.1 Purpose
Public website/WhatsApp/Facebook/Walk-in থেকে আসা inquiry capture, Sales Executive assign, follow-up track, booking-এ convert বা lost পর্যন্ত track করা।

### 4.2 Status Pipeline
```
new
  → contacted
  → site_visit_scheduled
  → site_visit_done
  → negotiation
  → booked          (→ Module 4: Booking & Customer টেকওভার করবে এখান থেকে)

  [যেকোনো stage থেকে] → lost
  lost → (revive করলে) ফিরে আগের active status-এ, lead history অক্ষত থাকবে
```

### 4.3 `leads` table

```
leads
 - id                    UUID, PK
 - code                  VARCHAR, e.g. "LEAD-2026-001", auto
 - name                  VARCHAR
 - phone                 VARCHAR, UNIQUE      -- duplicate check এর ভিত্তি (dedup key)
 - email                 VARCHAR, nullable
 - source                ENUM: website_form | whatsapp | facebook_ad | walk_in | referral | phone_call | other
 - inquiry_message       TEXT, nullable
 - interested_project_id UUID → projects.id, nullable
 - interested_unit_id    UUID → units.id, nullable
 - budget_range          VARCHAR, nullable
 - assigned_to           UUID → users.id       -- Sales Executive, manually assigned (Sales Manager sets this)
 - status                ENUM (per pipeline above)
 - lost_reason           TEXT, nullable        -- status = lost হলে fill হবে
 - created_at            TIMESTAMP
```

### 4.4 `lead_activities` table (follow-up log)

```
lead_activities
 - id                   UUID, PK
 - lead_id              UUID → leads.id
 - activity_type        ENUM: call | whatsapp | email | site_visit | meeting | status_change | other
 - notes                TEXT
 - activity_date        TIMESTAMP
 - next_follow_up_date  DATE, nullable
 - created_by           UUID → users.id
```

> Dashboard: "আজকে কার কার follow-up date, কোন lead-এ overdue follow-up আছে" — sales team-এর daily task list এখান থেকেই আসবে।

### 4.5 Duplicate Handling
`phone` field-এ UNIQUE constraint। নতুন inquiry আসলে (website form/manual entry) প্রথমে phone দিয়ে lookup হবে:
- **Match পেলে** → নতুন lead তৈরি হবে না, existing lead-এই একটা `lead_activities` entry যোগ হবে (`activity_type = other/website_form`, notes-এ নতুন inquiry-র message)
- **Match না পেলে** → নতুন lead তৈরি হবে

### 4.6 Lost → Revive
`lost` status থেকে lead-কে আবার active status-এ (`contacted`/`negotiation` — যেখান থেকে যুক্তিসঙ্গত) manually ফিরিয়ে আনা যাবে। যেহেতু record delete হয় না, আগের সব `lead_activities` history অক্ষত থাকে — revive করার সময় আগের communication দেখেই context বোঝা যাবে। কোনো আলাদা "revived" flag/table লাগবে না; status change নিজেই একটা `lead_activities` entry (`activity_type = status_change`) হিসেবে log হবে।

### 4.7 Assignment
Manual — Sales Manager role থেকে `assigned_to` field সরাসরি set/update করবেন। Auto round-robin এখন নাই (team ছোট থাকলে দরকার নাই, বড় হলে Phase 2-তে যোগ করা যাবে)।

### 4.8 Document types for `entity_type = 'lead'`
`nid_copy`, `other`

### 4.9 Public Website Connection
Website inquiry form submit → phone দিয়ে dedup check → নতুন lead অথবা existing-এ activity যোগ (`source = website_form`, নতুন হলে `status = new`)।

---

## 5. MODULE 4: Booking & Customer ✅ FROZEN

### 5.1 Purpose
Lead যখন `booked` status-এ পৌঁছায়, তখন সেই lead থেকে Customer record তৈরি, একটা Unit-এর সাথে Booking তৈরি, Unit reserve, pricing/discount/booking amount capture। পুরো installment schedule generate হবে না এখানে — সেটা Module 7 (Finance)।

### 5.2 Status Pipeline (Booking)

```
hold                  -- verbal/mutual confirm হয়েছে, unit reserve হয়ে গেছে, কিন্তু টাকা এখনো receive হয়নি
  → pending_approval   -- (conditional — শুধু discount rule অনুযায়ী threshold ছাড়ালে) higher role approval দরকার
  → confirmed           -- booking amount received AND (discount approval দরকার না, বা approved হয়েছে)
  → cancelled            -- hold বা pending_approval থেকে
```

**Gating logic (booking → confirmed):**
- `booking_amount_received = true` **AND**
- `discount_approval_status IN ('not_required', 'approved')`

দুটো শর্তই মিললে তবেই status auto `confirmed`-এ যাবে। কোনো একটা বাকি থাকলে `hold`/`pending_approval`-এই থাকবে।

### 5.3 `customers` table

```
customers
 - id             UUID, PK
 - code           VARCHAR, e.g. "CUST-2026-001", auto
 - name           VARCHAR
 - phone          VARCHAR, UNIQUE
 - email          VARCHAR, nullable
 - nid            VARCHAR, nullable
 - address        TEXT, nullable
 - profession     VARCHAR, nullable
 - lead_id        UUID → leads.id, nullable    -- ট্রেসেবিলিটির জন্য, কোন lead থেকে convert
 - created_at     TIMESTAMP
```

> Customer তৈরির সময় phone/name/email lead থেকে auto-copy হবে, নতুন করে টাইপ লাগবে না।

### 5.4 `discount_approval_rules` table (role-based discount limit — simple config)

```
discount_approval_rules
 - id                 UUID, PK
 - role                ENUM (users.role অনুযায়ী — sales_executive, sales_manager, head_of_sales...)
 - max_discount_pct    DECIMAL(5,2)      -- এই role approval ছাড়া সর্বোচ্চ কত % discount দিতে পারবে
```

> Booking তৈরির সময় system check করবে: `discount_pct` (discount_amount ÷ base_price × 100) বনাম `booked_by` user-এর role-এর `max_discount_pct`। বেশি হলে `pending_approval` trigger হবে।

### 5.5 `bookings` table

```
bookings
 - id                        UUID, PK
 - code                      VARCHAR, e.g. "BOOK-2026-001", auto
 - customer_id               UUID → customers.id
 - unit_id                   UUID → units.id
 - lead_id                   UUID → leads.id, nullable
 - booking_date              DATE
 - base_price                DECIMAL     -- unit.base_price থেকে snapshot
 - floor_premium             DECIMAL, default 0
 - facing_premium            DECIMAL, default 0
 - parking_charge            DECIMAL, default 0
 - other_charges             DECIMAL, default 0
 - discount_amount           DECIMAL, default 0
 - final_price               DECIMAL     -- base + premiums + charges − discount (calculated)
 - booking_amount            DECIMAL     -- advance/booking money (expected)
 - booking_amount_received   BOOLEAN, default false
 - discount_approval_status  ENUM: not_required | pending | approved | rejected
 - discount_approved_by      UUID → users.id, nullable
 - status                    ENUM (per pipeline above)
 - cancellation_reason       TEXT, nullable
 - booked_by                 UUID → users.id   -- Sales Executive
 - created_at                TIMESTAMP
```

### 5.6 Behavior / Side-effects

- Booking `hold` তৈরি হলে → `units.status = 'reserved'`
- Booking `confirmed` হলে → `units.status = 'booked'`, `leads.status = 'booked'`
- Booking `cancelled` হলে → `units.status` ফিরে `'available'`-এ
- `discount_approval_status = 'rejected'` হলে → booking `hold`-এ ফিরে যায় (note সহ), sales person discount adjust করে আবার submit করতে পারবে
- `final_price = base_price + floor_premium + facing_premium + parking_charge + other_charges − discount_amount`

### 5.7 Document types for `entity_type = 'customer'`
`nid_copy`, `photo`, `other`

### 5.8 Document types for `entity_type = 'booking'`
`booking_form`, `payment_receipt`, `other`

---

## 6. MODULE 5: Site Progress Update ✅ FROZEN

### 6.1 Purpose
Site engineer নিয়মিত construction progress আপডেট দেবে (WBS-based, granular), ছবি/GPS সহ — Public Website-এ reflect হবে। Material লাগলে এখান থেকেই request raise হয়ে Procurement-এ যাবে।

### 6.2 `tower_work_items` table (WBS per tower)

```
tower_work_items
 - id                     UUID, PK
 - tower_id               UUID → towers.id
 - name                   VARCHAR   -- "Foundation", "Ground Floor", "1st Floor"..."Roof", "Electrical", "Plumbing", "Finishing", "External Works"
 - sequence_no            INTEGER
 - weight_pct             DECIMAL(5,2)   -- overall tower %-এ অবদান (সবগুলো মিলিয়ে 100)
 - planned_start_date     DATE, nullable
 - planned_end_date       DATE, nullable
 - actual_progress_pct    DECIMAL(5,2), default 0
 - status                 ENUM: not_started | in_progress | completed
```

> Tower তৈরি হওয়ার সময় default template (Foundation → Roof → Electrical → Plumbing → Finishing → External Works, সমান weight) auto-generate হবে, Project Manager চাইলে edit করবেন।

### 6.3 `site_progress_updates` table (দৈনিক লগ)

```
site_progress_updates
 - id                UUID, PK
 - work_item_id       UUID → tower_work_items.id
 - update_date        DATE
 - progress_pct        DECIMAL(5,2)
 - remarks              TEXT, nullable
 - gps_lat / gps_lng    DECIMAL, nullable
 - updated_by            UUID → users.id
 - created_at
```

**Behavior:** নতুন entry → `tower_work_items.actual_progress_pct` update → `towers.current_progress_pct` recalculate (`Σ work_item.actual_progress_pct × weight_pct ÷ 100`, cached field) → Project overall % = তার Towers-এর average।

**Planned % (display-only, no storage):** Dashboard `planned_start_date`/`planned_end_date` থেকে linear interpolation করে "আজকের হিসেবে planned % কত হওয়া উচিত" বের করবে। Actual vs Planned পার্থক্যই "Delay %"। আলাদা কোনো table/field লাগবে না।

### 6.4 Document types for `entity_type = 'site_progress_update'`
`progress_photo`, `progress_video`, `other`

### 6.5 `material_requests` table (Site → Procurement bridge)

```
material_requests
 - id             UUID, PK
 - code           VARCHAR, e.g. "MREQ-2026-001"
 - project_id      UUID → projects.id
 - tower_id         UUID → towers.id, nullable
 - work_item_id      UUID → tower_work_items.id, nullable
 - requested_by       UUID → users.id   -- site engineer
 - request_date        DATE
 - status               ENUM: pending | approved | rejected | ordered | fulfilled
 - notes                 TEXT, nullable
```

**Lifecycle:** `pending` (Site Manager submit) → `approved`/`rejected` (Procurement decides) → `ordered` (Procurement purchase শুরু করেছে) → `fulfilled` (stock এসে গেছে, request close)। Purchase/vendor/voucher-এর বিস্তারিত পরের module (Procurement)-এ define হবে — এই module শুধু request পর্যন্ত দায়িত্ব নেয়, status-টা Procurement module থেকে আপডেট হবে।

### 6.6 `material_request_items` table

```
material_request_items
 - id                    UUID, PK
 - request_id            UUID → material_requests.id
 - item_name             VARCHAR   -- এখন free text; Procurement module-এ standard catalog-এর সাথে reconcile হবে
 - unit                   VARCHAR   -- bag/ton/piece
 - quantity_requested      DECIMAL
 - quantity_approved       DECIMAL, nullable
```

### 6.7 Public Website Connection
Project detail page-এ Tower-wise `current_progress_pct` + latest `progress_photo` দেখানো হবে।

---

## 7. MODULE 6: Procurement & Supplier Voucher ✅ FROZEN

### 7.1 Purpose
`material_requests` (Module 5, `approved` status) থেকে actual purchase, supplier থেকে material receive, stock আপডেট, site-এ material issue, এবং supplier payment/voucher track — সব project-wise।

### 7.2 Workflow
```
Material Request (approved)
        ↓
Purchase Order (supplier + price fix — simple, RFQ/quotation-comparison এখন নাই)
        ↓
Goods Receipt (material received, stock-এ যোগ, weighted avg cost update)
        ↓
Stock Issue (site-এ পাঠানো হলে stock থেকে বিয়োগ, cost snapshot নেওয়া হয়)
        ↓
Supplier Voucher (payment — সরাসরি, approval ছাড়াই)
        ↓
material_requests.status = 'fulfilled'
```

### 7.3 `suppliers` table

```
suppliers
 - id             UUID, PK
 - code           VARCHAR, e.g. "SUP-2026-001"
 - name           VARCHAR
 - type           ENUM: material_supplier | contractor | other   -- future Contractor module-এও reuse হবে
 - contact_person VARCHAR, nullable
 - phone          VARCHAR
 - address        TEXT, nullable
 - notes          TEXT, nullable
```

### 7.4 `purchase_orders` table

```
purchase_orders
 - id             UUID, PK
 - code           VARCHAR, e.g. "PO-2026-001"
 - request_id     UUID → material_requests.id, nullable   -- nullable, general/central stock purchase সরাসরি হতে পারে
 - project_id     UUID → projects.id, NULLABLE            -- null = general/central purchase, কোনো নির্দিষ্ট project-এর জন্য না, advance/bulk stocking
 - supplier_id    UUID → suppliers.id
 - order_date     DATE
 - status         ENUM: draft | ordered | partially_received | received | cancelled
 - created_by     UUID → users.id
 - notes          TEXT, nullable
```

### 7.5 `purchase_order_items` table

```
purchase_order_items
 - id                    UUID, PK
 - po_id                 UUID → purchase_orders.id
 - item_name             VARCHAR
 - unit                   VARCHAR
 - quantity_ordered        DECIMAL
 - unit_price               DECIMAL
 - quantity_received        DECIMAL, default 0
```

### 7.6 `goods_receipts` + `goods_receipt_items` (GRN)

```
goods_receipts
 - id             UUID, PK
 - code           VARCHAR, e.g. "GRN-2026-001"
 - po_id          UUID → purchase_orders.id
 - receipt_date   DATE
 - received_by    UUID → users.id
 - notes          TEXT, nullable

goods_receipt_items
 - id                UUID, PK
 - grn_id             UUID → goods_receipts.id
 - po_item_id         UUID → purchase_order_items.id
 - quantity_received   DECIMAL
 - quality_check       ENUM: passed | failed | pending
```

**Behavior:** GRN save → `purchase_order_items.quantity_received` update → সব item পুরো receive হলে PO `received`, আংশিক হলে `partially_received` → `material_requests.status = 'fulfilled'` (PO পুরো received হলে) → **শুধু `quality_check = 'passed'` item-এর quantity** `stock`-এ যোগ হয় + `average_unit_price` recalculate (weighted average: `(old_qty × old_avg + received_qty × unit_price) ÷ (old_qty + received_qty)`)। `failed` quality-check-এর item stock-এ যোগ হয় না — শুধু GRN record-এ থেকে যায়, যাতে ভুল material stock-এ ঢুকে না যায়।

> **PO cancellation rule:** কোনো item-এর quantity একবার receive (GRN) হয়ে গেলে সেটা stock-এ ঢুকে যায় ও অপরিবর্তনীয় থাকে; PO `cancelled` করলে শুধু **এখনো না-আসা বাকি quantity** বাতিল হয় — যা আগেই receive হয়েছে সেটা বহাল থাকে। Defective material পরে ফেরত দেওয়ার (supplier return/debit note) workflow এখন out of scope, Phase 2-তে যোগ হবে।

### 7.7 `stock` table (project-wise inventory, বা central/company stock)

```
stock
 - id                    UUID, PK
 - project_id            UUID → projects.id, NULLABLE   -- null = central/company stock (কোনো project-এর জন্য এখনো assign হয়নি)
 - item_name             VARCHAR
 - unit                   VARCHAR
 - quantity_available     DECIMAL
 - average_unit_price      DECIMAL   -- weighted avg purchase cost, GRN-এ update হয়
```

> `(project_id, item_name, unit)` মিলিয়ে একটা row — central stock-এর জন্য `project_id = null` দিয়ে একটাই row থাকবে item-প্রতি।

### 7.8 `stock_issues` table (site-এ material পাঠানো — consumption tracking)

```
stock_issues
 - id                    UUID, PK
 - code                  VARCHAR, e.g. "ISSUE-2026-001"
 - project_id            UUID → projects.id
 - work_item_id          UUID → tower_work_items.id, nullable   -- কোন কাজে ব্যবহার হলো (optional detail)
 - item_name             VARCHAR
 - unit                   VARCHAR
 - quantity_issued         DECIMAL
 - unit_cost_snapshot      DECIMAL   -- issue-এর সময় stock.average_unit_price থেকে snapshot
 - total_cost               DECIMAL   -- quantity_issued × unit_cost_snapshot
 - issue_date                DATE
 - issued_by                  UUID → users.id
 - notes                       TEXT, nullable
```

**Behavior:** Stock Issue save → `stock.quantity_available` বিয়োগ হয় (available-এর বেশি issue করা যাবে না, validation)। এই `total_cost`-ই আসল material-consumption-cost, যেটা Finance module-এ project-wise cost report-এ দেখানো যাবে।

### 7.8a `stock_transfers` table (central stock → project stock, অথবা project-to-project)

```
stock_transfers
 - id                    UUID, PK
 - code                  VARCHAR, e.g. "TRF-2026-001"
 - item_name             VARCHAR
 - unit                   VARCHAR
 - quantity                DECIMAL
 - from_project_id          UUID → projects.id, NULLABLE   -- null = central stock থেকে
 - to_project_id             UUID → projects.id             -- যে project-এর দরকার, required
 - unit_cost_snapshot         DECIMAL   -- source stock-এর average_unit_price থেকে নেওয়া
 - transfer_date               DATE
 - transferred_by               UUID → users.id
 - notes                          TEXT, nullable
```

**Behavior:** Transfer save → source stock row (`project_id = from_project_id`, central হলে `null`) থেকে `quantity_available` বিয়োগ → destination stock row (`project_id = to_project_id`) না থাকলে তৈরি, থাকলে quantity যোগ + `average_unit_price` নতুন করে weighted-average recalculate।

**পুরো advance-stocking scenario এভাবে কাজ করবে:**
```
PO তৈরি (project_id = null)  →  GRN  →  Central Stock-এ যোগ (project_id = null)
                                                  ↓
                    কোনো project-এর দরকার হলে → Stock Transfer (from: null/central → to: সেই project)
                                                  ↓
                            এরপর সেই project-এর নিজের stock থেকে normal Stock Issue (site consumption)
```

Material Request approve হওয়ার সময় Procurement team এখন দুইটা রাস্তা বেছে নিতে পারবে: (a) নতুন PO দিয়ে সরাসরি সেই project-এর জন্য কেনা, অথবা (b) central stock-এ আগে থেকেই থাকলে সরাসরি Stock Transfer করে দেওয়া — নতুন purchase লাগবে না।

### 7.9 `supplier_vouchers` table (payment to supplier — সরাসরি, approval ছাড়া)

```
supplier_vouchers
 - id             UUID, PK
 - code           VARCHAR, e.g. "VCH-2026-001"
 - po_id          UUID → purchase_orders.id
 - supplier_id    UUID → suppliers.id
 - project_id     UUID → projects.id, NULLABLE   -- po.project_id থেকে auto (central stock PO হলে null-ও হতে পারে)
 - amount         DECIMAL
 - payment_date   DATE
 - payment_method ENUM: cash | bank | mfs | cheque | online
 - reference_no   VARCHAR, nullable
 - paid_by        UUID → users.id
 - notes          TEXT, nullable
```

> এখন procurement-specific রাখা হয়েছে। Finance module-এ এটাকে Land payment/Contractor payment-এর সাথে মিলিয়ে unified Cost/Expense Dashboard-এ aggregate করা হবে — এখনই merge করছি না, Finance module confirm হওয়ার পর।

### 7.10 Document types
`entity_type = 'purchase_order'`: `quotation`, `invoice`, `other`
`entity_type = 'supplier_voucher'`: `payment_receipt`, `cheque_copy`, `other`

### 7.11 Project-wide Cost Traceability (confirmed design)
মূল chain-টা `project_id` বহন করে: `material_requests.project_id` → `purchase_orders.project_id` (nullable, central হলে null) → `stock.project_id` → `stock_issues.project_id` → `supplier_vouchers.project_id`। Central stock route ব্যবহার হলে `stock_transfers` সেই gap পূরণ করে (central → project), তারপর একই chain অনুসরণ করে। তাই কোনো অতিরিক্ত mapping ছাড়াই cost শেষ পর্যন্ত সঠিক project-এই রোলআপ হবে — এমনকি advance-এ কেনা জিনিসও।

---

## 8. MODULE 7: Finance — Customer Collection + Cost/Expense Ledger ✅ FROZEN

### 8.1 Purpose
দুইটা connected sub-part — **Income** (customer installment collection) এবং **Cost/Expense** (Land payment, Land extra cost, Contractor payment, ad-hoc/irregular project cost — Procurement voucher-এর সাথে মিলিয়ে unified rollup)।

---

### 8.2 Part A: Customer Collection (Income)

#### Status Pipeline (per installment)
```
pending → partially_paid → paid
   (due_date পার হয়ে গেলে, amount বাকি থাকলে) → overdue
```

#### `installment_plan_templates` table (per-project template — booking confirm হলে এখান থেকে actual installment generate হয়)

```
installment_plan_templates
 - id             UUID, PK
 - project_id     UUID → projects.id
 - sequence_no    INTEGER
 - label          VARCHAR    -- "Booking Amount", "Monthly Installment", "Construction Milestone", "Handover"
 - percentage     DECIMAL(5,2)
 - schedule_type  ENUM: on_booking | monthly | on_handover | manual
 - month_count    INTEGER, nullable   -- schedule_type='monthly' হলে কয় মাসে ভাগ হবে
```

**System default template** (Project তৈরি হওয়ার সময় auto-seed হয়ে যাবে, Project Manager/Accounts চাইলে project-ভিত্তিতে edit করতে পারবেন — booking শুরু হওয়ার আগে):

| Sequence | Label | % | Schedule |
|---|---|---|---|
| 1 | Booking Amount | 10% | on_booking |
| 2 | Monthly Installment | 60% | monthly (default 24 মাসে ভাগ, project-এর expected duration অনুযায়ী edit করা যাবে) |
| 3 | Construction Milestone | 20% | manual (Accounts নির্দিষ্ট progress % ছুঁলে due_date বসাবেন) |
| 4 | Handover | 10% | on_handover |

#### `payment_schedules` table

```
payment_schedules
 - id            UUID, PK
 - entity_type   ENUM: booking
 - entity_id     UUID → bookings.id
 - total_amount  DECIMAL   -- snapshot: bookings.final_price
 - created_at    TIMESTAMP
```

#### `payment_installments` table

```
payment_installments
 - id                UUID, PK
 - schedule_id       UUID → payment_schedules.id
 - installment_no    INTEGER
 - label              VARCHAR
 - due_date            DATE, nullable
 - amount_due          DECIMAL
 - amount_paid         DECIMAL, default 0
 - status               ENUM: pending | partially_paid | paid | overdue
```

**Generation logic:** Booking `confirmed` হলে → `payment_schedule` তৈরি (`total_amount = final_price`) → project-এর `installment_plan_templates` থেকে প্রতিটা row copy করে `payment_installments` তৈরি (`amount_due = percentage% × final_price`, `due_date` স্কিমা অনুযায়ী calculate — `on_booking` = booking_date, `monthly` = booking_date থেকে সমান interval-এ ভাগ, `manual`/`on_handover` = null, পরে Accounts/PM বসাবেন)। **Generated installment গুলো booking-ভিত্তিতে individually edit করা যাবে** (কোনো customer-এর সাথে আলাদা arrangement হলে)।

#### `payments` table (actual receive log)

```
payments
 - id              UUID, PK
 - installment_id   UUID → payment_installments.id
 - amount            DECIMAL
 - payment_date       DATE
 - payment_method     ENUM: cash | bank | mfs | cheque | card | online
 - reference_no       VARCHAR, nullable
 - received_by        UUID → users.id
 - notes               TEXT, nullable
```

**Behavior:** "Booking Amount" installment পুরো paid হলে → `bookings.booking_amount_received = true` (Module 4-এর hold→confirmed gate satisfy)। Partial payment সমর্থিত (একটা installment-এ একাধিক `payments` entry)। Overdue: `due_date < today AND amount_paid < amount_due` → status `overdue` (read-time/daily job)।

#### Document types for `entity_type = 'payment'`
`payment_receipt`, `cheque_copy`, `other`

#### `refunds` table (Booking cancel হলে already-paid amount ফেরত — gap fix)

```
refunds
 - id             UUID, PK
 - code           VARCHAR, e.g. "REF-2026-001"
 - booking_id     UUID → bookings.id
 - amount         DECIMAL
 - deduction      DECIMAL, default 0   -- cancellation charge কাটা হলে
 - net_refund     DECIMAL              -- amount − deduction
 - refund_date    DATE
 - payment_method ENUM: cash | bank | mfs | cheque | online
 - reference_no   VARCHAR, nullable
 - processed_by   UUID → users.id
 - notes          TEXT, nullable
```

> Booking `cancelled` হলে, ততদিন পর্যন্ত যত টাকা `payments`-এ জমা হয়েছিল, সেটার against-এ একটা `refunds` entry তৈরি করা যাবে (পুরো বা আংশিক — cancellation charge কেটে)। এটা ছাড়া booking cancellation lifecycle অসম্পূর্ণ থেকে যাচ্ছিল — ঠিক করা হলো।

#### Document types for `entity_type = 'refund'`
`refund_voucher`, `other`

---

### 8.3 Part B: Cost/Expense Ledger (unified, flexible — irregular cost-ও cover করে)

#### `expenses` table (generic — Land payment, Land extra cost, Contractor payment, marketing/admin, এবং যেকোনো ad-hoc/irregular project cost)

```
expenses
 - id             UUID, PK
 - code           VARCHAR, e.g. "EXP-2026-001"
 - project_id     UUID → projects.id, nullable   -- company-level খরচ হলে null
 - land_id        UUID → lands.id, nullable      -- land-related হলে reference
 - cost_category   ENUM: land_payment | land_extra_cost | contractor_payment | marketing | admin | other
 - cost_reason      VARCHAR      -- ছোট, স্পষ্ট label — বিশেষত category='other' হলে জরুরি, e.g. "Emergency generator repair", "Legal consultancy fee"
 - amount             DECIMAL
 - expense_date         DATE
 - paid_to               VARCHAR   -- landowner/contractor/vendor/individual নাম
 - payment_method         ENUM: cash | bank | mfs | cheque | online
 - reference_no             VARCHAR, nullable
 - paid_by                    UUID → users.id
 - notes                        TEXT, nullable
```

> এটাই আপনার তৃতীয় প্রশ্নের উত্তর — যেকোনো irregular/বড় খরচ যেটা এখনো কোনো নির্দিষ্ট lifecycle module (Land/Procurement/Contractor)-এর আওতায় আসেনি, সেটা সরাসরি এখানে **project-এর against এ** যোগ করা যাবে: `cost_reason` (কেন হলো), `project_id` (কোন project), `amount`, এবং Document tab দিয়ে receipt/voucher attach — কোনো নতুন module লাগবে না, এই generic ledger-ই যথেষ্ট। `cost_category = 'other'` হলে `cost_reason` দিয়েই context স্পষ্ট থাকবে।

#### Document types for `entity_type = 'expense'`
`receipt`, `voucher`, `invoice`, `other`

#### Unified Cost Rollup per Project (Dashboard query, নতুন table না)

```
Total Project Cost =
    SUM(expenses.amount WHERE project_id = X)
  + SUM(supplier_vouchers.amount WHERE project_id = X)     [Module 6]
```

#### Unified Revenue/Collection per Project (Dashboard query) — শুধু Company-owned sale, owner-direct sale বাদ

```
Total Sales Value    = SUM(bookings.final_price WHERE unit.tower.project_id = X, status != cancelled, unit.for_sale_by = 'company')
Total Collected       = SUM(payments.amount WHERE installment.schedule.booking.unit.tower.project_id = X, unit.for_sale_by = 'company')
Total Refunded          = SUM(refunds.net_refund WHERE booking.unit.tower.project_id = X)
Total Due                 = Total Sales Value − Total Collected
```

> **Gap fix:** আগে এই query-তে `unit.for_sale_by = 'company'` filter ছিল না — Module 2-তে landowner নিজে বিক্রি করা flat-এর (`for_sale_by = 'owner_direct'`) জন্যও যদি booking তৈরি হয় (inventory track করার জন্য), সেটা company-র নিজস্ব revenue না। Filter যোগ করে এটা ঠিক করা হলো, নাহলে Dashboard-এ ভুল বেশি revenue দেখাতো।

#### Management Dashboard (top-level, Owner role)
```
Project: PRJ-2026-001
  Total Sales Value     : ৳XX Cr   (company-owned sale only)
  Total Collected        : ৳XX Cr
  Total Refunded           : ৳XX Cr
  Total Due                : ৳XX Cr
  Total Cost So Far         : ৳XX Cr  (Land + Procurement + Contractor + Marketing + Admin + Other)
  Estimated Profit            : Total Sales − Total Cost
  Overdue Installments          : count + list
```

### 8.4 Notification (deferred)
Overdue reminder এখন শুধু dashboard-এ list আকারে দেখানো হবে — automated SMS/push notification এখনই দরকার নেই, Phase 2 (Notification module)-এ যোগ হবে।

---

## 9. MODULE 8: User & Role Management (+ Master Data, Settings) ✅ FROZEN

### 9.1 Purpose
সব module-এ ছড়িয়ে থাকা role reference একত্র করে চূড়ান্ত role list ও module-wise permission matrix। সাথে Master Data (admin-configurable dropdown lists) ও Company Settings — যেগুলো platform-wide shared component (Section 1.2, 1.3-এ schema আছে)।

### 9.2 Design Philosophy
Dynamic/custom role-builder বানানো হয়নি (over-engineering) — role একটা fixed ENUM, কোন role কী করতে পারবে সেটা application code-এ role-check দিয়ে হয়। ভবিষ্যতে সত্যিই দরকার হলে (অনেক role-variation লাগলে) আলাদা permissions table Phase 2-তে যোগ করা যাবে।

### 9.3 Finalized `users.role` ENUM

```
super_admin | management | land_team | project_manager | sales_executive | sales_manager | head_of_sales | site_manager | procurement | accounts
```

### 9.4 `users` table

```
users
 - id             UUID, PK
 - name           VARCHAR
 - phone          VARCHAR, UNIQUE
 - email          VARCHAR, UNIQUE
 - password_hash  VARCHAR   -- Phase A (IndexedDB, no real auth)-তে placeholder/mock; Phase B-তে actual hash
 - role           ENUM (উপরে তালিকাভুক্ত)
 - status         ENUM: active | inactive
 - last_login_at  TIMESTAMP, nullable
 - created_at     TIMESTAMP
```

### 9.5 `user_project_assignments` table (project-level scoping)

```
user_project_assignments
 - id            UUID, PK
 - user_id       UUID → users.id
 - project_id    UUID → projects.id
```

> `super_admin`, `management`, `land_team` — সব project access (mapping না থাকলেও)। বাকি role (`project_manager`, `site_manager`, `sales_executive`, `procurement`, `accounts`) — mapping না থাকলে কোনো project-ই দেখবে না, শুধু assigned project(s)-এর data access পাবে।

### 9.6 Permission Matrix (module-wise, high-level)

| Module | super_admin | management | land_team | project_manager | sales_executive | sales_manager | site_manager | procurement | accounts |
|---|---|---|---|---|---|---|---|---|---|
| Land | Full | View | Full | View | — | — | — | — | — |
| Project/Tower/Unit | Full | View | View | Full (assigned) | View | View | View (assigned) | View | View |
| Lead/CRM | Full | View | — | — | Own only | Full | — | — | — |
| Booking/Customer | Full | View | — | View | Own only | Full + Discount Approval | — | — | View |
| Site Progress | Full | View | — | Full (assigned) | — | — | Full (assigned) | — | — |
| Material Request | Full | View | — | Approve (assigned) | — | — | Create (assigned) | Approve/Fulfill | — |
| Procurement (PO/GRN/Stock) | Full | View | — | View (assigned) | — | — | — | Full | View |
| Supplier Voucher | Full | View | — | — | — | — | — | Full | Full |
| Finance — Collection | Full | View | — | View (assigned) | — | — | — | — | Full |
| Finance — Expense Ledger | Full | View | — | — | — | — | — | — | Full |
| Dashboard (Revenue/Cost) | Full | Full | — | View (assigned) | — | View (own) | — | — | View |
| Master Data / Settings | Full | — | — | — | — | — | — | — | — |
| User Management | Full | — | — | — | — | — | — | — | — |

> "Own only" = নিজের তৈরি/assign করা record-ই দেখবে। "Assigned" = `user_project_assignments`-এ থাকা project(s)।

### 9.7 Master Data / Settings (shared component, schema Section 1.2 ও 1.3-এ)
Admin (`super_admin`) role থেকে Settings screen-এ:
- **Company Info** — `company_settings` single row edit
- **Master Data** — `lookup_values` (Document Type per entity, Cost Category, Amenities, Unit Type, Facing) — নতুন option যোগ/inactive করা যাবে, code-change ছাড়াই

---

## 10. Roadmap — এখনো Discuss হয়নি (এই ক্রমে আলোচনা হবে)

- Public Website (project listing, progress showcase, inquiry form) ← next
- Handover, Snag/Defect, After-sales (later phase)

> প্রতিটা module confirm হওয়ার পর এই section থেকে সরিয়ে উপরে নিজের section-এ schema সহ যোগ হবে।

---

## 11. Decision Log (context, যাতে ভবিষ্যতে "কেন এভাবে করা হয়েছিল" মনে থাকে)

- Document management আলাদা module না — generic reusable `documents` table, entity-based
- Landowner info শুধু JV-তে না, সব land-এর জন্যই capture হয় (many-to-many, multiple owner support)
- Land ↔ Project many-to-many (multiple land → 1 project, বা 1 land → multiple project দুটোই সম্ভব)
- Tower আলাদা entity (শুধু text field না) — multi-tower project-এ আলাদা progress track করার জন্য
- Land-এ payment detail নাই, শুধু `final_agreed_amount` reference — actual payment/installment Finance module-এ হবে
- Lead assignment manual রাখা হয়েছে (auto round-robin না) — team ছোট, প্রয়োজনে Phase 2-তে যোগ হবে
- Lost lead delete হয় না — revive করা যায়, history (lead_activities) অক্ষত থাকে
- Duplicate lead phone number দিয়ে ঠেকানো হয় — নতুন inquiry existing lead-এ activity হিসেবে যোগ হয়, নতুন record না
- Booking-এ payment receive হওয়ার আগে "hold" status রাখা হয়েছে (unit reserve হয়ে যায়, কিন্তু confirmed না) — client-এর "verbal confirm কিন্তু টাকা আসেনি" বাস্তবতা reflect করার জন্য
- Discount approval conditional — শুধু role-এর limit ছাড়ালে approval লাগবে (`discount_approval_rules` table), সবসময় approval না — যাতে ছোট discount-এর জন্য extra step না লাগে
- Finance module (income + cost) ইচ্ছাকৃতভাবে postpone করা হয়েছে Procurement-এর পরে — কারণ cost/expense ledger মূলত Procurement থেকেই feed হবে, আগে freeze করলে rework লাগতো
- Site Progress WBS-based (granular, Option A) — প্রতিটা tower-এর work item (Foundation/Electrical/Plumbing...) আলাদা track হয়, tower-এর overall % এগুলোর weighted average
- Planned % storage করা হয়নি — `planned_start_date`/`planned_end_date` থেকে dashboard-এ display-time-এ linear interpolation করে বের করা হবে, আলাদা table/field লাগেনি
- Material Request lifecycle: pending → approved/rejected → ordered → fulfilled — actual purchase/vendor detail Procurement module দায়িত্বে, এই module শুধু request পর্যন্ত
- Procurement-এ RFQ/quotation-comparison এখনই রাখা হয়নি (simple, সরাসরি PO) — প্রয়োজনে Phase 2-তে যোগ হবে
- Stock Issue (site-এ material পাঠানো) আলাদাভাবে track হয় — শুধু "কত এলো" না, "কত ব্যবহার হলো"ও প্রতিটা project-wise থাকবে, cost snapshot নেওয়া হয় issue-এর সময়ে
- Supplier Voucher approval ছাড়া সরাসরি তৈরি হয় — Booking discount-এর মতো threshold-based approval নাই এখানে
- Cost traceability: material_requests → purchase_orders → stock → stock_issues → supplier_vouchers — সবগুলোতেই `project_id` থাকায় extra mapping ছাড়াই cost project-wise automatically রোলআপ হয়
- Central/company stock সাপোর্ট যোগ হয়েছে (addendum) — `stock.project_id` ও `purchase_orders.project_id` nullable করা হয়েছে (null = advance/bulk কেনা, কোনো project-এ এখনো assign হয়নি); `stock_transfers` table দিয়ে পরে যেকোনো project-এ issue করা যায়
- GRN-এ শুধু `quality_check = 'passed'` item stock-এ যোগ হয় — failed item ভুলে stock-এ ঢুকে যাওয়া রোধ করার জন্য (data correctness fix)
- Supplier return/debit note (defective material ফেরত) — এখন out of scope, Phase 2-তে যোগ হবে
- Installment plan এখন per-project template (`installment_plan_templates`) — system default (10/60/20/10) সেট আছে, Project তৈরির সময় auto-seed হয়, booking-এর আগে project-level edit করা যায়, generate হওয়ার পর booking-ভিত্তিতেও individually edit করা যায়
- Land payment, Land extra cost, Contractor payment, marketing/admin cost — সব একই generic `expenses` table-এ (আলাদা `land_costs` table বাদ দেওয়া হলো) — `cost_reason` field দিয়ে irregular/ad-hoc cost-ও কোনো নতুন module ছাড়াই project-এর against এ log করা যায়
- Automated overdue reminder (SMS/push) এখনই রাখা হয়নি — Phase 2 (Notification module)
- Role management dynamic role-builder না, fixed ENUM + code-level permission check — simple রাখার সিদ্ধান্ত, দরকার হলে Phase 2-তে permissions table
- Project-level data scoping (`user_project_assignments`) — Site Manager/Sales/Accounts শুধু নিজের assigned project দেখবে, super_admin/management/land_team সব দেখবে
- Master Data pattern চালু হলো (`lookup_values`) — শুধু option/dropdown list-এর জন্য (Document Type, Cost Category, Amenities...), workflow status ENUM-ই থাকছে যেহেতু সেগুলো code-logic-এর সাথে বাঁধা
- **Tech stack pivot (গুরুত্বপূর্ণ):** Phase A = Prototype/Demo শুধু IndexedDB (Dexie.js) দিয়ে, backend/API/Postgres এখনই না — Repository/Service layer আলাদা রাখা হচ্ছে যাতে Phase B (Postgres+Node backend)-এ migrate করা সহজ হয়, বড় rewrite না লাগে। Schema (table/field names) দুই Phase-এই একই থাকবে।
- **Full document review (gap-check pass) — ৩টা fix করা হলো:** (1) `supplier_vouchers.project_id` nullable করা হলো (central stock PO-র payment হলে project থাকার কথা না), (2) `refunds` table যোগ হলো — booking cancel হলে already-paid amount ফেরত দেওয়ার record রাখার জন্য, (3) Dashboard Revenue query-তে `unit.for_sale_by = 'company'` filter যোগ হলো — landowner-এর নিজের বিক্রি করা flat ভুলে company revenue-তে যোগ হয়ে যাচ্ছিল
- Sales Commission tracking ও Audit Log — industry-standard feature হলেও client-এর explicit চাহিদায় নাই, তাই এখন scope-এ রাখা হয়নি, Phase 2-তে বিবেচনা করা যাবে
- **Public Portal cross-module addendum:** `projects` table-এ `is_public` ও `is_featured` যোগ হলো — Public Portal (আলাদা document, `Real-Estate-Developer-Platform_Public-Portal_v1.md`) Home page-এর "Featured Projects" ও কোন project publicly visible সেটার জন্য দরকার
- **Public Portal same-app decision:** Admin ও Public Portal একই Next.js app-এ আলাদা route হিসেবে (`/admin/*` বনাম বাকি), যাতে Phase A-তে একই IndexedDB share করে সত্যিকারের connection demo করা যায় (IndexedDB origin-locked বলে আলাদা app হলে data share হতো না)
- **Public Portal P2 addendum:** `projects.location_summary` (marketing address, land-এর cadastral location থেকে আলাদা) ও `documents.is_public` (কোন document website-এ visible/downloadable) যোগ হলো — Public Portal-এর Project Listing/Detail page-এর জন্য দরকার
- **Public Portal P4 addendum:** `company_settings.whatsapp_number` যোগ হলো — click-to-chat button-এর জন্য
- **Chrome দিয়ে dpremiumhomes.com verified review-এর পর addendum:** `units`-এ `bedroom_count`/`bathroom_count`/`balcony_count` (আলাদা numeric field, শুধু `unit_type` text না) এবং `towers`-এ `building_type`/`unit_per_floor`/`lift_count`/`electricity_backup`/`front_road_width_ft` — real reference site-এর "Specification" ও "Available Units" section-এ এই breakdown আলাদাভাবে দেখানো হয়, তাই স্পষ্ট field হিসেবে যোগ করা হলো
- **Module 6 addendum — Material Request-এর role gating ও §7.8a route (b) বাস্তবায়ন (2026-09-03):** দুইটা জিনিস ধরা পড়েছিল। (১) 9.6-এর matrix সাইডবার আর route guard চালাত, কিন্তু **page-এর ভিতরের button** না — ফলে Site Manager নিজের তোলা request নিজেই "Approve" করতে পারত, অথচ matrix তাকে শুধু "Create (assigned)" দেয়। এখন approve/reject `canApprove(role,'material_request')`-এর পিছনে (Procurement ও Project Manager), আর "Raise Request"/"Request material" `canEdit(...)`-এর পিছনে (Site Manager), তাই যে চায় আর যে অনুমোদন দেয় তারা আলাদা থাকে। "(assigned)" অংশটা — কোন project-এ — Phase B-তে server-side, কারণ browser-এ করলে devtools দিয়ে খোলা যায় (OPEN-ITEMS 1.9)। (২) §7.8a বলেছিল approve-এর পরে Procurement দুইটা রাস্তা পাবে — নতুন PO, অথবা central stock-এ মাল থাকলে সরাসরি Stock Transfer — কিন্তু বাস্তবে শুধু PO-র রাস্তাটাই ছিল, আর `stock_transfers` কখনো request-এর status ছুঁত না, তাই route (b) নিলে request চিরকাল `approved`-এ আটকে থাকত (মাল site-এ পৌঁছে গেছে, queue তবু বলছে অপেক্ষায়)। এখন `stock_transfers.request_id` (nullable, index না — তাই নতুন Dexie version block লাগেনি, `towers.current_progress_pct`-এর মতোই) আর lifecycle-এ `approved → fulfilled` যোগ হলো, শুধু এই রাস্তার জন্য। Transfer delete করলে request আবার `approved`-এ ফেরে — GRN delete-এর rollback-এর হুবহু একই আচরণ

- **Final numbering fix:** "MODULE 5" নামে module না থাকা এবং Booking module-এর ভিতরে ভুল "Module 5 (Finance)" reference — দুটোই পুরনো ভুল ছিল, সব module-এর নাম ও cross-reference মিলিয়ে ঠিক করা হলো (Land=1, Project=2, Sales/CRM=3, Booking=4, Site Progress=5, Procurement=6, Finance=7, Users=8)
- **Module 5 build addendum (Site Progress, implement করার সময় ধরা পড়া gap):** Section 6-এ যা ছিল তার বাইরে ৩টা field দরকার হলো — (1) `material_requests.decision_note`: 6.5-এ `rejected` branch আছে কিন্তু "কেন reject" রাখার জায়গা নাই, আর `notes` হলো requester-এর নিজের লেখা (ওটার উপরে লিখলে আসল request নষ্ট হয়) — Booking module-এর `discount_decision_note`-এর মতোই; (2) `material_request_items.sort_order`: requisition-এর line-গুলোর কোনো order schema-তে ছিল না আর `created_at` দিয়ে হয় না (কয়েকটা line একই millisecond-এ save হয়), ফলে list প্রতিবার এলোমেলো order-এ আসত; (3) `towers.current_progress_pct`: 6.3-এ "cached field" হিসেবে নামসহ উল্লেখ আছে, index না বলে schema version বদলায়নি
- **Module 5 addendum — `material_request_status_history` table:** 6.5-এ lifecycle (`pending → approved/rejected → ordered → fulfilled`) define করা আছে কিন্তু transition record করার কোনো table নাই, তাই শুধু **current** status জানা যেত। ৮ তারিখে approve হয়ে ২৩ তারিখে ordered হলে approve-এর তারিখটা হারিয়ে যেত — অথচ delivery late হলে প্রথম প্রশ্নই হয় "Procurement কবে approve করেছিল"। `land_status_history` ও `project_status_history`-র হুবহু একই shape (`request_id`, `from_status`, `to_status`, `event_date`, `decided_by`, `note`)। Module 6 (Procurement) এই transition-গুলোর মালিক, তাই ওখানেই আরও field লাগলে যোগ হবে
- **Module 5 addendum — "Gone quiet" signal (scope-এ নাই, যোগ করা হলো):** delay-র চেয়ে বড় ঝুঁকি হলো active site থেকে বহুদিন কোনো update না আসা — তখন dashboard-এর % টা পুরনো, কিন্তু সেটা কেউ বুঝতে পারে না। যে project `under_construction`/`nearly_complete`/`handover_ongoing`-এ আছে **এবং** ১০০% হয়নি, সেটা ১৪ দিন report না দিলে board-এ লাল badge পেয়ে সবার উপরে ওঠে। কোনো নতুন field লাগেনি — `site_progress_updates.update_date` থেকেই derived
- **Module 5 — work item status derived, dropdown না:** `tower_work_items.status` (not_started/in_progress/completed) site engineer-এর দেওয়া percentage থেকে হিসাব হয়, হাতে বেছে নেওয়া যায় না। নাহলে "100% কিন্তু In Progress" টাইপ অসঙ্গতি তৈরি হতে পারত
- **Module 5 — project overall % কীভাবে:** 6.3 অনুযায়ী tower-গুলোর **average** (sum না)। প্রতিটা tower-এর weight নিজে নিজে 100% হয়, তাই ৫ tower-এর work item একসাথে যোগ করলে ১৭৬% আসে — build করার সময় এই ভুলটা হয়েছিল, ধরা পড়ে ঠিক করা হয়েছে
- **Module 6 build addendum (Procurement, implement করার সময় ধরা পড়া gap):** Section 7-এ যা ছিল তার বাইরে একটাই field দরকার হলো — `purchase_order_items.sort_order`। কারণ Module 5-এর `material_request_items.sort_order`-এর হুবহু একই: এক PO-র কয়েকটা line একই millisecond-এ save হয়, তাই `created_at` দিয়ে order ঠিক হয় না, আর PO পড়া হয় line ধরে ধরে মিলিয়ে। Index করা হয়নি — একটা PO-র হাতেগোনা line sort করতে লাগে, সেগুলো এমনিতেই memory-তে থাকে
- **Module 6 — PO status derived (partially_received/received হাতে সেট করা যায় না):** Section 7.6 বলে GRN থেকেই এই দুটো status আসে, তাই UI-তে শুধু `ordered` (draft raise করা) আর `cancelled` হাতে বেছে নেওয়া যায়। Module 5-এ work item status যে কারণে dropdown না, একই কারণ — dropdown থাকলে "Received কিন্তু কিছুই আসেনি" বলে stock-এ নাই এমন material বইয়ে উঠে যেত
- **Module 6 — Material Request lifecycle এখন সত্যিই Procurement চালায়:** Module 5-এ `ordered`/`fulfilled` হাতে mark করা হতো (তখন Module 6 ছিল না)। এখন PO raise হলে request → `ordered`, PO পুরো received হলে → `fulfilled`, দুটোই `materialRequestRepository.setStatus` দিয়ে, তাই `material_request_status_history`-তে row লেখা হয় আগের মতোই। উল্টোটাও ধরা হয়েছে: যে GRN দিয়ে order complete হয়েছিল সেটা delete করলে request আবার `ordered`-এ ফিরে যায় (note সহ) — নাহলে site-কে বলা থাকত material এসে গেছে, যেটা মাত্র un-receive হয়ে গেল। Manual button আর নাই, শুধু `approved` state-এ "Raise Purchase Order" আছে
- **Module 6 — `pending` quality check-ও stock-এ যায় না:** 7.6 শুধু `failed` বাদ দেওয়ার কথা বলে। কিন্তু `pending` মানে material site-এ আছে অথচ এখনো accept হয়নি (যেমন brick-এর crushing-strength test চলছে) — সেটাকে average cost-এ ঢোকালে ফেরত যেতে পারে এমন জিনিসের দামে store valued হতো। পরে pass করলে নতুন GRN line, তাতে audit trail-ও থাকে
- **Module 6 — GRN delete করলে weighted average rewind হয় না:** quantity ফেরত যায় (PO line ও stock দুটোতেই), কিন্তু `average_unit_price` যেখানে ছিল সেখানেই থাকে। running average reversible না — কোন receipt কোন order-এ এসেছিল তার উপর নির্ভর করে, আর ওই rate-এ material ইতিমধ্যে issue হয়ে গিয়ে থাকতে পারে। Stores ledger বাস্তবেও reversal current average-এই করে; উল্টোটা করলে এমন একটা দাম বানানো হতো যেটায় কিছুই কেনা হয়নি
- **Module 6 — over-receipt ও over-issue দুটোই refuse করা হয়:** PO-তে যত order হয়েছে তার বেশি receive করা যায় না (সত্যিই বেশি এলে আগে order edit করতে হবে), আর stock-এ যা আছে তার বেশি issue/transfer করা যায় না। কারণ দুটোই প্রায় সবসময় typo, আর ঢুকতে দিলে এমন rate-এ stock valued হতো যেটায় কেউ কিনতে রাজি হয়নি
- **Module 6 — voucher-এর `project_id` বেছে নেওয়া যায় না, PO থেকেই আসে:** 7.11-এর chain-এ PO-ই হলো link; দুটো আলাদা হতে দিলে payment ভুল project-এ রোলআপ হতো। তাই Supplier Voucher শুধু PO-র ভিতর থেকে তৈরি হয়, আলাদা "New voucher" button নাই
- **Module 6 — money/quantity rounding:** JS-এ একটাই number type, তাই "decimal, float না" নিয়মটা রাখা হয়েছে প্রতি ধাপে round করে — টাকা ২ দশমিক (`money()`), quantity ৩ দশমিক (`qty()`)। weighted average শত শত receipt fold করে বলে round না করলে drift দেখা যেত। Phase B-তে NUMERIC(14,2)/(14,3) — মানগুলো অপরিবর্তিত migrate হবে
- **Module 6 — supplier/PO delete-এর guard:** যে supplier-এর PO আছে তাকে delete করা যায় না (order ও payment-এর counterparty হারাত), আর যে PO-র against এ voucher আছে সেটাও না (paid voucher-এর order নাই — audit-এ উত্তর দেওয়া যায় না এমন অবস্থা)। PO delete করলে তার GRN-গুলো ও সেগুলোর যোগ করা stock ফেরত নেওয়া হয়
- **Module 7 build addendum (Finance, implement করার সময় ধরা পড়া gap):** Section 8-এ যা ছিল তার বাইরে কোনো নতুন field লাগেনি — চারটা table (`payment_schedules`, `payment_installments`, `refunds`, `expenses`) হুবহু scope অনুযায়ী। শুধু একটা ব্যাখ্যা যোগ করা দরকার: `payment_installments.status`-এ `overdue` কখনো **লেখা হয় না**। ওটা আজকের তারিখের উপর নির্ভরশীল, তাই লিখে রাখলে পরদিন সকালেই ভুল হয়ে যায়; আর সত্যি রাখতে হলে প্রতিবার screen পড়ার সময় table-এ লিখতে হতো — যেটা `useLiveQuery`-র নিচে ওই read-টাকেই আবার trigger করে (infinite loop)। তাই stored value শুধু money-based (pending/partially_paid/paid), আর `overdue` read-time-এ `installmentStatus()` দিয়ে উপরে বসানো হয়। 8.2 নিজেই "read-time/daily job" দুটোই allow করে; browser-only Phase A-তে daily job নেই, তাই read-time-ই একমাত্র যেটা বাসি হয় না
- **Module 7 — payment allocation waterfall (গুরুত্বপূর্ণ design decision):** 8.2-তে `payments.installment_id` আছে, অর্থাৎ এক receipt এক installment-এ। কিন্তু বাস্তবে দুইটা জিনিস এই নিয়ম ভাঙে: (ক) buyer একবারে lump দেয় যেটা তিনটা monthly একসাথে clear করে, (খ) booking money নেওয়া হয় Module 4-এ `hold` অবস্থায় — তখনো schedule তৈরিই হয়নি (schedule হয় `confirmed`-এ)। Receipt হলো একটা physical event (cheque, bKash transfer) — সেটাকে দুই ভাগ করে দুই line-এ বসানো মানে যে transaction হয়নি সেটা বানানো। তাই receipt অক্ষত থাকে আর **ledger সেগুলোকে পুরনো installment থেকে ক্রমান্বয়ে ভরে যায় (waterfall)**। `installment_id` রাখে receipt-টা কোন line ভরতে *শুরু* করেছিল — receipt-এ যেটা লেখা থাকা দরকার ("এটা আপনার booking money") — আর উদ্বৃত্ত পরের line-এ গড়িয়ে যায়। `amount_paid` কখনো আলাদা করে store হয় না, প্রতিবার receipt থেকে recompute হয়, তাই দুটো কখনো drift করতে পারে না। পুরো schedule ভরার পরও টাকা থেকে গেলে সেটা unallocated advance হিসেবে দেখানো হয় — জোর করে কোনো line-এ বসানো হয় না
- **Module 7 — schedule হলো snapshot, নিজে থেকে rebuild হয় না:** `payment_schedules.total_amount` তৈরির সময়কার `final_price`। পরে booking repricing হলে schedule নিজে থেকে বদলায় না, কারণ line-গুলোতে হাতে বসানো due date/amount থাকতে পারে ("এই buyer milestone-টা মার্চে দেবেন") — auto-rebuild করলে সেটা নিঃশব্দে মুছে যেত। এর বদলে Accounts-কে gap দেখানো হয় ("BDT X-এ তৈরি, এখন BDT Y") আর explicit "Rebuild" button দেওয়া হয়
- **Module 7 — rounding, শেষ line শোষণ করে:** percentage of price প্রায় কখনোই পূর্ণ টাকায় ভাগ যায় না, আর যে schedule-এর যোগফল দামের সমান না সেটা অচল — buyer-এর শেষ payment কখনো clear-ই হতো না। তাই প্রতি line round হয় আর **শেষ line পার্থক্যটা নেয়** (Module 5-এর tower WBS weight-এর মতোই), ফলে schedule সবসময় ঠিক final price-এ মেলে
- **Module 7 — tenure booking থেকে, template থেকে না:** template-এর `month_count` project-এর default, কিন্তু tenure-ই buyer আসলে দরকষাকষি করে, তাই `bookings.installment_tenure_months` থাকলে সেটাই জেতে (Module 4-এর addendum এই কারণেই যোগ হয়েছিল)
- **Module 7 — refund guard gross-এর উপর:** `amount` (gross) হলো buyer-এর ledger থেকে যা কাটছে, আর `deduction` হলো cancellation charge যা cheque থেকে বাদ যায়। যা paid হয়েছে তার সাথে **gross** মেলানো হয়, `net_refund` না — নাহলে charge কেটে দেখিয়ে যা এসেছিল তার চেয়ে বেশি ফেরত দেওয়া যেত। আর refund শুধু `cancelled` booking-এ তোলা যায়, booking page থেকেই — আলাদা "New refund" button নাই
- **Module 7 — Collections list থেকে cancelled booking বাদ:** বাতিল হওয়া booking-এর installment ধরে buyer-কে তাগাদা দেওয়া ঠিক এই list-টা যে ভুল ঠেকানোর জন্য। ওদের টাকা refund screen-এ দেখা যায়
- **Module 7 — `collected` receipt থেকে পড়া হয়, installment থেকে না:** booking `confirmed` হওয়ার আগেই নেওয়া টাকার কোনো schedule থাকে না, তাই installment-এর যোগফল ধরলে ব্যাংকে যা আছে তার চেয়ে কম দেখাত। Installment শুধু overdue কাটার জন্য ব্যবহার হয় — যেটা receipt দিয়ে বের করা যায় না
- **Module 7 — company-level cost project row-এ যোগ হয় না:** REHAB fair, head office rent, central store-এ আগাম কেনা material — এগুলোর `project_id` null। Company total-এ ধরা হয় কিন্তু কোনো project row-এ না, তাই row-গুলো যোগ করলে company total হয় না। Dashboard-এ এটা আলাদা করে লেখা আছে, নাহলে সংখ্যাটা ভুল মনে হতো
- **Module 8 build addendum (Users & Roles, implement করার সময়):** Section 9-এ যা ছিল তার বাইরে কোনো নতুন field লাগেনি — `users` (9.4) আগেই Module 3-এ তৈরি ছিল, শুধু `user_project_assignments` (9.5) যোগ হলো, হুবহু scope অনুযায়ী। Compound index `[user_id+project_id]` unique রাখা হয়েছে: duplicate row থাকলে assignment-নির্ভর প্রতিটা count নিঃশব্দে দ্বিগুণ হতো
- **Module 8 — permission matrix শুধু দেখা যায়, edit করা যায় না:** 9.2 ইচ্ছাকৃতভাবে dynamic role-builder বাদ দিয়েছে, আর check-গুলো code-এ। তাই Roles screen-এ 9.6-এর table hুবহু দেখানো হয়, কিন্তু editable grid দেওয়া হয়নি — সেটা এমন নমনীয়তার প্রতিশ্রুতি দিত যেটা বাকি application-এ নেই, আর কেউ ঘর বদলালে কিছুই বদলাত না
- **Module 8 — matrix শুধু document না, application সত্যিই মানে:** `PERMISSION_MATRIX` থেকে দুই জায়গায় কাজ হয় — (ক) sidebar যে module role খুলতে পারে না সেটা **লুকায়** (disable করে না; greyed-out "Users & Roles" একজন site manager-কে শুধু জানায় যে তাকে বিশ্বাস করা হয় না, যেটা অপ্রয়োজনীয়), (খ) `AccessGate` shell-এ বসে, তাই URL হাতে টাইপ করলেও page খোলে না। প্রতি page-এ আলাদা check বসালে পরে যোগ হওয়া page-এ সেটা বসাতে ভুলে যাওয়া হতো। Phase A-তে role simulated (Section 0 — real auth নাই), তাই এটা ভুল screen-এ যাওয়া ঠেকায়, security boundary না; Phase B-তে একই matrix API-র পিছনে গেলে সেটা boundary হবে
- **Module 8 — assignment হলো allow-list, filter না:** 9.5 বলে `super_admin`/`management`/`land_team` mapping ছাড়াই সব project দেখে, আর বাকিরা শুধু assigned project। তাই খালি mapping-এর মানে **"কিছুই না"**, "সব" না — `visibleProjectIds()` `null` (কোনো restriction নাই) আর `[]` (কিছুই না) আলাদা রাখে। উল্টোটা করলে নতুন site manager প্রথম দিনেই পুরো কোম্পানি দেখত। Role বদলে unscoped হলে পুরনো mapping মুছে ফেলা হয়, নাহলে screen এমন restriction দাবি করত যেটা প্রয়োগ হয় না
- **Module 8 — user delete করা যায় না যদি তার নামে record থাকে:** যে ব্যক্তি progress log করেছেন বা discount approve করেছেন, তার row মুছলে ওই record-গুলোর "কে করেছে" হারিয়ে যেত। তাই delete refuse করে কী কী আছে সেটা বলে দেওয়া হয়, আর **Inactive** করার পরামর্শ দেওয়া হয় — history থাকে, নতুন কাজ assign হয় না
- **Module 8 — Master Data-তে option retire হয়, delete না:** কোনো option বন্ধ করলে dropdown থেকে চলে যায়, কিন্তু যেসব record আগেই ওটা ব্যবহার করেছে সেগুলো ঠিকঠাক পড়া যায় (record value-টাই store করে, reference না)। একই কারণে rename করলে **সব জায়গায়** label বদলায় — typo ঠিক করার জন্য ঠিক, "এই slot অন্য কিছুর জন্য ব্যবহার করি" এর জন্য ভুল; screen-এ সেটা confirm করার আগে বলা আছে। Duplicate value case-insensitive ভাবে আটকানো হয় ("Lift" আর "lift" একই dropdown-এ দুইটা আলাদা choice হিসেবে দেখাত)
- **Module 8 — `userRepository` জায়গা বদলেছে:** Module 3-এ leads-কে কাউকে assign করতে হতো বলে `lead.repository.ts`-এর ভিতরে একটা read-only helper হিসেবে ছিল। এখন `user.repository.ts`-এ সরানো হয়েছে যাতে এক table-এর এক repository থাকে; `lead.repository.ts` আর সেটা define করে না

- **Tier 2 remediation addendum (2026-09-04, batches 2A–2E):** কোনো নতুন table বা index লাগেনি; `ExpenseFilters`-এ `land_id` যোগ হলো শুধু (column আগেই ছিল ও indexed ছিল, তাই নতুন Dexie version block দরকার হয়নি — `towers.current_progress_pct` ও `stock_transfers.request_id`-এর মতোই)। যে সিদ্ধান্তগুলো behaviour বদলায়:
  - **Unit status আর হাতে booked/reserved/sold করা যায় না (P-1):** `units.status` আর `bookings`-এর মধ্যে application কোনো invariant প্রয়োগ করত না, ফলে booking ছাড়াই একটা flat "Booked" করে দেওয়া যেত — এভাবেই Inventory rail আর Finance tab আলাদা কথা বলত। এখন unit form-এ শুধু `available`/`hold`; বাকিগুলো booking flow লেখে। যে unit-এ আগে থেকেই booking-লেখা status আছে সেটা dropdown-এ **দেখা যায় কিন্তু বেছে নেওয়া যায় না**, নাহলে form খুললেই status নিঃশব্দে বদলে যেত। Demo seed-এও Tower A-র booked/reserved flat-গুলোর পিছনে সত্যিকারের booking বসানো হলো। তবে `sold`/`handed_over` seed override হিসেবেই থাকল — এই software আসার আগে বিক্রি হওয়া flat-এর সত্যিই কোনো booking record থাকে না, আর developer বাস্তবে ওই inventory নিয়েই শুরু করে (OPEN-ITEMS-এ লেখা আছে)
  - **Refund এখন Refunds page থেকেও তোলা যায় (B-3) — Module 7-এর "আলাদা New refund button নাই" সিদ্ধান্তটা এখানে সংশোধিত:** কারণটা ভুল ছিল না (amount buyer যা দিয়েছে তার সাথে মেলাতে হবে), কিন্তু ফলটা ছিল — Refunds page-এ তৈরির কোনো রাস্তা নাই, আর কোথাও লেখাও নাই যে booking থেকে করতে হয়। এখন button আছে, কিন্তু সেটা **আগে cancelled booking বেছে নিতে বলে** (`refundRepository.listRefundable`) তারপর booking page-এর ওই একই dialog খোলে, তাই guard-গুলো (`issue`) হুবহু আগের মতোই কাজ করে
  - **Rejected discount আবার approval-এ পাঠানো যায় (B-5):** আগে reject হলে booking `hold`-এ পড়ে থাকত আর message বলত "adjust করে আবার submit করুন", অথচ একমাত্র রাস্তা ছিল Edit form-এ ঢুকে একই সংখ্যা আবার save করা — যেটা কেউ অনুমান করবে না। `bookingRepository.resubmitDiscount` ওই transition-টাকে নাম দিল, আর `rejected` ছাড়া অন্য কোনো state-এ চলতে অস্বীকার করে
  - **Bulk lead assignment filtered set-এর উপর, checkbox selection-এ না (C-4):** কাজটার আকৃতিই তাই — আজ সকালের website enquiry-গুলো filter করো, এক executive-কে দাও। প্রতিটা lead আলাদা করে `assign` দিয়েই যায় (bulk update না), তাই 4.7-এর assignment trail প্রতিটা lead-এ লেখা থাকে; নাহলে দ্রুত রাস্তাটা ইতিহাস মুছে ফেলত
  - **Land page-এ paid/balance দেখানো হয়, schedule দাবি করা হয় না (L-1):** `expenseRepository.landPaymentSummary` শুধু **যা বেরিয়েছে** সেটা বলে, আর balance = agreed − land_payment (registration/legal fee বাদ, কারণ ওগুলো জমির পিছনে খরচ কিন্তু মালিককে দেওয়া টাকা না)। কত কবে দেওয়ার কথা ছিল সেটা এখনো কোথাও লেখা নাই — land payment schedule Tier 3.4 — তাই copy-তে স্পষ্ট বলা আছে যে কোনো instalment plan record করা নেই
  - **Sorting `DataTable`-এর বাইরে নেওয়া গেল (F-7):** optional controlled `sort`/`onSortChange` prop যোগ হলো, তাই page নিজের sort dropdown দিতে পারে আর সেটা column header-এর সাথে **একই** state ভাগ করে (দুইটা আলাদা sort order হলে list ভুল মনে হতো)। `md`-এর নিচে card layout-এ header নাই বলে এটা ছাড়া মোবাইলে sort করার কোনো উপায়ই থাকত না
  - **Company Settings আর printed document-এর মিথ্যা দাবি করে না (U-8):** document-গুলো Tier 3.6, তাই copy এখন বলে সেগুলো এখনো তৈরি হয়নি — কিন্তু field ভরে রাখার কারণটাও বলে

- **Client review addendum (2026-09-04, feedback batches F1–F4):** সাতটা feedback যাচাই করা হলো; দুইটা ইতিমধ্যেই ঠিক ছিল (map default Dhaka-তেই ছিল — `DEFAULT_CENTER` 23.8103/90.4125; আর unit price বরাবরই user-ই দিত, per-sqft rate বা fixed — সমস্যা ছিল অন্য জায়গায়)। একটাই schema addendum, বাকিগুলো display ও guard:
  - **`projects.cover_image_document_id` (nullable, index না, তাই নতুন Dexie version block লাগেনি):** Phase A-তে upload করা ফাইল IndexedDB-তে Blob হিসেবে থাকে, তাই তার কোনো URL নাই যেটা `cover_image_url`-এ বসানো যায়। উঠানো ছবিকে display picture করতে হলে `documents` row-টাকেই reference করতে হয়। Upload করা ছবি pasted URL-এর উপরে জেতে (আর URL-টা মুছে দেওয়া হয়, নাহলে পুরনো link নিঃশব্দে website-এ থেকে যেত)। Phase B-তে document-এর আসল storage URL হলে এটা আবার `cover_image_url`-এ মিশে যাবে। `gallery_image` document type আর `documents.is_public` আগেই ছিল (3.7 ও Public Portal P2) — শুধু জোড়া লাগানো ছিল না
  - **Landowner allocation শুধু ওই project-এর জমির মালিকদের মধ্যে সীমিত:** আগে system-এর **সব** landowner dropdown-এ আসত, ফলে Bashundhara-র flat Sylhet-এর অন্য প্লটের মালিককে দেওয়া যেত। `allocation()` owner-ভিত্তিক গোনে, তাই ভুলটা সোজা JV target-vs-actual check-এ গিয়ে পড়ত — যে screen দিয়ে joint venture-এর তর্ক মেটে। নতুন `projectRepository.landownersForProject` chain-টা ধরে হাঁটে (project → `land_project_mapping` → lands → `land_owner_mapping` → owners), আর option-এ কারণটাও লেখা থাকে ("Md. Rafiqul Islam — LND-2026-001 100%")
  - **`for_sale_by` ENUM অপরিবর্তিত, কিন্তু label মিথ্যা বলা বন্ধ করল:** "Sold By: Owner Direct" পড়ে মনে হতো মালিক বিক্রি করছেন, অথচ সাধারণ JV ঘটনা হলো মালিক চুক্তি অনুযায়ী নিজের flat রেখে দিচ্ছেন আর কোম্পানি ওটা বিক্রিই করছে না। এখন label "Who sells it", value দুটো পুরো বাক্যে। সাথে একটা আসল ফাঁকও বন্ধ হলো: 8.5-এর revenue filter ঠিক এই field-এ চলে, অথচ unit form-এ developer-share flat-কে `owner_direct` করে দেওয়া যেত — তাতে unit নিঃশব্দে company sales/collections থেকে বেরিয়ে যেত। এখন allocation বদলালেই seller ঠিক হয়, আর developer-share হলে field read-only
  - **Bulk unit generation-এ floor premium:** আগে একটাই দাম সব floor-এ বসত, ফলে ২২ flat-এর tower এক দামে তৈরি হয়ে একটা একটা করে ঠিক করতে হতো — অথচ এদেশে উচ্চতার দাম আছে। `priceOnFloor` premium গোনে **`floor_from` থেকে**, floor 1 থেকে না; tower floor 2-এ শুরু হলে form-এ লেখা দামটাই floor 2-এর দাম, তার সাথে কেউ না-চাওয়া premium যোগ হয় না। Demo seed-ও এখন floor-প্রতি 1.5% ধরে
  - **Money input-এ কত টাকা লেখা হচ্ছে সেটা দেখানো হয় (`MoneyInput`):** grouping ছাড়া number field-এ 45000000 আর 450000000 চোখে এক — অথচ এগুলো জমির দামের ঘর। নিচে গ্রুপ করে আর বাজারের ভাষায় echo হয় ("BDT 45,000,000 · 4.5 crore")। এটা **input aid**, display format না — table ও tile-এ টাকা আগের মতোই পুরো দেখানো হয় (Tier 1-এর compact-বিরোধী সিদ্ধান্ত অক্ষত)
  - **Unit grid-এর legend ছয়টা status-ই দেখায়, count সহ:** আগে শুধু উপস্থিত status দেখাত ("legend যেন সত্য থাকে")। কিন্তু তাতে প্রতি tower-এ key-র আকার বদলাত আর প্রথম যে tower খোলা হতো সেটা ছয়টার মধ্যে তিনটা রঙ শেখাত। এখন সবগুলো থাকে, শূন্য হলে "0" দেখিয়ে ম্লান হয়ে যায় — সত্যতা অন্যভাবে রক্ষা পায়, আর রঙের ব্যবস্থাটা একবারেই শেখা হয়ে যায়

  - **Tier 3.6 — Printed documents (2026-09-04): কোনো schema change লাগেনি।** Money receipt, booking form ও supplier voucher যা যা ছাপে তার প্রতিটা field আগে থেকেই stored ছিল — `company_settings`-এর letterhead, `payments` + `bookings`-এর snapshot দাম (5.6), আর `supplier_vouchers` → PO → supplier chain (7.11)। তাই নতুন table নাই, নতুন column নাই, নতুন Dexie version block নাই। CSV export (collections, expenses, voucher register)-ও শুধু read
  - **Document আলাদা `/print` route-এ, admin shell-এর ভিতরে print stylesheet দিয়ে না:** sidebar/topbar-কে `@media print`-এ লুকালেও shell-এর flex column আর padding থেকেই যায় আর কাগজের আকার নিয়ন্ত্রণ করে; তাছাড়া এক payment-এর receipt-এর নিজের কোনো detail page নাই যার উপরে stylesheet বসানো যেত। তাই `AdminShell` `/print`-এ শেষ হওয়া route-এ সরে দাঁড়ায় — কিন্তু `MockSessionProvider` আর `AccessGate` থাকে, কারণ **document মানেই একটা URL**, আর paste করা URL-ও §9.6 মানতে বাধ্য। দুই দিক থেকেই যাচাই করা হয়েছে: `site_manager` receipt ও voucher দুটোতেই আটকায়, `accounts` receipt-এ ঢোকে
  - **Document-এ ভাষা English, কিন্তু টাকার কথা crore/lakh-এ:** UI English, তাই label-ও English (client-এর সিদ্ধান্ত)। কিন্তু `amountInWords` লেখে "Taka Fifteen Lakh Only" — Western scale-এ না — কারণ ঢাকায় হাতে দেওয়া receipt ওভাবেই লেখা হয়। **এখানে একটা অসঙ্গতি জেনেশুনে রাখা হলো:** পাশের অঙ্কটা `formatBdt`-এর কারণে `BDT 1,500,000` পড়ে, `15,00,000` না। `formatBdt`-কে `en-IN` grouping-এ নিলে application-এর **প্রতিটা** টাকার অঙ্ক একসাথে বদলাত (192 call site), তাই সেটা আলাদা সিদ্ধান্ত হিসেবে খোলা রইল — OPEN-ITEMS §0b। কাগজেই জিনিসটা সবচেয়ে বেশি চোখে পড়ে, তাই এটা তখন তোলা হয়েছিল, নিঃশব্দে বদলে ফেলা হয়নি
  - **Booking form snapshot column থেকেই ছাপে, unit থেকে নতুন করে হিসাব করে না:** booking-এর পরে unit-এর দাম বদলাতে পারে (5.6-এর snapshot এই জন্যই আছে), আর form যদি নিঃশব্দে নতুন দাম দেখাত তাহলে buyer-এর সই করা কপির সাথে বিরোধ বাধত
  - **Voucher-এ line rate `formatBdtRate`, `formatBdt` না:** পুরো টাকায় round করা rate নিজের line total-এর সাথে আর গুণ মেলে না (40,000 × 13.50), আর supplier-এর বিল মেলাতে বসা clerk তখন এমন একটা ফাঁক খোঁজে যেটার অস্তিত্ব নাই। যে voucher-এর project নাই সেটা "Central store" ছাপে — ওটা 7.11 ঠিকমতো কাজ করার প্রমাণ, missing data না
  - **Letterhead-এ খালি field কোনো লাইনই রাখে না:** Settings-এ trade licence না থাকলে সেখানে ফাঁকা লাইন থাকলে ওটা ছাপার ত্রুটির মতো দেখায়, তথ্য নাই সেটা বোঝায় না
  - **CSV export page না, filter-এর পুরো set নেয়:** table 12/25 row-এ page হয়, আর যিনি এক project-এ filter করে export চাপছেন তিনি ওই project চান, তার প্রথম পর্দাটুকু না। Button-এ row count লেখা থাকে যাতে কোনটা পাওয়া গেল তা নিয়ে ভুল বোঝাবুঝি না হয়। টাকা ও তারিখ কাঁচা যায় (number, ISO date) — `formatBdt`-এর "BDT 1,500,000" spreadsheet-এ text হয়ে যোগই হতো না। File-এ UTF-8 BOM দেওয়া হয়, নাহলে Excel Bangla নাম mojibake করে; আর `=`, `+`, `-`, `@` দিয়ে শুরু হওয়া cell-এর আগে একটা quote বসে, নাহলে reference number Excel-এ formula হয়ে যেত

  - **Tier 3.3 — `cost_category` এখন সত্যিই `lookup_values` (2026-09-04):** §1.2 শুরু থেকেই `cost_category`-কে lookup category বলে এসেছে, কিন্তু ওটা hard-coded ENUM ছিল আর Master Data screen-এ list-ই হতো না — ফলে "Legal & Registration" যোগ করতে developer লাগত, অথচ Master Data-র অস্তিত্বই এই জিনিস ঠেকানোর জন্য। এটা frozen scope-এর বিরুদ্ধে একটা ফাঁক ছিল, নতুন কোনো idea না
  - **`lookup_values`-এ দুইটা nullable, non-indexed column (তাই নতুন Dexie version block লাগেনি, `towers.current_progress_pct`-এর মতোই):** `code` — record যে stable key-টা রাখে; `is_system` — seeded option, যেটার উপর code নির্ভর করে
  - **কেন এই একটা list value-র বদলে code রাখে, বাকি পাঁচটা রাখে না:** `facing: 'South'` রাখলে "South"-কে rename করলে সব unit-এ একসাথে বদলে যায় — typo সারানোর জন্য এটাই ঠিক। কিন্তু `cost_category` ওভাবে পারে না: `expenseRepository.landPaymentSummary` আর expense form দুটোই `land_payment`-এর উপর চলে, তাই key যদি label হতো তাহলে Master Data-তে rename করলেই **একটা জমির balance-এর মানে নিঃশব্দে বদলে যেত**। এখন label rename হয়, নিচের key নড়ে না। যাচাই: "Land Payment" → "Payment to Landowner" rename করার পরে সব screen-এ label বদলেছে, code `land_payment`-ই আছে, আর জমির balance 12,000,000 ও fees 5,850,000 অপরিবর্তিত
  - **System option rename ও reorder হয়, retire হয় না:** Master Data-তে delete নাই, তাই deactivate-ই একমাত্র রাস্তা যেটা দিয়ে built-in category হারাতে পারত। `land_payment` deactivate হলে landowner-কে দেওয়া টাকা record করার আর কোনো উপায় থাকত না, অথচ land page balance দেখিয়ে যেত যেন সব ঠিক আছে — আর পর্দায় কিছুই ভুল দেখাত না। ছয়টায় "Built-in" badge আর disabled retire button; `deactivate()` এখন guarded `setActive` দিয়ে যায় যাতে পাশ কাটানো না যায়। User-এর যোগ করা option retire করা যায় — নাহলে check-টার কোনো মূল্য থাকত না
  - **Master Data দিয়ে যোগ করা category একবারই slug পায়** (`Legal & Registration` → `legal_registration`), আর seeded code-গুলোর সাথে মিলিয়ে unique করা হয় যাতে "Other Costs" seeded `other`-এর সাথে ধাক্কা না খায়। পরে rename করলে slug বদলায় না — ওটাই তো ওর কাজ
  - **`COST_CATEGORY_META` ইচ্ছা করে `SystemCostCategory`-তে keyed, widened `CostCategory`-তে না:** widen করলে প্রতিটা lookup type-check হয়ে যেত আর Master Data দিয়ে যোগ করা category-র জন্য runtime-এ `undefined` ফেরত দিত — অর্থাৎ compile হতো, crash করত। এভাবে keyed রাখায় compiler-ই দশটা display site ধরিয়ে দিয়েছে, আর প্রতিটাতে fallback (`costCategoryLabel` / `costCategoryTone`) বসাতে বাধ্য করেছে
  - **Retired category-র নামও আসল নামই দেখায়:** label lookup আগে শুধু active list পড়ত, ফলে retire করা "Legal & Registration" humanised code হয়ে "Legal Registration" দেখাত। এখন label সব option পড়ে, আর শুধু dropdown-গুলো active filter করে — retired option শুধু ওখানেই দেখানো চলে না
  - **Land picker নিয়ে §4.0-এর একটা দাবি ভুল ছিল:** বলা ছিল `ExpenseFormModal` শুধু `land_payment`/`land_extra_cost`-এ land picker দেখায়। আসলে picker সব category-তেই দেখায়, সবসময় দেখিয়ে এসেছে — ওই দুইটা নাম শুধু hint-টা বদলায়। যেমন ছিল তেমনই রাখা হলো, কারণ সীমিত করলে সেটা উন্নতি না, regression হতো: `landPaymentSummary` মালিককে দেওয়া টাকা আর জমির উপরে খরচ হওয়া বাকি সব আলাদা করে, আর ওই "বাকি সব" ঘরটাই তো "Legal & Registration"-এর মতো user-added category-র জায়গা

  - **Tier 3.4 — Land payment schedule (2026-09-04): schema change লাগেনি।** `SCHEDULE_ENTITY_TYPES`-এ `land` যোগ হলো; column আর `[entity_type+entity_id]` compound index দুটোই Section 8.2-তে আগে থেকেই ছিল, শুধু `booking` ছাড়া কিছু লেখা হতো না (OPEN-ITEMS 1.8, এখন closed)। `payment_installments` land instalment হুবহু যেমন আছে তেমনই নেয়
  - **§4.0-এর 🔴 সতর্কতাটা বাস্তবে হয় না — ধরে না নিয়ে পরীক্ষা করা হয়েছে:** বলা ছিল `collectionRepository.list` আর finance dashboard-এ `entity_type` filter নাই, তাই land instalment buyer-এর collections queue-তে ঢুকে যাবে আর land-এর টাকা "Still due"/"Overdue"-তে যোগ হবে। ৪টা overdue line (মোট 82,000,000) সহ একটা land schedule বসিয়ে তারপর filter-টা সরিয়ে দেখা হয়েছে: collections 156 row-ই থাকল, dashboard 207,751,600 due আর 5,558,712 overdue (9 instalment)-এই থাকল, কোনো land line দেখাল না। কারণ দুই জায়গাতেই `bookings`-এর সাথে join হয়, আর যে `entity_id` booking না সেটা এমনিতেই বাদ পড়ে। **তবু filter দুটো বসানো হলো** — কারণ এখনকার নিরাপত্তাটা "land id কখনো booking id-র সমান হয় না" নামের একটা অলিখিত, অরক্ষিত invariant-এর পার্শ্বপ্রতিক্রিয়া মাত্র
  - **Land-এর নিজের generator লাগে (§4.0 এই জায়গাটা ঠিক বলেছিল):** `generateForBooking` হাঁটে booking → unit → tower → project-এর instalment template ধরে — এর কোনোটাই একটা প্লটের নাই। তাই terms form থেকে নেওয়া হয় (বায়না, কয়টা monthly, registration-এ কত আটকে থাকবে), কারণ জমি একবারই এক মালিকের সাথে **টাকায়** দরদাম হয়, price list-এর percentage-এ না
  - **শুধু `direct_purchase`, আর `final_agreed_amount` থাকলে:** JV-তে মালিককে unit দিয়ে শোধ করা হয় (§2.4), টাকায় না — তাই schedule করার মতো কোনো দাম-ই নাই। Tab-টা খালি table না দেখিয়ে কারণটা লেখে
  - **Land instalment শোধ হয় cost ledger থেকে, `payments` থেকে না:** `recalculateForLand` ওই জমির `land_payment` expense-গুলো পুরনো থেকে নতুন ক্রমে instalment-এ বসায় — buyer-এর দিকের হুবহু একই waterfall, উল্টো দিক থেকে। `amount_paid` derived-ই থাকে, তাই plan আর ledger আলাদা হয়ে যেতে পারে না — এই কারণেই Accounts-কে হাতে টিক দিতে দেওয়া হয়নি, তাতে এক সত্যের দুইটা সংখ্যা থাকত। Expense-এ কিছু ফেরত লেখা হয় না: `payments`-এ `installment_id` আছে যাতে receipt বলতে পারে কোন কিস্তির টাকা, expense-এ ওটার দরকার নাই
  - **Expense-এর তিনটা write path-ই recalculate করে**, edit সহ — কারণ edit টাকা **সরাতে** পারে (এক জমি থেকে আরেক জমিতে, বা `land_payment` থেকে fee-তে)। শুধু নতুন দিকটা করলে পুরনো জমিতে এমন একটা কিস্তি "শোধ" দেখাত যার খরচটা আর ওই জমির against-এ নাই। দুই দিকেই পরীক্ষিত: 2,000,000 বসালে ৫ নম্বর কিস্তি পূর্ণ হয়, category বদলালে আবার 5,500,000-এ ফেরে
  - **একটা cross-check যেটা রেখে দেওয়ার মতো:** Dhanmondi plot-এ plan-এর মোট 82,000,000, allocated 70,000,000, বাকি 12,000,000 — আর land page-এর balance `landPaymentSummary` দিয়ে **আলাদা code path-এ** একই 12,000,000-এ পৌঁছায়। দুইটা না মিললে একটা ভুল
  - **Demo-তে একটা land plan seed করা হয়**, কিন্তু `generateForLand` দিয়ে — হাতে লিখে না। booking schedule-গুলোর ক্ষেত্রেও একই নিয়ম: হাতে লেখা schedule এমন একটা জিনিস দেখাত যেটা feature কখনো বানায়নি

  - **Land expense ↔ instalment connection (2026-09-05, client feedback):** তিনটা জিনিস, তার একটা display gap না — **data bug** ছিল। (১) category বদলালে `land_id` মুছত না, তাই Land Payment-এ প্লট বেছে Marketing-এ সরে গেলে একটা marketing খরচ `land_id` নিয়ে save হয়ে যেত; `landPaymentSummary` ওই জমির against-এর **সব** expense গোনে, তাই ওটা জমির "fees and extras"-এ গিয়ে বসত — যে টাকা জমিতে কখনো খরচই হয়নি, আর পর্দায় কিছু ভুল দেখাত না। এখন land-category ছাড়া picker **disabled**, আর category সরলে প্লটও মুছে যায়; নিয়মটা `createExpense`/`updateExpense`-এও আছে, কারণ Phase B এই layer-টাই রাখবে। জমির fee আটকায় না — `land_extra_cost`-ই registration/mutation/legal fee-র seeded category, ওটায় picker থাকে
  - **এটা 0e-তে লেখা সিদ্ধান্তটা উল্টে দিল:** ওখানে যুক্তি ছিল "Legal & Registration"-এর মতো user-added category জমির fee bucket-এ যাওয়া দরকার তাই picker সব category-তে থাকুক। যাচাই করতে গিয়ে যুক্তিটা টেকেনি — `land_extra_cost`-ই তো ওই bucket
  - **Expense form আর plan-এর ব্যাপারে অন্ধ না:** Land Payment + প্লট বাছলে দেখায় কোন কিস্তি এখনো বাকি, কত দিন late, ওটায় কত outstanding, আর plan-এ মোট কত বাকি — সাথে যে amount টাইপ হচ্ছে সেটা কী করবে। `landDueSummary` ইচ্ছা করে **সবচেয়ে পুরনো unsettled** line দেয়, `summariseSchedule.next_due` না — কারণ ওটা overdue line এড়িয়ে যায়, যেটা dashboard-এ ঠিক আর টাকা দেওয়ার সময় ভুল (টাকাটা তো overdue line-এই বসবে)
  - **Waterfall-এর একটাই implementation:** `allocateOldestFirst` এখন pure domain function, যেটা `recalculateForLand` (যে লেখে) আর `previewLandPayment` (যে আগেই বলে দেয়) দুটোই ব্যবহার করে। এক নিয়মের দুইটা implementation সময়ের সাথে আলাদা হয়ে যায়, আর যেটা আলাদা হয় সেটা preview — অর্থাৎ যেটা দেখে মানুষ সিদ্ধান্ত নেয়
  - **কম টাকা দিলে কী হয় (client-এর প্রশ্ন) — আচরণ আগের মতোই, তবে এখন পর্দায় লেখা থাকে:** 2,000,000-এর কিস্তিতে 1,500,000 দিলে বাকি 500,000 **ওই কিস্তিতেই** থেকে যায় আর ওর নিজের তারিখে overdue হয়, plan-এর শেষে সরে যায় না। তাতে বকেয়া বকেয়া হিসেবেই পড়া যায়, আর plan যা চুক্তি হয়েছিল তা-ই বলতে থাকে। মালিক রাজি হয়ে সত্যিই শর্ত বদলালে সেটা per-line edit — চুক্তির বদল, ইচ্ছা করে করা
  - **বেশি টাকা দিলে সতর্ক করে, কিন্তু আটকায় না:** টাকা তো সত্যিই অ্যাকাউন্ট থেকে গেছে; একটা পুরনো হয়ে যাওয়া plan বাঁচাতে গিয়ে ledger-কে ভুল করা যায় না। বাড়তিটা plan tab-এ unallocated হিসেবে দেখায়, আগের মতোই
