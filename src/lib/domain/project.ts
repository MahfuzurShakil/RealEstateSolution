import type { BadgeTone } from '@/components/ui/Badge';
import {
  DEFAULT_INSTALLMENT_PLAN,
  PLOT_INSTALLMENT_PLAN,
  SHARE_INSTALLMENT_PLAN,
} from '@/lib/db/types';
import type {
  AllocationType,
  Booking,
  BookingStatus,
  DeliveryStep,
  ForSaleBy,
  JvShareBasis,
  ProjectStatus,
  ProjectType,
  TowerStatus,
  UnitStatus,
} from '@/lib/db/types';

/**
 * Module 2 status pipeline (Scope v3.md, Section 3.2):
 *
 *   planning → design → approval → under_construction
 *            → nearly_complete → handover_ongoing → closed
 *
 * Unlike Module 1 this is a straight line with no branch, so a project can
 * only move one step forward — or one step back, when a stage was marked too
 * early (a RAJUK resubmission drops `approval` back to `design`).
 */
export const PROJECT_STATUS_META: Record<ProjectStatus, { label: string; tone: BadgeTone }> = {
  planning: { label: 'Planning', tone: 'neutral' },
  design: { label: 'Design', tone: 'blue' },
  approval: { label: 'Approval', tone: 'amber' },
  under_construction: { label: 'Under Construction', tone: 'teal' },
  nearly_complete: { label: 'Nearly Complete', tone: 'teal' },
  handover_ongoing: { label: 'Handover Ongoing', tone: 'green' },
  closed: { label: 'Closed', tone: 'green' },
};

export const PROJECT_PIPELINE_STEPS: ProjectStatus[] = [
  'planning',
  'design',
  'approval',
  'under_construction',
  'nearly_complete',
  'handover_ongoing',
  'closed',
];

/**
 * The stages this shape actually walks through (Phase 3).
 *
 * A land-share project has no design, no approval and no construction: the
 * register opens, the shares sell, the deeds are registered, it closes. Making
 * it click through three stages that describe nothing is how a pipeline stops
 * being believed. A plot scheme keeps every stage — it is designed, gets a
 * subdivision approval, and is developed — but "construction" is the filling
 * and the roads, so it is called that (`projectStatusLabel`).
 *
 * The status *keys* are shared on purpose, so reports and filters across
 * projects keep working; only which of them a shape uses, and what they are
 * called, differ.
 */
export function pipelineSteps(shape: ProjectShape): ProjectStatus[] {
  if (shape.item === 'share') return ['planning', 'nearly_complete', 'handover_ongoing', 'closed'];
  return PROJECT_PIPELINE_STEPS;
}

/** What a status is called on this shape. */
export function projectStatusLabel(status: ProjectStatus, shape: ProjectShape): string {
  if (shape.item === 'share') {
    const share: Partial<Record<ProjectStatus, string>> = {
      planning: 'Register Open',
      nearly_complete: 'Sold Out',
      handover_ongoing: 'Deeds Registering',
    };
    if (share[status]) return share[status];
  }
  if (shape.item === 'plot') {
    const plot: Partial<Record<ProjectStatus, string>> = {
      approval: 'Subdivision Approval',
      under_construction: 'Under Development',
      handover_ongoing: 'Possession Ongoing',
    };
    if (plot[status]) return plot[status];
  }
  return PROJECT_STATUS_META[status].label;
}

/**
 * One step forward, or one step back to correct a premature move.
 *
 * Phase 3 — along this shape's own steps. A project sitting on a status its
 * shape skips (a share project created before the shapes existed, still at
 * `design`) moves on to the next stage the shape does use, so no project is
 * ever stranded on a status it can no longer leave.
 */
export function allowedNextProjectStatuses(
  current: ProjectStatus,
  shape: ProjectShape = PROJECT_SHAPE.apartment,
): ProjectStatus[] {
  const steps = pipelineSteps(shape);
  const i = steps.indexOf(current);
  if (i === -1) {
    const order = PROJECT_PIPELINE_STEPS.indexOf(current);
    const next = steps.find((s) => PROJECT_PIPELINE_STEPS.indexOf(s) > order);
    return next ? [next] : [];
  }
  return [steps[i + 1], steps[i - 1]].filter((s): s is ProjectStatus => Boolean(s));
}

/**
 * What the project actually has, for checking a pipeline move against reality.
 *
 * Read once by the repository and passed in, so these stay pure functions the
 * way the booking blockers are.
 */
export interface ProjectReadiness {
  tower_count: number;
  unit_count: number;
  /** weighted construction progress across every tower, 0–100 */
  progress_pct: number;
  /** units that are booked, sold or handed over */
  units_spoken_for: number;
  units_handed_over: number;
  /** money still owed on confirmed bookings for this project */
  outstanding_amount: number;
}

/**
 * Moves that the project's own records say cannot have happened.
 *
 * The pipeline captured a date and remarks and asked nothing else, so a
 * project with no towers, no units and no site progress could be walked all
 * the way to Closed in six clicks — which is exactly the report a developer
 * would never trust again. These are the checks where the answer is not a
 * matter of judgement: you cannot be building without a tower, and you cannot
 * hand over or close a building nobody has reported any work on.
 *
 * Deliberately narrow. Anything a manager might legitimately do early is a
 * warning instead (see `projectStatusWarnings`) — this list only holds the
 * things that cannot be true.
 */
export function projectStatusBlockers(
  target: ProjectStatus,
  facts: ProjectReadiness,
  shape: ProjectShape = PROJECT_SHAPE.apartment,
): string[] {
  const blockers: string[] = [];
  const buildStages: ProjectStatus[] = [
    'under_construction',
    'nearly_complete',
    'handover_ongoing',
    'closed',
  ];
  /*
   * v26 — the construction checks only apply where something is built.
   *
   * A `land_share` project is never built and a `plot_development` project's
   * work is land development recorded in Module 1, so neither reports
   * construction progress against a tower. Asking them for it would have made
   * every plot and share project permanently unclosable, with a blocker naming
   * a tower the project does not have.
   */
  const built = shapeIsBuilt(shape);

  if (built && buildStages.includes(target) && facts.tower_count === 0) {
    blockers.push(
      `No ${shape.labels.container.toLowerCase()} has been added yet, so there is nothing to build`,
    );
  }

  if (
    built &&
    (target === 'handover_ongoing' || target === 'closed') &&
    facts.tower_count > 0 &&
    facts.progress_pct <= 0
  ) {
    blockers.push(
      'No construction progress has been reported — nothing can be handed over yet',
    );
  }

  /*
   * This one holds for every shape: closing a project nobody has taken
   * delivery of is wrong whether delivery is keys, possession or a deed.
   */
  if (target === 'closed' && facts.unit_count > 0 && facts.units_handed_over === 0) {
    blockers.push(
      `No ${shape.labels.item.toLowerCase()} has been handed over, so the project cannot be closed`,
    );
  }

  return blockers;
}

/**
 * Moves the records make look unlikely, but which a manager may still have a
 * good reason for. Shown, acknowledged, and allowed.
 */
export function projectStatusWarnings(
  target: ProjectStatus,
  facts: ProjectReadiness,
  shape: ProjectShape = PROJECT_SHAPE.apartment,
): string[] {
  const warnings: string[] = [];
  // the progress warnings mean nothing where no construction is reported
  const built = shapeIsBuilt(shape);

  if (built && target === 'nearly_complete' && facts.progress_pct < 75) {
    warnings.push(
      `Construction is reported at ${facts.progress_pct.toFixed(1)}%, which is not what "nearly complete" usually means`,
    );
  }

  if (built && target === 'handover_ongoing' && facts.progress_pct < 95) {
    warnings.push(
      `Construction is reported at ${facts.progress_pct.toFixed(1)}% — handover normally waits for the building to be finished`,
    );
  }

  if (built && target === 'closed' && facts.progress_pct < 100) {
    warnings.push(`Construction is reported at ${facts.progress_pct.toFixed(1)}%, not 100%`);
  }

  if (target === 'closed' && facts.unit_count > 0 && facts.units_handed_over < facts.unit_count) {
    warnings.push(
      `${facts.unit_count - facts.units_handed_over} of ${facts.unit_count} ${shape.labels.itemPlural.toLowerCase()} have not been handed over`,
    );
  }

  if (target === 'closed' && facts.outstanding_amount > 0.009) {
    warnings.push(
      `Buyers still owe money on this project — closing it does not write that off`,
    );
  }

  if (built && target === 'under_construction' && facts.unit_count === 0) {
    warnings.push(
      `No ${shape.labels.itemPlural.toLowerCase()} have been generated yet, so nothing can be sold while it is built`,
    );
  }

  return warnings;
}

/** `actual_start_date` is stamped when construction actually begins. */
export function statusStartsConstruction(status: ProjectStatus): boolean {
  return status === 'under_construction';
}

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  land_share: 'Land Share',
  plot_development: 'Plot Development',
  apartment: 'Apartment',
  commercial: 'Commercial',
  mixed: 'Mixed Use',
};

/**
 * The one-liner under each option in the project form.
 *
 * The two land types are the ones that need explaining: they are how a plot
 * gets sold at all, since the Land module deliberately has no sale of its own.
 */
export const PROJECT_TYPE_HINT: Record<ProjectType, string> = {
  land_share: 'Undivided shares in the plot are sold; nothing is built.',
  plot_development: 'The plot is serviced and sold as individual plots.',
  apartment: 'Residential flats in one or more towers.',
  commercial: 'Shops, offices or other commercial space.',
  mixed: 'Commercial floors below, flats above.',
};

/* ------------------------------------------------------------------ *
 * Project shape — what a project's towers and units actually mean
 * (PROJECT-MODULE-PLAN.md section 3)
 * ------------------------------------------------------------------ */

/**
 * The five project types are not five labels on one flow.
 *
 * Three of them — apartment, commercial, mixed — are a tower of floors sold by
 * rate per sqft, which is the only thing Module 2 was built for. The other two
 * are genuinely different work:
 *
 * - **plot_development** sells serviced plots by the katha. There is no floor,
 *   no bedroom and no sqft; what moves the price is road width and whether the
 *   plot is on a corner. Its "construction progress" is the land development
 *   the Land module already records.
 * - **land_share** sells undivided shares in a plot — 20 shares at 100,000
 *   each, one buyer owning a twentieth of the whole. Nothing is built, nothing
 *   is demarcated, and there is no container to put the shares in.
 *
 * `towers` and `units` stay the tables for all five, because `bookings`, site
 * progress, procurement and the public portal already speak that language and
 * a second set of tables would mean a second code path through four modules
 * kept in sync forever. What changes is what those rows *mean*, and that is
 * what this map holds.
 *
 * Derived from `project_type`, never stored. A `project_type` of
 * `plot_development` *is* the statement that this sells plots; a second stored
 * flag saying the same thing is a second answer to give when they disagree —
 * the same reasoning that kept `joint_venture` out of `PROJECT_TYPES`.
 *
 * Screens ask the shape rather than testing `project_type` inline, so a sixth
 * type is one entry here rather than a search through the module.
 */

/** What holds the saleable items. `none` = a flat register with no grouping. */
export type ContainerKind = 'tower' | 'block' | 'none';
/** What is sold. */
export type ItemKind = 'flat' | 'plot' | 'share';
/** What the item's size is measured in, which decides how it is priced. */
export type SizeBasis = 'sqft' | 'land' | 'share';
/** Which optional `units` fields this shape actually uses. */
export type UnitField =
  | 'floor'
  | 'size_sqft'
  | 'bedrooms'
  | 'facing'
  | 'parking'
  | 'land_size'
  | 'share_pct'
  | 'road_width'
  | 'corner';

/**
 * A price line on a booking that comes from what the item *is* (v27).
 *
 * A flat is worth more higher up and facing south; a plot is worth more on a
 * wider road and on a corner; a share is worth exactly what a share is worth.
 * These map one-to-one onto `bookings` columns, and the shape says which of
 * them the booking form asks for.
 */
export type PremiumKind = 'floor' | 'facing' | 'parking' | 'road' | 'corner';

export const PREMIUM_LABEL: Record<PremiumKind, string> = {
  floor: 'Floor Premium',
  facing: 'Facing Premium',
  parking: 'Parking Charge',
  road: 'Road-width Premium',
  corner: 'Corner Premium',
};

/**
 * The `bookings` column each one is stored in.
 *
 * The booking form and the price breakdown both index by it, so a premium
 * cannot be shown under one name and saved into another.
 */
export const PREMIUM_FIELD: Record<PremiumKind, keyof Booking> = {
  floor: 'floor_premium',
  facing: 'facing_premium',
  parking: 'parking_charge',
  road: 'road_premium',
  corner: 'corner_premium',
};

/** Why this line exists, for the salesperson who has to justify it. */
export const PREMIUM_HINT: Record<PremiumKind, string> = {
  floor: 'Height is priced — what this floor adds over the list price',
  facing: 'South-facing carries a premium in this market',
  parking: 'Charged separately from the flat price',
  road: 'A wider road in front is worth real money',
  corner: 'Two frontages — the usual premium on a plot scheme',
};

export interface ProjectShape {
  container: ContainerKind;
  item: ItemKind;
  sizeBasis: SizeBasis;
  /** the applicable subset of the `units` columns */
  fields: readonly UnitField[];
  /** v27 — the price lines a booking on this shape asks for */
  premiums: readonly PremiumKind[];
  /** what a progress report against this project means */
  progress: 'construction' | 'development' | 'none';
  /** what delivering one item to its buyer is */
  handover: 'keys' | 'possession' | 'deed';
  labels: {
    /** "Tower" / "Block" */
    container: string;
    containerPlural: string;
    /** "Flat" / "Plot" / "Share" */
    item: string;
    itemPlural: string;
    /** the column heading for size: "Size (sqft)" / "Size (katha)" / "Share" */
    size: string;
    /** how the rate is quoted, for the price breakdown */
    rate: string;
  };
}

const TOWER_SHAPE: Omit<ProjectShape, 'labels'> & { labels: ProjectShape['labels'] } = {
  container: 'tower',
  item: 'flat',
  sizeBasis: 'sqft',
  fields: ['floor', 'size_sqft', 'bedrooms', 'facing', 'parking'],
  premiums: ['floor', 'facing', 'parking'],
  progress: 'construction',
  handover: 'keys',
  labels: {
    container: 'Tower',
    containerPlural: 'Towers',
    item: 'Unit',
    itemPlural: 'Units',
    size: 'Size (sqft)',
    rate: 'per sqft',
  },
};

export const PROJECT_SHAPE: Record<ProjectType, ProjectShape> = {
  apartment: TOWER_SHAPE,
  /*
   * Commercial and mixed are the same machinery as an apartment project: a
   * tower of floors priced by the sqft. What differs is the price *curve* — a
   * ground-floor shop can be several times the rate of the same area three
   * floors up — and the floor premium already expresses that. Only the words
   * change, so that a shop is not called a flat.
   */
  commercial: {
    ...TOWER_SHAPE,
    // no bedrooms in a shop; facing still matters for a streetfront unit
    fields: ['floor', 'size_sqft', 'facing', 'parking'],
    premiums: ['floor', 'facing', 'parking'],
    labels: { ...TOWER_SHAPE.labels, item: 'Space', itemPlural: 'Spaces' },
  },
  mixed: TOWER_SHAPE,
  plot_development: {
    container: 'block',
    item: 'plot',
    sizeBasis: 'land',
    fields: ['land_size', 'road_width', 'corner', 'facing'],
    // no parking on a plot: the buyer parks on their own land
    premiums: ['road', 'corner'],
    // the filling, roads and drains are land development, recorded in Module 1
    progress: 'development',
    handover: 'possession',
    labels: {
      container: 'Block',
      containerPlural: 'Blocks',
      item: 'Plot',
      itemPlural: 'Plots',
      size: 'Size (katha)',
      rate: 'per katha',
    },
  },
  land_share: {
    /*
     * No container at all. A share is not in a block and not on a floor — it is
     * a fraction of the whole plot. The project page hides the container UI and
     * shows one flat share register.
     */
    container: 'none',
    item: 'share',
    sizeBasis: 'share',
    // the katha figure rides along because buyers think in katha, not percent
    fields: ['share_pct', 'land_size'],
    /*
     * None. A share is a fraction of one plot, so every share of that plot is
     * worth the same — there is no floor, no corner and no frontage to price.
     * A negotiated difference goes in `other_charges` or the discount, where
     * it is visible as a negotiation rather than dressed up as an attribute.
     */
    premiums: [],
    progress: 'none',
    handover: 'deed',
    labels: {
      container: 'Register',
      containerPlural: 'Register',
      item: 'Share',
      itemPlural: 'Shares',
      /*
       * Not "Share": the booking form prints the code and the size side by
       * side, and two fields both labelled SHARE told the buyer nothing about
       * which was which.
       */
      size: 'Holding',
      rate: 'per share',
    },
  },
};

/**
 * How big this item is, in the words its shape uses.
 *
 * One function rather than a ternary at each call site, because the list, the
 * grid, the edit modal, the allocation matrix and (in Phase 2) the booking form
 * and the money receipt all have to say it the same way. A plot described as
 * "5 sqft" on one screen and "5 katha" on another is the kind of thing a buyer
 * notices before we do.
 */
export function unitSizeLabel(
  unit: {
    size_sqft?: number | null;
    land_size?: number | null;
    land_size_unit?: string | null;
    share_pct?: number | null;
  },
  shape: ProjectShape,
): string {
  if (shape.sizeBasis === 'sqft') {
    return unit.size_sqft ? `${unit.size_sqft.toLocaleString('en-US')} sqft` : '—';
  }
  const land =
    unit.land_size != null ? `${trimNumber(unit.land_size)} ${unit.land_size_unit ?? ''}`.trim() : null;
  if (shape.sizeBasis === 'land') return land ?? '—';
  // a share: the percentage is the thing sold, the area is how buyers picture it
  const pct = unit.share_pct != null ? `${trimNumber(unit.share_pct)}%` : null;
  return [pct, land].filter(Boolean).join(' · ') || '—';
}

/** 5 -> "5", 5.5 -> "5.5", 5.00 -> "5" — katha are quoted without dead zeros. */
function trimNumber(n: number): string {
  return String(Number(n.toFixed(2)));
}

/**
 * The instalment plan a new project of this shape starts from (v27).
 *
 * Seeded onto the project at creation and editable afterwards, exactly as the
 * flat default always was — what changes is that a plot no longer starts life
 * with a 24-month tenure and a construction milestone it will never reach.
 */
export function defaultInstallmentPlan(shape: ProjectShape): typeof DEFAULT_INSTALLMENT_PLAN {
  if (shape.item === 'plot') return PLOT_INSTALLMENT_PLAN;
  if (shape.item === 'share') return SHARE_INSTALLMENT_PLAN;
  return DEFAULT_INSTALLMENT_PLAN;
}

/**
 * One line describing an item, for a dropdown, a receipt or a booking form.
 *
 * "Flat A-501 · 3 Bed · 1,450 sqft", "Plot C-14 · 5 katha", "Share 07 · 5%".
 * Printed paperwork and the unit picker both go through here so a buyer never
 * sees their plot called a flat on one document and a plot on the next.
 */
export function unitDescription(
  unit: {
    code: string;
    unit_type?: string | null;
    size_sqft?: number | null;
    land_size?: number | null;
    land_size_unit?: string | null;
    share_pct?: number | null;
  },
  shape: ProjectShape,
): string {
  return [`${shape.labels.item} ${unit.code}`, unit.unit_type, unitSizeLabel(unit, shape)]
    .filter((part) => part && part !== '\u2014')
    .join(' \u00b7 ');
}

/* ------------------------------------------------------------------ *
 * Delivery — how an item reaches its buyer (Phase 3)
 * ------------------------------------------------------------------ */

export const DELIVERY_STEP_LABEL: Record<DeliveryStep, string> = {
  keys_handed_over: 'Keys handed over',
  possession_given: 'Possession given',
  share_certificate: 'Share certificate issued',
  deed_registered: 'Deed registered',
  mutation_done: 'Mutation (namjari) done',
};

export const DELIVERY_STEP_HINT: Record<DeliveryStep, string> = {
  keys_handed_over: 'The flat is physically handed to the buyer',
  possession_given: 'The plot is pegged out on the ground and handed over',
  share_certificate: 'Issued before the deed, as proof of the holding',
  deed_registered: 'Sale deed registered at the sub-registry office',
  mutation_done: 'The buyer\u2019s name is on the khatian',
};

/**
 * The steps that deliver one item on this shape, in order.
 *
 * The last one completes the delivery and moves the unit to `handed_over`.
 * A share has no mutation step: the buyer holds an undivided fraction, and a
 * khatian is mutated for the whole plot at partition, not share by share.
 */
export function deliverySteps(shape: ProjectShape): DeliveryStep[] {
  if (shape.item === 'share') return ['share_certificate', 'deed_registered'];
  if (shape.item === 'plot') return ['possession_given', 'deed_registered', 'mutation_done'];
  return ['keys_handed_over', 'deed_registered', 'mutation_done'];
}

/** Facts a delivery step is checked against — read once, passed in. */
export interface DeliveryFacts {
  bookingStatus: BookingStatus;
  /** what the buyer still owes on this booking */
  outstanding: number;
  /** steps already recorded on this unit */
  done: DeliveryStep[];
  /** for a plot: development activities still open on the project's land */
  developmentOutstanding: number;
}

/**
 * Why the next delivery step cannot be recorded, or null.
 *
 * Three rules, each one a thing that cannot be true rather than a judgement:
 * nothing is delivered on a booking that is not confirmed; steps happen in
 * order; and **the deed is not registered while money is owed** — in this
 * market registration is the buyer's leverage and the developer's last, so a
 * deed on an unpaid plot is money the company will not see. A plot adds one
 * more: it is not possessed while the filling and roads under it are still
 * open, which is the Land module's development record doing its job here.
 */
export function deliveryBlockReason(
  step: DeliveryStep,
  shape: ProjectShape,
  facts: DeliveryFacts,
): string | null {
  if (facts.bookingStatus !== 'confirmed') {
    return 'Only a confirmed booking can be delivered.';
  }
  const steps = deliverySteps(shape);
  const i = steps.indexOf(step);
  if (i === -1) return `${DELIVERY_STEP_LABEL[step]} is not part of delivering a ${shape.labels.item.toLowerCase()}.`;
  if (facts.done.includes(step)) return `${DELIVERY_STEP_LABEL[step]} is already recorded.`;
  const missing = steps.slice(0, i).find((s) => !facts.done.includes(s));
  if (missing) return `Record \u201c${DELIVERY_STEP_LABEL[missing]}\u201d first.`;
  if (step === 'possession_given' && facts.developmentOutstanding > 0) {
    return `${facts.developmentOutstanding} land development ${facts.developmentOutstanding === 1 ? 'activity is' : 'activities are'} still open on this project's land \u2014 a plot is not handed over before its filling and roads are finished.`;
  }
  if (step === 'deed_registered' && facts.outstanding > 0.009) {
    return 'The buyer still owes money on this booking \u2014 the deed is registered only once it is paid in full.';
  }
  return null;
}

export function projectShape(type: ProjectType): ProjectShape {
  return PROJECT_SHAPE[type];
}

/** Does this shape use that `units` column? Drives every form field's visibility. */
export function shapeUses(shape: ProjectShape, field: UnitField): boolean {
  return shape.fields.includes(field);
}

/**
 * Is there anything to build on this project?
 *
 * Gates the construction-shaped parts of the module — the status pipeline's
 * build stages, tower work items, site progress. A share project is never
 * built, and a plot project's work is land development recorded in Module 1,
 * so neither should be asked for a tower before it can move on.
 */
export function shapeIsBuilt(shape: ProjectShape): boolean {
  return shape.progress === 'construction';
}

/**
 * The default code pattern for a new item, as a hint on the generator.
 *
 * `units.code` is globally unique, so a second project reusing `A-501` is
 * skipped rather than created — which is why the plot and share patterns lead
 * with something project-specific.
 */
export function defaultCodePrefix(shape: ProjectShape, containerName: string): string {
  if (shape.item === 'share') return 'SHARE';
  // "Block C" -> "C"; a tower's own prefix is chosen by the user
  return containerName.replace(/^(block|tower)\s+/i, '').trim() || containerName;
}

export const TOWER_STATUS_META: Record<TowerStatus, { label: string; tone: BadgeTone }> = {
  planning: { label: 'Planning', tone: 'neutral' },
  under_construction: { label: 'Under Construction', tone: 'amber' },
  complete: { label: 'Complete', tone: 'green' },
};

export const UNIT_STATUS_META: Record<UnitStatus, { label: string; tone: BadgeTone }> = {
  available: { label: 'Available', tone: 'green' },
  hold: { label: 'Hold', tone: 'amber' },
  reserved: { label: 'Reserved', tone: 'amber' },
  booked: { label: 'Booked', tone: 'blue' },
  sold: { label: 'Sold', tone: 'teal' },
  handed_over: { label: 'Handed Over', tone: 'neutral' },
};

export const ALLOCATION_TYPE_LABEL: Record<AllocationType, string> = {
  developer_share: 'Developer Share',
  landowner_share: 'Landowner Share',
};

/*
 * Who is responsible for selling a unit — NOT an assertion that it is being
 * sold. `owner_direct` covers the ordinary JV case where the landowner simply
 * keeps their flat under the agreement and the company never markets it; the
 * old "Sold By: Owner Direct" wording read as "the owner is selling it", which
 * is a claim the record does not make.
 *
 * This is what keeps company revenue honest: only `company` units count
 * towards sales and collections (Section 8.5), so the distinction is money,
 * not vocabulary.
 */
export const FOR_SALE_BY_LABEL: Record<ForSaleBy, string> = {
  company: 'Company sells it',
  owner_direct: "Owner's own — company does not sell it",
};

/** Short form for badges and grids, where the sentence above will not fit. */
export const FOR_SALE_BY_SHORT: Record<ForSaleBy, string> = {
  company: 'Company sells',
  owner_direct: "Owner's own",
};

export const JV_SHARE_BASIS_LABEL: Record<JvShareBasis, string> = {
  flat_count: 'Number of flats',
  total_sqft: 'Total sqft',
};

/* ------------------------------------------------------------------ *
 * Unit bulk generation (decided 2026-09-01)
 *
 * A 20-storey tower has ~80 units, and typing them one by one is unusable.
 * In Bangladeshi buildings a floor layout repeats, so the input is ONE floor
 * pattern applied to a floor range; a few runs cover a whole tower and the odd
 * floor is edited afterwards.
 * ------------------------------------------------------------------ */

export interface UnitPatternRow {
  /** appended after the floor number: 'A' gives A-501, '1' gives A-501 too */
  suffix: string;
  unit_type: string;
  bedroom_count: string;
  bathroom_count: string;
  balcony_count: string;
  size_sqft: string;
  facing: string;
  /** per-sqft rate is the usual way a price list is quoted in BD */
  price_mode: 'per_sqft' | 'fixed';
  price_value: string;
  parking_allocated: string;
}

export interface UnitPatternInput {
  prefix: string;          // 'A' → A-501
  separator: string;       // '-'
  floor_from: number;
  floor_to: number;
  /** floors to skip — the ground floor is often parking or commercial */
  excluded_floors: number[];
  /**
   * What a floor adds to the price of the flat below it.
   *
   * Height is priced everywhere in this market — a 10th-floor flat is not
   * worth what the 2nd-floor flat costs — but the generator applied one figure
   * to every floor, so every unit in a tower came out at the same price and
   * had to be corrected one at a time afterwards. `floor_premium_mode` says
   * whether the step is taka per floor or a percentage of the base, and it is
   * counted from `floor_from`, so the first generated floor is always the
   * price actually typed in.
   */
  floor_premium_mode: 'none' | 'amount' | 'percent';
  floor_premium_value: string;
  rows: UnitPatternRow[];
}

export function floorsInRange(input: {
  floor_from: number;
  floor_to: number;
  excluded_floors: number[];
}): number[] {
  const { floor_from, floor_to, excluded_floors } = input;
  if (!Number.isFinite(floor_from) || !Number.isFinite(floor_to) || floor_to < floor_from) return [];
  const floors: number[] = [];
  for (let f = floor_from; f <= floor_to; f += 1) {
    if (!excluded_floors.includes(f)) floors.push(f);
  }
  return floors;
}

export function unitCode(prefix: string, separator: string, floor: number, suffix: string): string {
  return `${prefix}${separator}${floor}${suffix}`;
}

/** Every code the pattern would produce, in generation order. */
export function previewUnitCodes(input: UnitPatternInput): string[] {
  const floors = floorsInRange(input);
  return floors.flatMap((floor) =>
    input.rows.map((row) => unitCode(input.prefix, input.separator, floor, row.suffix)),
  );
}

/** The pattern row's own price, before any floor premium. */
export function priceFor(row: UnitPatternRow): number {
  const value = Number(row.price_value) || 0;
  if (row.price_mode === 'fixed') return value;
  return Math.round(value * (Number(row.size_sqft) || 0));
}

/**
 * The price of one unit on one floor: the row's price plus the floor premium
 * for every floor above the first one being generated.
 *
 * Counted from `floor_from` rather than from floor 1, because the figure typed
 * into the form is the price of the first flat generated — if the tower starts
 * at floor 2, floor 2 is what was quoted, not floor 1 plus a premium nobody
 * asked for.
 */
export function priceOnFloor(
  row: UnitPatternRow,
  floor: number,
  input: Pick<UnitPatternInput, 'floor_from' | 'floor_premium_mode' | 'floor_premium_value'>,
): number {
  const base = priceFor(row);
  if (input.floor_premium_mode === 'none') return base;

  const step = Number(input.floor_premium_value) || 0;
  if (step === 0) return base;

  const stepsUp = Math.max(0, floor - input.floor_from);
  if (input.floor_premium_mode === 'percent') {
    return Math.round(base * (1 + (step / 100) * stepsUp));
  }
  return Math.round(base + step * stepsUp);
}

/* ------------------------------------------------------------------ *
 * JV allocation check (decided 2026-09-01)
 *
 * `land_jv_details` holds the agreed developer/landowner split, `units` holds
 * the flat-by-flat allocation, and nothing reconciled the two — a 45% owner
 * share could be marked against any number of flats. This computes target vs.
 * actual in whichever basis the JV was signed on.
 *
 * The target is only computable when the project maps to exactly ONE JV land:
 * with several JV lands the per-land shares cannot be combined without knowing
 * each land's contribution to the building, so those are listed per land and
 * the automatic check is skipped.
 * ------------------------------------------------------------------ */

export interface AllocationTotals {
  flat_count: number;
  total_sqft: number;
}

export interface JvAllocationSummary {
  basis: JvShareBasis;
  /** what the agreement promises */
  developer_target: number;
  landowner_target: number;
  /** what the units actually say */
  developer_actual: number;
  landowner_actual: number;
  /** allocated total, i.e. the pool the targets are computed from */
  total: number;
  within_tolerance: boolean;
  tolerance_label: string;
}

/**
 * flat_count rounds to whole flats so ±1 is fine; total_sqft is a continuous
 * number, so ~2% either way is the practical limit.
 */
export function jvAllocationSummary(
  totals: { developer: AllocationTotals; landowner: AllocationTotals },
  jv: { developer_share_pct: number; landowner_share_pct: number; jv_share_basis?: JvShareBasis },
): JvAllocationSummary {
  const basis: JvShareBasis = jv.jv_share_basis ?? 'flat_count';
  const key = basis === 'flat_count' ? 'flat_count' : 'total_sqft';

  const developer_actual = totals.developer[key];
  const landowner_actual = totals.landowner[key];
  const total = developer_actual + landowner_actual;

  const developer_target = (total * Number(jv.developer_share_pct)) / 100;
  const landowner_target = (total * Number(jv.landowner_share_pct)) / 100;

  const gap = Math.abs(landowner_actual - landowner_target);
  const within_tolerance =
    total === 0 ? true : basis === 'flat_count' ? gap <= 1 : gap <= total * 0.02;

  return {
    basis,
    developer_target,
    landowner_target,
    developer_actual,
    landowner_actual,
    total,
    within_tolerance,
    tolerance_label: basis === 'flat_count' ? '±1 flat' : '±2% of total sqft',
  };
}

/** A unit is spoken for once a customer is attached to it. */
export function isUnitSellable(status: UnitStatus): boolean {
  return status === 'available' || status === 'hold';
}

/**
 * Once a unit is sold or handed over, its price and allocation are history —
 * a booking and (later) a payment schedule were built on those numbers, so
 * editing them here would quietly contradict signed paperwork. Such units open
 * read-only instead of being un-clickable: people still need to see them.
 */
export function isUnitEditable(status: UnitStatus): boolean {
  return status !== 'sold' && status !== 'handed_over';
}

/**
 * Unit statuses a person may set by hand.
 *
 * `reserved`, `booked`, `sold` and `handed_over` are written by the booking
 * flow — a unit reaches them because a booking exists, and the application
 * enforces no invariant tying `units.status` back to `bookings`. Offering them
 * in the unit form let anyone mark a flat booked with no booking behind it,
 * which is how the inventory rail and the Finance tab came to disagree.
 *
 * The unit's own current status is always included, so opening the form on a
 * reserved unit does not silently rewrite it — it is shown, and the caller
 * marks it as not a manual choice.
 */
export const MANUAL_UNIT_STATUSES: readonly UnitStatus[] = ['available', 'hold'];

export function isManualUnitStatus(status: UnitStatus): boolean {
  return MANUAL_UNIT_STATUSES.includes(status);
}

export function unitStatusOptions(current: UnitStatus): UnitStatus[] {
  return isManualUnitStatus(current) ? [...MANUAL_UNIT_STATUSES] : [...MANUAL_UNIT_STATUSES, current];
}


/* ------------------------------------------------------------------ *
 * What each pipeline step asks for before it is confirmed
 *
 * Same idea as Module 1's land steps: a stray click must not move a project
 * forward silently, and what gets captured here becomes the Timeline tab.
 * ------------------------------------------------------------------ */

export interface ProjectStepField {
  key: 'event_date' | 'performed_by' | 'reference_no' | 'remarks';
  label: string;
  placeholder: string;
  type: 'date' | 'text' | 'textarea';
  required?: boolean;
}

export interface ProjectStepConfig {
  title: string;
  question: string;
  confirmLabel: string;
  tone: 'default' | 'danger' | 'success' | 'warning';
  fields: ProjectStepField[];
}

const REMARKS = (placeholder: string, required = false): ProjectStepField => ({
  key: 'remarks',
  label: required ? 'Remarks (required)' : 'Remarks',
  placeholder,
  type: 'textarea',
  required,
});

export const PROJECT_STEP_CONFIG: Record<ProjectStatus, ProjectStepConfig> = {
  planning: {
    title: 'Move back to planning',
    question: 'Send the project back to the planning stage.',
    confirmLabel: 'Move to planning',
    tone: 'warning',
    fields: [
      { key: 'event_date', label: 'Moved on', placeholder: '', type: 'date', required: true },
      REMARKS('Why is the project going back?', true),
    ],
  },
  design: {
    title: 'Move to design',
    question: 'Record that architectural design work has started.',
    confirmLabel: 'Move to design',
    tone: 'default',
    fields: [
      { key: 'event_date', label: 'Design started on', placeholder: '', type: 'date', required: true },
      { key: 'performed_by', label: 'Architect / firm', placeholder: 'e.g. Volumezero Ltd.', type: 'text' },
      { key: 'reference_no', label: 'Drawing set reference', placeholder: 'e.g. ARCH-2026-014', type: 'text' },
      REMARKS('Layout decisions, unit mix, revisions expected...'),
    ],
  },
  approval: {
    title: 'Submit for approval',
    question: 'Record that the design has gone to the approval authority.',
    confirmLabel: 'Move to approval',
    tone: 'default',
    fields: [
      { key: 'event_date', label: 'Submitted on', placeholder: '', type: 'date', required: true },
      { key: 'performed_by', label: 'Authority', placeholder: 'e.g. RAJUK, CDA, Fire Service', type: 'text' },
      { key: 'reference_no', label: 'File / memo number', placeholder: 'e.g. RAJUK/2026/4471', type: 'text' },
      REMARKS('Conditions raised, queries to answer, expected timeline...'),
    ],
  },
  under_construction: {
    title: 'Start construction',
    question: 'Confirm that construction has begun. This also sets the actual start date.',
    confirmLabel: 'Start construction',
    tone: 'success',
    fields: [
      { key: 'event_date', label: 'Actual start date', placeholder: '', type: 'date', required: true },
      { key: 'performed_by', label: 'Contractor', placeholder: 'e.g. Base Tech Engineering', type: 'text' },
      { key: 'reference_no', label: 'Work order number', placeholder: 'e.g. WO-2026-008', type: 'text' },
      REMARKS('Piling started, site handed to contractor...'),
    ],
  },
  nearly_complete: {
    title: 'Mark nearly complete',
    question: 'Record that the structure is finished and finishing work is on.',
    confirmLabel: 'Mark nearly complete',
    tone: 'default',
    fields: [
      { key: 'event_date', label: 'Reached on', placeholder: '', type: 'date', required: true },
      REMARKS('What is left - lift installation, finishing, utility connections...'),
    ],
  },
  handover_ongoing: {
    title: 'Start handover',
    question: 'Record that units are being handed over to buyers.',
    confirmLabel: 'Start handover',
    tone: 'success',
    fields: [
      { key: 'event_date', label: 'Handover started on', placeholder: '', type: 'date', required: true },
      { key: 'reference_no', label: 'Occupancy certificate no.', placeholder: 'e.g. OC-2026-021', type: 'text' },
      REMARKS('First units handed over, utility connections done...'),
    ],
  },
  closed: {
    title: 'Close the project',
    question: 'Every unit is handed over and the project is finished.',
    confirmLabel: 'Close project',
    tone: 'success',
    fields: [
      { key: 'event_date', label: 'Closed on', placeholder: '', type: 'date', required: true },
      REMARKS('Final accounts settled, warranty period notes...', true),
    ],
  },
};
