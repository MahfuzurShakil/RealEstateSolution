'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';
import { formatPublicPrice } from '@/lib/domain/public-portal';
import { Taka } from '../ProjectCard';

/*
 * A developer instalment plan, not a bank mortgage: booking money, a down
 * payment at the sale agreement, equal monthly instalments while the building
 * goes up, and the last part at handover. No interest — that is how flats are
 * sold off-plan in Dhaka. The admin agreement holds the real terms; this only
 * lets a buyer see roughly what a month would cost.
 */

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: React.ReactNode;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{label}</span>
        <span className="text-lg font-semibold text-site-primary">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full accent-site-primary"
        style={{ background: `linear-gradient(to right, var(--color-site-primary) ${pct}%, var(--color-site-line) ${pct}%)` }}
      />
    </label>
  );
}

function Row({ label, amount, strong }: { label: string; amount: number; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-white/10 py-3.5 last:border-0">
      <span className={strong ? 'text-white' : 'text-white/70'}>{label}</span>
      <span className={strong ? 'text-2xl font-bold text-white' : 'text-lg font-medium text-white'}>
        <Taka text={formatPublicPrice(Math.round(amount))} />
      </span>
    </div>
  );
}

export function InstalmentPlanner({ startingPrice }: { startingPrice: number | null }) {
  const initial = startingPrice ? Math.round(startingPrice / 500_000) * 500_000 : 12_000_000;
  const [price, setPrice] = useState(Math.min(Math.max(initial, 3_000_000), 50_000_000));
  const [bookingPct, setBookingPct] = useState(10);
  const [downPct, setDownPct] = useState(20);
  const [handoverPct, setHandoverPct] = useState(10);
  const [months, setMonths] = useState(24);

  const booking = (price * bookingPct) / 100;
  const down = (price * downPct) / 100;
  const atHandover = (price * handoverPct) / 100;
  const instalmentTotal = Math.max(0, price - booking - down - atHandover);
  const monthly = instalmentTotal / months;
  const over = bookingPct + downPct + handoverPct > 100;

  return (
    <div className="grid overflow-hidden rounded-3xl bg-white shadow-xl shadow-slate-200 lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-7 p-7 md:p-10">
        <Slider
          label="Property price"
          value={price}
          min={3_000_000}
          max={50_000_000}
          step={500_000}
          display={<Taka text={formatPublicPrice(price)} />}
          onChange={setPrice}
        />
        <Slider label="Booking money" value={bookingPct} min={5} max={30} step={1} display={`${bookingPct}%`} onChange={setBookingPct} />
        <Slider label="Down payment at agreement" value={downPct} min={0} max={50} step={5} display={`${downPct}%`} onChange={setDownPct} />
        <Slider label="Paid at handover" value={handoverPct} min={0} max={30} step={5} display={`${handoverPct}%`} onChange={setHandoverPct} />
        <Slider label="Monthly instalments" value={months} min={6} max={60} step={6} display={`${months} months`} onChange={setMonths} />
      </div>

      <div className="flex flex-col bg-site-night p-7 text-white md:p-10">
        <p className="text-sm tracking-[0.2em] text-white/60 uppercase">Your payment plan</p>
        <div className="mt-6">
          <p className="text-white/70">Each month</p>
          <p className="text-5xl font-bold text-site-primary">
            {over ? '—' : <Taka text={formatPublicPrice(Math.round(monthly))} />}
          </p>
          <p className="mt-1 text-white/60">for {months} months, no interest</p>
        </div>
        <div className="mt-8">
          <Row label="Booking money" amount={booking} />
          <Row label="Down payment" amount={down} />
          <Row label={`${months} instalments`} amount={instalmentTotal} />
          <Row label="At handover" amount={atHandover} />
          <Row label="Total price" amount={price} strong />
        </div>
        <p className="mt-auto flex gap-2 pt-6 text-sm text-white/55">
          <Info className="mt-0.5 size-4 shrink-0" />
          {over
            ? 'Booking, down payment and handover add up to more than the price.'
            : 'An estimate only. Your sale agreement sets the actual amounts and dates; registration costs are separate.'}
        </p>
      </div>
    </div>
  );
}
