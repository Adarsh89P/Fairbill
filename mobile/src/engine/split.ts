import { allocate, currencyFor, formatMoney, Minor, sum } from './money';
import {
  Bill,
  BillCharge,
  BillItem,
  ChargeKind,
  CHARGE_LABELS,
  DistributionMethod,
  DistributionRule,
  ItemAssignment,
  TAX_KINDS,
} from './types';

export const DEFAULT_RULES: Record<ChargeKind, DistributionRule> = {
  CGST: { method: 'equal' },
  SGST: { method: 'equal' },
  IGST: { method: 'equal' },
  GST: { method: 'equal' },
  SERVICE: { method: 'equal' },
  PACKAGING: { method: 'proportional' },
  DISCOUNT: { method: 'proportional' },
  TIP: { method: 'custom' },
  ROUND_OFF: { method: 'proportional' },
  OTHER: { method: 'proportional' },
};

export function ruleFor(bill: Bill, kind: ChargeKind): DistributionRule {
  return bill.rules[kind] ?? DEFAULT_RULES[kind];
}

export type IssueLevel = 'error' | 'warning';

export interface Issue {
  level: IssueLevel;
  code: string;
  message: string;
  itemId?: string;
  chargeId?: string;
}

export interface ShareLine {
  kind: 'item' | 'charge';
  refId: string;
  label: string;
  amount: Minor;
  sharedWith: number; // number of people sharing this line (1 = sole)
  chargeKind?: ChargeKind;
}

export interface PersonShare {
  participantId: string;
  lines: ShareLine[];
  itemsTotal: Minor;
  chargesTotal: Minor;
  total: Minor;
}

export interface SplitResult {
  people: PersonShare[];
  itemsTotal: Minor; // net of item-level discounts
  chargesTotal: Minor;
  computedTotal: Minor;
  issues: Issue[];
}

export function itemNet(item: BillItem): Minor | null {
  if (item.amount.value === null) return null;
  return item.amount.value - (item.discount || 0);
}

/** Convert a share value to an integer weight (percent keeps 2 decimals). */
function weightOf(mode: ItemAssignment['mode'], v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 0;
  if (mode === 'equal') return 1;
  return Math.round(v * 100);
}

export function describeShares(a: ItemAssignment | undefined): { ids: string[]; weights: number[] } {
  if (!a) return { ids: [], weights: [] };
  const ids: string[] = [];
  const weights: number[] = [];
  for (const [pid, v] of Object.entries(a.shares)) {
    const w = weightOf(a.mode, v);
    if (w > 0) {
      ids.push(pid);
      weights.push(w);
    }
  }
  return { ids, weights };
}

function chargeLabel(c: BillCharge): string {
  return c.label?.trim() || CHARGE_LABELS[c.kind];
}

/**
 * Pure, deterministic split. Every allocated amount is an integer and every
 * line is fully allocated, so the sum of person totals always equals
 * itemsTotal + chargesTotal exactly.
 */
export function computeSplit(bill: Bill): SplitResult {
  const issues: Issue[] = [];
  const people = bill.participants.map<PersonShare>((p) => ({
    participantId: p.id,
    lines: [],
    itemsTotal: 0,
    chargesTotal: 0,
    total: 0,
  }));
  const byId = new Map(people.map((p) => [p.participantId, p]));
  const validIds = new Set(bill.participants.map((p) => p.id));

  if (bill.participants.length === 0) {
    issues.push({ level: 'error', code: 'NO_PARTICIPANTS', message: 'Add at least one person to split the bill.' });
  }

  let itemsTotal = 0;
  for (const item of bill.items) {
    const net = itemNet(item);
    const name = item.name.value?.trim() || 'Unnamed item';
    if (net === null) {
      issues.push({ level: 'error', code: 'ITEM_NO_PRICE', itemId: item.id, message: `Price missing for "${name}".` });
      continue;
    }
    itemsTotal += net;
    const a = bill.assignments[item.id];
    const { ids, weights } = describeShares(a);
    const keep = ids.map((id, i) => ({ id, w: weights[i] })).filter((x) => validIds.has(x.id));
    if (keep.length === 0) {
      issues.push({ level: 'error', code: 'ITEM_UNASSIGNED', itemId: item.id, message: `"${name}" is not assigned to anyone.` });
      continue;
    }
    if (a?.mode === 'percent') {
      const pct = sum(keep.map((k) => k.w));
      if (pct !== 10000) {
        issues.push({
          level: 'error',
          code: 'PERCENT_NOT_100',
          itemId: item.id,
          message: `Percentages for "${name}" add up to ${pct / 100}%, not 100%.`,
        });
      }
    }
    if (a?.mode === 'quantity' && item.quantity.value) {
      const units = sum(keep.map((k) => k.w)) / 100;
      if (units !== item.quantity.value) {
        issues.push({
          level: 'error',
          code: 'QTY_MISMATCH',
          itemId: item.id,
          message: `"${name}" has quantity ${item.quantity.value} but ${units} assigned.`,
        });
      }
    }
    const parts = allocate(net, keep.map((k) => k.w));
    keep.forEach((k, i) => {
      const person = byId.get(k.id)!;
      person.lines.push({ kind: 'item', refId: item.id, label: name, amount: parts[i], sharedWith: keep.length });
      person.itemsTotal += parts[i];
    });
  }

  // Bases for proportional distribution: each person's consumption.
  const consumption = people.map((p) => Math.max(0, p.itemsTotal));
  const consumptionSum = sum(consumption);

  let chargesTotal = 0;
  for (const charge of bill.charges) {
    const label = chargeLabel(charge);
    if (charge.amount.value === null) {
      issues.push({ level: 'error', code: 'CHARGE_NO_AMOUNT', chargeId: charge.id, message: `Amount missing for ${label}.` });
      continue;
    }
    const amount = charge.amount.value;
    chargesTotal += amount;
    if (people.length === 0 || amount === 0) continue;
    const rule = ruleFor(bill, charge.kind);
    let method: DistributionMethod = rule.method;
    let weights: number[];
    if (method === 'custom') {
      weights = people.map((p) => Math.max(0, Math.round((rule.custom?.[p.participantId] ?? 0) * 100)));
      if (sum(weights) === 0) {
        issues.push({
          level: 'error',
          code: 'CUSTOM_NOT_SET',
          chargeId: charge.id,
          message: `Choose who pays the ${label} (custom split has no shares).`,
        });
        continue;
      }
    } else if (method === 'proportional') {
      if (consumptionSum === 0) {
        issues.push({
          level: 'warning',
          code: 'PROPORTIONAL_FALLBACK',
          chargeId: charge.id,
          message: `${label} split equally because no items are assigned yet.`,
        });
        weights = people.map(() => 1);
        method = 'equal';
      } else {
        weights = consumption;
      }
    } else {
      weights = people.map(() => 1);
    }
    const parts = allocate(amount, weights);
    const sharers = weights.filter((w) => w > 0).length;
    people.forEach((p, i) => {
      if (weights[i] === 0) return;
      p.lines.push({ kind: 'charge', refId: charge.id, label, amount: parts[i], sharedWith: sharers, chargeKind: charge.kind });
      p.chargesTotal += parts[i];
    });
  }

  for (const p of people) p.total = p.itemsTotal + p.chargesTotal;
  const computedTotal = itemsTotal + chargesTotal;

  issues.push(...reconcile(bill, itemsTotal, computedTotal));
  return { people, itemsTotal, chargesTotal, computedTotal, issues };
}

/** Compare our arithmetic with the amounts printed on the bill. */
/** Amount the user included on top of the printed bill (items/charges not on it). 0 when none. */
export function extraNotOnBill(bill: Bill): Minor {
  if (bill.printedTotal == null || bill.total.value === null) return 0;
  return Math.max(0, bill.total.value - bill.printedTotal);
}

export function reconcile(bill: Bill, itemsTotal: Minor, computedTotal: Minor): Issue[] {
  const issues: Issue[] = [];
  const cur = currencyFor(bill.currency);
  const fmt = (m: Minor) => formatMoney(m, cur);
  const total = bill.total.value;
  if (total === null) {
    issues.push({
      level: 'error',
      code: 'TOTAL_MISSING',
      message: 'Final bill amount not entered. Enter the amount printed on the bill.',
    });
  } else if (total !== computedTotal) {
    issues.push({
      level: 'error',
      code: 'TOTAL_MISMATCH',
      message: `Items and charges add up to ${fmt(computedTotal)} but the bill total is ${fmt(total)}.`,
    });
  }
  const subtotal = bill.subtotal.value;
  if (subtotal !== null) {
    // Extra added on top of the printed bill isn't part of the printed subtotal.
    const extra = extraNotOnBill(bill);
    const gross = sum(bill.items.map((i) => i.amount.value ?? 0)) - extra;
    if (subtotal !== itemsTotal - extra && subtotal !== gross) {
      issues.push({
        level: 'warning',
        code: 'SUBTOTAL_MISMATCH',
        message: `${extra ? "Items on the bill" : "Items"} add up to ${fmt(itemsTotal - extra)} but the printed subtotal is ${fmt(subtotal)}. An item may be missing or misread.`,
      });
    }
  }
  const cgst = bill.charges.filter((c) => c.kind === 'CGST').map((c) => c.amount.value ?? 0);
  const sgst = bill.charges.filter((c) => c.kind === 'SGST').map((c) => c.amount.value ?? 0);
  if (cgst.length && sgst.length && sum(cgst) !== sum(sgst)) {
    issues.push({
      level: 'warning',
      code: 'CGST_SGST_DIFFER',
      message: 'CGST and SGST are usually equal. Please double-check the tax lines.',
    });
  }
  const hasIgst = bill.charges.some((c) => c.kind === 'IGST');
  if (hasIgst && (cgst.length || sgst.length)) {
    issues.push({
      level: 'warning',
      code: 'IGST_WITH_CGST',
      message: 'Bill shows both IGST and CGST/SGST. Please check that no tax line is duplicated.',
    });
  }
  return issues;
}

export function isTax(kind: ChargeKind): boolean {
  return TAX_KINDS.includes(kind);
}

/** Items that look like duplicates (same name and amount). Never removed automatically. */
export function findDuplicates(items: BillItem[]): Set<string> {
  const seen = new Map<string, string>();
  const dups = new Set<string>();
  for (const it of items) {
    const name = it.name.value?.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!name || it.amount.value === null) continue;
    const key = `${name}|${it.amount.value}`;
    const first = seen.get(key);
    if (first) {
      dups.add(first);
      dups.add(it.id);
    } else seen.set(key, it.id);
  }
  return dups;
}

export interface ReviewState {
  verified: number;
  needsVerification: number;
  notDetected: number;
}

/** Every field the user still has to look at before confirming. */
export function pendingReview(bill: Bill): { blocking: string[]; counts: ReviewState } {
  const blocking: string[] = [];
  const counts: ReviewState = { verified: 0, needsVerification: 0, notDetected: 0 };
  for (const it of bill.items) {
    const st = itemStatus(it);
    if (st === 'ok') counts.verified++;
    else if (st === 'verify') counts.needsVerification++;
    else counts.notDetected++;
    if (st !== 'ok') blocking.push(`Review "${it.name.value?.trim() || 'unnamed item'}"`);
  }
  for (const c of bill.charges) {
    const st = c.amount.value === null ? 'missing' : c.amount.status;
    if (st === 'ok') counts.verified++;
    else if (st === 'verify') counts.needsVerification++;
    else counts.notDetected++;
    if (st !== 'ok') blocking.push(`Review ${chargeLabel(c)}`);
  }
  if (bill.total.status === 'verify') blocking.push('Confirm the final bill amount');
  if (bill.subtotal.status === 'verify') blocking.push('Confirm the subtotal');
  return { blocking, counts };
}

export function itemStatus(it: BillItem): 'ok' | 'verify' | 'missing' {
  if (it.amount.value === null || it.name.value === null || !it.name.value.trim()) return 'missing';
  if (it.amount.status === 'missing' || it.name.status === 'missing') return 'missing';
  if (it.amount.status === 'verify' || it.name.status === 'verify' || it.quantity.status !== 'ok') return 'verify';
  return 'ok';
}
