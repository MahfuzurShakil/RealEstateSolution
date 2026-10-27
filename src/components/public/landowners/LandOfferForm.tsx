'use client';

import { useId, useState } from 'react';
import { CircleCheck, Send } from 'lucide-react';
import { LAND_OFFER_PAPERS, LAND_OFFER_TYPES, LAND_SIZE_UNITS, type LandOfferPaper, type LandOfferType, type LandSizeUnit } from '@/lib/db/types';
import { isBdMobile, isIntlPhone } from '@/lib/domain/public-enquiry';
import { publicInquiryRepository, type PublicLandOfferError } from '@/lib/repositories/public/inquiry.public.repository';
import { cn } from '@/lib/utils/cn';
import { en } from '../i18n/en';
import { Button } from '../ui/Button';

const t = en.landowners.form;

const input =
  'h-12 w-full rounded-xl border border-site-line bg-white px-4 text-base text-site-ink placeholder:text-site-faint transition-colors focus:border-site-primary focus:outline-none aria-[invalid=true]:border-site-danger';
const chip =
  'rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-site-primary';

const positiveOrBlank = (v: string) => !v.trim() || (Number.isFinite(Number(v)) && Number(v) > 0);

/*
 * The /landowners offer form (master plan §7.4, W8). Inline on the page rather
 * than in the enquiry modal: it is the page's whole purpose, and it has more
 * fields than a popup should carry. Writes a land offer, never a land.
 */
export function LandOfferForm() {
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;
  const [f, setF] = useState({ name: '', phone: '', location: '', size: '', unit: 'katha' as LandSizeUnit, road: '', message: '', website: '' });
  const [offerType, setOfferType] = useState<LandOfferType>('joint_venture');
  const [papers, setPapers] = useState<LandOfferPaper[]>([]);
  const [errors, setErrors] = useState<Partial<Record<PublicLandOfferError | 'failed', string>>>({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((v) => ({ ...v, [k]: e.target.value }));

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const found: typeof errors = {};
    if (f.name.trim().length < 2) found.name = t.errors.name;
    if (!isBdMobile(f.phone) && !isIntlPhone(f.phone)) found.phone = t.errors.phone;
    if (f.location.trim().length < 3) found.location = t.errors.location;
    if (!positiveOrBlank(f.size)) found.size = t.errors.size;
    if (!positiveOrBlank(f.road)) found.road = t.errors.road;
    setErrors(found);
    const first = (['name', 'phone', 'location', 'size', 'road'] as const).find((k) => found[k]);
    if (first) {
      document.getElementById(id(first))?.focus();
      return;
    }
    setSending(true);
    try {
      const result = await publicInquiryRepository.submitLandOffer({
        owner_name: f.name,
        phone: f.phone,
        location: f.location,
        land_size: f.size,
        land_size_unit: f.unit,
        front_road_width_ft: f.road,
        offer_type: offerType,
        papers,
        message: f.message,
        website: f.website,
        page_url: window.location.pathname,
      });
      if (result.ok) setDone(true);
      else setErrors({ [result.field]: t.errors[result.field] });
    } catch {
      setErrors({ failed: t.errors.failed });
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-[24px] border border-site-line bg-white p-8 text-center shadow-site-2 md:p-12" role="status">
        <CircleCheck className="mx-auto size-14 text-site-primary" strokeWidth={1.6} aria-hidden />
        <p className="mt-4 text-2xl font-semibold">{t.doneTitle}</p>
        <p className="mt-2 text-site-muted">{t.doneBody}</p>
        <Button
          variant="outline"
          className="mt-8"
          onClick={() => {
            setF({ name: '', phone: '', location: '', size: '', unit: 'katha', road: '', message: '', website: '' });
            setPapers([]);
            setDone(false);
          }}
        >
          {t.another}
        </Button>
      </div>
    );
  }

  const label = (k: string, text: string, optional = false) => (
    <label htmlFor={id(k)} className="mb-1.5 block text-sm font-semibold">
      {text}
      {optional && <span className="font-normal text-site-muted"> ({t.optional})</span>}
    </label>
  );
  const msg = (k: PublicLandOfferError, hint?: string) =>
    errors[k] ? (
      <p id={`${id(k)}-msg`} className="mt-1.5 text-sm text-site-danger" role="alert">
        {errors[k]}
      </p>
    ) : hint ? (
      <p id={`${id(k)}-msg`} className="mt-1.5 text-sm text-site-muted">
        {hint}
      </p>
    ) : null;

  return (
    <form onSubmit={submit} noValidate className="relative rounded-[24px] border border-site-line bg-white p-6 shadow-site-2 md:p-8">
      <h2 className="text-2xl font-semibold md:text-[28px]">{t.title}</h2>
      <p className="mt-2 text-site-muted">{t.lead}</p>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <div>
          {label('name', t.name)}
          <input id={id('name')} value={f.name} onChange={set('name')} autoComplete="name" aria-invalid={!!errors.name} aria-describedby={`${id('name')}-msg`} className={input} />
          {msg('name')}
        </div>
        <div>
          {label('phone', t.phone)}
          <input id={id('phone')} type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} aria-invalid={!!errors.phone} aria-describedby={`${id('phone')}-msg`} className={cn(input, 'tabular')} />
          {msg('phone', t.phoneHint)}
        </div>
        <div className="sm:col-span-2">
          {label('location', t.location)}
          <input id={id('location')} value={f.location} onChange={set('location')} aria-invalid={!!errors.location} aria-describedby={`${id('location')}-msg`} className={input} />
          {msg('location', t.locationHint)}
        </div>
        <div>
          {label('size', t.size, true)}
          <div className="flex gap-2">
            <input id={id('size')} inputMode="decimal" value={f.size} onChange={set('size')} aria-invalid={!!errors.size} aria-describedby={`${id('size')}-msg`} className={cn(input, 'tabular min-w-0 flex-1')} />
            <select aria-label={t.unit} value={f.unit} onChange={set('unit')} className={cn(input, 'w-32 shrink-0')}>
              {LAND_SIZE_UNITS.map((u) => (
                <option key={u} value={u}>
                  {t.units[u]}
                </option>
              ))}
            </select>
          </div>
          {msg('size')}
        </div>
        <div>
          {label('road', t.road, true)}
          <input id={id('road')} inputMode="decimal" value={f.road} onChange={set('road')} aria-invalid={!!errors.road} aria-describedby={`${id('road')}-msg`} className={cn(input, 'tabular')} />
          {msg('road')}
        </div>

        <fieldset className="min-w-0 sm:col-span-2">
          <legend className="mb-1.5 text-sm font-semibold">{t.offerType}</legend>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t.offerType}>
            {LAND_OFFER_TYPES.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={offerType === k}
                onClick={() => setOfferType(k)}
                className={cn(chip, offerType === k ? 'border-site-primary bg-site-primary text-white' : 'border-site-line bg-white hover:border-site-primary')}
              >
                {t.offerTypes[k]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="min-w-0 sm:col-span-2">
          <legend className="mb-1.5 text-sm font-semibold">
            {t.papers} <span className="font-normal text-site-muted">({t.optional})</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {LAND_OFFER_PAPERS.map((p) => {
              const on = papers.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPapers((list) => (on ? list.filter((x) => x !== p) : [...list, p]))}
                  className={cn(chip, on ? 'border-site-primary bg-site-primary-soft text-site-primary-dark' : 'border-site-line bg-white hover:border-site-primary')}
                >
                  {t.paperLabels[p]}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="sm:col-span-2">
          {label('message', t.message, true)}
          <textarea id={id('message')} rows={3} value={f.message} onChange={set('message')} className={cn(input, 'h-auto resize-none py-3')} />
        </div>
      </div>

      {/* honeypot: off-screen, out of the tab order, ignored by screen readers */}
      <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" name="website" value={f.website} onChange={set('website')} />
        </label>
      </div>

      {errors.failed && (
        <p className="mt-5 rounded-xl bg-site-danger/10 p-3 text-sm text-site-danger" role="alert">
          {errors.failed}
        </p>
      )}
      <Button type="submit" size="lg" className="mt-6 w-full sm:w-auto" disabled={sending} icon={<Send className="size-4.5" />}>
        {sending ? t.sending : t.submit}
      </Button>
      <p className="mt-3 text-xs text-site-muted">{t.privacy}</p>
    </form>
  );
}
