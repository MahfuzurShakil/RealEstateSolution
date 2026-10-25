'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { publicContentRepository, type PublicCompanyInfo } from '@/lib/repositories/public/content.public.repository';

/** Company contact facts for the header, footer and WhatsApp button; undefined while loading. */
export function useCompanyInfo(): PublicCompanyInfo | undefined {
  return useLiveQuery(() => publicContentRepository.company(), []);
}
