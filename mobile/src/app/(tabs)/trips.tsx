import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Icon } from '../../components/Icon';
import { Btn, Card, Empty, Field, Row, Screen, T } from '../../components/ui';
import { uid } from '../../engine/factory';
import { currencyFor, formatMoney } from '../../engine/money';
import { tripSummary } from '../../lib/trip';
import { useStore } from '../../store/AppStore';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/theme';

export default function Trips() {
  const { trips, bills, saveTrip, settings, updateSettings } = useStore();
  const { c } = useTheme();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const summaries = useMemo(() => trips.map((t) => ({ trip: t, s: tripSummary(t, bills.filter((b) => b.tripId === t.id)) })), [trips, bills]);

  const create = () => {
    const n = name.trim();
    if (!n) return;
    const now = new Date().toISOString();
    const t = { id: uid('trip'), name: n.slice(0, 60), currency: settings.currency, createdAt: now, updatedAt: now, settled: {} };
    saveTrip(t);
    updateSettings({ activeTripId: t.id });
    setCreating(false);
    setName('');
    router.push(`/trip/${t.id}`);
  };

  return (
    <Screen footer={!creating ? <Btn title="New trip" icon="plus" onPress={() => setCreating(true)} /> : undefined}>
      <T muted>Going away together? Add every meal to one trip and settle up once at the end, with the fewest payments.</T>
      {creating ? (
        <Card style={{ gap: space(3) }}>
          <Field label="Trip name" value={name} onChangeText={setName} placeholder="e.g. Goa, Dec 2026" autoFocus onSubmitEditing={create} returnKeyType="done" />
          <T v="small" muted>New bills join this trip automatically until you end it.</T>
          <Row gap={2}>
            <Btn title="Cancel" variant="secondary" onPress={() => { setCreating(false); setName(''); }} />
            <Btn title="Start trip" icon="check" disabled={!name.trim()} onPress={create} style={{ flex: 1 }} />
          </Row>
        </Card>
      ) : null}
      {summaries.length === 0 && !creating ? (
        <Card><Empty icon="trip" title="No trips yet" body="Start one before you leave — every bill you add goes into it." /></Card>
      ) : (
        summaries.map(({ trip, s }) => {
          const active = settings.activeTripId === trip.id;
          const me = s.people.find((p) => p.isMe);
          const open = s.transfers.filter((t) => !t.settled).length;
          const cur = currencyFor(trip.currency);
          return (
            <Card key={trip.id} onPress={() => router.push(`/trip/${trip.id}`)} accessibilityLabel={`${trip.name}${active ? ', active' : ''}`}>
              <Row>
                <View style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: active ? c.primary : c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="trip" color={active ? c.onPrimary : c.primary} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="bodyStrong" numberOfLines={1}>{trip.name}</T>
                  <T v="small" muted>
                    {[`${s.included.length + s.excluded.length} bill${s.included.length + s.excluded.length === 1 ? '' : 's'}`, active ? 'Active' : null,
                      s.included.length ? (open ? `${open} payment${open === 1 ? '' : 's'} to settle` : 'All settled') : null].filter(Boolean).join(' · ')}
                  </T>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <T v="amount">{formatMoney(s.total, cur, { compact: true })}</T>
                  {me && me.net !== 0 ? (
                    <T v="small" color={me.net > 0 ? c.success : c.warning}>{me.net > 0 ? `You get ${formatMoney(me.net, cur, { compact: true })}` : `You owe ${formatMoney(-me.net, cur, { compact: true })}`}</T>
                  ) : null}
                </View>
              </Row>
            </Card>
          );
        })
      )}
    </Screen>
  );
}
