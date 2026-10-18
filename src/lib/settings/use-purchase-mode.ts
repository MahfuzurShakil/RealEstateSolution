'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import type { PurchaseMode } from '../db/types';
import { purchaseModeOf, showsDirectPurchase, showsProcurement } from '../domain/construction-cost';
import { companySettingsRepository } from '../repositories';

/**
 * Company Settings → Purchase mode (DIRECT-PURCHASE-PLAN.md §7). Decides
 * which buying screens are shown; `undefined` while settings load, so callers
 * hide both paths for a moment rather than flash the wrong one.
 */
export function usePurchaseMode(): {
  mode: PurchaseMode | undefined;
  procurement: boolean;
  direct: boolean;
} {
  const settings = useLiveQuery(async () => (await companySettingsRepository.get()) ?? null, []);
  if (settings === undefined) return { mode: undefined, procurement: false, direct: false };
  const mode = purchaseModeOf(settings?.purchase_mode);
  return { mode, procurement: showsProcurement(mode), direct: showsDirectPurchase(mode) };
}
