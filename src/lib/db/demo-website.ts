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
