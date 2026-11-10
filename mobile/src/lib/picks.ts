import type { ClaimSnapshot, ShareView } from '../api/client';
import { itemNet } from '../engine/split';
import type { Bill } from '../engine/types';

/** The list friends tick from: every item with its printed amount, and everyone on the bill so far. */
export function claimFrom(b: Bill): ClaimSnapshot {
  return {
    restaurant: b.restaurant.value,
    currency: b.currency,
    items: b.items.map((it) => ({ id: it.id, name: (it.name.value ?? 'Item').slice(0, 120), amount: itemNet(it) ?? 0, quantity: it.quantity.value })),
    people: b.participants.map((p) => ({ id: p.id, name: p.name.slice(0, 80) })),
  };
}

export interface PickStatus {
  /** item id -> participant ids (bill ids) who ticked it. */
  byItem: Record<string, string[]>;
  /** Friends who joined from the link and are not on the bill yet. */
  newPeople: { id: string; name: string }[];
  /** participant id on the link -> participant id on the bill. */
  idMap: Record<string, string>;
  ticked: number; // people who ticked at least one item
}

export function pickStatus(b: Bill, v: ShareView): PickStatus {
  const idMap: Record<string, string> = {};
  const newPeople: { id: string; name: string }[] = [];
  for (const p of v.claim?.people ?? []) {
    const same = b.participants.find((x) => x.id === p.id) ?? b.participants.find((x) => x.name.trim().toLowerCase() === p.name.trim().toLowerCase());
    if (same) idMap[p.id] = same.id;
    else {
      idMap[p.id] = p.id;
      newPeople.push({ id: p.id, name: p.name });
    }
  }
  const byItem: Record<string, string[]> = Object.fromEntries(b.items.map((i) => [i.id, [] as string[]]));
  let ticked = 0;
  for (const [pid, items] of Object.entries(v.picks ?? {})) {
    const who = idMap[pid];
    if (!who || !items.length) continue;
    ticked++;
    for (const iid of items) if (byItem[iid] && !byItem[iid].includes(who)) byItem[iid].push(who);
  }
  return { byItem, newPeople, idMap, ticked };
}

/**
 * Adds friends who joined from the link and shares every ticked item equally between the people who
 * ticked it. Items nobody ticked keep whatever was set in the app.
 */
export function applyPicks(d: Bill, v: ShareView): { items: number; people: number } {
  const st = pickStatus(d, v);
  for (const p of st.newPeople) d.participants.push({ id: p.id, name: p.name.slice(0, 40) });
  let items = 0;
  for (const [iid, who] of Object.entries(st.byItem)) {
    if (!who.length) continue;
    d.assignments[iid] = { mode: 'equal', shares: Object.fromEntries(who.map((w) => [w, 1])) };
    items++;
  }
  return { items, people: st.newPeople.length };
}
