'use client';

import dynamic from 'next/dynamic';
import { Crosshair, MapPin, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { DEFAULT_CENTER } from './constants';

const LeafletMap = dynamic(() => import('./LeafletMap').then((m) => m.LeafletMap), {
  ssr: false,
  loading: () => (
    <div className="grid h-[400px] w-full place-items-center rounded-xl bg-slate-100 text-sm text-ink-muted">
      Loading map…
    </div>
  ),
});

/**
 * Pick a location on the map — clicking (or dragging the pin) fills the
 * latitude/longitude fields, and typing coordinates moves the pin. Both
 * directions stay in sync so the fields remain editable by hand.
 */
export function MapPicker({
  lat,
  lng,
  onChange,
}: {
  lat: string;
  lng: string;
  onChange: (lat: string, lng: string) => void;
}) {
  const parsedLat = Number.parseFloat(lat);
  const parsedLng = Number.parseFloat(lng);
  const hasPoint = Number.isFinite(parsedLat) && Number.isFinite(parsedLng);
  const point: [number, number] | null = hasPoint ? [parsedLat, parsedLng] : null;

  const round = (n: number) => n.toFixed(6);

  function useMyLocation() {
    navigator.geolocation?.getCurrentPosition((pos) =>
      onChange(round(pos.coords.latitude), round(pos.coords.longitude)),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">
          {hasPoint ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4 text-admin-600" />
              Pin set at {parsedLat.toFixed(5)}, {parsedLng.toFixed(5)}
            </span>
          ) : (
            'Click anywhere on the map to drop a pin — you can drag it to fine-tune.'
          )}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={useMyLocation}>
            <Crosshair className="size-4" /> Use my location
          </Button>
          {hasPoint && (
            <Button variant="ghost" size="sm" onClick={() => onChange('', '')}>
              <Trash2 className="size-4" /> Clear pin
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-hairline">
        <LeafletMap
          center={point ?? DEFAULT_CENTER}
          zoom={hasPoint ? 16 : 12}
          marker={point}
          onPick={(la, ln) => onChange(round(la), round(ln))}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="GPS Latitude">
          <TextInput
            type="number"
            step="0.000001"
            value={lat}
            placeholder="e.g. 23.813200"
            onChange={(e) => onChange(e.target.value, lng)}
          />
        </Field>
        <Field label="GPS Longitude">
          <TextInput
            type="number"
            step="0.000001"
            value={lng}
            placeholder="e.g. 90.424500"
            onChange={(e) => onChange(lat, e.target.value)}
          />
        </Field>
      </div>
    </div>
  );
}
