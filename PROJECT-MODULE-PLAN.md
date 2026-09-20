# Module 2 — Projects: what it does, and the three phases

Agreed with the client 2026-09-20/21, after the Land module wrap-up. Source of
truth: `Real-Estate-Developer-Platform_Scope-Document_v3.md` §3, BRD v2.0
§12–16, and the 2026-09-20 decision that **a land is never sold from the Land
module** — it is linked to a project, and `project_type` declares the shape of
the sale.

That decision is what makes this plan necessary. Module 2 was built for one
kind of project: a tower with floors and flats. Three of the five types we now
offer do not have floors, and one of them does not have a building at all.

---

## 1. What the Project module is for

The Land module answers *"do we own it, and what did it cost?"*. Module 4
answers *"who bought what, and what have they paid?"*. Module 2 is the thing in
between, and it has exactly three jobs:

1. **Declare the venture.** A project is the unit of planning: which land it
   stands on, what is being sold on it, who the manager is, when it starts and
   finishes, what stage it is at.
2. **Create the saleable inventory.** This is the module's real output. Nothing
   in the system can be sold until Module 2 has made the thing that gets sold —
   a flat, a plot, a share. Everything downstream (`bookings.unit_id`,
   payment schedules, refunds, the public portal) hangs off that row.
3. **Split the inventory between the parties.** On a JV, which flats are the
   landowner's and which are ours, and who sells each. This is the one piece of
   arithmetic the developer cannot get wrong without a lawsuit.

Everything else a project screen shows — construction progress, procurement,
budget — belongs to other modules and is *read* here.

### What connects, on each side

| Direction | Module | The contract between them |
|---|---|---|
| ← | **1 Land** | `land_project_mapping`. Gate G3: a land must be `ready_for_project` (or need no development). Linking sets the land to `linked_to_project`. `land_jv_details` drives the landowner split. Land area feeds `total_land_area`. |
| ← | **1 Land** | On a JV, `lands.acquisition_type` — **not** `project_type` — is what says a JV is involved. Deliberate; see the scope doc §3.3. |
| → | **3 Leads** | A lead names the project it is interested in. Site visits are arranged against it. |
| → | **4 Bookings** | `bookings.unit_id`. The unit's `base_price` is snapshotted at booking. `unit.status` moves available → booked → sold → handed over. |
| → | **5 Site Progress** | `towers` + `tower_work_items`; the weighted progress % is cached on the tower. |
| → | **6 Procurement** | Material requests and site stock are held per project, and issued per tower. |
| → | **7/8 Finance** | `project_budget`, and every expense with a `project_id`. |
| → | **Public Portal** | `is_public` / `is_featured` projects and their available inventory. |

**The load-bearing consequence:** `towers` is wired into site progress,
procurement, material requests and stock. It cannot be replaced with a
type-specific table without writing a second code path through four modules. So
the container stays `towers` and the item stays `units`; what changes is what
they *mean*, what they *require*, and what they are *called*.

---

## 2. How these projects actually run in Bangladesh

The five types are not five labels on one flow. They differ in what is sold, how
it is priced, what "progress" means, and what handover is.

### 2.1 Apartment — ফ্ল্যাট প্রকল্প

The default, and what the module already does. A tower of flats, sold by **rate
per sqft**. Two ownership shapes:

- **Own land.** Every flat is the company's to sell.
- **Joint venture (ডেভেলপার চুক্তি).** The landowner takes a share, typically
  40–50%, and it is settled in **named flats**, not a percentage — "A-3A, A-4B
  and A-6A are the owner's". Signing money (সাইনিং মানি) is paid at the
  agreement, and is a land cost, not a project cost. The owner may sell his own
  flats directly (`for_sale_by = 'owner_direct'`) or ask the developer to sell
  them for him.

Price is the sqft rate plus premiums that are real money in this market: floor
premium, facing (south-facing carries a genuine premium), and corner. Parking is
usually priced separately. Utility connection, transformer and the registration
cost are charged **outside** the flat price.

Handover is physical: keys, then deed registration and mutation.

### 2.2 Commercial — দোকান / অফিস স্পেস

Same tower, same sqft pricing, but the rate is not uniform by floor the way a
flat project's is — a ground-floor shop can be several times the rate of the
same area three floors up. Sold as `Shop` / `Office Space` unit types.

Mechanically this is an apartment project with a different price curve, which is
why it needs no separate flow — only the ability to price per floor, which the
floor premium already allows.

### 2.3 Mixed — নিচে দোকান, উপরে ফ্ল্যাট

One tower, two pricing regimes: commercial on the lower floors, residential
above. The only thing the system needs is for `unit_type` to be free to vary by
floor, which it already is. No separate flow.

### 2.4 Plot Development — প্লট প্রকল্প / আবাসন প্রকল্প

**A genuinely different flow.** The developer buys a large tract — Purbachal
fringe, Ashulia, Gazipur — fills it, cuts roads and drains, brings electricity,
and sells **serviced plots**.

- Inventory is **blocks and plots**, not towers and floors. "Block C, Plot 14."
- Priced **per katha**, never per sqft. A 5-katha plot at 12 lakh/katha.
- The two things that move the price are **road width** and **corner**: a plot
  on a 40ft road is worth materially more than the same plot on a 20ft road, and
  a corner plot carries a premium. These are the plot equivalent of floor and
  facing premiums.
- **There is no floor, no bedroom, no bathroom, no balcony, no lift.** Asking
  for them is not merely noise; it makes the screen unusable.
- Payment runs long — 36 to 60 monthly instalments is ordinary, far longer than
  a flat.
- "Construction progress" is **development progress**: earth filling, road,
  drain, electricity, boundary wall. This is the same work the Land module
  already models as land development (batch L6), which is the natural place for
  it.
- Handover is **possession + registration + mutation (নামজারি)**, not keys.

### 2.5 Land Share — জমির শেয়ার বিক্রয়

**The other genuinely different flow, and the one the system has never had.**

The company buys a plot and sells it as a fixed number of **undivided shares**.
The client's own example: one plot, 20 shares, 100,000 taka each. A buyer of one
share owns 1/20th of the whole plot — not a demarcated piece of ground. Nothing
is built, and nothing is physically divided.

What this means in practice:

- Inventory is a **share register**: N shares, usually all at the same price,
  each optionally carrying the land area it represents (1 share = 1.2 katha).
- **There are no blocks.** The tower/block UI should not appear at all.
- Priced **per share**, a flat amount. Not per sqft and not per katha, though
  the katha figure is shown because buyers think in katha.
- The buyer's title is a fractional share by deed. Often a share certificate is
  issued first and the deed follows.
- **Two things commonly happen next, and the system has to expect both:**
  1. **The shareholders commission construction.** Once the shares are sold, the
     buyers — now co-owners — come back to the same developer and ask him to
     build on it. That is a **new project on the same land**, whose buyers are
     already known. It is not a stage of the land-share project; it is a
     successor to it.
  2. **Partition (বাঁটোয়ারা).** The co-owners divide the land into demarcated
     plots and each takes one. The land-share project effectively becomes a plot
     project.
- There is no construction and no handover of keys. "Delivery" is the deed.

### 2.6 What that gives us

| | apartment | commercial | mixed | plot_development | land_share |
|---|---|---|---|---|---|
| Container | Tower | Tower | Tower | **Block** | **none** |
| Item | Flat | Shop / Office | Flat + Shop | **Plot** | **Share** |
| Priced by | rate × sqft | rate × sqft | rate × sqft | **rate × katha** | **flat per share** |
| Size in | sqft | sqft | sqft | **katha / bigha / decimal** | **share % (+ katha)** |
| Floor applies | yes | yes | yes | **no** | **no** |
| Bed/bath/balcony | yes | no | varies | **no** | **no** |
| Premium drivers | floor, facing | floor, facing | floor, facing | **road width, corner** | **none** |
| Progress means | construction | construction | construction | **land development** | **none** |
| Handover is | keys + deed | keys + deed | keys + deed | **possession + deed** | **deed only** |
| JV split applies | yes | yes | yes | yes | rarely |

Three columns behave alike and two do not. That is the whole design problem.

---

## 3. The model: one set of tables, type-aware meaning

`towers` stays the container and `units` stays the item, because `bookings`,
site progress, procurement and the public portal all already speak that
language. A **project shape** derived from `project_type` says, in one place,
what those rows mean for this project.

```
projectShape(project_type) → {
  container: 'tower' | 'block' | 'none',
  item:      'flat' | 'plot' | 'share',
  sizeBasis: 'sqft' | 'land' | 'share',
  priceBasis:'per_sqft' | 'per_katha' | 'per_share',
  fields:    which unit fields apply,
  progress:  'construction' | 'development' | 'none',
  handover:  'keys' | 'possession' | 'deed',
}
```

Every screen asks the shape rather than testing `project_type` inline, so a
sixth type later is one entry in one map.

### Schema changes (Dexie v26)

```
units
 + land_size          DECIMAL, nullable   -- plots: 5.0 (katha)
 + land_size_unit     ENUM, nullable      -- katha | bigha | decimal
 + share_pct          DECIMAL, nullable   -- land_share: 5.0 (= 1/20th)
 + road_width_ft      INT, nullable       -- plot price driver
 + is_corner          BOOLEAN, nullable   -- plot price driver
   floor              -> nullable         (no floors on a plot or a share)
   size_sqft          -> nullable         (no sqft on a plot or a share)

projects
 + succeeds_project_id UUID, nullable     -- the land-share project this one grew out of
```

`tower_id` stays **required**. A land-share project gets one implicit container
row that the UI never shows, because making it nullable would mean auditing
every `where('tower_id')` in four modules for a null case that only one project
type can produce. The cost of the implicit row is one hidden record; the cost of
the nullable column is a class of bug in Module 5 and 6.

Nothing here is indexed except `succeeds_project_id`, so v26 is one `.stores()`
block for `projects` plus a no-op upgrade — existing flats keep their `floor`
and `size_sqft` and gain nulls elsewhere.

---

## 4. The three phases

### Phase 1 — The project knows what it is *(this pass)*

Make the shape real, and make the project page correct for all five types.

- `projectShape` in `src/lib/domain/project.ts`, with the labels, the applicable
  fields, and the price/size basis.
- Dexie **v26**: the unit columns above, `projects.succeeds_project_id`, `floor`
  and `size_sqft` nullable.
- Project form: the type drives what is asked. A plot project asks for blocks,
  not towers; a land-share project asks how many shares and at what price, and
  never mentions a container.
- `TowersUnitsPanel` / `UnitMatrix` / `UnitEditModal` / `TowerFormModal` read the
  shape for every label and every field's visibility.
- Bulk generation per shape: floors × units for a tower, a plot list for a
  block, N shares for a share register.
- Unit code patterns per shape: `A-501`, `C-14`, `SHARE-07`.
- Project readiness and the status pipeline stop demanding towers from a project
  that has none, and stop demanding construction progress from one that is never
  built.
- Demo data: one `plot_development` project and one `land_share` project, seeded
  through the same generators the UI uses.

**Done when** a plot project and a share project can be created, have their
inventory generated, and read correctly end to end on the project page — with
no floor, no bedroom and no sqft anywhere they do not belong.

### Phase 2 — Selling what is not a flat

Carry the shape into Module 4, which currently prices and words everything as a
flat.

- Pricing by basis: rate × sqft, rate × katha, flat per share. The booking's
  price breakdown follows.
- Plot premiums: road width and corner, replacing floor and facing on a plot
  project's booking.
- Long instalment plans — a plot's 48-month schedule against a flat's 24.
- Booking form, money receipt and booking form wording per shape ("Plot C-14,
  5 katha" and "Share 07 of 20" instead of "Flat A-501, 1,250 sqft").
- The unit picker and availability list read the shape.
- Public portal: filter by type, and show plots and shares correctly.

**Done when** a plot and a share can be booked, paid against and receipted, with
every printed document naming the right thing.

### Phase 3 — Delivery, and what happens next

The two flows that have no equivalent today.

- **Plot delivery**: development milestones → possession → registration →
  mutation, replacing the keys-and-deed handover. Reads the Land module's
  development activities rather than tower work items.
- **Share delivery**: the deed, and the share certificate before it.
- **Succession**: the land-share → construction project. Create the successor
  project on the same land, carrying the shareholders across as known customers
  (`succeeds_project_id`), so the developer does not re-enter twenty buyers by
  hand. Also covers partition, where a share project becomes a plot project.
- Project status pipeline per shape — a land-share project has no `design`,
  `approval` or `under_construction` stage worth walking through.

**Done when** a land-share project can be completed and its buyers carried into
the construction project they commission.

---

## 5. Decisions taken, and why

- **`towers`/`units` are reused, not replaced.** A separate `plots` table would
  be a cleaner model and would require a second path through bookings, payment
  schedules, refunds, allocation and the public portal, kept in sync forever.
- **`tower_id` stays required.** See §3.
- **The shape is derived, never stored.** A `project_type` of `plot_development`
  *is* the statement that this sells plots; storing a second "sells plots" flag
  is a second answer to give when the two disagree — the same reason
  `joint_venture` was kept out of `project_type`.
- **Land-share succession is a new project, not a stage.** Different buyers'
  money, different contract, different inventory. Modelling it as a stage would
  mean one project whose units change meaning halfway through.
- **Plot development progress reads the Land module.** The filling and roads on
  a plot project are the same records the land already keeps (BRD DEV-001…004).
  A second progress system would be two answers to "is the land ready".
