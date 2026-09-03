# Prompt for the next session — Tier 2

Copy everything between the lines into a fresh session in this project folder.

---

তুমি এই project-এ Tier 2-র কাজ করবে — `REMEDIATION-PLAN.md`-এ যেগুলো
**Minor আর Cosmetic** হিসেবে চিহ্নিত। কোড লিখবে, browser-এ যাচাই করবে।

## আগে এগুলো পড়ে নাও

- `REMEDIATION-PLAN.md` — তিন Tier-এর পরিকল্পনা ও blast-radius analysis
- `ANALYSIS-REPORT_2026-09-02.md` — প্রতিটা defect-এর বিস্তারিত (L-1, P-3, C-3…
  এই কোডগুলো ওখান থেকে আসে)
- `OPEN-ITEMS.md` — **Section 0** পড়ো, Tier 1-এ ঠিক কী কী বদলেছে সেটা ওখানে
- `Real-Estate-Developer-Platform_Scope-Document_v3.md` — Section 9.6 permission
  matrix, Section 11 Decision Log
- `AGENTS.md` — architecture rules (UI কখনো Dexie ছোঁয় না, Dexie version block
  কখনো edit হয় না)

## অবস্থা

আটটা admin module built। **Tier 1 (batch 1A–1E) শেষ ও browser-verified** —
টাকার রাউন্ডিং, site-progress-এর variance, booking-এর ভুয়া বকেয়া, supplier
payable, shell-এর মরা control, role persistence, role-aware dashboard। তার
পরে material request flow-এর তিনটা জিনিসও ঠিক হয়েছে (approve/reject role
gating, §7.8a-র central-stock route, Procurement-এর nav placement)।

**প্রথমেই `git log --oneline -5` আর `git status` চালাও** — Tier 1 commit হয়েছে
কিনা দেখে নাও। যদি working tree নোংরা থাকে, ওটা Tier 1-এর কাজ; মুছে ফেলো না,
আগে user-কে জিজ্ঞেস করো commit করবে কিনা।

## চালানোর নিয়ম

- dev server: `.claude/launch.json`-এর `dev` config, **port 3001**। Next 16
  একই folder-এ দ্বিতীয় dev server চালাতে দেয় না — শুরুর আগে port 3001 check
  করো, চললে সেটাই ব্যবহার করো।
- **`next build` চালাবে না যতক্ষণ dev server চলছে** — একই `.next` folder, dev
  server-এর Turbopack cache নষ্ট হয়।
- Demo data reload-এ **৪০–৬০ সেকেন্ড** লাগে, আর **মাঝপথে page ছাড়লে seed মরে
  যায়** (তখন Purchase Orders খালি দেখায় — bug না)। Reload দিয়ে dashboard-এই
  বসে থাকো যতক্ষণ না tiles দেখায় Leads 12 · Bookings 9 · Site Updates 25 ·
  Material Requests 6।
- Topbar-এর role switcher এখন `localStorage`-এ থাকে, reload-এ টেকে। Browser-এ
  test করার সময় role বদলে বদলে দেখো।
- যাচাই শেষে viewport `desktop`-এ ফিরিয়ে দিও।

## Tier 2 — যা করতে হবে

`REMEDIATION-PLAN.md`-এর §3-এর তালিকা। এগুলোর কোনোটাই domain বা repository
layer-এর হিসাব বদলায় না — প্রায় সবই display।

| # | কাজ |
|---|---|
| L-2, F-5 | Default page size ঠিক করো — worklist-এ (collections, expenses, vouchers) 25, card list-এ 12। এখন সব জায়গায় 5/6, ফলে 102 instalment-এর queue 21 পাতা |
| L-3 | Detail header-এ `Delete`-কে `Edit`-এর সমান ওজন দিও না |
| P-3 | Bulk generation ফাঁক রেখে গেলে tower card-এ লিখুক "18 of 22 generated" |
| P-4 | Project list card-এ sold % আর booked value |
| P-5 | 7-tab strip ~1280px-এর নিচে scroll affordance পাক (এখন নিঃশব্দে কেটে যায়) |
| P-1 | Seed-এ pre-sold unit-গুলোর বিপরীতে booking তৈরি হোক, **আর** unit form থেকে সেই status-গুলো বাদ যাক যেগুলো শুধু booking লিখতে পারে (`booked`/`reserved`) |
| C-3 | Lead card-এ last-activity date |
| C-4 | Lead-এ bulk assignment |
| B-3 | Refunds page-এ "Record refund" action (এখন list আছে, তৈরির রাস্তা নেই আর কোথাও লেখাও নেই যে booking থেকে করতে হয়) |
| B-4 | Payment dialog-এ negative amount-এর message — "Enter the amount received" না, "Amount must be greater than zero" |
| B-5 | Rejected discount-এ "Resubmit for approval" action (এখন শুধু Edit form) |
| S-3 | Plan date নেই এমন work item সেটা বলুক, আর বলুক যে সে schedule-এর হিসাবের বাইরে |
| PR-5 | PO card-এ "goods outstanding" আর "money due" আলাদা করে বোঝাও |
| PR-6 | Draft order-এ "Created", "Ordered" না |
| F-6 | Collections-এর row থেকে সরাসরি "Record payment" (এখন booking → Payments tab → dialog, চার ধাপ) |
| F-7 | Expenses-এ sort control, আর category chart clickable filter |
| F-8 | "Showing 1–1 of 1 refund" |
| U-6 | Sidebar group একাধিক খোলা থাকতে পারুক, আর কোনটা খোলা ছিল মনে রাখুক |
| U-7 | Seed-এ `users.created_at` অন্য সব demo record-এর মতো offset হোক (এখন সব "আজ") |
| Mobile | collections, expenses, vouchers, users — `md`-এর নিচে card হয়ে যাক, list page-গুলোর মতো। এখন desktop table scroll box-এ (collections: 299px-এ 889px চওড়া table, outstanding দেখতে তিনবার swipe) |

### দুটোর আগে সিদ্ধান্ত লাগবে — user-কে জিজ্ঞেস করো

- **L-1** (land page-এ agreed / paid / balance): পুরোটা Tier 3.4-এর land
  payment schedule-এর উপর নির্ভর করে। এখন শুধু filtered expense list-এর link
  দেবে, নাকি Tier 3.4 পর্যন্ত অপেক্ষা?
- **U-8**: Company Settings এখনো দাবি করে "printed documents — booking form,
  money receipt and supplier voucher"। সেগুলো নেই। এখন copy বদলে দেবে, নাকি
  Tier 3.6-এ সত্যি বানানোর অপেক্ষায় রাখবে?

## যেভাবে কাজ করবে

- **কাজ শুরুর আগে blast radius দেখো** — Tier 1-এ এই অভ্যাসটা দুইবার ভুল fix
  ঠেকিয়েছে। কোন file, কোন consumer, কী ভাঙতে পারে।
- **তিন-চারটা করে batch-এ ভাগ করো**, প্রতি batch-এর পরে browser-এ যাচাই, তারপর
  commit। এক batch পিছিয়ে নিলে যেন বাকিটা খুলতে না হয়।
- UI কখনো Dexie ছোঁয় না — নতুন read/write `lib/repositories/*` দিয়ে, হিসাব
  `lib/domain/*`-এ।
- Schema বদলালে **নতুন** Dexie `version(n).stores({...})` block; পুরনো block
  কখনো edit না। Index না লাগলে column-এর জন্য version bump লাগে না
  (`towers.current_progress_pct`, `stock_transfers.request_id` নজির)।
- প্রতিটা batch-এর পরে `npx tsc --noEmit` আর `npx eslint src` — দুটোই এখন
  clean, clean-ই রাখো।
- **375px-এ overflow মেপো** প্রতিটা batch-এর পরে। Tier 1-এর আগে কোথাও overflow
  ছিল না, এখনো নেই — এটা হারানো সহজ।
- যা বদলালে সেটা `OPEN-ITEMS.md`-এ, আর schema/behaviour সিদ্ধান্ত হলে scope
  document-এর Section 11 Decision Log-এ লিখে রাখো — গত আটটা module যে ধারা
  মেনেছে।
- Commit করবে, **push করবে না** — user বললে তখন।

## যা করবে না

- **Tier 3-এর কোনো feature না** (material item catalogue, project budget/BOQ,
  cost category → lookup_values, land payment schedule, bank accounts, printed
  documents)। ওগুলো আলাদা session, আলাদা সিদ্ধান্ত।
- `formatBdt`-এ compact/abbreviated money ফিরিয়ে আনবে না — Tier 1-এ ওটা
  ইচ্ছাকৃতভাবে তোলা হয়েছে, কারণ সংখ্যা মেলানো যেত না।
- Supplier payable-কে received-value ভিত্তিক করবে না — সেটা client-এর
  সিদ্ধান্ত, bug না (`supplierBalance`-এর comment দেখো)।

শুরুতে তালিকাটা দেখে বলো কোনগুলো কোন batch-এ ফেলছ, আর উপরের দুটো প্রশ্নের
উত্তর নাও। তারপর কাজ শুরু করো।
