import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/database';
import { publicBlogRepository } from './blog.public.repository';
import { publicContentRepository } from './content.public.repository';
import { publicInquiryRepository } from './inquiry.public.repository';
import { progressPublicRepository } from './progress.public.repository';
import { publicProjectRepository } from './project.public.repository';

/*
 * The public whitelist (AGENTS.md, Public Portal v2.0 §1): nothing internal
 * reaches the website. Every private field below holds a "LEAK" marker or a
 * 777xxx number, and every row also carries a column no repository knows
 * about (`leak_probe`) — the column someone adds next month. Each public
 * reader's whole output is then searched for any of them.
 */

const LEAK = /LEAK|leak_probe|777\d{3}/;
const probe = { leak_probe: 'LEAK-new-column' };
const NOW = '2026-01-01T00:00:00.000Z';
const base = (id: string) => ({ id, created_at: NOW, updated_at: NOW, created_by: 'LEAK-creator', ...probe });

const AVAILABLE_PRICE = 5_250_000;

// rows are cast: they carry columns the types do not know about, on purpose
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rows = (list: object[]) => list as any[];

async function seed(showPrices: boolean) {
  await Promise.all(db.tables.map((t) => t.clear()));

  await db.company_settings.bulkAdd(rows([{
    ...base('co'),
    company_name: 'Sample Co',
    phone: '01711000000',
    default_currency: 'BDT',
    tax_id: 'LEAK-tax-id',
    notes: 'LEAK-company-notes',
    purchase_mode: 'LEAK-mode',
    public_show_prices: showPrices,
  }]));
  await db.users.bulkAdd(rows([{
    ...base('author'),
    name: 'Rahim Writer',
    phone: 'LEAK-user-phone',
    email: 'LEAK@example.test',
    password_hash: 'LEAK-hash',
    role: 'management',
    status: 'active',
  }]));

  const project = {
    ...base('p1'),
    code: 'PRJ-2026-001',
    name: 'Green Court',
    project_type: 'apartment',
    location_summary: 'Bashundhara, Dhaka',
    status: 'under_construction',
    sales_status: 'open',
    is_public: true,
    is_featured: true,
    amenities: ['Lift'],
    surroundings: 'School nearby',
    project_manager: 'LEAK-manager',
    architect: 'LEAK-architect',
    est_avg_rate: 777001,
    est_saleable_area: 777011,
    contingency_pct: 777012,
    land_id: 'LEAK-land-id',
    cover_image_url: 'https://img.example.test/cover.jpg',
  };
  const hidden = { ...project, id: 'p2', code: 'PRJ-2026-002', name: 'LEAK-unpublished', is_public: false, is_featured: false };
  const notOpen = { ...project, id: 'p3', code: 'PRJ-2026-003', name: 'LEAK-not-open', sales_status: 'not_open' };
  await db.projects.bulkAdd(rows([project, hidden, notOpen]));

  await db.towers.bulkAdd(rows([
    { ...base('t1'), project_id: 'p1', name: 'Tower A', floor_count: 10, status: 'under_construction', current_progress_pct: 40 },
    { ...base('t2'), project_id: 'p2', name: 'LEAK-hidden-tower', floor_count: 5, status: 'planning' },
  ]));

  const unit = { tower_id: 't1', floor: 3, unit_type: '3 Bed', bedroom_count: 3, size_sqft: 1450, for_sale_by: 'company', parking_allocated: 'LEAK-parking', allocation_type: 'LEAK-allocation' };
  await db.units.bulkAdd(rows([
    { ...base('u1'), ...unit, code: 'A-3', status: 'available', base_price: AVAILABLE_PRICE },
    { ...base('u2'), ...unit, code: 'B-3', status: 'booked', base_price: 777002 },
    { ...base('u3'), ...unit, code: 'C-3', status: 'available', base_price: 777003, for_sale_by: 'owner_direct', allocated_to_owner_id: 'LEAK-owner' },
    { ...base('u4'), ...unit, code: 'LEAK-draft-unit', status: 'draft', base_price: 777004 },
    { ...base('u5'), ...unit, tower_id: 't2', code: 'LEAK-hidden-unit', status: 'available', base_price: 777005 },
  ]));

  await db.lands.bulkAdd(rows([{
    ...base('l1'),
    code: 'LND-2026-001',
    name: 'LEAK-land-name',
    location_division: 'Dhaka',
    location_district: 'Dhaka',
    location_area: 'LEAK-area',
    mouza: 'LEAK-mouza',
    dag_number: 'LEAK-dag',
    land_size: 10,
    land_size_unit: 'katha',
    asking_price: 777006,
    final_agreed_amount: 777007,
    gps_lat: 23.8,
    gps_lng: 90.4,
    front_road_width_ft: 40,
    acquisition_type: 'joint_venture',
    status: 'acquired',
    remarks: 'LEAK-remarks',
  }]));
  await db.land_project_mapping.bulkAdd(rows([{ ...base('m1'), land_id: 'l1', project_id: 'p1' }]));

  const doc = { entity_type: 'project', entity_id: 'p1', uploaded_by: 'LEAK-uploader', uploaded_at: NOW, notes: 'LEAK-doc-notes' };
  await db.documents.bulkAdd(rows([
    { ...base('d1'), ...doc, document_type: 'gallery_image', file_url: 'https://img.example.test/g1.jpg', is_public: true },
    { ...base('d2'), ...doc, document_type: 'brochure', file_url: 'https://files.example.test/brochure.pdf', file_name: 'brochure.pdf', is_public: true },
    { ...base('d3'), ...doc, document_type: 'brochure', file_url: 'https://files.example.test/LEAK-private.pdf', file_name: 'LEAK-private.pdf', is_public: false, uploaded_at: '2026-06-01T00:00:00.000Z' },
    { ...base('d4'), ...doc, document_type: 'gallery_image', file_url: 'https://img.example.test/LEAK-private.jpg', is_public: false },
  ]));
  await db.installment_plan_templates.bulkAdd(rows([
    { ...base('ip1'), project_id: 'p1', sequence_no: 1, label: 'On booking', percentage: 20, schedule_type: 'on_booking' },
  ]));

  await db.blog_posts.bulkAdd(rows([
    { ...base('b1'), slug: 'buying-guide', title: 'Buying guide', excerpt: 'How to buy', content: 'One.\n\nTwo.', author_id: 'author', status: 'published', published_at: '2026-01-01' },
    { ...base('b2'), slug: 'draft-post', title: 'LEAK-draft', excerpt: 'x', content: 'x', status: 'draft', published_at: null },
    { ...base('b3'), slug: 'future-post', title: 'LEAK-scheduled', excerpt: 'x', content: 'x', status: 'published', published_at: '2999-01-01' },
  ]));

  const ordered = { sort_order: 1 };
  await db.testimonials.bulkAdd(rows([
    { ...base('ts1'), ...ordered, buyer_name: 'Karim', quote: 'Good', project_id: 'p2', is_published: true },
    { ...base('ts2'), ...ordered, buyer_name: 'LEAK-unpublished', quote: 'x', is_published: false },
  ]));
  await db.team_members.bulkAdd(rows([
    { ...base('tm1'), ...ordered, name: 'Nadia', title: 'Director', is_published: true },
    { ...base('tm2'), ...ordered, name: 'LEAK-unpublished', title: 'x', is_published: false },
  ]));
  await db.awards.bulkAdd(rows([
    { ...base('a1'), ...ordered, kind: 'membership', title: 'REHAB', is_published: true },
    { ...base('a2'), ...ordered, kind: 'award', title: 'LEAK-unpublished', is_published: false },
  ]));
  await db.faq_items.bulkAdd(rows([
    { ...base('f1'), ...ordered, category: 'buying', question: 'Q?', answer: 'A.', is_published: true },
    { ...base('f2'), ...ordered, category: 'buying', question: 'LEAK-unpublished', answer: 'x', is_published: false },
  ]));
}

/** Everything a visitor's browser can get from the public layer. */
async function everything() {
  return {
    list: await publicProjectRepository.list(),
    featured: await publicProjectRepository.featured(),
    stats: await publicProjectRepository.stats(),
    locations: await publicProjectRepository.locations(),
    detail: await publicProjectRepository.detail('PRJ-2026-001'),
    company: await publicContentRepository.company(),
    testimonials: await publicContentRepository.testimonials(),
    team: await publicContentRepository.team(),
    awards: await publicContentRepository.awards(),
    faqs: await publicContentRepository.faqs(),
    posts: await publicBlogRepository.list(),
    post: await publicBlogRepository.detail('buying-guide'),
    towers: await progressPublicRepository.towerProgressForProject('p1'),
    photos: await progressPublicRepository.photoFeed(),
    progress: await progressPublicRepository.projectProgressPct('p1'),
  };
}

const text = (v: unknown) => JSON.stringify(v);

describe('public repositories whitelist', () => {
  describe('prices shown', () => {
    beforeEach(() => seed(true));

    it('returns no private field, unknown column or hidden row', async () => {
      const out = await everything();
      // the seed is really being read, so an empty result cannot pass by accident
      expect(out.list.map((c) => c.code)).toEqual(['PRJ-2026-001']);
      expect(out.detail?.containers[0].units.map((u) => u.code).sort()).toEqual(['A-3', 'B-3', 'C-3']);
      expect(out.posts.map((p) => p.slug)).toEqual(['buying-guide']);
      expect(out.post?.author).toBe('Rahim Writer');
      expect(text(out)).not.toMatch(LEAK);
    });

    it('prices only units the company still has for sale', async () => {
      const units = (await publicProjectRepository.detail('PRJ-2026-001'))!.containers[0].units;
      const price = Object.fromEntries(units.map((u) => [u.code, u.price]));
      expect(price).toEqual({ 'A-3': AVAILABLE_PRICE, 'B-3': null, 'C-3': null });
    });

    it('answers an unpublished or not-open project and an unpublished post like a missing one', async () => {
      expect(await publicProjectRepository.detail('PRJ-2026-002')).toBeNull();
      expect(await publicProjectRepository.detail('PRJ-2026-003')).toBeNull();
      expect(await publicProjectRepository.detail('PRJ-0000-000')).toBeNull();
      expect(await publicBlogRepository.detail('draft-post')).toBeNull();
      expect(await publicBlogRepository.detail('future-post')).toBeNull();
    });
  });

  describe('prices hidden (Website card switch off)', () => {
    beforeEach(() => seed(false));

    it('leaves no price, price filter or payment plan anywhere', async () => {
      const out = await everything();
      expect(out.detail).not.toBeNull();
      expect(text(out)).not.toMatch(LEAK);
      expect(text(out)).not.toContain(String(AVAILABLE_PRICE));
      expect(out.detail!.payment_plan).toEqual([]);
      // a budget filter would reveal prices by what it drops, so it is ignored
      const filtered = await publicProjectRepository.list({ price_bands: ['above_3cr'] });
      expect(filtered.map((c) => c.code)).toEqual(['PRJ-2026-001']);
    });
  });

  describe('public writes', () => {
    beforeEach(() => seed(true));

    it('tells the visitor only whether the enquiry was received', async () => {
      const input = { kind: 'enquiry' as const, name: 'Test Buyer', phone: '01711222333', project_code: 'PRJ-2026-001', unit_code: 'A-3' };
      const first = await publicInquiryRepository.submit(input);
      const repeat = await publicInquiryRepository.submit(input);
      expect(first).toEqual({ ok: true });
      expect(repeat).toEqual({ ok: true });
    });
  });
});
