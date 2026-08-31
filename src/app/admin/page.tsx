'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { Building2, FileText, Map, Users } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  documentRepository,
  landRepository,
  landownerRepository,
  lookupRepository,
} from '@/lib/repositories';
import { useMockSession } from '@/lib/auth/mock-session';

/**
 * Placeholder dashboard — proves the shell, the Dexie connection and the
 * repository layer all work end to end. Real KPI cards (Design Reference A.4
 * Pattern 2) arrive with Module 8.
 */
export default function AdminDashboardPage() {
  const { userName } = useMockSession();

  const counts = useLiveQuery(
    async () => ({
      lands: await landRepository.count(),
      landowners: await landownerRepository.count(),
      documents: await documentRepository.count(),
      lookups: await lookupRepository.count(),
    }),
    [],
  );

  const tiles = [
    { label: 'Lands', value: counts?.lands, icon: Map, tint: 'bg-admin-100 text-admin-700' },
    {
      label: 'Landowners',
      value: counts?.landowners,
      icon: Users,
      tint: 'bg-orange-100 text-orange-600',
    },
    {
      label: 'Documents',
      value: counts?.documents,
      icon: FileText,
      tint: 'bg-blue-100 text-blue-600',
    },
    {
      label: 'Master data options',
      value: counts?.lookups,
      icon: Building2,
      tint: 'bg-emerald-100 text-emerald-600',
    },
  ];

  return (
    <>
      <PageHeader
        title={`Hello, ${userName}`}
        subtitle="Project setup complete — modules will be added one at a time."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(({ label, value, icon: Icon, tint }) => (
          <Card key={label}>
            <div className={`mb-4 grid size-11 place-items-center rounded-xl ${tint}`}>
              <Icon className="size-5" />
            </div>
            <p className="text-sm text-ink-muted">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{value ?? '—'}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <h2 className="text-base font-semibold text-ink">What is wired up</h2>
        <ul className="mt-3 space-y-2 text-sm text-ink-muted">
          <li>• Shared IndexedDB (Dexie) — one database for both portals</li>
          <li>• Tables: documents, lookup_values, company_settings, lands, landowners, land_owner_mapping, land_jv_details</li>
          <li>• Repository layer — UI never calls Dexie directly</li>
          <li>• Admin shell: sidebar groups for all eight modules, topbar with role simulation</li>
        </ul>
      </Card>
    </>
  );
}
