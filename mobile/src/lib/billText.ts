import { currencyFor, formatMoney, Minor } from '../engine/money';
import { settle, Settlement } from '../engine/settle';
import { computeSplit, SplitResult } from '../engine/split';
import type { Bill } from '../engine/types';
import type { ShareSnapshot } from '../api/client';

export function billTitle(b: Bill): string {
  return b.restaurant.value?.trim() || (b.origin === 'manual' ? 'Manual bill' : 'Scanned bill');
}

export function fmt(b: Bill, m: Minor, compact = false): string {
  return formatMoney(m, currencyFor(b.currency), { compact });
}

export function nameOf(b: Bill, pid: string): string {
  return b.participants.find((p) => p.id === pid)?.name ?? 'Someone';
}

export function displayDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export interface Computed {
  split: SplitResult;
  settlement: Settlement;
  errors: SplitResult['issues'];
  warnings: SplitResult['issues'];
}

export function compute(b: Bill): Computed {
  const split = computeSplit(b);
  const settlement = settle(b, split);
  return {
    split,
    settlement,
    errors: split.issues.filter((i) => i.level === 'error'),
    warnings: split.issues.filter((i) => i.level === 'warning'),
  };
}

export function payersText(b: Bill): string | null {
  const ids = Object.entries(b.payments).filter(([, v]) => v > 0).map(([k]) => k);
  if (ids.length === 0) return null;
  return ids.map((id) => nameOf(b, id)).join(' & ');
}

export function snapshot(b: Bill, c: Computed): ShareSnapshot {
  return {
    restaurant: b.restaurant.value,
    date: b.date.value,
    currency: b.currency,
    total: c.split.computedTotal,
    paidBy: payersText(b),
    people: c.split.people.map((p) => ({
      id: p.participantId,
      name: nameOf(b, p.participantId),
      total: p.total,
      lines: p.lines.map((l) => ({ label: lineLabel(l), amount: l.amount })),
    })),
    transfers: c.settlement.transfers.map((t) => ({ from: t.from, to: t.to, amount: t.amount })),
  };
}

export function lineLabel(l: { kind: string; label: string; sharedWith: number }): string {
  if (l.kind === 'item') return l.sharedWith > 1 ? `Shared ${l.label}` : l.label;
  return `${l.label} share`;
}

export function personText(b: Bill, c: Computed, pid: string): string {
  const p = c.split.people.find((x) => x.participantId === pid);
  if (!p) return '';
  const lines = p.lines.map((l) => `• ${lineLabel(l)}: ${fmt(b, l.amount)}`);
  const owes = c.settlement.transfers.filter((t) => t.from === pid && !t.settled);
  const pay = owes.map((t) => `Pay ${nameOf(b, t.to)}: ${fmt(b, t.amount)}`);
  return [`${nameOf(b, pid)} — ${billTitle(b)}`, ...lines, `Total: ${fmt(b, p.total)}`, ...pay].join('\n');
}

export function wholeBillText(b: Bill, c: Computed, link?: string): string {
  const head = `🧾 ${billTitle(b)}${b.date.value ? ' · ' + displayDate(b.date.value) : ''}\nTotal bill: ${fmt(b, c.split.computedTotal)}${payersText(b) ? `, paid by ${payersText(b)}` : ''}`;
  const people = c.split.people.map((p) => `${nameOf(b, p.participantId)}: ${fmt(b, p.total)}`).join('\n');
  const transfers = c.settlement.transfers.length
    ? '\n\nTo settle up:\n' + c.settlement.transfers.map((t) => `${nameOf(b, t.from)} → ${nameOf(b, t.to)}: ${fmt(b, t.amount)}${t.settled ? ' ✅' : ''}`).join('\n')
    : '';
  return `${head}\n\n${people}${transfers}${link ? `\n\nFull breakdown: ${link}` : ''}\n\nSplit fairly with FairBill`;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

export function billHtml(b: Bill, c: Computed): string {
  const rows = (pid: string) => {
    const p = c.split.people.find((x) => x.participantId === pid)!;
    return p.lines.map((l) => `<tr><td>${esc(lineLabel(l))}</td><td class="r">${esc(fmt(b, l.amount))}</td></tr>`).join('');
  };
  const items = b.items
    .map((i) => `<tr><td>${esc(i.name.value ?? '—')}</td><td class="c">${i.quantity.value ?? '—'}</td><td class="r">${i.amount.value === null ? '—' : esc(fmt(b, i.amount.value - i.discount))}</td></tr>`)
    .join('');
  const charges = b.charges.map((ch) => `<tr><td colspan="2">${esc(ch.label)}</td><td class="r">${ch.amount.value === null ? '—' : esc(fmt(b, ch.amount.value))}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif;color:#0E1E16;padding:28px;font-size:13px}
    h1{color:#4F46E5;margin:0 0 2px;font-size:22px} .muted{color:#5B6075} h2{font-size:15px;margin:22px 0 6px}
    table{width:100%;border-collapse:collapse} td,th{padding:6px 4px;border-bottom:1px solid #E1E8E4;text-align:left} .r{text-align:right} .c{text-align:center}
    .total td{font-weight:700;border-top:2px solid #0E1E16} .card{border:1px solid #E1E8E4;border-radius:10px;padding:10px 12px;margin:8px 0;page-break-inside:avoid}
    .head{display:flex;justify-content:space-between;font-weight:700;font-size:14px}
  </style></head><body>
  <h1>FairBill</h1><div class="muted">Eat Together. Pay Fairly.</div>
  <h2>${esc(billTitle(b))}</h2><div class="muted">${esc([b.billNumber.value ? 'Bill ' + b.billNumber.value : '', displayDate(b.date.value)].filter(Boolean).join(' · '))}</div>
  <table><tr><th>Item</th><th class="c">Qty</th><th class="r">Amount</th></tr>${items}${charges}
  <tr class="total"><td colspan="2">Total</td><td class="r">${esc(fmt(b, c.split.computedTotal))}</td></tr></table>
  <div class="muted" style="margin-top:6px">Paid by ${esc(payersText(b) ?? '—')}</div>
  <h2>Individual shares</h2>
  ${c.split.people.map((p) => `<div class="card"><div class="head"><span>${esc(nameOf(b, p.participantId))}</span><span>${esc(fmt(b, p.total))}</span></div><table>${rows(p.participantId)}</table></div>`).join('')}
  ${c.settlement.transfers.length ? `<h2>Settle up</h2><table>${c.settlement.transfers.map((t) => `<tr><td>${esc(nameOf(b, t.from))} pays ${esc(nameOf(b, t.to))}</td><td class="r">${esc(fmt(b, t.amount))}</td><td class="r">${t.settled ? 'Paid' : 'Pending'}</td></tr>`).join('')}</table>` : ''}
  <p class="muted" style="margin-top:24px">Shares reconcile exactly with the restaurant total. Taxes are shown as printed on the bill.</p>
  </body></html>`;
}

export type BillPhase = 'Needs review' | 'Assigning' | 'Pending payments' | 'Settled';
export function phaseOf(b: Bill): BillPhase {
  if (b.status === 'draft') return 'Needs review';
  if (b.status === 'confirmed') return 'Assigning';
  const c = compute(b);
  return c.settlement.transfers.every((t) => t.settled) ? 'Settled' : 'Pending payments';
}

export function myShare(b: Bill): Minor | null {
  if (b.status !== 'final') return null;
  const me = b.participants.find((p) => p.isMe);
  if (!me) return null;
  return computeSplit(b).people.find((p) => p.participantId === me.id)?.total ?? null;
}
