/// <reference types="jest" />
import type { ShareView } from '../../api/client';
import { newBill, newItem } from '../../engine/factory';
import { computeSplit } from '../../engine/split';
import { applyPicks, claimFrom, pickStatus } from '../picks';

function setup() {
  const b = newBill('manual');
  b.items = [newItem('Biryani', 50000), newItem('Beer', 60000, 2), newItem('Raita', 8000)];
  b.total = { value: 118000, status: 'ok' };
  b.participants = [{ id: 'a', name: 'Adarsh', isMe: true }, { id: 'r', name: 'Rahul' }, { id: 'p', name: 'Priya' }];
  b.assignments = { [b.items[2].id]: { mode: 'equal', shares: { a: 1 } } };
  const [bi, be, ra] = b.items.map((i) => i.id);
  const view: ShareView = {
    token: 't', url: 'u', phase: 'picking', bill: null, hasPhoto: false, expiresAt: '', paid: {},
    claim: { ...claimFrom(b), people: [...claimFrom(b).people, { id: 'g_1', name: 'Karan', guest: true }, { id: 'g_2', name: 'priya', guest: true }] },
    picks: { r: [bi, be], g_1: [be], g_2: [be], a: [] },
  };
  return { b, view, bi, be, ra };
}

test('the claim lists every item at its printed amount', () => {
  const { b } = setup();
  expect(claimFrom(b).items.map((i) => [i.name, i.amount, i.quantity])).toEqual([['Biryani', 50000, 1], ['Beer', 60000, 2], ['Raita', 8000, 1]]);
});

test('guests who joined are added; one who typed an existing name is matched to that person', () => {
  const { b, view, be } = setup();
  const st = pickStatus(b, view);
  expect(st.newPeople).toEqual([{ id: 'g_1', name: 'Karan' }]);
  expect(st.byItem[be]).toEqual(['r', 'g_1', 'p']);
  expect(st.ticked).toBe(3);
});

test('ticked items are shared between the people who ticked them; others are left alone', () => {
  const { b, view, bi, be, ra } = setup();
  expect(applyPicks(b, view)).toEqual({ items: 2, people: 1 });
  expect(b.participants.map((p) => p.name)).toEqual(['Adarsh', 'Rahul', 'Priya', 'Karan']);
  expect(b.assignments[bi].shares).toEqual({ r: 1 });
  expect(b.assignments[be].shares).toEqual({ r: 1, g_1: 1, p: 1 });
  expect(b.assignments[ra].shares).toEqual({ a: 1 }); // nobody ticked it: unchanged
  const split = computeSplit(b);
  expect(split.issues.filter((i) => i.level === 'error')).toEqual([]);
  expect(split.people.reduce((s, p) => s + p.total, 0)).toBe(118000);
});
