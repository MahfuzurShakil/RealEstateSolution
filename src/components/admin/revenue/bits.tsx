'use client';

import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { WithdrawalStatus } from '@/lib/db/types';
import { PERIOD_STATUS_META, WITHDRAWAL_STATUS_META } from '@/lib/domain/revenue-share';
import { cn } from '@/lib/utils/cn';
import { formatBdt } from '@/lib/utils/format';

export function PeriodBadge({ status }: { status: keyof typeof PERIOD_STATUS_META }) {
  const m = PERIOD_STATUS_META[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function WithdrawalBadge({ status }: { status: WithdrawalStatus }) {
  const m = WITHDRAWAL_STATUS_META[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function ModalFooter({
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

export function FormError({ error }: { error: string }) {
  return error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null;
}

/** One line of a statement: label left, taka right; `minus` prints "−". */
export function StatementLine({
  label,
  value,
  minus,
  strong,
  hint,
  tone,
}: {
  label: ReactNode;
  value: number;
  minus?: boolean;
  strong?: boolean;
  hint?: ReactNode;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-2', strong ? 'border-t border-hairline font-semibold' : 'text-sm')}>
      <span className={strong ? 'text-ink' : 'text-ink-muted'}>
        {minus && '− '}
        {label}
        {hint && <span className="ml-1.5 text-xs font-normal text-ink-muted">{hint}</span>}
      </span>
      <span
        className={cn(
          'whitespace-nowrap tabular-nums',
          tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-red-600' : 'text-ink',
        )}
      >
        {formatBdt(value)}
      </span>
    </div>
  );
}

export interface WaterfallFigures {
  income: number;
  cost: number;
  operating_profit: number;
  loss_brought_in: number;
  reserve: number;
  mgmt_fee: number;
  loan_principal_due: number;
  available: number;
  loss_carried_out: number;
}

/** Plan §2.3 — the same waterfall for a preview and a closed period. */
export function Waterfall({ s, reservePct }: { s: WaterfallFigures; reservePct?: number }) {
  const loss = s.operating_profit < 0;
  return (
    <div>
      <StatementLine label="Income" value={s.income} />
      <StatementLine label="Running cost" value={s.cost} minus />
      <StatementLine
        label={loss ? 'Operating loss' : 'Operating profit'}
        value={Math.abs(s.operating_profit)}
        strong
        tone={loss ? 'bad' : 'good'}
      />
      {s.loss_brought_in > 0 && <StatementLine label="Past loss recovered" value={Math.min(s.loss_brought_in, Math.max(0, s.operating_profit))} minus />}
      {s.reserve > 0 && <StatementLine label="Reserve" hint={reservePct ? `${reservePct}%` : undefined} value={s.reserve} minus />}
      {s.mgmt_fee > 0 && <StatementLine label="Management fee" value={s.mgmt_fee} minus />}
      {s.loan_principal_due > 0 && <StatementLine label="Loan principal due" hint="cash check" value={s.loan_principal_due} minus />}
      <StatementLine label="Available to share" value={s.available} strong />
      {s.loss_carried_out > 0 && (
        <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {formatBdt(s.loss_carried_out)} of loss is carried forward — later profit fills it before anything is shared.
        </p>
      )}
    </div>
  );
}
