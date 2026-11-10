/// <reference types="jest" />
import { newBill, newItem } from '../../engine/factory';
import { sum } from '../../engine/money';
import type { Bill, Participant } from '../../engine/types';
import { Trip, tripSummary, tripText } from '../trip';

const trip: Trip = { id: 't', name: 'Goa', currency: 'INR', createdAt: '', updatedAt: '', settled: {} };

/** A finished bill: one item shared equally by everyone, paid by `payer`. */
function bill(total: number, people: Participant[], payer: string, at: string): Bill {
  const b = newBill('manual');
  b.createdAt = at;
  b.status = 'final';
  b.items = [newItem('Dinner', total)];
  b.total = { value: total, status: 'ok' };
  b.participants = people;
  b.assignments = { [b.items[0].id]: { mode: 'equal', shares: Object.fromEntries(people.map((p) => [p.id, 1])) } };
  b.payments = { [payer]: total };
  return b;
}

describe('trip settle-up', () => {
  const b1 = () => bill(90000, [{ id: 'a1', name: 'Adarsh', isMe: true }, { id: 'r1', name: 'Rahul', phone: '98765 43210' }, { id: 'p1', name: 'Priya' }], 'a1', '1');
  // Rahul has no phone number on this bill, and a different id: still the same person.
  const b2 = () => bill(60000, [{ id: 'a2', name: 'Me', isMe: true }, { id: 'r2', name: 'rahul ' }], 'r2', '2');

  test('combines bills into fewer transfers that still move exactly what is owed', () => {
    const s = tripSummary(trip, [b1(), b2()]);
    expect(s.included).toHaveLength(2);
    expect(s.total).toBe(150000);
    expect(s.people.map((p) => p.key)).toEqual(['me', 'n:priya', 'ph:919876543210']);
    expect(s.people.map((p) => p.name)).toEqual(['Adarsh', 'Priya', 'Rahul']);
    // Adarsh +600 -300, Rahul -300 +300, Priya -300  =>  only Priya pays Adarsh.
    expect(s.transfers).toEqual([{ key: 'n:priya->me', from: 'n:priya', to: 'me', amount: 30000, settled: false }]);
    expect(sum(s.people.map((p) => p.net))).toBe(0);
    expect(sum(s.people.map((p) => p.spent))).toBe(s.total);
  });

  test('payments already made on a single bill count towards the trip', () => {
    const first = b1();
    first.settled = { 'p1->a1': true }; // Priya already paid Adarsh for bill 1
    const s = tripSummary(trip, [first, b2()]);
    expect(s.transfers).toEqual([]);
    expect(tripText(trip, s)).toContain('Everyone is square');
  });

  test('unfinished bills and other currencies are listed, never guessed', () => {
    const open = b2();
    open.assignments = {};
    const usd = b1();
    usd.currency = 'USD';
    const s = tripSummary(trip, [b1(), open, usd]);
    expect(s.included).toHaveLength(1);
    expect(s.excluded.map((e) => e.reason)).toEqual(['In USD, the trip is in INR', expect.stringMatching(/assign/i)]);
  });

  test('trip-level paid marks are kept per transfer', () => {
    const s = tripSummary({ ...trip, settled: { 'n:priya->me': true } }, [b1(), b2()]);
    expect(s.transfers[0].settled).toBe(true);
  });
});
