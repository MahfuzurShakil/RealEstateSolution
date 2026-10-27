'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarCheck, CircleCheck, Globe2, MessageCircle, PhoneCall, X } from 'lucide-react';
import {
  CALLBACK_TIMES,
  VISIT_SLOTS,
  isBdMobile,
  isEmail,
  isIntlPhone,
  shortDate,
  visitDays,
  type CallbackTime,
  type VisitSlot,
} from '@/lib/domain/public-enquiry';
import { PUBLIC_PRICE_BANDS, telLink } from '@/lib/domain/public-portal';
import { publicInquiryRepository, type PublicInquiryError } from '@/lib/repositories/public/inquiry.public.repository';
import { publicProjectRepository } from '@/lib/repositories/public/project.public.repository';
import { cn } from '@/lib/utils/cn';
import { en } from '../i18n/en';
import { Button, ButtonLink } from '../ui/Button';
import { landingUtm, type EnquiryKind, type EnquirySubject } from './EnquiryProvider';

const t = en.enquiry;

const input =
  'h-12 w-full rounded-xl border border-site-line bg-white px-4 text-base text-site-ink placeholder:text-site-faint transition-colors focus:border-site-primary focus:outline-none aria-[invalid=true]:border-site-danger';
const chip =
  'rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-site-primary disabled:cursor-not-allowed';

function Field({
  label,
  hint,
  error,
  optional,
  children,
  id,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  optional?: boolean;
  children: React.ReactNode;
  id: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        {label}
        {optional && <span className="font-normal text-site-muted"> ({t.optional})</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-msg`} className="mt-1.5 text-sm text-site-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="mt-1.5 text-sm text-site-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function EnquiryModal({
  kind,
  subject,
  onKind,
  onClose,
  whatsapp,
  tel,
}: {
  kind: EnquiryKind;
  subject: EnquirySubject;
  onKind: (kind: EnquiryKind) => void;
  onClose: () => void;
  whatsapp: (subject?: EnquirySubject | null) => string | null;
  tel: string | null;
}) {
  const uid = useId();
  const panel = useRef<HTMLDivElement>(null);
  const projects = useLiveQuery(
    () => (kind === 'visit' ? publicProjectRepository.list().then((r) => r.filter((c) => c.stage !== 'completed')) : []),
    [kind],
  );
  const days = useState(() => visitDays())[0];

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [budget, setBudget] = useState('');
  const [message, setMessage] = useState('');
  const [projectCode, setProjectCode] = useState(subject.project?.code ?? '');
  const [date, setDate] = useState('');
  const [slot, setSlot] = useState<VisitSlot | ''>('');
  const [country, setCountry] = useState('');
  const [bestTime, setBestTime] = useState<CallbackTime>('any');
  const [honeypot, setHoneypot] = useState('');
  const [errors, setErrors] = useState<Partial<Record<PublicInquiryError | 'failed', string>>>({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  // lock the page, close on Esc, keep Tab inside, start on the first field
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLElement>('input:not([tabindex="-1"]), select, button[data-first]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !panel.current) return;
      const items = [
        ...panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([tabindex="-1"]), select, textarea'),
      ];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      prevFocus?.focus?.();
    };
  }, [onClose]);

  const chosenProject =
    subject.project ?? (projects ?? []).filter((p) => p.code === projectCode).map((p) => ({ name: p.name, code: p.code }))[0];

  const check = () => {
    const e: typeof errors = {};
    if (name.trim().length < 2) e.name = t.errors.name;
    if (kind === 'callback' ? !isIntlPhone(phone) : !isBdMobile(phone)) e.phone = kind === 'callback' ? t.errors.phoneIntl : t.errors.phone;
    if (kind === 'enquiry' && email.trim() && !isEmail(email)) e.email = t.errors.email;
    if (kind === 'visit' && !projectCode) e.project = t.errors.project;
    if (kind === 'visit' && (!date || !slot)) e.date = t.errors.date;
    return e;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const found = check();
    setErrors(found);
    if (Object.keys(found).length) {
      // by field, not by `aria-invalid`: the DOM has not re-rendered with the errors yet
      const first = (['project', 'name', 'phone', 'email'] as const).find((k) => found[k]);
      if (first) document.getElementById(ids[first])?.focus();
      return;
    }
    setSending(true);
    const common = { name, phone, website: honeypot, page_url: window.location.pathname + window.location.search, utm: landingUtm() };
    try {
      const result = await publicInquiryRepository.submit(
        kind === 'enquiry'
          ? { ...common, kind, email, budget, message, project_code: subject.project?.code, unit_code: subject.unit?.code }
          : kind === 'visit'
            ? { ...common, kind, project_code: projectCode, date, slot: slot as VisitSlot }
            : {
                ...common,
                kind,
                country,
                best_time: bestTime,
                message,
                project_code: subject.project?.code,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              },
      );
      if (result.ok) setDone(true);
      else setErrors({ [result.field]: t.errors[result.field] });
    } catch {
      setErrors({ failed: t.errors.failed });
    } finally {
      setSending(false);
    }
  };

  const ids = {
    name: `${uid}-name`,
    phone: `${uid}-phone`,
    email: `${uid}-email`,
    budget: `${uid}-budget`,
    message: `${uid}-message`,
    project: `${uid}-project`,
    country: `${uid}-country`,
  };
  const wa = whatsapp(kind === 'visit' ? { project: chosenProject } : subject);
  const aboutLine = subject.project
    ? subject.unit
      ? `${subject.unit.item} ${subject.unit.code} · ${subject.project.name}`
      : subject.project.name
    : null;
  const call = telLink(tel);

  return createPortal(
    <div
      className="site fixed inset-0 z-[70] flex bg-site-night/60 font-site text-site-ink backdrop-blur-sm motion-safe:animate-[site-fade-in_.2s_ease-out]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        className="mt-auto flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[24px] bg-site-ivory shadow-site-3 motion-safe:animate-[site-sheet-up_.3s_var(--ease-site-out)] sm:m-auto sm:max-h-[90dvh] sm:max-w-lg sm:rounded-[24px]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-site-line px-5 pt-5 pb-4 sm:px-7">
          <div className="min-w-0">
            <h2 id={`${uid}-title`} className="text-xl font-semibold md:text-2xl">
              {done ? t.done.title(name.trim().split(' ')[0]) : t.titles[kind]}
            </h2>
            {!done && aboutLine && (
              <p className="mt-1 truncate text-sm text-site-muted">
                {t.about}: <span className="font-medium text-site-ink">{aboutLine}</span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-white shadow-site-1 hover:text-site-primary"
          >
            <X className="size-5" />
          </button>
        </div>

        {done ? (
          <div className="overflow-y-auto px-5 py-8 text-center sm:px-7" role="status">
            <CircleCheck className="mx-auto size-14 text-site-primary motion-safe:animate-[fade-up_.4s_var(--ease-site-out)]" strokeWidth={1.6} />
            <p className="mx-auto mt-4 max-w-sm text-lg">
              {kind === 'visit' ? t.done.visit(`${shortDate(date)}, ${t.slots[slot as VisitSlot].toLowerCase()}`) : t.done[kind]}
            </p>
            <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
              {wa && (
                <ButtonLink href={wa} variant="whatsapp" icon={<MessageCircle className="size-4.5" />}>
                  {t.done.whatsapp}
                </ButtonLink>
              )}
              <Button variant="outline" onClick={onClose} data-first>
                {t.done.close}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
            <div className="space-y-5 overflow-y-auto px-5 py-5 sm:px-7">
              <p className="text-site-muted">{t.leads[kind]}</p>

              {kind === 'visit' && (
                <>
                  {!subject.project && (
                    <Field id={ids.project} label={t.project} error={errors.project}>
                      <select
                        id={ids.project}
                        value={projectCode}
                        onChange={(e) => setProjectCode(e.target.value)}
                        aria-invalid={!!errors.project}
                        className={input}
                      >
                        <option value="">{t.chooseProject}</option>
                        {(projects ?? []).map((p) => (
                          <option key={p.code} value={p.code}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <fieldset className="min-w-0">
                    <legend className="mb-1.5 text-sm font-semibold">{t.date}</legend>
                    <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label={t.date}>
                      {days.map((d) => {
                        const dt = new Date(`${d.date}T00:00:00`);
                        const on = date === d.date;
                        return (
                          <button
                            key={d.date}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            disabled={d.closed}
                            onClick={() => setDate(d.date)}
                            className={cn(
                              chip,
                              'flex w-16 shrink-0 snap-start flex-col items-center py-2',
                              on ? 'border-site-primary bg-site-primary text-white' : 'border-site-line bg-white hover:border-site-primary',
                              d.closed && 'border-dashed bg-site-soft text-site-faint',
                            )}
                          >
                            <span className="text-xs">{dt.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                            <span className="text-lg leading-tight font-bold">{dt.getDate()}</span>
                            <span className="text-xs">{d.closed ? t.closed : dt.toLocaleDateString('en-GB', { month: 'short' })}</span>
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                  <fieldset className="min-w-0">
                    <legend className="mb-1.5 text-sm font-semibold">{t.slot}</legend>
                    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t.slot}>
                      {VISIT_SLOTS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          role="radio"
                          aria-checked={slot === s}
                          onClick={() => setSlot(s)}
                          className={cn(
                            chip,
                            'flex flex-col items-center',
                            slot === s ? 'border-site-primary bg-site-primary text-white' : 'border-site-line bg-white hover:border-site-primary',
                          )}
                        >
                          {t.slots[s]}
                          <span className={cn('text-xs font-normal', slot === s ? 'text-white/80' : 'text-site-muted')}>{t.slotHours[s]}</span>
                        </button>
                      ))}
                    </div>
                    {errors.date && (
                      <p className="mt-1.5 text-sm text-site-danger" role="alert">
                        {errors.date}
                      </p>
                    )}
                  </fieldset>
                </>
              )}

              <Field id={ids.name} label={t.name} error={errors.name}>
                <input
                  id={ids.name}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? `${ids.name}-msg` : undefined}
                  className={input}
                />
              </Field>

              {kind === 'callback' && (
                <Field id={ids.country} label={t.country}>
                  <select id={ids.country} value={country} onChange={(e) => setCountry(e.target.value)} className={input}>
                    <option value="">—</option>
                    {t.countries.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              )}

              <Field
                id={ids.phone}
                label={kind === 'callback' ? t.phoneIntl : t.phone}
                hint={kind === 'callback' ? t.phoneIntlHint : t.phoneHint}
                error={errors.phone}
              >
                <input
                  id={ids.phone}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  aria-invalid={!!errors.phone}
                  aria-describedby={`${ids.phone}-msg`}
                  className={cn(input, 'tabular')}
                />
              </Field>

              {kind === 'callback' && (
                <fieldset className="min-w-0">
                  <legend className="mb-1.5 text-sm font-semibold">{t.bestTime}</legend>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label={t.bestTime}>
                    {CALLBACK_TIMES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        role="radio"
                        aria-checked={bestTime === s}
                        onClick={() => setBestTime(s)}
                        className={cn(
                          chip,
                          bestTime === s ? 'border-site-primary bg-site-primary text-white' : 'border-site-line bg-white hover:border-site-primary',
                        )}
                      >
                        {t.times[s]}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}

              {kind === 'enquiry' && (
                <>
                  <Field id={ids.email} label={t.email} optional error={errors.email}>
                    <input
                      id={ids.email}
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      aria-invalid={!!errors.email}
                      className={input}
                    />
                  </Field>
                  <Field id={ids.budget} label={t.budget} optional>
                    <select id={ids.budget} value={budget} onChange={(e) => setBudget(e.target.value)} className={input}>
                      <option value="">{t.anyBudget}</option>
                      {PUBLIC_PRICE_BANDS.map((b) => (
                        <option key={b.key}>{b.label}</option>
                      ))}
                    </select>
                  </Field>
                </>
              )}

              {kind !== 'visit' && (
                <Field id={ids.message} label={t.message} optional>
                  <textarea
                    id={ids.message}
                    rows={3}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={t.messagePlaceholder}
                    className={cn(input, 'h-auto resize-none py-3')}
                  />
                </Field>
              )}

              {/* honeypot: off-screen, out of the tab order, ignored by screen readers */}
              <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden">
                <label>
                  Website
                  <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} name="website" />
                </label>
              </div>

              {kind === 'enquiry' && (
                <button type="button" onClick={() => onKind('callback')} className="flex items-center gap-2 text-sm font-semibold text-site-primary hover:underline">
                  <Globe2 className="size-4" aria-hidden /> {t.abroad}
                </button>
              )}
              {errors.failed && (
                <p className="rounded-xl bg-site-danger/10 p-3 text-sm text-site-danger" role="alert">
                  {errors.failed}
                </p>
              )}
            </div>

            <div className="border-t border-site-line bg-white px-5 py-4 sm:px-7">
              <Button type="submit" size="lg" className="w-full" disabled={sending} icon={kind === 'visit' ? <CalendarCheck className="size-4.5" /> : kind === 'callback' ? <PhoneCall className="size-4.5" /> : undefined}>
                {sending ? t.sending : t.submit[kind]}
              </Button>
              <p className="mt-2.5 text-center text-xs text-site-muted">
                {t.privacy}
                {call && (
                  <>
                    {' · '}
                    <a href={call} className="tabular font-medium text-site-ink hover:text-site-primary">
                      {tel}
                    </a>
                  </>
                )}
              </p>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.getElementById('site-root') ?? document.body,
  );
}
