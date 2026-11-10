import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '../../../components/Icon';
import { Avatar, Btn, Card, Empty, Row, Screen, SectionTitle, T } from '../../../components/ui';
import { describeShares, itemNet } from '../../../engine/split';
import { fmt } from '../../../lib/billText';
import { useBill } from '../../../store/AppStore';
import { useTheme } from '../../../theme/ThemeProvider';
import { radius, space } from '../../../theme/theme';

/**
 * "Everyone except…": share several items at once between everybody but a few people —
 * drinks without the person who doesn't drink, the chicken without the vegetarian.
 */
export default function BulkAssign() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { bill, update } = useBill(id);
  const { c } = useTheme();
  const unassigned = useMemo(() => new Set(bill?.items.filter((i) => !describeShares(bill.assignments[i.id]).ids.length).map((i) => i.id) ?? []), [bill]);
  const [items, setItems] = useState<Set<string>>(() => new Set(unassigned.size ? unassigned : []));
  const [left, setLeft] = useState<Set<string>>(new Set());
  if (!bill) return <Screen><Empty icon="receipt" title="Bill not found" /></Screen>;

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, k: string) => {
    const n = new Set(set);
    if (n.has(k)) n.delete(k); else n.add(k);
    setter(n);
  };
  const sharers = bill.participants.filter((p) => !left.has(p.id));
  const leftNames = bill.participants.filter((p) => left.has(p.id)).map((p) => p.name);
  const apply = () => {
    update((d) => {
      for (const iid of items) d.assignments[iid] = { mode: 'equal', shares: Object.fromEntries(sharers.map((p) => [p.id, 1])) };
    });
    router.back();
  };
  const title = !items.size ? 'Pick some items'
    : !sharers.length ? 'Leave at least one person in'
    : `Share ${items.size} item${items.size === 1 ? '' : 's'} between ${sharers.length === bill.participants.length ? 'everyone' : `${sharers.length} ${sharers.length === 1 ? 'person' : 'people'}`}`;

  return (
    <Screen footer={<Btn title={title} icon="check" disabled={!items.size || !sharers.length} onPress={apply} />}>
      <SectionTitle>Everyone except…</SectionTitle>
      <T v="small" muted>Tap the people who didn't have these. Everyone else shares them equally.</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
        {bill.participants.map((p) => {
          const out = left.has(p.id);
          return (
            <Pressable key={p.id} onPress={() => toggle(left, setLeft, p.id)} accessibilityRole="checkbox" aria-checked={!out}
              accessibilityLabel={`${p.name}, ${out ? 'left out' : 'sharing'}`}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space(1.5), minHeight: 44, paddingHorizontal: space(3),
                borderRadius: radius.pill, borderWidth: 1.5, borderStyle: out ? 'dashed' : 'solid', borderColor: out ? c.border : c.primary,
                backgroundColor: out ? c.surface : c.primarySoft, opacity: pressed ? 0.8 : 1 })}>
              <View style={{ opacity: out ? 0.4 : 1 }}><Avatar name={p.name} id={p.id} size={26} /></View>
              <T v="bodyStrong" color={out ? c.textMuted : c.primary} style={{ textDecorationLine: out ? 'line-through' : 'none' }}>{p.name}</T>
              <Icon name={out ? 'x' : 'check'} size={14} color={out ? c.textMuted : c.primary} strokeWidth={3} />
            </Pressable>
          );
        })}
      </View>
      {leftNames.length ? <T v="small" color={c.primary}>Everyone except {leftNames.join(', ')}</T> : null}

      <SectionTitle right={
        <Row gap={1}>
          <Btn title="All" small variant="ghost" onPress={() => setItems(new Set(bill.items.map((i) => i.id)))} />
          <Btn title="None" small variant="ghost" onPress={() => setItems(new Set())} />
        </Row>
      }>Items</SectionTitle>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {bill.items.map((it, i) => {
          const on = items.has(it.id);
          const who = describeShares(bill.assignments[it.id]).ids;
          return (
            <Pressable key={it.id} onPress={() => toggle(items, setItems, it.id)} accessibilityRole="checkbox" aria-checked={on} accessibilityLabel={it.name.value ?? 'Item'}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4), paddingVertical: space(3),
                borderTopWidth: i ? 1 : 0, borderColor: c.border, backgroundColor: pressed ? c.surfaceAlt : 'transparent' })}>
              <View style={{ width: 24, height: 24, borderRadius: radius.sm, borderWidth: 2, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {on ? <Icon name="check" size={15} color={c.onPrimary} strokeWidth={3} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <T v="bodyStrong" numberOfLines={1}>{it.name.value}</T>
                <T v="small" muted>{who.length ? `Now: ${who.length === bill.participants.length ? 'everyone' : who.map((w) => bill.participants.find((p) => p.id === w)?.name).join(', ')}` : 'Not assigned yet'}</T>
              </View>
              <T v="bodyStrong">{fmt(bill, itemNet(it) ?? 0)}</T>
            </Pressable>
          );
        })}
      </Card>
    </Screen>
  );
}
