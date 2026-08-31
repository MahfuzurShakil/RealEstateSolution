# Real Estate Developer Management Platform — Design Reference
## v2.0 — Visual/Component Language (companion to Admin Scope v3.md ও Public Portal v1.md)

> **এই ডকুমেন্টের scope:** শুধু **visual design ও component pattern** — colors, layout, card style, form pattern, icon system। কোনো business logic, data model, বা workflow এখানে নাই — সেসব `Real-Estate-Developer-Platform_Scope-Document_v3.md` (Admin) ও `Real-Estate-Developer-Platform_Public-Portal_v1.md` (Public)-এই থাকবে, এই doc শুধু ওগুলো **কেমন দেখাবে** সেটা বলে।
>
> **Admin Portal design পুরোপুরি UrbanHub-ভিত্তিক** — client নিজে confirm করেছেন এটাই ভিত্তি হবে, পুরো site Chrome দিয়ে page-by-page ঘুরে verify করা হয়েছে (screenshot সহ)। **Public Portal**-এর জন্য dpremiumhomes.com থেকে শুধু **idea/component-pattern** নেওয়া হচ্ছে — রঙ/theme হুবহু কপি করা client-এর নির্দেশ না, Public Portal-এর নিজস্ব visual identity frontend-design skill দিয়ে বানানো হবে। Public Portal-এ **real project photo ব্যবহার হবে না — free stock image site থেকে ছবি নেওয়া হবে** (demo/prototype purpose)।

---

## PART A: ADMIN PORTAL — UrbanHub-ভিত্তিক (verified, Chrome দিয়ে সরাসরি দেখা)

### A.0 Reviewed Pages
Dashboard (index), Analytics Dashboard (index-3), Property List, Property Grid, Property Details, Add Property (form), All Agents, Agent Profile, Login। প্রতিটা page screenshot নিয়ে verify করা হয়েছে — নিচের সব detail সরাসরি দেখা থেকে।

### A.1 Color Palette (verified)
- **Primary/accent:** Teal (`#0D919C`-এর কাছাকাছি) — active nav item bg, primary button, chart line, icon bg
- **Secondary accent (data/status differentiation):** Coral/Orange — secondary KPI icon bg, "For Sale" badge, negative %-change indicator ব্যবহার করা হয় কখনো (তবে red-ও ব্যবহার হয় negative-এর জন্য)
- **Additional accent colors (KPI icon variety):** Green, Blue — বিভিন্ন KPI card-এর icon background আলাদা করতে (একঘেয়ে না লাগার জন্য প্রতিটা card আলাদা রঙ)
- **Background:** হালকা mint/pastel-green page background (সাদা না, একটা হালকা tint) — card-গুলো pure white, তাই subtle contrast তৈরি হয়
- **Text:** গাঢ় নেভি/চারকোল (pure black না) headline-এর জন্য, মাঝারি gray body text-এর জন্য
- **Semantic:** সবুজ = positive %change/available, লাল = negative %change/sold-out, hairline gray border card-এর চারপাশে (shadow-heavy না, flat কিন্তু subtle elevation)

### A.2 Top Bar (সব page-এ consistent)
```
[Logo] [Sidebar collapse toggle]   [Search bar — pill shape, icon right]   [🔔][💬][📅][🌙 dark-mode toggle]   [User name + role ▾][avatar with online-dot]
```
- Search bar হালকা gray fill, rounded-full, ভিতরে placeholder "Search anything"
- User avatar-এর কোণায় ছোট সবুজ online-status dot

### A.3 Sidebar
- সাদা background, item hover/active-এ হালকা teal tint bg + teal text
- Grouped/collapsible menu (Dashboard group-এর ভিতরে Dashboard/Agent Dashboard/Analytics Dashboard/Add Agents/All Agents/Agent Profile/Add Property/Property List/Property Grid/Property Details — sub-items)
- নিচে collapse arrow (>) প্রতিটা group-এর পাশে
- সবার নিচে "Help and Support" pinned item

### A.4 Dashboard KPI Cards — দুই ধরনের প্যাটার্ন verified

**Pattern 1 (index.html, simple):**
```
[icon in colored rounded-square]  Title
                                   Big Number   [%change pill badge]
                                   [tiny sparkline chart, right-aligned]
[See Details] button (outline, top-right of card)
```

**Pattern 2 (index-3.html analytics, ring-progress):**
```
[colored circular icon] Title
Target/subtitle text
Big Number                    [circular ring % progress, right side]
```

> **আমাদের Owner Dashboard (v3.md Module 8)-এর জন্য Pattern 2 বেশি উপযুক্ত** — Total Sales/Collection/Cost-এর পাশে target-vs-actual ring দেখানো যাবে সরাসরি।

### A.5 Welcome/Hero Card (Dashboard top)
Diagonal split card — বামে teal solid bg-তে greeting text + ২টা mini-stat (Total Properties, Sold Properties), ডানে coral/orange gradient circle-এর উপর property image bleed করে বের হয়ে থাকে। এটা optional decorative element — আমাদের dashboard-এ "Hello, [User Name]" + quick stats হিসেবে adapt করা যায়, কিন্তু image bleed effect স্কিপ করা যায় simplicity-র জন্য।

### A.6 Charts
- **Grouped/stacked bar chart** (Property Revenue: Income/Expenses/Profit) — মাসভিত্তিক, প্রতিটা metric আলাদা রঙ (teal/coral/navy)
- **Area/line chart** (Sales Statistic, Revenue Overview) — smooth curve, হালকা fill-gradient নিচে, উপরে বড় সংখ্যা + %change badge, "Last Month ▾" filter dropdown ডানে
- **World map with animated dashed connector lines** (Most Sales Location) — location dot + country-wise card list পাশে, প্রতিটাতে ছোট circular % ring

### A.7 List/Table Page (Property List) — আমাদের সব list module-এর ভিত্তি
```
[Page title]                                          [+ Add button]
[Filters sidebar]  |  Showing N results        [grid/list toggle] [Sort ▾]
                    |  [Card 1] [Card 2]
                    |  [Card 3] [Card 4]
```
- **Filters sidebar:** keyword search input, location search, dropdown (Type/Status), checkbox group (Features) — ২-column checkbox layout
- **List-view card:** image thumbnail বামে, ডানে title + status-text (green "For Sale"/blue "For Rent") + pill-badge row (location, price, size, bed/bath — প্রতিটা icon+text, হালকা gray bg rounded-pill) + bottom row: agent avatar+name বামে, heart/share/compare icon বাটন ডানে
- **Grid-view card:** image top (rounded), নিচে একই info vertically stacked

### A.8 Detail Page (Property Details) — আমাদের Project/Booking Detail-এর ভিত্তি
```
[Sidebar: Agent card (avatar, name, phone, message, social icons) + Customer Review card + mini-map card]
[Main: Hero image (status badge কোণায়) → Title + price + action icons → pill-badge specs row → Description → Nearby Locations (bullet list) → Lifestyle Features (checkmark pill-tags, wrap layout) → embedded Leaflet map]
```

### A.9 Form Page (Add Property) — আমাদের সব Add/Edit form-এর ভিত্তি
```
[Left card: Image dropzone — icon + dimension-hint text + "Upload Image" button]
[Right card: "Add Property" — 3-column responsive grid of labeled inputs, label উপরে/input নিচে, dropdown+text mix, description textarea full-width নিচে, তারপর Cancel/Save button footer]
```

### A.10 Grid Profile Card (All Agents) — আমাদের User/Sales-Executive list-এর ভিত্তি
Full-width portrait image top (rounded corners), নিচে name + role, stats row (Properties: X · Sold: Y), Rating, দুইটা outline button (View Profile / Message)

### A.11 Full Profile Page (Agent Profile) — আমাদের User Detail page-এর ভিত্তি
৩-column: বামে avatar+contact+social card, মাঝে mini-KPI row (Revenue/Agents/Bills, icon+number+%) + Description card (checkmark bullet icon) + Expertise bullet list, ডানে key-value "Agent Information" card + "Latest Listings" card

### A.12 Login/Auth
Centered white card, full-bleed abstract 3D-illustration background (decorative, brand-specific — আমাদের জন্য simpler solid/gradient bg দিয়ে adapt করা যায়), teal solid button, password show/hide icon toggle

### A.13 Icons
Lucide icon set (outline style) — search icon, bell, chat bubble, calendar, moon (dark-mode), heart, share, location pin, money-bag, bed, bath, ruler (sqft), star (rating)। আমাদের React stack-এ `lucide-react` ব্যবহার হবে।

---

## PART B: PUBLIC PORTAL — শুধু Idea/Component-pattern (রঙ কপি না)

> dpremiumhomes.com Chrome দিয়ে দেখা হয়েছিল শুধু **component-level idea নেওয়ার জন্য** (কোন ধরনের section থাকে, কী তথ্য দেখানো হয়) — client explicitly বলেছেন রঙ/theme হুবহু ওরকম হতে হবে এটা বলেননি। তাই Public Portal-এর নিজস্ব color palette ও visual identity frontend-design skill দিয়ে আলাদাভাবে বানানো হবে (Admin-এর teal থেকে আলাদা রাখা ভালো, যাতে দুইটা আলাদা "product" মনে হয়)।

### B.1 কী ধরনের Component/Section Idea নেওয়া হচ্ছে (dpremiumhomes.com থেকে দেখা pattern, না রঙ)
- Sticky "Interested in this property?" bar — scroll করলে top-এ আটকে থাকে, Save/Contact CTA
- "Available Units" card grid — Size/Bedrooms/Bathrooms/Balcony
- "Specification" label-value row list (Building Type, Unit Per Floor, Lift, Electricity Backup)
- "Nearby Landmarks" image+name card grid
- "Progress of Our Projects" — Virtual Tour / Progress / Map তিন-card row (আমাদের P3-এর ধারণা)
- Filter sidebar: Communities (checkbox), Price Range (checkbox bucket), status checkbox
- Floating action buttons (Notification/Email/Phone/WhatsApp) স্ক্রিনের পাশে persistent
- Inquiry form fields: Full Name, Phone, Email, Message

### B.2 Images
**Real project photo ব্যবহার হবে না** — Unsplash/Pexels-এর মতো free stock image site থেকে residential building/interior/lifestyle-থিমের ছবি নিয়ে placeholder হিসেবে ব্যবহার হবে prototype-এ। Claude Code implementation-এর সময় image URL এভাবেই বসবে (hotlink বা downloaded asset)।

### B.3 Visual Identity (নতুন, স্বাধীনভাবে বানাতে হবে)
- রঙ, typography, hero treatment — frontend-design skill দিয়ে fresh সিদ্ধান্ত, কোনো নির্দিষ্ট reference site copy না
- শুধু নিশ্চিত করতে হবে: premium/trustworthy tone (real estate buyer decision বড় financial commitment), mobile-friendly, Admin থেকে visually distinct

---

## Implementation Note (Claude Code-এর জন্য)
- Admin: Tailwind CSS, teal-based palette + KPI ring/sparkline pattern (Section A.4), `lucide-react`
- Public: Tailwind CSS, স্বাধীন palette (frontend-design skill অনুযায়ী নির্ধারিত হবে), stock images
- দুটো UI সম্পূর্ণ আলাদা visual system, একই backend/data (Section 0, admin ও public portal doc)
