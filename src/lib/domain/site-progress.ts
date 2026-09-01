import type { BadgeTone } from '@/components/ui/Badge';
import type {
  MaterialRequestStatus,
  SiteProgressUpdate,
  TowerWorkItem,
  WorkItemStatus,
} from '@/lib/db/types';

/* ------------------------------------------------------------------ *
 * Work items (Section 6.2)
 * ------------------------------------------------------------------ */

export const WORK_ITEM_STATUS_META: Record<WorkItemStatus, { label: string; tone: BadgeTone }> = {
  not_started: { label: 'Not Started', tone: 'neutral' },
  in_progress: { label: 'In Progress', tone: 'amber' },
  completed: { label: 'Completed', tone: 'green' },
};

/**
 * Status is derived, never picked. A site engineer reports a percentage; a
 * dropdown that could disagree with it ("100% but still In Progress") is a bug
 * waiting to happen, so the two are kept in lockstep here.
 */
export function statusForProgress(pct: number): WorkItemStatus {
  if (pct <= 0) return 'not_started';
  if (pct >= 100) return 'completed';
  return 'in_progress';
}

export function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/** Σ actual × weight ÷ 100 (Section 6.3), rounded to two decimals. */
export function towerProgressPct(items: Array<Pick<TowerWorkItem, 'actual_progress_pct' | 'weight_pct'>>): number {
  const total = items.reduce(
    (sum, item) => sum + (Number(item.actual_progress_pct) || 0) * (Number(item.weight_pct) || 0),
    0,
  );
  return Math.round((total / 100) * 100) / 100;
}

export function totalWeight(items: Array<Pick<TowerWorkItem, 'weight_pct'>>): number {
  return Math.round(items.reduce((sum, i) => sum + (Number(i.weight_pct) || 0), 0) * 100) / 100;
}

/** The WBS only adds up to a meaningful tower % when the weights make 100. */
export function weightsBalanced(items: Array<Pick<TowerWorkItem, 'weight_pct'>>): boolean {
  if (items.length === 0) return true;
  return Math.abs(totalWeight(items) - 100) < 0.01;
}

/**
 * Planned % today, by linear interpolation between the planned dates
 * (Section 6.3 — "display-only, no storage"). Null when the item has no plan:
 * a made-up baseline would produce a made-up delay.
 */
export function plannedPctOn(
  item: Pick<TowerWorkItem, 'planned_start_date' | 'planned_end_date'>,
  today: string,
): number | null {
  const { planned_start_date: start, planned_end_date: end } = item;
  if (!start || !end) return null;

  const from = Date.parse(start);
  const to = Date.parse(end);
  const now = Date.parse(today);
  if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(now)) return null;

  if (now <= from) return 0;
  if (now >= to) return 100;
  // a same-day plan would divide by zero; it is either not started or done
  if (to <= from) return 100;

  return Math.round(((now - from) / (to - from)) * 10000) / 100;
}

/** Actual − planned. Negative = behind schedule (Section 6.3, "Delay %"). */
export function varianceOn(
  item: Pick<TowerWorkItem, 'planned_start_date' | 'planned_end_date' | 'actual_progress_pct'>,
  today: string,
): number | null {
  const planned = plannedPctOn(item, today);
  if (planned === null) return null;
  return Math.round(((Number(item.actual_progress_pct) || 0) - planned) * 100) / 100;
}

export type ScheduleState = 'on_track' | 'behind' | 'ahead' | 'no_plan';

/**
 * A couple of points either way is measurement noise on a construction site,
 * so only a real gap is called out.
 */
export function scheduleState(variance: number | null): ScheduleState {
  if (variance === null) return 'no_plan';
  if (variance < -5) return 'behind';
  if (variance > 5) return 'ahead';
  return 'on_track';
}

export const SCHEDULE_STATE_META: Record<ScheduleState, { label: string; tone: BadgeTone }> = {
  on_track: { label: 'On Track', tone: 'green' },
  behind: { label: 'Behind Schedule', tone: 'red' },
  ahead: { label: 'Ahead of Plan', tone: 'blue' },
  no_plan: { label: 'No Plan Dates', tone: 'neutral' },
};

/** Roll-up over a whole tower or project, used by the cards and the dashboard. */
export interface ProgressRollup {
  actual_pct: number;
  planned_pct: number | null;
  variance: number | null;
  state: ScheduleState;
}

/**
 * Weighted planned % for a set of work items — the same weights the actual
 * uses, so the two numbers are comparable. Items with no plan dates are left
 * out of both sides rather than counted as zero.
 */
export function rollupProgress(items: TowerWorkItem[], today: string): ProgressRollup {
  const actual_pct = towerProgressPct(items);

  let plannedWeighted = 0;
  let plannedWeight = 0;
  let actualWeighted = 0;
  for (const item of items) {
    const planned = plannedPctOn(item, today);
    if (planned === null) continue;
    const weight = Number(item.weight_pct) || 0;
    plannedWeighted += planned * weight;
    actualWeighted += (Number(item.actual_progress_pct) || 0) * weight;
    plannedWeight += weight;
  }

  if (plannedWeight === 0) {
    return { actual_pct, planned_pct: null, variance: null, state: 'no_plan' };
  }

  const planned_pct = Math.round((plannedWeighted / plannedWeight) * 100) / 100;
  const comparableActual = actualWeighted / plannedWeight;
  const variance = Math.round((comparableActual - planned_pct) * 100) / 100;

  return { actual_pct, planned_pct, variance, state: scheduleState(variance) };
}

/**
 * Roll-up over MORE than one tower.
 *
 * Weights are per tower and each set makes its own 100%, so concatenating the
 * work items of five towers and running `rollupProgress` over them gives five
 * towers' worth of percentage — 176%, not 35%. Section 6.3 is explicit about
 * this: "Project overall % = তার Towers-এর average". So each tower is rolled
 * up on its own and the towers are averaged.
 *
 * Every tower counts once regardless of size. Weighting by floor count or unit
 * count would be defensible, but the scope document says average, and a
 * different rule here would quietly disagree with the number the client signed
 * off on.
 */
export function rollupAcrossTowers(items: TowerWorkItem[], today: string): ProgressRollup {
  const byTower = new Map<string, TowerWorkItem[]>();
  for (const item of items) {
    const list = byTower.get(item.tower_id) ?? [];
    list.push(item);
    byTower.set(item.tower_id, list);
  }

  const towers = [...byTower.values()].map((group) => rollupProgress(group, today));
  if (towers.length === 0) {
    return { actual_pct: 0, planned_pct: null, variance: null, state: 'no_plan' };
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  const actual_pct = round(towers.reduce((s, t) => s + t.actual_pct, 0) / towers.length);

  // towers with no plan dates sit out the planned side rather than dragging
  // the average to zero — the same rule rollupProgress uses per item
  const planned = towers.filter((t) => t.planned_pct !== null);
  if (planned.length === 0) {
    return { actual_pct, planned_pct: null, variance: null, state: 'no_plan' };
  }

  const planned_pct = round(
    planned.reduce((s, t) => s + (t.planned_pct ?? 0), 0) / planned.length,
  );
  const variance = round(planned.reduce((s, t) => s + (t.variance ?? 0), 0) / planned.length);

  return { actual_pct, planned_pct, variance, state: scheduleState(variance) };
}

/* ------------------------------------------------------------------ *
 * Material requests (Section 6.5)
 * ------------------------------------------------------------------ */

export const MATERIAL_REQUEST_STATUS_META: Record<
  MaterialRequestStatus,
  { label: string; tone: BadgeTone }
> = {
  pending: { label: 'Pending', tone: 'amber' },
  approved: { label: 'Approved', tone: 'blue' },
  rejected: { label: 'Rejected', tone: 'red' },
  ordered: { label: 'Ordered', tone: 'teal' },
  fulfilled: { label: 'Fulfilled', tone: 'green' },
};

/** The happy path, for the step list on the status card. */
export const MATERIAL_REQUEST_PIPELINE: MaterialRequestStatus[] = [
  'pending',
  'approved',
  'ordered',
  'fulfilled',
];

/**
 * Lifecycle of Section 6.5. `rejected` is a dead end that only the requester
 * can reopen by raising a fresh request — reviving a rejected request would
 * lose why it was turned down.
 */
export function allowedNextRequestStatuses(
  current: MaterialRequestStatus,
): MaterialRequestStatus[] {
  switch (current) {
    case 'pending':
      return ['approved', 'rejected'];
    case 'approved':
      return ['ordered'];
    case 'ordered':
      return ['fulfilled'];
    default:
      return [];
  }
}

/**
 * Section 6.5 hands the post-approval steps to Procurement (Module 6). Until
 * that module exists the buttons stay, but the card says where they will move.
 */
export const REQUEST_STEP_OWNER: Record<MaterialRequestStatus, string> = {
  pending: 'Site Manager',
  approved: 'Procurement',
  rejected: 'Procurement',
  ordered: 'Procurement',
  fulfilled: 'Procurement',
};

export interface RequestStepConfig {
  title: string;
  message: string;
  confirmLabel: string;
  tone: 'default' | 'danger' | 'success' | 'warning';
  /** a rejection has to say why */
  needsNote: boolean;
}

export const MATERIAL_REQUEST_STEP_CONFIG: Record<
  Exclude<MaterialRequestStatus, 'pending'>,
  RequestStepConfig
> = {
  approved: {
    title: 'Approve this request',
    message:
      'Procurement accepts the request. Approved quantities can be trimmed per item before approving; a blank quantity means the full amount asked for.',
    confirmLabel: 'Approve request',
    tone: 'success',
    needsNote: false,
  },
  rejected: {
    title: 'Reject this request',
    message: 'The request is closed. The site team has to raise a new one. A reason is required.',
    confirmLabel: 'Reject request',
    tone: 'danger',
    needsNote: true,
  },
  ordered: {
    title: 'Mark as ordered',
    message:
      'Purchasing has started against this request. In Module 6 this is where the Purchase Order is raised.',
    confirmLabel: 'Mark ordered',
    tone: 'default',
    needsNote: false,
  },
  fulfilled: {
    title: 'Mark as fulfilled',
    message: 'The material has reached the site and the request is closed.',
    confirmLabel: 'Mark fulfilled',
    tone: 'success',
    needsNote: false,
  },
};

/**
 * Line counts for a request.
 *
 * Deliberately NOT a sum of quantities: a request mixes 450 bags of cement
 * with 12 tons of rod and 1800 cft of sand, and adding those gives "3462",
 * a number that means nothing. What a procurement officer actually wants to
 * know is how many lines were cut.
 */
export function requestTotals(
  items: Array<{ quantity_requested: number; quantity_approved?: number | null }>,
): { lines: number; decided: number; trimmed: number; rejected: number } {
  let decided = 0;
  let trimmed = 0;
  let rejected = 0;

  for (const item of items) {
    if (item.quantity_approved == null) continue;
    decided += 1;
    const approved = Number(item.quantity_approved) || 0;
    if (approved <= 0) rejected += 1;
    else if (approved < Number(item.quantity_requested)) trimmed += 1;
  }

  return { lines: items.length, decided, trimmed, rejected };
}

/** One-line summary of what the decision did to the lines. */
export function approvalSummary(totals: ReturnType<typeof requestTotals>): string {
  if (totals.decided === 0) return 'no decision yet';
  if (totals.rejected === totals.lines) return 'all lines rejected';
  const cut = totals.trimmed + totals.rejected;
  if (cut === 0) return `all ${totals.lines} lines approved in full`;
  return `${totals.lines - cut} of ${totals.lines} lines approved in full, ${cut} cut`;
}

/* ------------------------------------------------------------------ *
 * Site activity — the merged event stream (added after the Module 5
 * review: a flat list of readings gave no sense of what was happening
 * on a site, only of what numbers were typed in)
 * ------------------------------------------------------------------ */

/**
 * A reading that crosses a boundary is not just another number — "Foundation
 * completed" is the thing people remember. So the milestone is folded INTO the
 * reading rather than emitted as a second event on the same day, which would
 * make the timeline read as if two things happened.
 */
export type ActivityKind =
  | 'reading'
  | 'item_started'
  | 'item_completed'
  | 'request_raised'
  | 'request_decided'
  | 'project_status';

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  /** YYYY-MM-DD — what the timeline groups by */
  date: string;
  /** full timestamp, for ordering inside one day */
  at: string;
  title: string;
  detail?: string | null;
  /** where clicking the entry goes */
  href?: string | null;
  /** "Tower A · Superstructure" */
  context?: string | null;
  /** who did it */
  actor?: string | null;
  /** reading events: the percentage it moved to, and from */
  progress_pct?: number | null;
  previous_pct?: number | null;
  /** reading events: how many photos are attached */
  photo_count?: number;
  /** request events: the status badge to show */
  status?: string | null;
}

/** Which readings count as a milestone (see ActivityKind). */
export function readingKind(previous: number, next: number): ActivityKind {
  if (next >= 100 && previous < 100) return 'item_completed';
  if (previous <= 0 && next > 0) return 'item_started';
  return 'reading';
}

export const ACTIVITY_META: Record<ActivityKind, { label: string; tone: BadgeTone }> = {
  reading: { label: 'Progress', tone: 'teal' },
  item_started: { label: 'Started', tone: 'blue' },
  item_completed: { label: 'Completed', tone: 'green' },
  request_raised: { label: 'Material Request', tone: 'amber' },
  request_decided: { label: 'Request Decision', tone: 'neutral' },
  project_status: { label: 'Project Stage', tone: 'blue' },
};

/** The filter chips on the timeline. */
export const ACTIVITY_FILTERS: Array<{ key: string; label: string; kinds: ActivityKind[] }> = [
  { key: 'all', label: 'Everything', kinds: [] },
  {
    key: 'progress',
    label: 'Progress',
    kinds: ['reading', 'item_started', 'item_completed'],
  },
  { key: 'milestones', label: 'Milestones', kinds: ['item_started', 'item_completed'] },
  { key: 'materials', label: 'Materials', kinds: ['request_raised', 'request_decided'] },
  { key: 'stage', label: 'Project stage', kinds: ['project_status'] },
];

/* ------------------------------------------------------------------ *
 * Staleness — the signal nothing else surfaces
 * ------------------------------------------------------------------ */

/**
 * A site only owes updates while it is actually being built. Warning that a
 * project in `design` has not reported progress would be noise, and noise is
 * how people learn to ignore a warning.
 */
export function isSiteActive(status: string): boolean {
  return (
    status === 'under_construction' || status === 'nearly_complete' || status === 'handover_ongoing'
  );
}

/** A fortnight of silence from an active site is worth asking about. */
export const STALE_AFTER_DAYS = 14;

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Human date grouping for the timeline: Today / Yesterday / 28 Aug 2026. */
export function dayHeading(date: string, today: string): string {
  const diff = daysBetween(date, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/* ------------------------------------------------------------------ *
 * Actual-vs-planned over time (the S-curve)
 * ------------------------------------------------------------------ */

export interface ProgressPoint {
  date: string;
  actual: number;
  planned: number | null;
}

/** The latest reading on or before `date`; 0 when the item had not started. */
function pctAsOf(readings: SiteProgressUpdate[] | undefined, date: string): number {
  if (!readings || readings.length === 0) return 0;
  let value = 0;
  for (const r of readings) {
    if (r.update_date > date) break;
    value = r.progress_pct;
  }
  return value;
}

/**
 * Rebuilds the project's progress curve from the log.
 *
 * A single "62%, planned 67%" tells you the gap today but not which way it is
 * moving, and on a three-year build that is the only question worth asking.
 * Every reading carries its own date, so the whole curve is recoverable
 * without storing a single extra row — the same reason Section 6.3 keeps
 * planned % out of the database.
 *
 * `readingsByItem` must be sorted oldest-first per item.
 */
export function progressSeries(
  items: TowerWorkItem[],
  readingsByItem: Map<string, SiteProgressUpdate[]>,
  from: string,
  to: string,
  points = 12,
): ProgressPoint[] {
  if (items.length === 0) return [];

  const span = daysBetween(from, to);
  if (span <= 0) return [];

  const step = Math.max(1, Math.round(span / (points - 1)));
  const dates: string[] = [];
  for (let d = 0; d < span; d += step) dates.push(addDays(from, d));
  dates.push(to);

  return dates.map((date) => {
    // the same items, rewound to where they stood on that date
    const asOf = items.map((item) => ({
      ...item,
      actual_progress_pct: pctAsOf(readingsByItem.get(item.id), date),
    }));
    const rollup = rollupAcrossTowers(asOf, date);
    return { date, actual: rollup.actual_pct, planned: rollup.planned_pct };
  });
}
