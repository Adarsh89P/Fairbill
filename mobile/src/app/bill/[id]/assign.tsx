import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Icon } from '../../../components/Icon';
import { Banner, Btn, Card, Chip, Empty, Row, Screen, Segmented, Steps, T } from '../../../components/ui';
import { allocate } from '../../../engine/money';
import { computeSplit, describeShares, itemNet } from '../../../engine/split';
import type { Bill, BillItem, ShareMode } from '../../../engine/types';
import { fmt } from '../../../lib/billText';
import { useBill } from '../../../store/AppStore';
import { useTheme } from '../../../theme/ThemeProvider';
import { radius, space, type } from '../../../theme/theme';

export default function Assign() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { bill, update } = useBill(id);
  const split = useMemo(() => (bill ? computeSplit(bill) : null), [bill]);
  if (!bill || !split) return <Screen><Empty icon="receipt" title="Bill not found" /></Screen>;
  if (bill.participants.length === 0) {
    return <Screen><Empty icon="users" title="Add people first" action={<Btn title="Add people" onPress={() => router.replace(`/bill/${bill.id}/people`)} />} /></Screen>;
  }

  const itemErrors = split.issues.filter((i) => i.itemId && i.level === 'error');
  const assigned = bill.items.filter((i) => describeShares(bill.assignments[i.id]).ids.length > 0).length;
  const everyone = Object.fromEntries(bill.participants.map((p) => [p.id, 1]));

  const splitRestEqually = () =>
    update((d) => {
      for (const it of d.items) if (!describeShares(d.assignments[it.id]).ids.length) d.assignments[it.id] = { mode: 'equal', shares: { ...everyone } };
    });

  return (
    <Screen footer={
      <>
        {itemErrors.length ? <T v="small" muted style={{ textAlign: 'center' }}>{itemErrors[0].message}</T> : null}
        <Btn title="Continue" icon="chevronRight" disabled={itemErrors.length > 0} onPress={() => router.push(`/bill/${bill.id}/charges`)} />
      </>
    }>
      <Steps current={2} />
      <PickingCard bill={bill} />
      <Row style={{ justifyContent: 'space-between' }}>
        <T muted>{assigned} of {bill.items.length} items assigned</T>
        {assigned < bill.items.length ? <Btn title="Share the rest with everyone" small variant="ghost" onPress={splitRestEqually} /> : null}
      </Row>
      {bill.participants.length > 2 && bill.items.length > 1 ? (
        <Btn title="Everyone except…" icon="users" variant="secondary" small onPress={() => router.push(`/bill/${bill.id}/bulk`)}
          accessibilityHint="Share several items between everyone but a few people" />
      ) : null}
      {bill.items.map((it) => <ItemAssign key={it.id} bill={bill} item={it} update={update} error={itemErrors.find((e) => e.itemId === it.id)?.message} />)}
      <PersonPreview bill={bill} people={split.people} />
    </Screen>
  );
}

function PickingCard({ bill }: { bill: Bill }) {
  const { c } = useTheme();
  const picking = bill.share?.phase === 'picking';
  return (
    <Card onPress={() => router.push(`/bill/${bill.id}/picks`)} accessibilityLabel="Let friends tick what they had"
      style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: c.primarySoft, borderColor: c.primarySoft }}>
      <Icon name="share" color={c.primary} />
      <View style={{ flex: 1 }}>
        <T v="bodyStrong" color={c.primary}>{picking ? "See what friends ticked" : 'Let friends tick what they had'}</T>
        <T v="small" muted>{picking ? 'Their picks fill in the items below' : 'Send a link — each person picks their own dishes'}</T>
      </View>
      <Icon name="chevronRight" color={c.primary} />
    </Card>
  );
}

function ItemAssign({ bill, item, update, error }: { bill: Bill; item: BillItem; update: (fn: (d: Bill) => void) => void; error?: string }) {
  const { c } = useTheme();
  const a = bill.assignments[item.id];
  const [open, setOpen] = useState(a ? a.mode !== 'equal' : false);
  const net = itemNet(item) ?? 0;
  const { ids, weights } = describeShares(a);
  const allSelected = bill.participants.every((p) => ids.includes(p.id));
  const parts = ids.length ? allocate(net, weights) : [];

  const toggle = (pid: string) =>
    update((d) => {
      const cur = d.assignments[item.id] ?? { mode: 'equal', shares: {} };
      if (cur.shares[pid]) delete cur.shares[pid];
      else cur.shares[pid] = cur.mode === 'equal' ? 1 : 0;
      d.assignments[item.id] = cur;
    });
  const setAll = () =>
    update((d) => {
      d.assignments[item.id] = allSelected ? { mode: 'equal', shares: {} } : { mode: 'equal', shares: Object.fromEntries(d.participants.map((p) => [p.id, 1])) };
    });
  const setMode = (mode: ShareMode) =>
    update((d) => {
      const cur = d.assignments[item.id] ?? { mode: 'equal', shares: {} };
      const sel = Object.keys(cur.shares).filter((k) => cur.shares[k] > 0 || cur.mode !== 'equal');
      const n = sel.length || 1;
      let shares: Record<string, number> = {};
      if (mode === 'equal') shares = Object.fromEntries(sel.map((k) => [k, 1]));
      if (mode === 'percent') {
        // Start from an even split in whole percent; the last person takes the remainder.
        const base = Math.floor(100 / n);
        shares = Object.fromEntries(sel.map((k, i) => [k, i === n - 1 ? 100 - base * (n - 1) : base]));
      }
      if (mode === 'quantity') {
        const qty = d.items.find((x) => x.id === item.id)?.quantity.value ?? n;
        const base = Math.floor(qty / n);
        shares = Object.fromEntries(sel.map((k, i) => [k, i === n - 1 ? qty - base * (n - 1) : base]));
      }
      d.assignments[item.id] = { mode, shares };
    });
  const setShare = (pid: string, text: string) =>
    update((d) => {
      const cur = d.assignments[item.id];
      if (!cur) return;
      const v = Number(text.replace(',', '.'));
      cur.shares[pid] = Number.isFinite(v) && v >= 0 ? v : 0;
    });

  return (
    <Card style={{ gap: space(3), borderColor: error ? c.danger : ids.length ? c.border : c.warning }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <T v="bodyStrong">{item.name.value}</T>
          <T v="small" muted>{item.quantity.value ? `Qty ${item.quantity.value} · ` : ''}{shareLabel(bill, ids)}</T>
        </View>
        <T v="amount">{fmt(bill, net)}</T>
      </Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
        {bill.participants.length > 1 ? <Chip label="Everyone" icon="users" selected={allSelected} onPress={setAll} /> : null}
        {bill.participants.map((p) => <Chip key={p.id} label={p.name} avatarId={p.id} selected={a?.shares[p.id] !== undefined} onPress={() => toggle(p.id)} />)}
      </View>
      {ids.length > 1 || (a && a.mode !== 'equal') ? (
        open ? (
          <View style={{ gap: space(2) }}>
            <Segmented options={[{ key: 'equal', label: 'Equally' }, { key: 'percent', label: 'By %' }, { key: 'quantity', label: 'By quantity' }]}
              value={a?.mode ?? 'equal'} onChange={setMode} />
            {Object.keys(a?.shares ?? {}).map((pid) => {
              const p = bill.participants.find((x) => x.id === pid);
              if (!p) return null;
              const idx = ids.indexOf(pid);
              return (
                <Row key={pid} style={{ justifyContent: 'space-between' }}>
                  <T style={{ flex: 1 }}>{p.name}</T>
                  {a?.mode !== 'equal' ? (
                    <TextInput accessibilityLabel={`${a?.mode === 'percent' ? 'Percent' : 'Quantity'} for ${p.name}`} keyboardType="decimal-pad" inputMode="decimal"
                      defaultValue={String(a?.shares[pid] ?? 0)} onChangeText={(t) => setShare(pid, t)}
                      style={[type.body, { color: c.text, width: 72, textAlign: 'right', borderWidth: 1.5, borderColor: c.border, borderRadius: radius.sm, paddingHorizontal: 8, minHeight: 40 }]} />
                  ) : null}
                  <T v="small" muted style={{ width: 24, textAlign: 'center' }}>{a?.mode === 'percent' ? '%' : a?.mode === 'quantity' ? 'pcs' : ''}</T>
                  <T v="bodyStrong" style={{ width: 90, textAlign: 'right' }}>{idx >= 0 ? fmt(bill, parts[idx]) : '—'}</T>
                </Row>
              );
            })}
          </View>
        ) : (
          <Btn title="Split differently (%, quantity)" small variant="ghost" onPress={() => setOpen(true)} />
        )
      ) : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}
    </Card>
  );
}

function shareLabel(bill: Bill, ids: string[]): string {
  const n = bill.participants.length;
  if (!ids.length) return 'Not assigned yet';
  if (ids.length === n) return n > 1 ? 'Everyone' : 'One person';
  const out = bill.participants.filter((p) => !ids.includes(p.id));
  // "Everyone except Priya" reads better than "Shared by 5" when only one or two are left out.
  if (n >= 4 && out.length <= 2) return `Everyone except ${out.map((p) => p.name).join(' & ')}`;
  return ids.length > 1 ? `Shared by ${ids.length}` : 'One person';
}

function PersonPreview({ bill, people }: { bill: Bill; people: ReturnType<typeof computeSplit>['people'] }) {
  return (
    <Card style={{ gap: space(2) }}>
      <T v="caption" muted>FOOD & DRINKS SO FAR</T>
      {people.map((p) => (
        <Row key={p.participantId} style={{ justifyContent: 'space-between' }}>
          <T>{bill.participants.find((x) => x.id === p.participantId)?.name}</T>
          <T v="bodyStrong">{fmt(bill, p.itemsTotal)}</T>
        </Row>
      ))}
    </Card>
  );
}
