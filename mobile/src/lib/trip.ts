import { currencyFor, formatMoney, Minor, sum } from '../engine/money';
import { greedyTransfers } from '../engine/settle';
import type { Bill, Participant } from '../engine/types';
import { billTitle, compute } from './billText';
import { waNumber } from './phone';

export interface Trip {
  id: string;
  name: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
  /** Trip-level settle-up: `${fromKey}->${toKey}` -> paid. */
  settled: Record<string, boolean>;
}

/** The same friend appears with a different id on every bill; match them by phone, then by name. */
export function personKey(p: Participant): string {
  if (p.isMe) return 'me';
  const ph = waNumber(p.phone);
  if (ph) return `ph:${ph}`;
  return `n:${p.name.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

export interface TripPerson {
  key: string;
  name: string;
  phone?: string;
  isMe?: boolean;
  /** Their share of everything eaten on the trip. */
  spent: Minor;
  /** What they paid restaurants. */
  paid: Minor;
  /** paid - spent, adjusted for per-bill payments already made. Positive = gets money back. */
  net: Minor;
}

export interface TripTransfer {
  key: string;
  from: string;
  to: string;
  amount: Minor;
  settled: boolean;
}

export interface TripSummary {
  currency: string;
  total: Minor;
  included: Bill[];
  excluded: { bill: Bill; reason: string }[];
  people: TripPerson[];
  transfers: TripTransfer[];
}

/**
 * Combines every finished bill of a trip into one settle-up. Bills that are not fully split, or in
 * another currency, are left out (and listed) rather than guessed at.
 */
export function tripSummary(trip: Trip, bills: Bill[]): TripSummary {
  const included: Bill[] = [];
  const excluded: { bill: Bill; reason: string }[] = [];
  const people = new Map<string, TripPerson>();
  // If a friend has a phone number on any bill, use it to recognise them on the bills where they don't.
  const phoneByName = new Map<string, string | null>();
  for (const b of bills) {
    for (const p of b.participants) {
      const k = personKey(p);
      if (!k.startsWith('ph:')) continue;
      const n = personKey({ ...p, phone: undefined });
      const prev = phoneByName.get(n);
      phoneByName.set(n, prev === undefined || prev === k ? k : null); // two different numbers -> ambiguous
    }
  }
  const keyOf = (p: Participant) => {
    const k = personKey(p);
    return k.startsWith('n:') ? phoneByName.get(k) ?? k : k;
  };
  const person = (p: Participant) => {
    const key = keyOf(p);
    let tp = people.get(key);
    if (!tp) {
      tp = { key, name: p.name, phone: p.phone, isMe: p.isMe, spent: 0, paid: 0, net: 0 };
      people.set(key, tp);
    }
    if (!tp.phone && p.phone) tp.phone = p.phone;
    return tp;
  };

  for (const b of [...bills].sort((a, z) => a.createdAt.localeCompare(z.createdAt))) {
    if (b.currency !== trip.currency) {
      excluded.push({ bill: b, reason: `In ${b.currency}, the trip is in ${trip.currency}` });
      continue;
    }
    if (b.status === 'draft') {
      excluded.push({ bill: b, reason: 'Still being reviewed' });
      continue;
    }
    const c = compute(b);
    if (c.errors.length || c.settlement.issues.length) {
      excluded.push({ bill: b, reason: c.errors[0]?.message ?? c.settlement.issues[0] ?? 'Not fully split yet' });
      continue;
    }
    included.push(b);
    const byId = new Map(b.participants.map((p) => [p.id, p]));
    for (const bal of c.settlement.balances) {
      const p = byId.get(bal.participantId);
      if (!p) continue;
      const tp = person(p);
      tp.spent += bal.owes;
      tp.paid += bal.paid;
      tp.net += bal.net;
    }
    // Money already handed over for this bill counts towards the trip settle-up.
    for (const t of c.settlement.transfers) {
      if (!t.settled) continue;
      const from = byId.get(t.from);
      const to = byId.get(t.to);
      if (!from || !to) continue;
      person(from).net += t.amount;
      person(to).net -= t.amount;
    }
  }

  const list = [...people.values()].sort((a, z) => Number(!!z.isMe) - Number(!!a.isMe) || a.name.localeCompare(z.name));
  const transfers = greedyTransfers(Object.fromEntries(list.map((p) => [p.key, p.net]))).map((t) => {
    const key = `${t.from}->${t.to}`;
    return { key, ...t, settled: !!trip.settled[key] };
  });
  return { currency: trip.currency, total: sum(included.map((b) => compute(b).split.computedTotal)), included, excluded, people: list, transfers };
}

export function tripText(trip: Trip, s: TripSummary): string {
  const cur = currencyFor(s.currency);
  const m = (v: Minor) => formatMoney(v, cur);
  const name = (k: string) => s.people.find((p) => p.key === k)?.name ?? 'Someone';
  const lines = [`*${trip.name}* — ${s.included.length} bill${s.included.length === 1 ? '' : 's'}, ${m(s.total)} in total`, ''];
  const open = s.transfers.filter((t) => !t.settled);
  if (open.length) {
    lines.push('*Settle up*');
    for (const t of open) lines.push(`• ${name(t.from)} pays ${name(t.to)} ${m(t.amount)}`);
  } else {
    lines.push('Everyone is square. ✅');
  }
  lines.push('', '*Who spent what*');
  for (const p of s.people) lines.push(`• ${p.name}: ${m(p.spent)}`);
  lines.push('', '*Bills*');
  for (const b of s.included) lines.push(`• ${billTitle(b)}: ${m(compute(b).split.computedTotal)}`);
  lines.push('', 'Split with FairBill — amounts reconcile exactly with each bill.');
  return lines.join('\n');
}

export function tripPersonText(trip: Trip, s: TripSummary, key: string): string {
  const cur = currencyFor(s.currency);
  const m = (v: Minor) => formatMoney(v, cur);
  const p = s.people.find((x) => x.key === key);
  const name = (k: string) => s.people.find((x) => x.key === k)?.name ?? 'Someone';
  const pays = s.transfers.filter((t) => !t.settled && t.from === key);
  const gets = s.transfers.filter((t) => !t.settled && t.to === key);
  const lines = [`Hi ${p?.name ?? ''}! Here's your share for *${trip.name}*:`, `You spent ${m(p?.spent ?? 0)} across ${s.included.length} bills.`];
  for (const t of pays) lines.push(`Please pay ${name(t.to)} ${m(t.amount)}.`);
  for (const t of gets) lines.push(`${name(t.from)} will pay you ${m(t.amount)}.`);
  if (!pays.length && !gets.length) lines.push("You're all square. ✅");
  return lines.join('\n');
}
