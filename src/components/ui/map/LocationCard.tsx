'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { ExternalLink, Expand, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';

const LeafletMap = dynamic(() => import('./LeafletMap').then((m) => m.LeafletMap), {
  ssr: false,
  loading: () => (
    <div className="grid h-[220px] w-full place-items-center rounded-xl bg-slate-100 text-sm text-ink-muted">
      Loading map…
    </div>
  ),
});

/**
 * Read-only location card for a detail page: a small pinned map, expandable to
 * a full-size interactive dialog, plus a link out to OpenStreetMap.
 */
export function LocationCard({
  lat,
  lng,
  title,
  address,
}: {
  lat?: number | null;
  lng?: number | null;
  title: string;
  address?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (lat == null || lng == null) {
    return (
      <Card>
        <CardHeader title="Location" />
        <p className="text-sm text-ink-muted">
          No coordinates recorded. Add a pin from the edit form to show this land on the map.
        </p>
      </Card>
    );
  }

  const point: [number, number] = [lat, lng];
  const osmUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;

  return (
    <>
      <Card>
        <CardHeader
          title="Location"
          action={
            <Button variant="outline" size="sm" onClick={() => setExpanded(true)}>
              <Expand className="size-4" /> Expand
            </Button>
          }
        />
        <div className="overflow-hidden rounded-xl border border-hairline">
          <LeafletMap
            center={point}
            zoom={16}
            marker={point}
            interactive={false}
            className="h-[220px] w-full"
          />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="inline-flex min-w-0 items-center gap-1.5 text-xs text-ink-muted">
            <MapPin className="size-3.5 shrink-0 text-admin-600" />
            <span className="truncate">
              {lat.toFixed(5)}, {lng.toFixed(5)}
            </span>
          </p>
          <a
            href={osmUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-admin-700 hover:underline"
          >
            Open in OpenStreetMap <ExternalLink className="size-3.5" />
          </a>
        </div>
      </Card>

      <Modal
        open={expanded}
        title={title}
        subtitle={address}
        icon={MapPin}
        size="xl"
        onClose={() => setExpanded(false)}
      >
        <div className="overflow-hidden rounded-xl border border-hairline">
          <LeafletMap center={point} zoom={16} marker={point} className="h-[65vh] w-full" />
        </div>
      </Modal>
    </>
  );
}
