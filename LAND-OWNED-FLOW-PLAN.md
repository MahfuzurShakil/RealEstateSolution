# Land flows by type — plan (2026-10-17)

Projects already have one flow per type (apartment, land share, plot…). Land
needs the same: a plot the company is **buying** and a plot it **already owns**
are different jobs, so they get different screens.

## How it works in real life (Bangladesh)

| | To acquire (pipeline) | Already owned |
|---|---|---|
| Typical case | Broker (dalal) brings a plot; owner approached for sale or JV | Bought years ago · inherited / family land · JV already signed |
| Work to do | Site visit → feasibility → legal due diligence (khatian, porcha, namjari, khajna, encumbrance search) → negotiation rounds → bayna / agreement → owner payments → registration (dolil) → namjari → development | Nothing to buy. Prove the title, record what it cost, prepare the ground |
| What matters | Every step, who did it, what it costs, can we walk away | **Papers in order** (deed, khatian, namjari, khajna; warishan certificate for inherited; JV deed + power of attorney for JV) · **historic cost** · development readiness |
| Exits | Hold, reject, dispose | Dispose (sell / transfer). Hold and reject do not apply |

### Already owned — three kinds

1. **Bought earlier** — deed (dolil) no., owned since, price + registration + any other cost paid. Previous sellers are history; owners list optional.
2. **Inherited / family** — no price; owners are the **heirs (warish)** with their shares. Key risk is a missing warishan certificate or namjari not done in the heirs' names.
3. **JV already signed** — landowners and the split are required (already enforced on Add Land); agreement date, signing money, power of attorney.

## What changes

### 1. Quick add (project form → New owned land)
- Layout fixed: two money fields side by side, no empty cell.
- **+ Add other cost**: each row = *What was it for* (free text, suggestions: stamp duty, mutation, legal fees, broker, survey, holding cost…) + *Amount*. A known name goes to its cost-sheet head; anything else goes to **Other**, with the descriptions kept in the remarks.
- Nothing is written until **Confirm this land**. The confirm step has **Back to edit**, which reopens the form with everything filled in. (This also removes the orphan land from E2E #24.)
- Confirm step hides Mouza / Dag / Khatian when none is recorded.

### 2. Add Land (full form), owned mode
- Same *other costs* rows instead of the fixed list of heads.
- Hides the pipeline-only fields: Source (broker / walk-in…) and "Assigned to — the land officer chasing this plot".

### 3. Land detail page, owned land
- Header: no Put on hold / Reject; Dispose stays.
- Tabs: Overview · Owners (named **Heirs** for inherited) · **Papers** · Documents · Timeline. The Timeline keeps only **Land Development** (site visit / DD / negotiation do not apply).
- **Papers** tab: a checklist built from the land's documents — Deed, Khatian, Namjari, Khajna receipt, plus Warishan certificate (inherited) or JV agreement + Power of attorney (JV). Each shows *On file* or *Missing* with an upload button that files the document under that type.
- Overview: Land information (pipeline fields like Source/Assigned to hidden), **Owned since / How / Deed ref**, and the Land Cost Sheet (historic costs) always shown.
- Sidebar: an **Owned land** card (owned since, papers x of y on file, development, project) instead of the 7-step acquisition progress.

Pipeline lands keep today's screens unchanged.
