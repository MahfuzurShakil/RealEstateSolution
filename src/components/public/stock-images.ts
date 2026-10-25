import type { ProjectType } from '@/lib/db/types';

/*
 * Free Unsplash photos for the demo (Design Reference B.2): the hero, the
 * "why us" band, and a stand-in cover for a project the admin has not given a
 * picture yet. Picked for Dhaka-style apartment blocks and open land — no
 * villas with pools, which no buyer here would recognise.
 */

const unsplash = (id: string, width = 1600) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=70`;

export const HERO_IMAGE = unsplash('photo-1460317442991-0ec209397118', 2000);
export const INTERIOR_IMAGE = unsplash('photo-1560448204-e02f11c3d0e2', 1200);

export const COVER_FALLBACK: Record<ProjectType, string> = {
  apartment: unsplash('photo-1545324418-cc1a3fa10c00', 900),
  mixed: unsplash('photo-1481253127861-534498168948', 900),
  commercial: unsplash('photo-1486406146926-c627a92ad1ab', 900),
  plot_development: unsplash('photo-1500382017468-9049fed747ef', 900),
  land_share: unsplash('photo-1500382017468-9049fed747ef', 900),
};
