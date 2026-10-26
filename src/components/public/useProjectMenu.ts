'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { areaOf } from '@/lib/domain/public-portal';
import { publicProjectRepository, type PublicProjectCard } from '@/lib/repositories/public/project.public.repository';

export interface ProjectMenu {
  types: { project_type: string; label: string; count: number }[];
  areas: { area: string; count: number }[];
  featured: PublicProjectCard | null;
  total: number;
}

/**
 * What the Projects menu offers: only types and areas that have a live
 * project right now, with counts — so every link in it returns results.
 */
export function useProjectMenu(): ProjectMenu | undefined {
  return useLiveQuery(async () => {
    const cards = (await publicProjectRepository.list()).filter((c) => c.stage !== 'completed');
    const types = new Map<string, { project_type: string; label: string; count: number }>();
    const areas = new Map<string, number>();
    for (const c of cards) {
      const t = types.get(c.project_type) ?? { project_type: c.project_type, label: c.type_label, count: 0 };
      t.count += 1;
      types.set(c.project_type, t);
      const area = areaOf(c.location_summary);
      if (area) areas.set(area, (areas.get(area) ?? 0) + 1);
    }
    return {
      types: [...types.values()],
      areas: [...areas.entries()].map(([area, count]) => ({ area, count })).sort((a, b) => b.count - a.count).slice(0, 8),
      featured: cards.find((c) => c.is_featured) ?? cards[0] ?? null,
      total: cards.length,
    };
  }, []);
}
