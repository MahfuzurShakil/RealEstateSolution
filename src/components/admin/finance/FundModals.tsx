'use client';

import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDownToLine, Building2, HandCoins, Landmark, UserPlus, Users, Wallet } from 'lucide-react';
import { ShareBar, partnerColors } from '@/components/admin/fund/ShareBar';
import { Button } from '@/components/ui/Button';
import { Field, MoneyInput, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import type { FundSourceType, Partner } from '@/lib/db/types';
import {
  bankAccountRepository,
  fundAllocationRepository,
  fundReceiptRepository,
  partnerRepository,
  projectRepository,
  splitProject,
  type FundOverview,
} from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, todayLocal } from '@/lib/utils/format';

/*
 * The three Fund actions (client, 2026-10-21: "make them user friendly").
 * Each form asks one question at a time in plain words, shows what the
 * answer means before saving (a preview of the split, where the money will
 * land), and ends on a one-line summary of exactly what will be recorded.
 */

function Footer({
  busy,
  onClose,
  onSave,
  label,
  disabled,
}: {
  busy: boolean;
  onClose: () => void;
  onSave: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <>
      <Button variant="outline" onClick={onClose} disabled={busy}>
        Cancel
      </Button>
      <Button onClick={onSave} disabled={busy || disabled}>
        {busy ? 'Saving…' : label}
      </Button>
    </>
  );
}

/** A big tappable choice: icon, title, one line of what it means. */
function Choice({
  active,
  onClick,
  icon: Icon,
  title,
  text,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Users;
  title: string;
  text: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        active
          ? 'border-admin-500 bg-admin-50 ring-1 ring-admin-500'
          : 'border-hairline hover:border-admin-300 hover:bg-slate-50',
      )}
    >
      <span
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-lg',
          active ? 'bg-admin-500 text-white' : 'bg-slate-100 text-ink-muted',
        )}
      >
        <Icon className="size-4" />
      </span>
      <span>
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-xs text-ink-muted">{text}</span>
      </span>
    </button>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section>
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="grid size-5 place-items-center rounded-full bg-admin-500 text-[11px] text-white">{n}</span>
        {title}
      </p>
      {children}
    </section>
  );
}

/** What will be recorded, in one sentence, just above the save button. */
function Summary({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-admin-50 px-3 py-2.5 text-sm text-admin-900">{children}</p>;
}

/* ------------------------------------------------------------------ *
 * Add / edit partner
 * ------------------------------------------------------------------ */

/**
 * Either a partner of the whole company, or an investor in one project only
 * (the two cases the business has). The preview shows the split the save
 * will produce, so the rule is seen rather than explained.
 */
export function PartnerModal({
  partner,
  shareTotal,
  onClose,
}: {
  partner?: Partner;
  shareTotal: number;
  onClose: () => void;
}) {
  const { userId } = useMockSession();
  const [kind, setKind] = useState<'company' | 'investor'>(partner?.project_id ? 'investor' : 'company');
  const [name, setName] = useState(partner?.name ?? '');
  const [phone, setPhone] = useState(partner?.phone ?? '');
  const [nid, setNid] = useState(partner?.nid ?? '');
  const [share, setShare] = useState(partner ? String(partner.share_pct) : '');
  const [active, setActive] = useState(partner?.is_active ?? true);
  const [projectId, setProjectId] = useState(partner?.project_id ?? '');
  const projects = useLiveQuery(() => projectRepository.list(), []);
  const allPartners = useLiveQuery(() => partnerRepository.list(), []);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const shareValue = Number(share) || 0;
  const free =
    Math.round((100 - shareTotal + (partner?.is_active && !partner.project_id ? partner.share_pct : 0)) * 100) / 100;

  // the partner list as it would be after saving, for the preview
  const draftId = partner?.id ?? '__new__';
  const draft: Partner = {
    ...(partner ?? ({} as Partner)),
    id: draftId,
    // sorts after every real code, so the newcomer takes the next colour and nobody else's changes
    code: partner?.code ?? '￿',
    name: name.trim() || 'New partner',
    share_pct: shareValue,
    is_active: active,
    project_id: kind === 'investor' ? projectId || null : null,
  };
  const others = (allPartners ?? []).filter((p) => p.id !== draftId);
  const after = [...others, draft];
  const colors = partnerColors(after);
  const companyAfter = after.filter((p) => p.is_active && !p.project_id);
  const companyTotalAfter = Math.round(companyAfter.reduce((s, p) => s + p.share_pct, 0) * 100) / 100;
  const investorTaken = others
    .filter((p) => p.is_active && p.project_id && p.project_id === projectId)
    .reduce((s, p) => s + p.share_pct, 0);
  const projectName = (projects ?? []).find((p) => p.id === projectId)?.name;

  async function save() {
    setError('');
    setBusy(true);
    try {
      await partnerRepository.save(
        {
          id: partner?.id,
          name,
          phone: phone || null,
          nid: nid || null,
          share_pct: shareValue,
          is_active: active,
          project_id: kind === 'investor' ? projectId || null : null,
          notes: partner?.notes ?? null,
        },
        userId,
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      size="lg"
      icon={UserPlus}
      title={partner ? `Edit ${partner.name}` : 'Add partner'}
      subtitle="Someone who puts money into the business"
      onClose={onClose}
      footer={<Footer busy={busy} onClose={onClose} onSave={save} label={partner ? 'Save changes' : 'Add partner'} />}
    >
      <div className="space-y-5">
        <Step n={1} title="What kind of partner?">
          <div className="grid gap-2 sm:grid-cols-2">
            <Choice
              active={kind === 'company'}
              onClick={() => setKind('company')}
              disabled={Boolean(partner)}
              icon={Users}
              title="Partner of the whole company"
              text="Owns a share of the company, so of every project."
            />
            <Choice
              active={kind === 'investor'}
              onClick={() => setKind('investor')}
              disabled={Boolean(partner)}
              icon={Building2}
              title="Investor in one project only"
              text="Takes a share of one project. Nothing in the others."
            />
          </div>
          {partner && (
            <p className="mt-1.5 text-xs text-ink-muted">
              The kind cannot change once money is recorded against a partner.
            </p>
          )}
        </Step>

        <Step n={2} title="Who are they?">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Name" required className="sm:col-span-3">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Karim Uddin" />
            </Field>
            <Field label="Phone">
              <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" />
            </Field>
            <Field label="NID" className="sm:col-span-2">
              <TextInput value={nid} onChange={(e) => setNid(e.target.value)} />
            </Field>
          </div>
        </Step>

        <Step n={3} title={kind === 'company' ? 'Their share of the company' : 'Which project, and what share of it?'}>
          <div className="grid gap-3 sm:grid-cols-2">
            {kind === 'investor' && (
              <Field label="Project" required>
                <SelectInput
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  disabled={Boolean(partner)}
                >
                  <option value="">Select…</option>
                  {(projects ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            )}
            <Field
              label={kind === 'company' ? 'Share of the company (%)' : 'Share of this project (%)'}
              required
              hint={
                kind === 'company'
                  ? `${free}% of the company is not given to anyone yet`
                  : projectId
                    ? `Other investors hold ${Math.round(investorTaken * 100) / 100}% of it; the company keeps the rest`
                    : undefined
              }
            >
              <TextInput
                type="number"
                min={0}
                max={100}
                step="any"
                value={share}
                onChange={(e) => setShare(e.target.value)}
              />
            </Field>
          </div>
        </Step>

        {/* the rule, shown on the actual numbers */}
        <div className="rounded-xl border border-hairline p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">After saving</p>
          {kind === 'company' ? (
            <>
              <p className="mb-2 text-sm text-ink">The company will be shared like this:</p>
              <ShareBar
                colors={colors}
                slices={companyAfter
                  .sort((a, b) => b.share_pct - a.share_pct)
                  .map((p) => ({
                    partner_id: p.id,
                    name: p.name,
                    share_pct: p.share_pct,
                    kind: 'company',
                    company_pct: p.share_pct,
                  }))}
              />
              {companyTotalAfter !== 100 && (
                <p className={cn('mt-2 text-xs', companyTotalAfter > 100 ? 'text-red-600' : 'text-amber-700')}>
                  Shares add up to {companyTotalAfter}%.{' '}
                  {companyTotalAfter > 100 ? 'Lower a share — it cannot pass 100%.' : 'They should add up to 100%.'}
                </p>
              )}
            </>
          ) : projectId ? (
            <>
              <p className="mb-2 text-sm text-ink">{projectName} will be owned like this:</p>
              <ShareBar colors={colors} slices={splitProject(projectId, after)} />
            </>
          ) : (
            <p className="text-sm text-ink-muted">Pick the project to see how it will be shared.</p>
          )}
        </div>

        {partner && (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="size-4 accent-admin-600"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Still a partner (untick when they leave — their history stays)
          </label>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * Money in
 * ------------------------------------------------------------------ */

/** Money coming in that is not a sale: capital, a loan, anything else. */
export function MoneyInModal({ onClose }: { onClose: () => void }) {
  const { userId } = useMockSession();
  const partners = useLiveQuery(() => partnerRepository.list(), []);
  const accounts = useLiveQuery(() => bankAccountRepository.options(), []);
  const projects = useLiveQuery(() => projectRepository.list(), []);
  const [source, setSource] = useState<FundSourceType>('partner_capital');
  const [partnerId, setPartnerId] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [target, setTarget] = useState<'pool' | 'project'>('pool');
  const [projectId, setProjectId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const pickedPartner = source === 'partner_capital' ? (partners ?? []).find((p) => p.id === partnerId) : undefined;
  // an investor's money always belongs to their project
  const lockedProject = pickedPartner?.project_id ?? null;
  const effectiveProject = lockedProject ?? (target === 'project' ? projectId : '');
  const projectName = (projects ?? []).find((p) => p.id === effectiveProject)?.name;
  const accountName = (accounts ?? []).find((a) => a.id === accountId)?.name;
  const who = source === 'partner_capital' ? pickedPartner?.name : sourceName.trim();
  const value = Number(amount) || 0;

  async function save() {
    setError('');
    setBusy(true);
    try {
      await fundReceiptRepository.record(
        {
          source_type: source,
          partner_id: source === 'partner_capital' ? partnerId || null : null,
          source_name: sourceName || null,
          project_id: effectiveProject || null,
          account_id: accountId,
          amount: value,
          receipt_date: date,
          reference_no: reference || null,
          notes: notes || null,
        },
        userId,
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  const activePartners = (partners ?? []).filter((p) => p.is_active);
  const companyPartners = activePartners.filter((p) => !p.project_id);
  const investors = activePartners.filter((p) => p.project_id);
  const projectOf = (id: string | null | undefined) => (projects ?? []).find((p) => p.id === id)?.name ?? 'a project';

  return (
    <Modal
      open
      size="lg"
      icon={ArrowDownToLine}
      title="Money in"
      subtitle="A partner's capital, a loan, or other money that is not a sale"
      onClose={onClose}
      footer={
        <Footer
          busy={busy}
          onClose={onClose}
          onSave={save}
          label={value > 0 ? `Record ${formatBdt(value)}` : 'Record'}
        />
      }
    >
      <div className="space-y-5">
        <Step n={1} title="Where is the money from?">
          <div className="grid gap-2 sm:grid-cols-3">
            <Choice
              active={source === 'partner_capital'}
              onClick={() => setSource('partner_capital')}
              icon={Users}
              title="A partner"
              text="Capital they put in"
            />
            <Choice
              active={source === 'loan'}
              onClick={() => setSource('loan')}
              icon={Landmark}
              title="A loan"
              text="Bank or person, to be repaid"
            />
            <Choice
              active={source === 'other'}
              onClick={() => setSource('other')}
              icon={Wallet}
              title="Something else"
              text="Any other money in"
            />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {source === 'partner_capital' ? (
              <Field label="Partner" required>
                <SelectInput value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
                  <option value="">Select…</option>
                  {companyPartners.length > 0 && (
                    <optgroup label="Company partners">
                      {companyPartners.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.share_pct}% of the company)
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {investors.length > 0 && (
                    <optgroup label="Project investors">
                      {investors.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.share_pct}% of {projectOf(p.project_id)})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </SelectInput>
              </Field>
            ) : (
              <Field label={source === 'loan' ? 'Lender' : 'From'} required>
                <TextInput
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  placeholder={source === 'loan' ? 'e.g. City Bank term loan' : 'Who paid it'}
                />
              </Field>
            )}
          </div>
        </Step>

        <Step n={2} title="Whose fund does it go into?">
          {lockedProject ? (
            <p className="rounded-xl border border-hairline bg-slate-50 px-3 py-2.5 text-sm text-ink">
              <Building2 className="mr-1.5 inline size-4 text-admin-600" />
              {pickedPartner?.name} invests in <span className="font-medium">{projectName}</span> only, so this money
              goes straight to that project.
            </p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <Choice
                  active={target === 'pool'}
                  onClick={() => setTarget('pool')}
                  icon={Wallet}
                  title="Company pool"
                  text="Kept for the company; give it to a project later."
                />
                <Choice
                  active={target === 'project'}
                  onClick={() => setTarget('project')}
                  icon={Building2}
                  title="Straight to one project"
                  text="That project can spend it right away."
                />
              </div>
              {target === 'project' && (
                <Field label="Project" required className="mt-3 sm:w-1/2">
                  <SelectInput value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                    <option value="">Select…</option>
                    {(projects ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
              )}
            </>
          )}
        </Step>

        <Step n={3} title="How much, and into which account?">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Amount (BDT)" required>
              <MoneyInput value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Into account" required hint="Where the money actually landed">
              <SelectInput value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Select…</option>
                {(accounts ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Date" required>
              <TextInput type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Reference">
              <TextInput
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Cheque no., bank ref…"
              />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </Step>

        {value > 0 && who && accountName && (
          <Summary>
            <span className="font-medium">{formatBdt(value)}</span> from <span className="font-medium">{who}</span> goes
            into <span className="font-medium">{accountName}</span> and is added to{' '}
            <span className="font-medium">{effectiveProject ? `${projectName}'s fund` : 'the company pool'}</span>.
          </Summary>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * Give to project
 * ------------------------------------------------------------------ */

/**
 * Pool → project: says the project may spend part of the company's money.
 * No money moves between accounts. Each project shows what it has left and
 * what it owes, so the owner can see which one needs money.
 */
export function AllocateModal({ overview, onClose }: { overview: FundOverview; onClose: () => void }) {
  const { userId } = useMockSession();
  const projects = useLiveQuery(() => projectRepository.list(), []);
  const [projectId, setProjectId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const available = overview.pool.unallocated;
  const value = Number(amount) || 0;
  const fundRow = (id: string) => overview.projects.find((r) => r.project_id === id);
  const picked = fundRow(projectId);
  const pickedName = (projects ?? []).find((p) => p.id === projectId)?.name;
  // what it needs to clear its unpaid bills
  const shortfall = picked ? Math.max(0, picked.owed - picked.remaining) : 0;
  const tooMuch = value > available + 0.005;

  async function save() {
    setError('');
    setBusy(true);
    try {
      await fundAllocationRepository.allocate(
        {
          project_id: projectId,
          amount: value,
          allocation_date: date,
          notes: notes || null,
        },
        userId,
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      size="lg"
      icon={HandCoins}
      title="Give money to a project"
      subtitle="From the company pool. No money moves between accounts — it only says this project may spend it."
      onClose={onClose}
      footer={
        <Footer
          busy={busy}
          onClose={onClose}
          onSave={save}
          label={value > 0 ? `Give ${formatBdt(value)}` : 'Give'}
          disabled={tooMuch}
        />
      }
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between rounded-xl bg-admin-50 px-4 py-3">
          <span className="text-sm text-admin-900">In the company pool, not given to any project</span>
          <span className="text-lg font-semibold text-admin-900">{formatBdt(available)}</span>
        </div>

        <Step n={1} title="Which project?">
          <div className="max-h-64 overflow-y-auto rounded-xl border border-hairline">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-left text-xs text-ink-muted">
                <tr className="border-b border-hairline">
                  <th className="px-3 py-2 font-medium">Project</th>
                  <th className="px-3 py-2 text-right font-medium">Left</th>
                  <th className="px-3 py-2 text-right font-medium">Bills unpaid</th>
                </tr>
              </thead>
              <tbody>
                {/* the ones that cannot pay their bills first */}
                {[...(projects ?? [])]
                  .sort((a, b) => {
                    const ra = fundRow(a.id);
                    const rb = fundRow(b.id);
                    const gap = (r?: typeof ra) => (r ? r.owed - r.remaining : -Infinity);
                    return gap(rb) - gap(ra);
                  })
                  .map((p) => {
                    const r = fundRow(p.id);
                    const short = r ? r.owed > r.remaining : false;
                    return (
                      <tr
                        key={p.id}
                        onClick={() => setProjectId(p.id)}
                        className={cn(
                          'cursor-pointer border-b border-hairline last:border-0',
                          projectId === p.id ? 'bg-admin-50' : 'hover:bg-slate-50',
                        )}
                      >
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-2">
                            <input type="radio" readOnly checked={projectId === p.id} className="accent-admin-600" />
                            <span className="text-ink">{p.name}</span>
                            {short && (
                              <span className="rounded-full bg-amber-50 px-2 text-[11px] text-amber-700">
                                needs money
                              </span>
                            )}
                          </span>
                        </td>
                        <td
                          className={cn(
                            'px-3 py-2 text-right tabular-nums',
                            r && r.remaining < 0 ? 'text-red-600' : 'text-ink',
                          )}
                        >
                          {formatBdt(r?.remaining ?? 0)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink-muted">
                          {r?.owed ? formatBdt(r.owed) : '—'}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Step>

        <Step n={2} title="How much?">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Amount (BDT)"
              required
              error={tooMuch ? `The pool only has ${formatBdt(available)}` : undefined}
            >
              <MoneyInput value={amount} onChange={(e) => setAmount(e.target.value)} invalid={tooMuch} />
            </Field>
            <Field label="Date" required>
              <TextInput type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {shortfall > 0 && (
              <Button size="sm" variant="outline" onClick={() => setAmount(String(Math.min(shortfall, available)))}>
                Enough to pay its bills ({formatBdt(Math.min(shortfall, available))})
              </Button>
            )}
            {available > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setAmount(String(available))}>
                All of the pool
              </Button>
            )}
          </div>
          <Field label="Notes" className="mt-3">
            <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </Step>

        {value > 0 && pickedName && !tooMuch && (
          <Summary>
            <span className="font-medium">{pickedName}</span> may now spend{' '}
            <span className="font-medium">{formatBdt(value)}</span> more of the company&apos;s money. Left in the pool
            after this: <span className="font-medium">{formatBdt(available - value)}</span>.
          </Summary>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}
