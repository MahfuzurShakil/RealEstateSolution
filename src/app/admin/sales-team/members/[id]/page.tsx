'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, ArrowRightLeft, HandCoins, Pencil, Printer, ReceiptText, UserCheck, UserMinus, XCircle } from 'lucide-react';
import { DetailTabs } from '@/components/admin/share-sale/bits';
import { CommissionSummary, LineStatusBadge, MarkLeftDialog, MemberFormModal, MoveMemberModal, useCommissionSync } from '@/components/admin/sales-team/parts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SALE_KIND_LABEL } from '@/lib/domain/commission';
import {
  commissionLineRepository,
  commissionPayoutRepository,
  commissionTotals,
  orgMemberRepository,
  type OrgNode,
} from '@/lib/repositories';
import { formatBdt, formatDate, formatPhone } from '@/lib/utils/format';

type Tab = 'statement' | 'team' | 'history' | 'payouts';
type Dialog = 'edit' | 'move' | 'left' | null;

function findNode(nodes: OrgNode[], id: string, path: OrgNode[] = []): { node: OrgNode; path: OrgNode[] } | null {
  for (const n of nodes) {
    if (n.member.id === id) return { node: n, path };
    const hit = findNode(n.children, id, [...path, n]);
    if (hit) return hit;
  }
  return null;
}

const saleHref = (kind: 'share' | 'booking', id: string) => (kind === 'share' ? `/admin/share-sale/sales/${id}` : `/admin/bookings/${id}`);

/** One member: where they sit, their commission statement (plan §7.3), their team and their payouts. */
export default function MemberPage() {
  const { id } = useParams<{ id: string }>();
  const synced = useCommissionSync();
  const tree = useLiveQuery(() => orgMemberRepository.tree(), []);
  const statement = useLiveQuery(() => commissionLineRepository.statement(id), [id, synced]);
  const allLines = useLiveQuery(() => commissionLineRepository.rows(), [synced]);
  const history = useLiveQuery(() => orgMemberRepository.history(id), [id]);
  const payouts = useLiveQuery(async () => (await commissionPayoutRepository.list()).filter((p) => p.member_id === id), [id]);
  const members = useLiveQuery(() => orgMemberRepository.getAll(), []);
  const [tab, setTab] = useState<Tab>('statement');
  const [dialog, setDialog] = useState<Dialog>(null);

  if (!tree || !statement || !members) return <p className="text-sm text-ink-muted">Loading…</p>;
  const hit = findNode(tree, id);
  if (!hit) return <EmptyState icon={XCircle} title="Member not found" action={<Link href="/admin/sales-team/members">Back to members</Link>} />;
  const { node, path } = hit;
  const m = node.member;
  const name = (mid: string | null) => members.find((x) => x.id === mid)?.name ?? 'Top level';
  const totals = commissionTotals(statement.flatMap((s) => s.lines));

  const team: OrgNode[] = [];
  const walk = (ns: OrgNode[]) => ns.forEach((n) => (team.push(n), walk(n.children)));
  walk(node.children);
  const teamLines = (allLines ?? []).filter((l) => team.some((t) => t.member.id === l.member_id));

  return (
    <>
      <Link href="/admin/sales-team/members" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-admin-700 print:hidden">
        <ArrowLeft className="size-4" /> Members
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold text-ink">
            {m.name}
            <Badge tone="teal">{node.designation}</Badge>
            {m.status === 'left' && <Badge tone="amber">Left {formatDate(m.left_on)}</Badge>}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {m.code}
            {m.phone ? ` · ${formatPhone(m.phone)}` : ''} · joined {formatDate(m.joined_on)}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {path.length ? path.map((p) => p.member.name).join(' → ') + ` → ${m.name}` : 'Top level'}
            {node.user_name ? ` · login: ${node.user_name}` : ''}
            {node.partner_name ? ' · company partner' : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="outline" size="sm" viewSafe onClick={() => window.print()}>
            <Printer className="size-4" /> Print statement
          </Button>
          {m.status === 'active' ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setDialog('edit')}>
                <Pencil className="size-4" /> Edit
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDialog('move')}>
                <ArrowRightLeft className="size-4" /> Move
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDialog('left')}>
                <UserMinus className="size-4" /> Has left
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => void orgMemberRepository.rejoin(m.id)}>
              <UserCheck className="size-4" /> Rejoined
            </Button>
          )}
          {totals.approved > 0 && (
            <Link href={`/admin/sales-team/payouts?member=${m.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-admin-500 px-3 text-sm font-medium text-white hover:bg-admin-600">
              <HandCoins className="size-4" /> Pay {formatBdt(totals.approved)}
            </Link>
          )}
        </div>
      </div>

      <div className="mb-5">
        <CommissionSummary totals={totals} />
      </div>

      <div className="print:hidden">
        <DetailTabs
          tabs={[
            { key: 'statement', label: `Statement (${statement.length})` },
            { key: 'team', label: `Team (${team.length})` },
            { key: 'history', label: 'Reporting history' },
            { key: 'payouts', label: `Payouts (${payouts?.length ?? 0})` },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'statement' && (
        <div className="space-y-4">
          {statement.length === 0 ? (
            <Card>
              <EmptyState icon={ReceiptText} title="No commission yet" description="Sales credited to this member, or to their team, appear here once a plan covers them." />
            </Card>
          ) : (
            statement.map((s) => (
              <Card key={s.key} className="break-inside-avoid">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link href={saleHref(s.kind, s.sale_id)} className="font-semibold text-admin-700 hover:underline">
                      {s.sale_code}
                    </Link>
                    <p className="text-xs text-ink-muted">
                      {SALE_KIND_LABEL[s.kind]} · {s.customer?.name ?? '—'} · {s.project?.name ?? '—'} · {formatDate(s.sale_date)}
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="text-ink-muted">
                      {s.role === 'seller' ? 'Seller' : `Override as ${s.designation_at_sale}`} on {formatBdt(s.sale_amount)}
                    </p>
                    <p className="text-base font-semibold tabular-nums text-ink">{formatBdt(s.total)}</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead>
                      <tr className="border-b border-hairline text-left text-xs text-ink-muted">
                        <th className="py-1.5 font-medium">Stage</th>
                        <th className="py-1.5 font-medium">Status</th>
                        <th className="py-1.5 font-medium">Released</th>
                        <th className="py-1.5 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.lines.map((l) => (
                        <tr key={l.id} className="border-b border-hairline/60 last:border-0">
                          <td className="py-2">{l.stage_label}</td>
                          <td className="py-2">
                            <LineStatusBadge status={l.status} toRecover={l.to_recover} />
                          </td>
                          <td className="py-2 text-ink-muted">{l.earned_on ? formatDate(l.earned_on) : l.status === 'void' ? (l.void_reason ?? '—') : 'Still to come'}</td>
                          <td className="py-2 text-right tabular-nums">{formatBdt(l.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'team' && (
        <Card>
          <CardHeader title="Team" subtitle={`Branch sales ${formatBdt(node.branch_sales)} · ${node.branch_sales_count} sale${node.branch_sales_count === 1 ? '' : 's'}`} />
          {team.length === 0 ? (
            <p className="text-sm text-ink-muted">Nobody reports to {m.name}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-hairline text-left text-xs text-ink-muted">
                    <th className="py-1.5 font-medium">Member</th>
                    <th className="py-1.5 font-medium">Reports to</th>
                    <th className="py-1.5 text-right font-medium">Own sales</th>
                    <th className="py-1.5 text-right font-medium">Commission earned</th>
                    <th className="py-1.5 text-right font-medium">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {team.map((t) => {
                    const ct = commissionTotals(teamLines.filter((l) => l.member_id === t.member.id));
                    return (
                      <tr key={t.member.id} className="border-b border-hairline/60 last:border-0">
                        <td className="py-2">
                          <Link href={`/admin/sales-team/members/${t.member.id}`} className="font-medium text-admin-700 hover:underline">
                            {t.member.name}
                          </Link>
                          <span className="block text-xs text-ink-muted">{t.designation}</span>
                        </td>
                        <td className="py-2 text-ink-muted">{name(t.member.parent_id)}</td>
                        <td className="py-2 text-right tabular-nums">{formatBdt(t.own_sales)}</td>
                        <td className="py-2 text-right tabular-nums">{formatBdt(ct.earned + ct.approved + ct.paid)}</td>
                        <td className="py-2 text-right tabular-nums">{formatBdt(ct.paid)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'history' && (
        <Card>
          <CardHeader title="Reporting history" subtitle="Commission on a sale follows the tree as it was on the sale date." />
          <ol className="space-y-3 text-sm">
            {(history ?? []).map((h) => (
              <li key={h.id} className="flex flex-wrap justify-between gap-2 border-b border-hairline/60 pb-2 last:border-0">
                <span>
                  From <span className="font-medium">{name(h.from_parent_id)}</span> to <span className="font-medium">{name(h.to_parent_id)}</span>
                  {h.note && <span className="block text-xs text-ink-muted">{h.note}</span>}
                </span>
                <span className="text-ink-muted">{formatDate(h.effective_date)}</span>
              </li>
            ))}
            <li className="flex flex-wrap justify-between gap-2 text-ink-muted">
              <span>Joined{history?.length ? '' : `, reporting to ${name(m.parent_id)}`}</span>
              <span>{formatDate(m.joined_on)}</span>
            </li>
          </ol>
        </Card>
      )}

      {tab === 'payouts' && (
        <Card>
          <CardHeader title="Payouts" />
          {(payouts ?? []).length === 0 ? (
            <p className="text-sm text-ink-muted">No commission paid yet.</p>
          ) : (
            <ul className="divide-y divide-hairline text-sm">
              {payouts!.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span>
                    <span className="font-medium">{p.code}</span>
                    <span className="block text-xs text-ink-muted">
                      {formatDate(p.paid_on)} · {p.account_name ?? '—'} · {p.line_count} line{p.line_count === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span className="text-right tabular-nums">
                    <span className="block font-semibold">{formatBdt(p.net)}</span>
                    <span className="block text-xs text-ink-muted">
                      {formatBdt(p.lines_total)}
                      {p.recovered > 0 && ` − ${formatBdt(p.recovered)} recovered`}
                      {p.tax_withheld > 0 && ` − ${formatBdt(p.tax_withheld)} tax`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {dialog === 'edit' && <MemberFormModal member={m} onClose={() => setDialog(null)} />}
      {dialog === 'move' && <MoveMemberModal member={m} onClose={() => setDialog(null)} />}
      {dialog === 'left' && <MarkLeftDialog member={m} onClose={() => setDialog(null)} />}
    </>
  );
}
