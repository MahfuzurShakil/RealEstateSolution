'use client';

import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Leaflet wrapper used by both the picker and the read-only map.
 *
 * Leaflet touches `window` at import time, so every consumer loads this file
 * through `next/dynamic` with `ssr: false`.
 */
export function LeafletMap({
  center,
  zoom = 15,
  marker,
  interactive = true,
  onPick,
  className = 'h-[400px] w-full',
}: {
  center: [number, number];
  zoom?: number;
  /** marker position; omit to show no pin */
  marker?: [number, number] | null;
  /** false renders a static preview (no drag/zoom) */
  interactive?: boolean;
  /** click or marker-drag handler — presence of this makes the map a picker */
  onPick?: (lat: number, lng: number) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onPickRef = useRef(onPick);

  // keep the latest handler reachable from Leaflet's own listeners without
  // re-creating the map on every render
  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  // Leaflet's default icon URLs assume a bundler-less setup; build our own pin
  // so nothing is fetched from an external host.
  const icon = useMemo(
    () =>
      L.divIcon({
        className: '',
        html: `<svg width="28" height="38" viewBox="0 0 28 38" xmlns="http://www.w3.org/2000/svg">
                 <path d="M14 0C6.3 0 0 6.3 0 14c0 10 14 24 14 24s14-14 14-24c0-7.7-6.3-14-14-14z" fill="#0d919c"/>
                 <circle cx="14" cy="14" r="5.5" fill="#ffffff"/>
               </svg>`,
        iconSize: [28, 38],
        iconAnchor: [14, 38],
      }),
    [],
  );

  // create the map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center,
      zoom,
      dragging: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      zoomControl: interactive,
      attributionControl: true,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      onPickRef.current?.(e.latlng.lat, e.latlng.lng);
    });

    mapRef.current = map;
    // the card animates in; let Leaflet re-measure once laid out
    setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep the view in sync
  useEffect(() => {
    mapRef.current?.setView(center, zoom);
  }, [center, zoom]);

  // keep the marker in sync
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!marker) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    if (!markerRef.current) {
      const m = L.marker(marker, { icon, draggable: Boolean(onPickRef.current) }).addTo(map);
      m.on('dragend', () => {
        const { lat, lng } = m.getLatLng();
        onPickRef.current?.(lat, lng);
      });
      markerRef.current = m;
    } else {
      markerRef.current.setLatLng(marker);
    }
  }, [marker, icon]);

  return <div ref={containerRef} className={className} />;
}

export default LeafletMap;
