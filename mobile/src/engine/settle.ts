import { Minor, sum } from './money';
import type { Bill } from './types';
import type { SplitResult } from './split';

export interface Transfer {
  key: string; // `${from}->${to}`
  from: string;
  to: string;
  amount: Minor;
  settled: boolean;
}

export interface PersonBalance {
  participantId: string;
  owes: Minor; // share of the bill
  paid: Minor; // paid to the restaurant
  net: Minor; // paid - owes; positive = should receive
  pending: Minor; // still to pay others (unsettled transfers)
  toReceive: Minor; // still to receive (unsettled transfers)
}

export interface Settlement {
  transfers: Transfer[];
  balances: PersonBalance[];
  paidTotal: Minor;
  issues: string[];
}

/**
 * Greedy settlement: largest debtor pays largest creditor until everyone is
 * square. Produces at most n-1 transfers and moves exactly the amounts owed.
 */
export function settle(bill: Bill, split: SplitResult): Settlement {
  const issues: string[] = [];
  const paidTotal = sum(Object.values(bill.payments).map((v) => v || 0));
  const billTotal = split.computedTotal;
  if (paidTotal !== billTotal) {
    issues.push(
      paidTotal === 0
        ? 'Select who paid the restaurant.'
        : 'Amounts paid to the restaurant do not add up to the bill total.',
    );
  }
  const balances: PersonBalance[] = split.people.map((p) => {
    const paid = bill.payments[p.participantId] ?? 0;
    return { participantId: p.participantId, owes: p.total, paid, net: paid - p.total, pending: 0, toReceive: 0 };
  });

  const transfers: Transfer[] = [];
  if (issues.length === 0) {
    const debtors = balances.filter((b) => b.net < 0).map((b) => ({ id: b.participantId, left: -b.net }));
    const creditors = balances.filter((b) => b.net > 0).map((b) => ({ id: b.participantId, left: b.net }));
    const order = (a: { left: number; id: string }, b: { left: number; id: string }) =>
      b.left - a.left || a.id.localeCompare(b.id);
    debtors.sort(order);
    creditors.sort(order);
    let i = 0;
    let j = 0;
    while (i < debtors.length && j < creditors.length) {
      const amount = Math.min(debtors[i].left, creditors[j].left);
      if (amount > 0) {
        const key = `${debtors[i].id}->${creditors[j].id}`;
        transfers.push({ key, from: debtors[i].id, to: creditors[j].id, amount, settled: !!bill.settled[key] });
      }
      debtors[i].left -= amount;
      creditors[j].left -= amount;
      if (debtors[i].left === 0) i++;
      if (creditors[j].left === 0) j++;
    }
    for (const t of transfers) {
      if (t.settled) continue;
      balances.find((b) => b.participantId === t.from)!.pending += t.amount;
      balances.find((b) => b.participantId === t.to)!.toReceive += t.amount;
    }
  }
  return { transfers, balances, paidTotal, issues };
}
