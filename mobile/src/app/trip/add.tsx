import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { Btn, Card, Empty, Screen, T } from '../../components/ui';
import { billTitle, displayDate, fmt } from '../../lib/billText';
import { useStore } from '../../store/AppStore';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/theme';

/** Pick bills you already have to put into a trip. */
export default function AddToTrip() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { bills, trips, updateBill } = useStore();
  const { c } = useTheme();
  const trip = trips.find((t) => t.id === tripId);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  if (!trip) return <Screen><Empty icon="trip" title="Trip not found" /></Screen>;
  const candidates = bills.filter((b) => b.tripId !== trip.id);
  const tripName = (id?: string) => trips.find((t) => t.id === id)?.name;

  return (
    <Screen footer={
      <Btn title={picked.size ? `Add ${picked.size} bill${picked.size === 1 ? '' : 's'} to ${trip.name}` : 'Select bills'} icon="plus" disabled={!picked.size}
        onPress={() => { for (const id of picked) updateBill(id, (d) => { d.tripId = trip.id; }); router.back(); }} />
    }>
      {candidates.length === 0 ? <Empty icon="receipt" title="No other bills" body="Every bill you have is already in this trip." /> : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {candidates.map((b, i) => {
            const on = picked.has(b.id);
            const other = tripName(b.tripId);
            return (
              <Pressable key={b.id} accessibilityRole="checkbox" aria-checked={on} accessibilityLabel={billTitle(b)}
                onPress={() => setPicked((s) => { const n = new Set(s); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; })}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space(3), padding: space(4), borderTopWidth: i ? 1 : 0, borderColor: c.border,
                  backgroundColor: pressed ? c.surfaceAlt : 'transparent' })}>
                <View style={{ width: 24, height: 24, borderRadius: radius.sm, borderWidth: 2, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {on ? <Icon name="check" size={15} color={c.onPrimary} strokeWidth={3} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong" numberOfLines={1}>{billTitle(b)}</T>
                  <T v="small" muted>{[displayDate(b.date.value ?? b.createdAt), b.currency !== trip.currency ? b.currency : null, other ? `Moves from ${other}` : null].filter(Boolean).join(' · ')}</T>
                </View>
                <T v="bodyStrong">{b.total.value !== null && b.total.status === 'ok' ? fmt(b, b.total.value, true) : '—'}</T>
              </Pressable>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}
