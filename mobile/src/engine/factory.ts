import type { Minor } from './money';
import type { Bill, BillCharge, BillItem, ChargeKind, Tracked } from './types';
import { CHARGE_LABELS } from './types';

let counter = 0;
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function ok<T>(value: T): Tracked<T> {
  return { value, status: 'ok' };
}
export function missing<T>(note?: string): Tracked<T> {
  return { value: null, status: 'missing', note };
}
/** A value the user typed in; null means intentionally left blank. */
export function manual<T>(value: T | null): Tracked<T> {
  return value === null ? { value: null, status: 'missing' } : { value, status: 'ok' };
}

export function newBill(origin: Bill['origin'], currency = 'INR'): Bill {
  const now = new Date().toISOString();
  return {
    id: uid('bill'),
    createdAt: now,
    updatedAt: now,
    status: 'draft',
    currency,
    origin,
    restaurant: manual<string>(null),
    billNumber: manual<string>(null),
    date: ok(now.slice(0, 10)),
    subtotal: manual<Minor>(null),
    total: manual<Minor>(null),
    items: [],
    charges: [],
    warnings: [],
    participants: [],
    assignments: {},
    rules: {},
    payments: {},
    settled: {},
  };
}

export function newItem(name: string | null, amount: Minor | null, quantity = 1, unitPrice: Minor | null = null): BillItem {
  return {
    id: uid('item'),
    name: manual(name),
    quantity: ok(quantity),
    unitPrice: manual(unitPrice),
    amount: manual(amount),
    discount: 0,
    source: 'manual',
  };
}

export function newCharge(kind: ChargeKind, amount: Minor | null, label?: string): BillCharge {
  return { id: uid('chg'), kind, label: label ?? CHARGE_LABELS[kind], amount: manual(amount), source: 'manual' };
}
