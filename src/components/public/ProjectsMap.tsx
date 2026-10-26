'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { formatPublicPrice } from '@/lib/domain/public-portal';
import type { PublicProjectCard } from '@/lib/repositories/public/project.public.repository';

/*
 * The listing's map view (master plan §7.2): a price pin per project, from the
 * linked land's GPS; a pin opens a small card linking to the project. Leaflet
 * touches `window` at import, so the listing loads this with `next/dynamic`.
 * Light CARTO tiles keep the brand colours in front; pins use the site tokens.
 */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export default function ProjectsMap({ cards, activeCode, onSelect }: { cards: PublicProjectCard[]; activeCode?: string | null; onSelect?: (code: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const markers = useRef(new Map<string, L.Marker>());

  useEffect(() => {
    if (!box.current || map.current) return;
    const m = L.map(box.current, { center: [23.81, 90.41], zoom: 11, scrollWheelZoom: false });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    setTimeout(() => m.invalidateSize(), 0);
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const group = layer.current;
    if (!m || !group) return;
    group.clearLayers();
    markers.current.clear();
    const pinned = cards.filter((c) => c.point);
    for (const c of pinned) {
      const label = c.price_from ? formatPublicPrice(c.price_from) : c.type_label;
      const icon = L.divIcon({
        className: '',
        html: `<span class="site-pin">${esc(label)}</span>`,
        iconSize: undefined,
        iconAnchor: [0, 0],
      });
      const marker = L.marker([c.point!.lat, c.point!.lng], { icon, title: c.name, keyboard: true })
        .bindPopup(
          `<a class="site-pop" href="/projects/${encodeURIComponent(c.code)}">
             <strong>${esc(c.name)}</strong>
             <span>${esc(c.location_summary ?? '')}</span>
             <em>${c.price_from ? `from ${esc(formatPublicPrice(c.price_from))}` : esc(c.type_label)} · ${c.available_count} ${esc(c.available_count === 1 ? c.item_label_singular : c.item_label)} left</em>
           </a>`,
          { closeButton: false, offset: [0, -6] },
        )
        .on('click', () => onSelect?.(c.code))
        .addTo(group);
      markers.current.set(c.code, marker);
    }
    if (pinned.length === 1) m.setView([pinned[0].point!.lat, pinned[0].point!.lng], 14);
    else if (pinned.length > 1) m.fitBounds(L.latLngBounds(pinned.map((c) => [c.point!.lat, c.point!.lng] as [number, number])), { padding: [48, 48], maxZoom: 14 });
  }, [cards, onSelect]);

  // a card hovered in the list lifts its pin
  useEffect(() => {
    for (const [code, marker] of markers.current) {
      marker.getElement()?.querySelector('.site-pin')?.classList.toggle('is-active', code === activeCode);
      if (code === activeCode) marker.setZIndexOffset(1000);
      else marker.setZIndexOffset(0);
    }
  }, [activeCode, cards]);

  return <div ref={box} className="size-full" aria-label="Map of projects" />;
}
