# Project status flow (2026-10-17, revised after client review)

## Rule

- A status is the **phase the project is in**. A new project starts in its
  first phase (Planning / Register Open).
- The button under the status **completes the current phase**: "Mark Planning
  Complete". The pop-up asks only what that phase produced — date, facts,
  papers, remarks. The project then moves into the next phase.
- Nothing is asked about the next phase; it has not happened yet.
- A step back is a correction with a reason, and is refused where the records
  rule it out.

## Phases and buttons

| Type | Phases (status) | Buttons |
|---|---|---|
| Apartment / Commercial / Mixed | Planning → Design → Approval → Under Construction → Finishing → Handover → Closed | Mark Planning / Design / Approval / Construction / Finishing Complete → Close Project |
| Plot Development | Planning → Layout Design → Subdivision Approval → Under Development → Possession → Closed | Mark Planning / Layout Design / Subdivision Approval / Development Complete → Close Project. Development Complete also records the plot demarcation; "Not needed" covers land that needed no work |
| Land Share | Register Open → Sold Out → Deeds Registered → Closed | Mark Sold Out → Mark Deeds Registered → Close Project |

While deeds are being registered a land share stays **Sold Out**.

## Gates

- Land share: Sold Out needs every share sold; Deeds Registered and Closed need
  every share deed registered. A deed is registered only when the buyer has
  paid in full — the balance is collected on deed day.
- Built: Under Construction needs land secured and a tower.
- Every type: Closed needs every unit / plot / share handed over and nothing
  owed by buyers.
- Actual start is the first site reading (or set on Edit), not the approval date. Approval complete lifts the "plan not approved" sales warning.
- Sales: no Open sales before inventory exists or when nothing is unsold.

## Steps back refused

- From Closed (any type).
- Land share back to Register Open when every share is sold (cancel a booking
  first).
- Land share back from Deeds Registered when every deed is registered.
