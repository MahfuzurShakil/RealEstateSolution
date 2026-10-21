# Popup system

_Decided 2026-10-21, after the client's review: "every popup looks different — a
narrow, tall registration popup, an over-wide success message, header colours
that change from page to page."_

References: the **Atlassian Design System** modal (fixed width scale; intent
shown by the icon and the primary button, not by painting the dialog) and the
**GitHub Primer** dialog (sizes chosen by content; one-button result
dialogs kept small).

## The rules

### 1. One frame
Every popup goes through `src/components/ui/Modal.tsx` (or one of the two
components built on it). The frame never changes:

- **Header:** white. An icon chip, a dark title, a grey subtitle, and a close (×).
- **Body:** the light page-canvas tint, padded 24px. White inputs and white section cards stand out against it. (A white body was tried first; the client found the fields blended into it.)
- **Footer:** white bar. Actions sit on the right, the main action last.
- **Inputs:** a slate-300 border, not the card hairline, so a field always reads as a box you can type in.

No page builds its own overlay. The only `fixed inset-0` outside `Modal.tsx` is
the mobile sidebar.

### 2. Four types, and the colour is fixed by the type

| Type      | Use for                                                     | Icon chip | Main button   |
|-----------|-------------------------------------------------------------|-----------|---------------|
| `default` | forms, ordinary confirmations, information                  | teal      | teal          |
| `success` | a **result** only ("24 units created")                      | green     | teal (Done)   |
| `warning` | recoverable but consequential (hold, retire, correct status), and "this cannot be done" notices | amber | amber |
| `danger`  | destructive (delete, reject, undo a payment)                 | red       | red           |

A confirmation is never `success`, even when the action is a happy one
(approve, accept, register). `ConfirmDialog` treats `success` as `default`.

### 3. Four widths, chosen by what is inside

| Size | Width  | For                                                                 |
|------|--------|---------------------------------------------------------------------|
| `sm` | 440px  | a confirmation question, a notice, a result, or a 1–2 field quick form |
| `md` | 640px  | an ordinary form (**default**)                                      |
| `lg` | 860px  | a form with 3- or 4-column rows, or a table inside                  |
| `xl` | 1120px | viewers only: a document, a map, a photo gallery                    |

`ConfirmDialog` sizes itself. A plain question gets `sm`. One that carries
fields (`children`) gets `md`.

### 4. Which component

- **`Modal`**: any form.
- **`ConfirmDialog`**: "are you sure?". Cancel plus one action; fields allowed.
  The tone defaults to `danger`. Anything that isn't destructive must pass
  `tone="default"` or `"warning"`.
- **`ResultDialog`**: an outcome or a notice. Always `sm`, centred, with a large
  icon and **one** button. Never show a result inside the form that produced
  it, because it inherits the form's width.

## Done (2026-10-21)

- **The shared components**
  - `Modal` rebuilt on the white frame.
  - `DialogFrame` shared by all three components.
  - `ResultDialog` added.
  - `ConfirmDialog` sizes itself by content, has solid tone buttons, and maps `success` to `default`.
  - These changes alone bring all ~100 popups onto one header style and the new width scale.
- **Land screens**
  - The registration and JV signing popups (`LandEventDialog`) are now `md`, because they carry fields.
  - "Mark as acquired" and "JV signed" use `default`, not `success`.
  - Feasibility study: `xl` → `lg`.
  - Site visit: `xl` → `lg`.
  - Negotiation round: `xl` → `lg`.
  - Accept round: `success` → `default`.
  - Development activity: `xl` → `lg`.
  - Land Cost "Budget & deal": `xl` → `md`.
  - Land Cost "Record payment": `lg` → `md`.
  - Landowners "cannot delete" is now a `ResultDialog` (warning).
- **Projects:** the unit generation result is now a `ResultDialog`, no longer shown inside the `xl` generator.
- **Leads:** the bulk "Assign" confirm now passes `tone="default"`. It was red only because of the default.

## Done — the other pages (2026-10-22)

- **"Cannot be deleted" notices are now one-button `ResultDialog`s (warning).**
  - Purchase order detail, supplier detail, supplier list, users.
  - Customer detail: a refused delete closes the question and opens its own notice, instead of the confirm turning amber.
- **Results moved out of the generators:** plot and share generation now report through a `ResultDialog`, the same way unit generation does.
- **Sizes fixed:**
  - `UnitBulkGenerateModal` and `PlotShareGenerateModal`: `xl` → `lg`.
  - `WorkItemBudgetModal`: `xl` → `lg`.
  - `AddWorkItemModal`: `lg` on both steps, so it no longer jumps between them.
  - `UnitBulkAllocateModal`: `sm` → `md`.
  - `MaterialRequestStatusCard` and `ProjectStatusCard`: no longer force `sm` on confirmations that carry fields. They size themselves (`md`), and keep `lg` for approval and stage forms.
  - `ExpenseFormModal` and the cash account form: checked. Both have one- or two-column rows, so they stay `md`.
- **Status-card tones:** every `tone: 'success'` in a confirmation config is now `default`. `success` is also removed from those config types, so a confirmation can't be green again. Reject and cancel moves are `danger`; back-moves and holds are `warning`.

**When adding a popup:** use `Modal`, `ConfirmDialog` or `ResultDialog`. Pass a
`tone` only when it isn't `default`, and a `size` only when the content needs
`lg` or `xl`.
