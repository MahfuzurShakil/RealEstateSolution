'use client';

import { db } from '../../db/database';
import type { DocumentRecord, Project, ProjectType, Tower, Unit } from '../../db/types';
import { PROJECT_TYPE_LABEL, projectSalesStatus, projectShape, unitSizeLabel, type ProjectShape } from '../../domain/project';
import {
  areaOf,
  isPubliclyVisible,
  mapLink,
  priceInBand,
  type PublicPriceBand,
  publicSalesBadge,
  publicStage,
  publicUnitStatus,
  type PublicSalesBadge,
  type PublicStage,
  type PublicUnitStatus,
} from '../../domain/public-portal';
import { publicShowsPrices } from './content.public.repository';

/**
 * Public Portal P2 — projects, towers and units as a buyer may see them
 * (Public Portal v2.0 §3).
 *
 * Every method returns objects built field by field here, never a spread of a
 * Dexie row: a column added to `projects` or `units` next month must not reach
 * the website because nobody remembered to strip it. What is left out on
 * purpose — cost, discount, allocation, landowner, who sells an owner-direct
 * flat, the price of anything not available — is listed in v2.0 §1.
 *
 * `isPubliclyVisible` gates every entry point, so a code typed into the URL of
 * an unpublished project gets the same answer as a code that does not exist.
 */

/** A picture the page can show: an uploaded Blob, or an externally hosted URL. */
export type PublicImage =
  | { kind: 'blob'; id: string; blob: Blob; alt: string }
  | { kind: 'url'; url: string; alt: string };

export interface PublicDownload {
  id: string;
  title: string;
  file_name: string;
  blob: Blob | null;
  url: string | null;
}

export interface PublicProjectCard {
  code: string;
  name: string;
  project_type: ProjectType;
  type_label: string;
  location_summary: string | null;
  cover: PublicImage | null;
  sales_badge: PublicSalesBadge;
  stage: PublicStage;
  is_featured: boolean;
  /** "Flats" / "Spaces" / "Plots" / "Shares" */
  item_label: string;
  item_label_singular: string;
  /** lowest price among company-sold available items; null when none */
  price_from: number | null;
  available_count: number;
  /** shown items, i.e. everything but drafts */
  total_count: number;
  /** "1,250–1,650 sqft", "3–5 katha", "5% · 1 katha" */
  size_range: string | null;
  /** built shapes only */
  expected_completion_date: string | null;
  /** map pin for the listing's map view; null when no linked land has GPS */
  point: { lat: number; lng: number } | null;
}

export interface PublicUnit {
  code: string;
  floor: number | null;
  unit_type: string | null;
  size_label: string;
  bedroom_count: number | null;
  bathroom_count: number | null;
  balcony_count: number | null;
  facing: string | null;
  road_width_ft: number | null;
  is_corner: boolean | null;
  public_status: PublicUnitStatus;
  /** only when available — a sold flat's price is a buyer's private business */
  price: number | null;
}

export interface PublicContainer {
  /** tower or block; absent for a share register */
  name: string;
  floor_count: number | null;
  basement_count: number | null;
  building_type: string | null;
  unit_per_floor: number | null;
  lift_count: number | null;
  staircase_count: number | null;
  electricity_backup: boolean | null;
  floor_area_sqft: number | null;
  /** a plot block's own internal road */
  road_width_ft: number | null;
  progress_pct: number | null;
  units: PublicUnit[];
}

export interface PublicUnitTypeSummary {
  unit_type: string;
  size_range: string | null;
  bedroom_count: number | null;
  bathroom_count: number | null;
  balcony_count: number | null;
  price_from: number | null;
  available_count: number;
  total_count: number;
}

export interface PublicProjectDetail extends PublicProjectCard {
  container_kind: ProjectShape['container'];
  container_label: string;
  container_label_plural: string;
  surroundings: string[];
  amenities: string[];
  total_land_area: string | null;
  front_road_ft: number | null;
  map_url: string | null;
  /** land_share only */
  construction_planned: boolean;
  containers: PublicContainer[];
  unit_types: PublicUnitTypeSummary[];
  gallery: PublicImage[];
  /** standard payment plan; empty when Admin has none for this project */
  payment_plan: PublicPaymentStep[];
  brochure: PublicDownload | null;
  floor_plans: PublicDownload[];
  /** average of the towers, built shapes only */
  progress_pct: number | null;
}

/** One step of the project's standard payment plan (Admin's instalment template); percentages only. */
export interface PublicPaymentStep {
  label: string;
  percentage: number;
  schedule: 'on_booking' | 'monthly' | 'on_handover' | 'manual';
  month_count: number | null;
}

export interface PublicSiteStats {
  on_sale: number;
  completed: number;
  /** the types that have at least one visible project, for the home tiles */
  types: { project_type: ProjectType; label: string; count: number }[];
}

export interface PublicProjectFilters {
  project_types?: ProjectType[];
  stages?: PublicStage[];
  location?: string;
  /** one of `DHAKA_AREAS`, matched inside `location_summary` */
  area?: string;
  available_only?: boolean;
  /** any of these: the project has an available item priced inside the band */
  price_bands?: PublicPriceBand[];
}

/* ------------------------------------------------------------------ */

const isCompanyAvailable = (u: Unit) => u.status === 'available' && u.for_sale_by === 'company';

function numberRange(values: number[], format: (n: number) => string): string | null {
  if (values.length === 0) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return lo === hi ? format(lo) : `${format(lo)}–${format(hi)}`;
}

function sizeRange(units: Unit[], shape: ProjectShape): string | null {
  if (units.length === 0) return null;
  if (shape.sizeBasis === 'sqft') {
    return numberRange(
      units.map((u) => u.size_sqft ?? 0).filter((n) => n > 0),
      (n) => n.toLocaleString('en-US'),
    )?.concat(' sqft') ?? null;
  }
  if (shape.sizeBasis === 'land') {
    const sizes = units.map((u) => u.land_size ?? 0).filter((n) => n > 0);
    const unit = units.find((u) => u.land_size_unit)?.land_size_unit ?? '';
    return numberRange(sizes, (n) => String(Number(n.toFixed(2))))?.concat(unit ? ` ${unit}` : '') ?? null;
  }
  // shares are usually equal; when they are not, the label of the first one is still honest
  const labels = [...new Set(units.map((u) => unitSizeLabel(u, shape)))];
  return labels.length === 1 ? labels[0] : `from ${labels[0]}`;
}

function minPrice(units: Unit[]): number | null {
  const prices = units.filter(isCompanyAvailable).map((u) => u.base_price).filter((p) => p > 0);
  return prices.length ? Math.min(...prices) : null;
}

const HOSTED = /^https?:\/\//;

/** An uploaded image, or an image hosted elsewhere and linked by URL (no file stored). */
export function isPicture(doc: DocumentRecord): boolean {
  if (doc.file_data) return (doc.mime_type ?? '').startsWith('image/');
  return HOSTED.test(doc.file_url) && (doc.mime_type ?? 'image/').startsWith('image/');
}

export function pictureOf(doc: DocumentRecord, alt: string): PublicImage {
  return doc.file_data
    ? { kind: 'blob', id: doc.id, blob: doc.file_data, alt }
    : { kind: 'url', url: doc.file_url, alt };
}

/**
 * v2.0 §3.5 — the chosen upload, then the hosted URL, then the first public
 * gallery picture. The chosen display picture still has to be ticked public:
 * nothing from the Documents tab reaches the site without that tick.
 */
function coverFor(project: Project, docs: DocumentRecord[]): PublicImage | null {
  const chosen = project.cover_image_document_id
    ? docs.find((d) => d.id === project.cover_image_document_id && d.is_public && isPicture(d))
    : undefined;
  if (chosen) return pictureOf(chosen, project.name);
  if (project.cover_image_url) return { kind: 'url', url: project.cover_image_url, alt: project.name };
  const first = docs.find((d) => d.is_public && d.document_type === 'gallery_image' && isPicture(d));
  return first ? pictureOf(first, project.name) : null;
}

/** `notes` is the admin's own remark about the file, so it never becomes the title. */
function toDownload(doc: DocumentRecord): PublicDownload {
  return {
    id: doc.id,
    title: (doc.file_name ?? doc.file_url).replace(/\.[a-z0-9]{2,4}$/i, ''),
    file_name: doc.file_name ?? doc.file_url,
    blob: doc.file_data ?? null,
    url: doc.file_data ? null : /^https?:\/\//.test(doc.file_url) ? doc.file_url : null,
  };
}

interface Loaded {
  towersByProject: Map<string, Tower[]>;
  unitsByTower: Map<string, Unit[]>;
  docsByProject: Map<string, DocumentRecord[]>;
  /** first linked land with GPS — the only land fact the listing map needs */
  pointByProject: Map<string, { lat: number; lng: number }>;
}

/** One read of the three tables, shared by every card on the listing. */
async function loadFor(projectIds: string[]): Promise<Loaded> {
  const ids = new Set(projectIds);
  const towers = (await db.towers.toArray()).filter((t) => ids.has(t.project_id));
  const towerIds = new Set(towers.map((t) => t.id));
  const [units, docs] = await Promise.all([
    db.units.toArray().then((rows) => rows.filter((u) => towerIds.has(u.tower_id))),
    db.documents.where('entity_type').equals('project').toArray(),
  ]);

  const towersByProject = new Map<string, Tower[]>();
  for (const t of towers) towersByProject.set(t.project_id, [...(towersByProject.get(t.project_id) ?? []), t]);
  const unitsByTower = new Map<string, Unit[]>();
  for (const u of units) unitsByTower.set(u.tower_id, [...(unitsByTower.get(u.tower_id) ?? []), u]);
  const docsByProject = new Map<string, DocumentRecord[]>();
  for (const d of docs) {
    if (!ids.has(d.entity_id)) continue;
    docsByProject.set(d.entity_id, [...(docsByProject.get(d.entity_id) ?? []), d]);
  }
  const pointByProject = new Map<string, { lat: number; lng: number }>();
  const mappings = (await db.land_project_mapping.toArray()).filter((m) => ids.has(m.project_id));
  const lands = new Map((await db.lands.bulkGet([...new Set(mappings.map((m) => m.land_id))])).filter((l) => !!l).map((l) => [l!.id, l!]));
  for (const m of mappings) {
    const land = lands.get(m.land_id);
    if (!pointByProject.has(m.project_id) && land?.gps_lat != null && land.gps_lng != null) {
      pointByProject.set(m.project_id, { lat: land.gps_lat, lng: land.gps_lng });
    }
  }
  return { towersByProject, unitsByTower, docsByProject, pointByProject };
}

function shownUnits(project: Project, loaded: Loaded): Unit[] {
  return (loaded.towersByProject.get(project.id) ?? [])
    .flatMap((t) => loaded.unitsByTower.get(t.id) ?? [])
    .filter((u) => publicUnitStatus(u) !== null);
}

function toCard(project: Project, loaded: Loaded): PublicProjectCard {
  const shape = projectShape(project.project_type);
  const units = shownUnits(project, loaded);
  const docs = loaded.docsByProject.get(project.id) ?? [];
  const built = shape.progress === 'construction';
  return {
    code: project.code,
    name: project.name,
    project_type: project.project_type,
    type_label: PROJECT_TYPE_LABEL[project.project_type],
    location_summary: project.location_summary?.trim() || null,
    cover: coverFor(project, docs),
    sales_badge: publicSalesBadge(projectSalesStatus(project)),
    stage: publicStage(project.status, shape),
    is_featured: project.is_featured,
    item_label: shape.labels.itemPlural,
    item_label_singular: shape.labels.item,
    price_from: minPrice(units),
    available_count: units.filter(isCompanyAvailable).length,
    total_count: units.length,
    size_range: sizeRange(units, shape),
    expected_completion_date: built ? (project.expected_completion_date ?? null) : null,
    point: loaded.pointByProject.get(project.id) ?? null,
  };
}

function toPublicUnit(unit: Unit, shape: ProjectShape): PublicUnit | null {
  const status = publicUnitStatus(unit);
  if (!status) return null;
  const bedrooms = shape.fields.includes('bedrooms');
  return {
    code: unit.code,
    floor: shape.fields.includes('floor') ? (unit.floor ?? null) : null,
    unit_type: shape.item === 'share' ? null : unit.unit_type || null,
    size_label: unitSizeLabel(unit, shape),
    bedroom_count: bedrooms ? (unit.bedroom_count ?? null) : null,
    bathroom_count: bedrooms ? (unit.bathroom_count ?? null) : null,
    balcony_count: bedrooms ? (unit.balcony_count ?? null) : null,
    facing: shape.fields.includes('facing') ? (unit.facing ?? null) : null,
    road_width_ft: shape.fields.includes('road_width') ? (unit.road_width_ft ?? null) : null,
    is_corner: shape.fields.includes('corner') ? (unit.is_corner ?? null) : null,
    public_status: status,
    price: status === 'available' ? unit.base_price : null,
  };
}

function unitTypeSummaries(units: Unit[], shape: ProjectShape): PublicUnitTypeSummary[] {
  if (shape.item !== 'flat') return [];
  const groups = new Map<string, Unit[]>();
  for (const u of units) {
    const key = u.unit_type || 'Other';
    groups.set(key, [...(groups.get(key) ?? []), u]);
  }
  // the most common value: one 3 Bed with an extra bathroom should not speak for the rest
  const typical = (rows: Unit[], key: 'bedroom_count' | 'bathroom_count' | 'balcony_count') => {
    const tally = new Map<number, number>();
    for (const u of rows) if (u[key] != null) tally.set(u[key]!, (tally.get(u[key]!) ?? 0) + 1);
    return [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null;
  };
  const bedrooms = shape.fields.includes('bedrooms');
  return [...groups.entries()]
    .map(([unit_type, rows]) => ({
      unit_type,
      size_range: sizeRange(rows, shape),
      bedroom_count: bedrooms ? typical(rows, 'bedroom_count') : null,
      bathroom_count: bedrooms ? typical(rows, 'bathroom_count') : null,
      balcony_count: bedrooms ? typical(rows, 'balcony_count') : null,
      price_from: minPrice(rows),
      available_count: rows.filter(isCompanyAvailable).length,
      total_count: rows.length,
    }))
    .sort((a, b) => a.unit_type.localeCompare(b.unit_type, undefined, { numeric: true }));
}

function byFloorThenCode(a: PublicUnit, b: PublicUnit): number {
  return (b.floor ?? 0) - (a.floor ?? 0) || a.code.localeCompare(b.code, undefined, { numeric: true });
}

/* ------------------------------------------------------------------ */

/** Booleans are not valid IndexedDB keys, so the `is_public` index cannot answer this. */
async function visibleProjects(): Promise<Project[]> {
  return (await db.projects.toArray()).filter(isPubliclyVisible);
}

/**
 * The price band asks about every available item, not the card's "from"
 * price: a project whose cheapest flat is 1.1 Cr but which also has 2.4 Cr
 * penthouses belongs in "2 – 3 Crore" too.
 */
function matches(
  card: PublicProjectCard,
  availablePrices: number[],
  filters: PublicProjectFilters,
): boolean {
  if (filters.project_types?.length && !filters.project_types.includes(card.project_type)) return false;
  if (filters.stages?.length && !filters.stages.includes(card.stage)) return false;
  if (filters.location && card.location_summary !== filters.location) return false;
  if (filters.area && areaOf(card.location_summary) !== filters.area) return false;
  if (filters.available_only && card.available_count === 0) return false;
  if (
    filters.price_bands?.length &&
    !availablePrices.some((p) => filters.price_bands!.some((band) => priceInBand(p, band)))
  )
    return false;
  return true;
}

/*
 * Website card "Show prices on the website" off: prices are taken out here,
 * where every public object is built, so no page can forget to hide one. The
 * pages already read a null price as "Price on request".
 */
function unpriced<T extends PublicProjectCard>(card: T): T {
  return { ...card, price_from: null };
}

/** Public Portal v2.0 §6.3 — what a project needs before it looks right on the website. */
export interface WebsiteReadinessItem {
  key: 'cover' | 'location' | 'gallery' | 'priced_unit' | 'brochure';
  ok: boolean;
  /** the brochure is nice to have; the rest are expected */
  optional: boolean;
}

/**
 * The checklist under the publish switch. Built from the same mapping the
 * site uses (cover, public gallery, available company-sold units), so it can
 * never say "ready" about something the website would leave out. Warnings
 * only — publishing is never blocked by it.
 */
export async function websiteReadiness(projectId: string): Promise<WebsiteReadinessItem[]> {
  const project = await db.projects.get(projectId);
  if (!project) return [];
  const loaded = await loadFor([project.id]);
  const docs = loaded.docsByProject.get(project.id) ?? [];
  const publicDocs = docs.filter((d) => d.is_public);
  return [
    { key: 'cover', ok: coverFor(project, docs) !== null, optional: false },
    { key: 'location', ok: !!project.location_summary?.trim(), optional: false },
    { key: 'gallery', ok: publicDocs.some((d) => d.document_type === 'gallery_image' && isPicture(d)), optional: false },
    { key: 'priced_unit', ok: minPrice(shownUnits(project, loaded)) !== null, optional: false },
    { key: 'brochure', ok: publicDocs.some((d) => d.document_type === 'brochure'), optional: true },
  ];
}

export const publicProjectRepository = {
  /** v2.0 §3.4 — the listing. Featured first, then newest. */
  async list(filters: PublicProjectFilters = {}): Promise<PublicProjectCard[]> {
    const projects = await visibleProjects();
    const loaded = await loadFor(projects.map((p) => p.id));
    const showPrices = await publicShowsPrices();
    // with prices hidden a budget filter would still reveal them by what it drops
    if (!showPrices) filters = { ...filters, price_bands: undefined };
    const cards = projects
      .sort(
        (a, b) =>
          Number(b.is_featured) - Number(a.is_featured) || b.created_at.localeCompare(a.created_at),
      )
      .filter((p) =>
        matches(
          toCard(p, loaded),
          shownUnits(p, loaded).filter(isCompanyAvailable).map((u) => u.base_price),
          filters,
        ),
      )
      .map((p) => toCard(p, loaded));
    return showPrices ? cards : cards.map(unpriced);
  },

  /** Home page — featured first, topped up with the newest (the listing's own order). */
  async featured(limit = 4): Promise<PublicProjectCard[]> {
    const cards = (await this.list()).filter((c) => c.stage !== 'completed');
    return cards.slice(0, limit);
  },

  async stats(): Promise<PublicSiteStats> {
    const cards = await this.list();
    const counts = new Map<ProjectType, number>();
    for (const c of cards) counts.set(c.project_type, (counts.get(c.project_type) ?? 0) + 1);
    return {
      on_sale: cards.filter((c) => c.sales_badge === 'on_sale').length,
      completed: cards.filter((c) => c.stage === 'completed').length,
      types: [...counts.entries()].map(([project_type, count]) => ({
        project_type,
        label: PROJECT_TYPE_LABEL[project_type],
        count,
      })),
    };
  },

  /** Distinct marketing locations, for the listing's location filter. */
  async locations(): Promise<string[]> {
    const cards = await this.list();
    return [...new Set(cards.map((c) => c.location_summary).filter((l): l is string => !!l))].sort();
  },

  /** v2.0 §3.5 — one project by its code, or null when it is not on the website. */
  async detail(code: string): Promise<PublicProjectDetail | null> {
    const project = await db.projects.where('code').equals(code).first();
    if (!project || !isPubliclyVisible(project)) return null;

    const shape = projectShape(project.project_type);
    const loaded = await loadFor([project.id]);
    const card = toCard(project, loaded);
    const docs = (loaded.docsByProject.get(project.id) ?? []).filter((d) => d.is_public);
    const towers = (loaded.towersByProject.get(project.id) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
    const built = shape.progress === 'construction';

    const containers: PublicContainer[] = towers.map((t) => ({
      name: t.name,
      floor_count: built ? t.floor_count : null,
      basement_count: built ? (t.basement_count ?? null) : null,
      building_type: built ? (t.building_type ?? null) : null,
      unit_per_floor: built ? (t.unit_per_floor ?? null) : null,
      lift_count: built ? (t.lift_count ?? null) : null,
      staircase_count: built ? (t.staircase_count ?? null) : null,
      electricity_backup: built ? (t.electricity_backup ?? null) : null,
      floor_area_sqft: built ? (t.floor_area_sqft ?? null) : null,
      road_width_ft: shape.container === 'block' ? (t.front_road_width_ft ?? null) : null,
      progress_pct: built ? Math.round(Number(t.current_progress_pct) || 0) : null,
      units: (loaded.unitsByTower.get(t.id) ?? [])
        .map((u) => toPublicUnit(u, shape))
        .filter((u): u is PublicUnit => u !== null)
        .sort(byFloorThenCode),
    }));

    // v2.0 §3.5 — only two land facts cross over: where it is, and the road it fronts
    const mappings = await db.land_project_mapping.where('project_id').equals(project.id).toArray();
    const lands = (await db.lands.bulkGet(mappings.map((m) => m.land_id))).filter((l) => !!l);
    const located = lands.find((l) => l.gps_lat != null && l.gps_lng != null);
    const roads = lands.map((l) => l.front_road_width_ft ?? 0).filter((n) => n > 0);

    const progressValues = containers.map((c) => c.progress_pct).filter((n): n is number => n !== null);
    const brochure = docs
      .filter((d) => d.document_type === 'brochure')
      .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))[0];

    const showPrices = await publicShowsPrices();
    const detail: PublicProjectDetail = {
      ...card,
      container_kind: shape.container,
      container_label: shape.labels.container,
      container_label_plural: shape.labels.containerPlural,
      surroundings: (project.surroundings ?? '')
        .split(/\r?\n/)
        .map((s) => s.replace(/^[-•*]\s*/, '').trim())
        .filter(Boolean),
      amenities: [...project.amenities],
      total_land_area:
        project.total_land_area != null
          ? `${Number(project.total_land_area.toFixed(2))} ${project.total_land_area_unit ?? 'katha'}`
          : null,
      front_road_ft: roads.length ? Math.max(...roads) : null,
      map_url: located ? mapLink(located.gps_lat!, located.gps_lng!) : null,
      construction_planned: shape.item === 'share' && project.construction_after_sale === 'planned',
      containers,
      unit_types: unitTypeSummaries(shownUnits(project, loaded), shape),
      gallery: docs
        .filter((d) => d.document_type === 'gallery_image' && isPicture(d))
        // a file name ("render-03.png") is not a description; the project name is
        .map((d, i) => pictureOf(d, `${project.name} — photo ${i + 1}`)),
      brochure: brochure ? toDownload(brochure) : null,
      floor_plans: docs
        .filter((d) => d.document_type === 'layout_floor_plan' || d.document_type === 'layout_plan')
        .map(toDownload),
      payment_plan: (await db.installment_plan_templates.where('project_id').equals(project.id).toArray())
        .sort((a, b) => a.sequence_no - b.sequence_no)
        .filter((s) => s.percentage > 0)
        .map((s) => ({ label: s.label, percentage: s.percentage, schedule: s.schedule_type, month_count: s.month_count ?? null })),
      // an Upcoming project has not started, so a 0% section would only look like a stall
      progress_pct: built && progressValues.length && publicStage(project.status, shape) !== 'upcoming'
        ? Math.round(progressValues.reduce((s, n) => s + n, 0) / progressValues.length)
        : null,
    };
    if (showPrices) return detail;
    return {
      ...unpriced(detail),
      containers: detail.containers.map((c) => ({ ...c, units: c.units.map((u) => ({ ...u, price: null })) })),
      unit_types: detail.unit_types.map((t) => ({ ...t, price_from: null })),
      payment_plan: [],
    };
  },
};
