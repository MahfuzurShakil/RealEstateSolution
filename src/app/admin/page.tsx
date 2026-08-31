'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { Building2, FileText, Layers, Map, Users } from 'lucide-react';
import { DemoDataCard } from '@/components/admin/DemoDataCard';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  documentRepository,
  landRepository,
  landownerRepository,
  projectRepository,
  towerRepository,
  unitRepository,
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
      projects: await projectRepository.count(),
      towers: await towerRepository.count(),
      units: await unitRepository.count(),
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
      label: 'Projects',
      value: counts?.projects,
      icon: Building2,
      tint: 'bg-blue-100 text-blue-600',
    },
    {
      label: 'Units',
      value: counts?.units,
      icon: Layers,
      tint: 'bg-emerald-100 text-emerald-600',
    },
    {
      label: 'Documents',
      value: counts?.documents,
      icon: FileText,
      tint: 'bg-violet-100 text-violet-600',
    },
  ];

  return (
    <>
      <PageHeader
        title={`Hello, ${userName}`}
        subtitle="Modules 1 and 2 are live — the rest follow the roadmap, one at a time."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
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

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <DemoDataCard />

      <Card>
        <h2 className="text-base font-semibold text-ink">What is wired up</h2>
        <ul className="mt-3 space-y-2 text-sm text-ink-muted">
          <li>• Shared IndexedDB (Dexie) — one database for both portals</li>
          <li>• Tables: documents, lookup_values, company_settings, lands, landowners, land_owner_mapping, land_jv_details, projects, land_project_mapping, towers, units</li>
          <li>• Repository layer — UI never calls Dexie directly</li>
          <li>• Admin shell: sidebar groups for all eight modules, topbar with role simulation</li>
          <li>• Module 1 — Land Management, preloaded with sample records</li>
          <li>• Module 2 — Project Creation: towers, bulk unit generation, JV allocation check</li>
        </ul>
      </Card>
      </div>
    </>
  );
}
