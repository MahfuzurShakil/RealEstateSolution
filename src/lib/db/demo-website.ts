'use client';

import { db } from './database';
import { documentRepository } from '../repositories/document.repository';

/*
 * Demo pictures for the public website (PUBLIC-WEBSITE-MASTER-PLAN.md §10.3).
 *
 * The demo seed draws a teal "Sample document" PNG for every attachment, which
 * is fine in Admin but looked broken as a hero image on the website. This gives
 * each published demo project a small gallery of stock photos instead — linked
 * by URL (nothing downloaded into IndexedDB) and noted as stock in Admin so
 * nobody mistakes them for the real building.
 *
 * Idempotent: a project that already has its stock gallery is left alone, so
 * an admin's own cover or gallery choices are never overwritten. Projects are
 * matched by their demo names; anything a user created is never touched.
 */

const STOCK_NOTE = 'Demo stock photo — replace with real photos of this project before going live.';

const u = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1600&q=70`;

const APT_BLOCK = 'photo-1574362848149-11496d93a7c7';
const APT_TOWER = 'photo-1545324418-cc1a3fa10c00';
const APT_FACADE = 'photo-1515263487990-61b07816b324';
const LIVING_1 = 'photo-1502672260266-1c1ef2d93688';
const LIVING_2 = 'photo-1522708323590-d24dbb6b0267';
const LIVING_3 = 'photo-1493809842364-78817add7ffb';
const LIVING_4 = 'photo-1501183638710-841dd1904471';
const LIVING_5 = 'photo-1560448204-e02f11c3d0e2';
const KITCHEN_1 = 'photo-1484154218962-a197022b5858';
const KITCHEN_2 = 'photo-1507089947368-19c1da9775ae';
const BEDROOM = 'photo-1505691938895-1758d7feb511';
const COMMERCIAL = 'photo-1481253127861-534498168948';
const OFFICE_1 = 'photo-1497366216548-37526070297c';
const OFFICE_2 = 'photo-1497366811353-6870744d04b2';
const FIELD = 'photo-1500382017468-9049fed747ef';
const GREEN_LAND = 'photo-1472214103451-9374bd1c798e';
const RIVERSIDE = 'photo-1506744038136-46273834b3fb';

/** First photo becomes the cover. */
const GALLERIES: Record<string, string[]> = {
  'Nokshi Green Residence': [APT_BLOCK, LIVING_1, KITCHEN_1, BEDROOM],
  'Nokshi Uttara Heights': [APT_TOWER, LIVING_2, KITCHEN_2, LIVING_4],
  'Nokshi Dhanmondi Court': [COMMERCIAL, OFFICE_1, LIVING_3, OFFICE_2],
  'Nokshi Kanchan Model Town': [FIELD, GREEN_LAND],
  'Birulia Riverside Share Project': [RIVERSIDE, FIELD],
  'Nokshi Lakeview Residence': [APT_FACADE, LIVING_5, LIVING_2, BEDROOM, KITCHEN_1],
};

export async function ensureDemoWebsitePictures(): Promise<void> {
  for (const [name, photos] of Object.entries(GALLERIES)) {
    const project = await db.projects.where('name').equals(name).first();
    if (!project) continue;

    const docs = await documentRepository.listForEntity('project', project.id);
    if (docs.some((d) => d.notes === STOCK_NOTE)) continue;

    for (const [i, id] of photos.entries()) {
      await documentRepository.create({
        entity_type: 'project',
        entity_id: project.id,
        document_type: 'gallery_image',
        custom_type_name: null,
        file_url: u(id),
        file_data: null,
        file_name: `stock-${i + 1}.jpg`,
        file_size: null,
        mime_type: 'image/jpeg',
        is_public: project.is_public,
        uploaded_by: null,
        uploaded_at: project.created_at,
        notes: STOCK_NOTE,
      });
    }

    // a generated "Sample document" PNG must not be anyone's cover or gallery picture
    for (const d of docs) {
      if (d.document_type === 'gallery_image' && d.file_data && d.mime_type === 'image/png' && d.is_public) {
        await documentRepository.setPublic(d.id, false);
      }
    }
    await db.projects.update(project.id, { cover_image_url: u(photos[0]), cover_image_document_id: null });
  }
}

const SITE_PHOTOS = [
  'photo-1541888946425-d81bb19240f5', // site from above, crew on the slab
  'photo-1504307651254-35680f356dfd', // rod binding
  'photo-1621905251189-08b45d6a269e', // finishing work
];

/**
 * The demo's site photos are generated PNGs too. Swap each one for a stock
 * construction photo (linked by URL), keeping its date, tower and public flag.
 * Matched by the demo seed's own file names (`progress-…d.png`), so a photo an
 * engineer uploaded is never touched; a no-op once swapped.
 */
export async function ensureDemoSitePhotos(): Promise<void> {
  const docs = await db.documents.where('document_type').equals('progress_photo').toArray();
  const generated = docs
    .filter((d) => d.file_data && d.mime_type === 'image/png' && /^progress-.+-\d+d\.png$/.test(d.file_name ?? ''))
    .sort((a, b) => a.uploaded_at.localeCompare(b.uploaded_at));
  for (const [i, d] of generated.entries()) {
    const finishing = /finish/i.test(d.file_name ?? '');
    const id = finishing ? SITE_PHOTOS[2] : SITE_PHOTOS[i % 2];
    await db.documents.update(d.id, {
      file_data: null,
      file_url: u(id),
      file_name: (d.file_name ?? 'site-photo').replace(/\.png$/, '.jpg'),
      mime_type: 'image/jpeg',
      file_size: null,
      notes: d.notes ? `${d.notes} · ${STOCK_NOTE}` : STOCK_NOTE,
    });
  }
}

/**
 * Website card text for the sample company (W6). Only fills a row whose
 * website fields have never been saved (`undefined`, not `null`): once the
 * Website card is saved — even with blanks — the user's choice stands.
 */
export async function ensureDemoWebsiteText(): Promise<void> {
  const settings = (await db.company_settings.limit(1).toArray())[0];
  // the sample company only: a real client's row never gets demo text
  if (!settings || settings.company_name !== 'Nokshi Properties Ltd.' || settings.about_text !== undefined) return;
  await db.company_settings.update(settings.id, {
    website_tagline: 'Homes with clear papers, built in Dhaka since 2008',
    about_text: [
      'Nokshi Properties started in 2008 with a single six-storey building in Uttara, built on land owned by three brothers who wanted to stay on as neighbours. They still live there.',
      'Today we develop apartments, serviced plots and land shares across Dhaka — usually together with the landowners, who keep a share of what is built.',
      'What has not changed is how we sell: every paper shown before booking, the price written down, and progress photos published as the work goes on.',
    ].join('\n\n'),
    office_hours: 'Sat–Thu, 10am–7pm',
    office_map_url: 'https://www.google.com/maps?q=23.7937,90.4066',
    facebook_url: 'https://facebook.com/',
    youtube_url: 'https://youtube.com/',
    established_year: 2008,
    rehab_member_no: '1187',
    public_show_prices: true,
  });
}

const CONTENT_FLAG = 'demo-website-content-seeded';

/**
 * Sample testimonials, team, awards and FAQ (W7) for the sample company.
 * Seeded once per demo load: the flag stops a user who deliberately emptied
 * a list from getting the samples back on the next visit, and "Reload sample
 * data" (which clears the tables and the flag) brings them back.
 */
export async function ensureDemoWebsiteContent(): Promise<void> {
  try {
    if (localStorage.getItem(CONTENT_FLAG) === '1') return;
  } catch {
    return;
  }
  const settings = (await db.company_settings.limit(1).toArray())[0];
  if (!settings || settings.company_name !== 'Nokshi Properties Ltd.') return;
  const counts = await Promise.all([db.testimonials.count(), db.team_members.count(), db.awards.count(), db.faq_items.count()]);
  if (counts.some((n) => n > 0)) return;

  const projectId = async (name: string) => (await db.projects.toArray()).find((p) => p.name === name)?.id ?? null;
  const now = new Date().toISOString();
  const base = (i: number) => ({ id: crypto.randomUUID(), created_at: now, updated_at: now, created_by: null, is_published: true, sort_order: i + 1 });

  await db.testimonials.bulkAdd([
    {
      ...base(0),
      buyer_name: 'Farhana Akter',
      buyer_detail: 'Flat owner, Nokshi Green Residence',
      project_id: await projectId('Nokshi Green Residence'),
      quote: 'They showed us every land paper at the site office before we paid a taka. Two years on, the instalments and the handover date are exactly as written in our agreement.',
      rating: 5,
      photo_url: null,
    },
    {
      ...base(1),
      buyer_name: 'Mahbub Rahman',
      buyer_detail: 'Bought from Riyadh',
      project_id: null,
      quote: 'I live in Saudi Arabia and booked after a video call on WhatsApp. My brother signed with a power of attorney, and I get the progress photos every month.',
      rating: 5,
      photo_url: null,
    },
    {
      ...base(2),
      buyer_name: 'Shirin & Kamal Hossain',
      buyer_detail: 'Plot owners, Kanchan Model Town',
      project_id: await projectId('Nokshi Kanchan Model Town'),
      quote: 'The plot was measured with us on site, the road was built as promised, and the mutation was done within weeks of registration.',
      rating: 4,
      photo_url: null,
    },
  ]);

  await db.team_members.bulkAdd([
    { ...base(0), name: 'Abdul Karim', title: 'Managing Director', bio: 'Founded the company in 2008 after twenty years in civil construction.', photo_url: null },
    { ...base(1), name: 'Nasrin Sultana', title: 'Director, Sales', bio: 'Leads the sales desk and every buyer’s agreement, from booking to registration.', photo_url: null },
    { ...base(2), name: 'Engr. Tanvir Ahmed', title: 'Head of Construction', bio: 'Structural engineer; runs all our sites and the monthly progress reports.', photo_url: null },
    { ...base(3), name: 'Rezaul Haque', title: 'Head of Land', bio: 'Checks every land paper and works with landowners on joint ventures.', photo_url: null },
  ]);

  await db.awards.bulkAdd([
    { ...base(0), kind: 'membership', title: 'Member, Real Estate & Housing Association of Bangladesh', issuer: 'REHAB', year: 2010 },
    { ...base(1), kind: 'certification', title: 'ISO 9001:2015 Quality Management', issuer: 'Bureau Veritas', year: 2022 },
    { ...base(2), kind: 'award', title: 'Best Mid-size Residential Project', issuer: 'REHAB Fair', year: 2024 },
  ]);

  // the built-in buyer questions become editable rows
  const { en } = await import('../../components/public/i18n/en');
  const topics = ['buying', 'papers', 'payment', 'payment', 'papers', 'abroad'] as const;
  await db.faq_items.bulkAdd(
    en.home.faq.items.map((item, i) => ({ ...base(i), category: topics[i] ?? 'other', question: item.q, answer: item.a })),
  );

  if ((await db.land_offers.count()) === 0) {
    const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
    await db.land_offers.bulkAdd([
      {
        id: crypto.randomUUID(),
        created_at: day(1),
        updated_at: day(1),
        created_by: null,
        code: 'LOF-2026-001',
        owner_name: 'Habibur Rahman',
        phone: '01713-556677',
        location: 'Sector 14, Uttara — two plots from the lake road',
        land_size: 6,
        land_size_unit: 'katha',
        front_road_width_ft: 25,
        offer_type: 'joint_venture',
        papers: ['deed', 'khatian', 'mutation', 'land_tax'],
        message: 'Inherited with my two sisters; we all want to keep flats in the building.',
        status: 'new',
        land_id: null,
        notes: null,
        page_url: '/landowners',
      },
      {
        id: crypto.randomUUID(),
        created_at: day(5),
        updated_at: day(3),
        created_by: null,
        code: 'LOF-2026-002',
        owner_name: 'Selina Parvin',
        phone: '+44 7700 900123',
        location: 'Bashundhara R/A, Block G',
        land_size: 5,
        land_size_unit: 'katha',
        front_road_width_ft: 30,
        offer_type: 'either',
        papers: ['deed', 'khatian'],
        message: 'I live in London. Please call in the evening UK time.',
        status: 'contacted',
        land_id: null,
        notes: 'Called 2 days ago; site visit planned for Saturday.',
        page_url: '/landowners',
      },
    ]);
  }

  try {
    localStorage.setItem(CONTENT_FLAG, '1');
  } catch {
    /* private mode: the empty-table check above still prevents duplicates */
  }
}

/** Called by `clearDemoData`, so "Reload sample data" seeds the samples again. */
export function forgetDemoWebsiteContent(): void {
  try {
    localStorage.removeItem(CONTENT_FLAG);
  } catch {
    /* nothing to forget */
  }
}
