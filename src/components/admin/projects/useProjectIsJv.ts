'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { landProjectMappingRepository } from '@/lib/repositories';

/**
 * Whether any land under the project is a joint venture.
 *
 * Landowner allocation only exists on JV land (client walkthrough
 * 2026-10-10): land bought outright or inherited has no landowner share, so
 * the JV Allocation tab and the allocation fields stay out of the way.
 * `undefined` while loading.
 */
export function useProjectIsJv(projectId: string): boolean | undefined {
  return useLiveQuery(
    async () =>
      (await landProjectMappingRepository.landsForProject(projectId)).some(
        (l) => l.acquisition_type === 'joint_venture',
      ),
    [projectId],
  );
}
