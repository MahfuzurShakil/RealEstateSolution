# Land module — UX review after L1–L6

Client feedback, 2026-09-14, after the six land batches shipped
(`7984371` → `6e9a46b`). This is a design review, not a defect list: the data
being captured is right, and none of it is being thrown away. What is wrong is
*where* a user goes to enter it and *how* the same event gets recorded twice.

---

## 1. The feedback, as given

> Site Visit, Feasibility, Negotiation, Acquisition Cost — these are all
> timeline-like, and some of them can happen more than once. Could they not have
> been brought into the Pipeline, with each step as a status?
>
> The inputs have got a bit strange — sometimes you enter from the pipeline,
> sometimes from a tab. A user will get confused.
>
> The information being captured is right. Think about a better and easier way
> to capture and show it, and suggest a professional approach.

---

## 2. What I actually built, and the seam it left

Each batch added a **tab** that records its work properly, and left the **old
pipeline dialog** in place recording a thin summary of the same event. So four
of the nine status steps now ask for something a tab already holds:

| Pipeline step asks for | The tab that already holds it, properly |
|---|---|
| "Visited on", "Visited by", remarks | **Site Visits** — many visits, road width, soil, utilities, lowland, photos |
| "Verified on", "Verified by", case reference | **Due Diligence** — 17 checks, findings, evidence, waivers |
| "Negotiation started on", "Offered amount" | **Negotiation** — every round, terms, conditions, broker |
| "Decision meeting on", "Amount on the table" | **Negotiation** — accepting a round *is* the decision |

That is the same "two answers to one question" problem this project has been
removing everywhere else — and I introduced it. A site visit recorded in the
dialog and a site visit recorded in the tab are two different records of one
afternoon, and nothing reconciles them.

**Five steps do not have this problem**, because they record a real-world legal
event rather than a summary of work: Acquired (registration date, deed number),
JV Signed (agreement date, reference), Rejected, Disposed, Reopened.

The second symptom is volume: the land detail page now carries **11 tabs** (12
on a joint venture). Overview, Owners, Site Visits, Feasibility, Due Diligence,
Negotiation, Acquisition Cost, Joint Venture, Payment plan, Documents, Timeline.
Each one is justified on its own; together they are a filing cabinet, not a
screen.

---

## 3. Answering the question directly

**"Should each step be a status?"** — No, and the reason is worth stating,
because it also points at the right answer.

A status is *one value that moves forward*. A site visit is *a thing that
happens, repeatedly*. A plot worth buying is visited three times — the first
look, the one with the engineer, the one after the rains — and "site visit done"
three times is not a status, it is three records. The same is true of
feasibility versions and negotiation rounds. Turning them into statuses would
force the system to forget everything except the last one, which is exactly what
L2 and L4 were built to stop.

**But the instinct behind the question is right**, and it is the fix:

> The pipeline should be **driven by** the work, not typed in **alongside** it.

---

## 4. Recommendation — the work moves the pipeline

Invert the relationship. Today a user changes the status and is then asked to
summarise why. Instead, let them do the work, and let the status follow.

| Transition | Today | Proposed |
|---|---|---|
| Sourced → Under Review | manual + dialog | **automatic** when the first site visit is saved |
| Under Review → Due Diligence | manual + dialog | **automatic** when a feasibility study is approved with "Proceed" |
| Due Diligence → Negotiation | manual + dialog | **automatic** when the first negotiation round is recorded |
| Negotiation → Agreed | manual + dialog | **automatic** when a round is accepted (it already writes the agreed amount) |
| Agreed → Acquired / JV Signed | manual + dialog | **stays manual** — registration is a real event with a deed number |
| → Rejected / Disposed / Reopened | manual + dialog | **stays manual** — these are decisions, not work |

**There is precedent for this in this codebase.** Module 6 already works this
way: raising a Purchase Order writes the material request to `ordered`, a Goods
Receipt that completes the order writes `fulfilled`, and the manual status
buttons were deleted. Nobody has missed them. The land pipeline is the last
place still asking a user to tell the system something the system can see.

**The Pipeline card stops being a set of buttons and becomes a status read-out**
that answers one question — *why is this land here, and what unblocks it?*

```
  Under Review
  ─────────────────────────────────────────────
  Waiting on:  feasibility study v2 is submitted
               and not yet approved
               → Open Feasibility
```

The three gates already compute exactly this sentence. Today they only show it
when a button is disabled; it should be the card's normal content.

---

## 5. Recommendation — six tabs instead of eleven

Group by what a person is doing, not by which batch built it.

| Tab | Holds |
|---|---|
| **Overview** | the land record, the owners, the map |
| **Lifecycle** | one merged timeline — site visits, feasibility versions, status changes, offers, DD milestones, development reports, payments — in date order, each expandable. *Record a visit* and *Add a study* sit here as actions on the timeline |
| **Legal** | the due-diligence checklist and its evidence |
| **Commercials** | negotiation ladder, acquisition cost sheet, payment plan, owner settlements, JV terms |
| **Development** | development activities and progress |
| **Documents** | the vault |

**Lifecycle is the tab this feedback is really asking for.** Today "what has
happened to this land" is spread across the Timeline tab (status changes only),
the Site Visits tab, the Feasibility tab and the Negotiation tab — four places
telling one story in four fragments. Merged and sorted by date, it *is* the
pipeline the feedback describes: a timeline where some steps repeat.

The existing Timeline tab becomes that view, extended to read every record type
rather than only `land_status_history`.

---

## 6. What this costs, and what it does not break

**No data model changes.** Every table stays. The site visit, the feasibility
version, the negotiation round are all already the right shape — this is about
where the user meets them.

**Four status dialogs are deleted**, not rewritten. Their fields already exist
on the tab records.

**One migration question:** demo and live data has status events created by
those dialogs, carrying `performed_by` and `remarks` that no tab record holds.
Those rows stay and still render on the Lifecycle timeline — they are history,
and history does not need to be re-derivable. New events simply come from a
different place.

**Risk:** automatic transitions can surprise. Mitigated the way Module 6 does —
the Lifecycle entry says what moved the land and what caused it ("Under Review —
site visit recorded 26 May"), so it is never a silent change.

**Estimate:** one batch, comparable to L3. Call it **L7 — one way in**.

---

## 7. Open questions for the client

1. **Should Due Diligence → Negotiation really be automatic?** In practice the
   two overlap — a land team often opens negotiation while the lawyer is still
   searching. Proposed: yes, automatic on the first round, because a land being
   negotiated *is* in negotiation whatever the lawyer is doing. Gate G2 still
   stops the purchase completing.
2. **Should the Pipeline card keep a manual override?** Proposed: yes, hidden
   behind "Correct this status" with a required reason, for the land bought in
   2019 that is being entered today.
3. **Six tabs or a sidebar?** At six, tabs still work. If Investor and Contractor
   work later adds more to a land, a left rail inside the page reads better than
   a wrapping tab row.

---

## Next session — starting prompt

> Read `LAND-UX-REVIEW.md`. Implement **L7 — one way in**, the proposal in
> sections 4 and 5:
>
> 1. Make the four work-driven pipeline transitions automatic
>    (`sourced→under_review` on the first site visit, `under_review→dd_in_progress`
>    on feasibility approval, `dd_in_progress→negotiation` on the first round,
>    `negotiation→agreed` on accepting a round), and delete those four status
>    dialogs. Keep Acquired, JV Signed, Rejected, Disposed and Reopen manual, and
>    add the "Correct this status" override with a required reason.
> 2. Turn the Pipeline card into a status read-out that always shows what the
>    land is waiting on and links to the tab that unblocks it — the gates already
>    compute that sentence.
> 3. Regroup the land detail page from 11 tabs to six: Overview, Lifecycle,
>    Legal, Commercials, Development, Documents.
> 4. Rebuild the Timeline tab as **Lifecycle** — one merged, date-ordered feed of
>    status changes, site visits, feasibility versions, negotiation rounds, DD
>    milestones, development reports and land payments, with the "record"
>    actions inline.
>
> Answer section 7's three open questions with me before starting part 3.
> Browser-verify each part, seed the BD demo data so every feed entry type is
> represented, and commit per part.
