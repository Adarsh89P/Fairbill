import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { Switch, View } from 'react-native';
import { BillRow } from '../../components/BillRow';
import { Icon } from '../../components/Icon';
import { Avatar, Banner, Btn, Card, Empty, IconBtn, Row, Screen, SectionTitle, T } from '../../components/ui';
import { currencyFor, formatMoney, Minor } from '../../engine/money';
import { billTitle, compute } from '../../lib/billText';
import { confirmAction, notify } from '../../lib/confirm';
import { tripPersonText, tripSummary, tripText } from '../../lib/trip';
import { openWhatsApp } from '../../lib/whatsapp';
import { useStore } from '../../store/AppStore';
import { useTheme } from '../../theme/ThemeProvider';
import { space } from '../../theme/theme';

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { trips, bills, updateTrip, deleteTrip, updateBill, settings, updateSettings } = useStore();
  const { c } = useTheme();
  const trip = trips.find((t) => t.id === id);
  const tripBills = useMemo(() => bills.filter((b) => b.tripId === id), [bills, id]);
  const s = useMemo(() => (trip ? tripSummary(trip, tripBills) : null), [trip, tripBills]);
  if (!trip || !s) return <Screen><Empty icon="trip" title="Trip not found" /></Screen>;

  const cur = currencyFor(trip.currency);
  const m = (v: Minor) => formatMoney(v, cur);
  const name = (k: string) => s.people.find((p) => p.key === k)?.name ?? 'Someone';
  const active = settings.activeTripId === trip.id;
  const open = s.transfers.filter((t) => !t.settled);
  const separate = s.included.reduce((n, b) => n + compute(b).settlement.transfers.filter((t) => !t.settled).length, 0);

  const setPaid = (key: string, paid: boolean) => {
    const last = paid && open.length === 1 && open[0].key === key;
    const apply = () => {
      updateTrip(trip.id, (d) => { d.settled[key] = paid; });
      if (last) {
        // Everyone is square: close out every bill in the trip too.
        for (const b of s.included) updateBill(b.id, (d) => { for (const t of compute(d).settlement.transfers) d.settled[t.key] = true; });
        notify('Trip settled', 'Every bill in this trip is now marked as paid.');
      }
    };
    if (last) confirmAction('Settle the whole trip?', `This is the last payment. All ${s.included.length} bills will be marked as paid.`, apply, 'Settle trip');
    else apply();
  };

  return (
    <>
      <Stack.Screen options={{ title: trip.name }} />
      <Screen footer={
        <Row gap={2}>
          <Btn title="Share" icon="whatsapp" style={{ flex: 1 }} disabled={!s.included.length} onPress={() => openWhatsApp(tripText(trip, s))} />
          <Btn title="Copy" icon="copy" variant="secondary" disabled={!s.included.length} onPress={async () => { await Clipboard.setStringAsync(tripText(trip, s)); notify('Trip summary copied'); }} />
        </Row>
      }>
        <Card style={{ gap: space(2) }}>
          <T v="caption" muted>TOTAL SPENT</T>
          <T v="title">{m(s.total)}</T>
          <T v="small" muted>{s.included.length} bill{s.included.length === 1 ? '' : 's'} · {s.people.length} people</T>
          <Row style={{ marginTop: space(2) }}>
            <View style={{ flex: 1 }}>
              <T v="bodyStrong">New bills go here</T>
              <T v="small" muted>{active ? 'Every bill you add joins this trip.' : 'Turn on to add new bills automatically.'}</T>
            </View>
            <Switch value={active} onValueChange={(v) => updateSettings({ activeTripId: v ? trip.id : undefined })} accessibilityLabel="Add new bills to this trip"
              trackColor={{ true: c.primary, false: c.border }} />
          </Row>
        </Card>

        {s.excluded.length ? (
          <Banner tone="warning" title={`${s.excluded.length} bill${s.excluded.length === 1 ? ' is' : 's are'} not counted yet`}>
            <View style={{ gap: space(1) }}>
              {s.excluded.map(({ bill, reason }) => <T key={bill.id} v="small">• {billTitle(bill)}: {reason}</T>)}
            </View>
          </Banner>
        ) : null}

        <SectionTitle>Settle up</SectionTitle>
        {!s.included.length ? (
          <Card><Empty icon="receipt" title="No bills yet" body={active ? 'Scan or enter a bill — it will land here.' : 'Add bills you already split.'} /></Card>
        ) : s.transfers.length === 0 ? (
          <Banner tone="success" title="Everyone is square">Nobody owes anything for this trip.</Banner>
        ) : (
          <Card style={{ padding: 0 }}>
            {s.transfers.map((t, i) => {
              const debtor = s.people.find((p) => p.key === t.from);
              return (
                <Row key={t.key} style={{ paddingHorizontal: space(4), paddingVertical: space(3), borderTopWidth: i ? 1 : 0, borderColor: c.border }}>
                  <View style={{ flex: 1 }}>
                    <T><T v="bodyStrong">{name(t.from)}</T> pays <T v="bodyStrong">{name(t.to)}</T></T>
                    <T v="amount" color={t.settled ? c.success : undefined}>{m(t.amount)}{t.settled ? '  · paid' : ''}</T>
                  </View>
                  {!debtor?.isMe && !t.settled ? (
                    <IconBtn icon="whatsapp" label={`Message ${name(t.from)}`} onPress={() => openWhatsApp(tripPersonText(trip, s, t.from), debtor?.phone)} />
                  ) : null}
                  <Btn small variant={t.settled ? 'secondary' : 'primary'} title={t.settled ? 'Undo' : 'Mark paid'} onPress={() => setPaid(t.key, !t.settled)} />
                </Row>
              );
            })}
          </Card>
        )}
        {s.included.length > 1 && separate > open.length ? (
          <T v="small" muted>{open.length} payment{open.length === 1 ? '' : 's'} instead of {separate} if every bill were settled separately.</T>
        ) : null}

        {s.people.length ? (
          <>
            <SectionTitle>Who spent what</SectionTitle>
            <Card style={{ padding: 0 }}>
              {s.people.map((p, i) => (
                <Row key={p.key} style={{ paddingHorizontal: space(4), paddingVertical: space(2.5), borderTopWidth: i ? 1 : 0, borderColor: c.border }}>
                  <Avatar name={p.name} id={p.key} />
                  <View style={{ flex: 1 }}>
                    <T v="bodyStrong">{p.name}{p.isMe ? ' (you)' : ''}</T>
                    <T v="small" muted>Paid restaurants {m(p.paid)}</T>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <T v="bodyStrong">{m(p.spent)}</T>
                    {p.net !== 0 ? <T v="small" color={p.net > 0 ? c.success : c.warning}>{p.net > 0 ? `gets ${m(p.net)}` : `owes ${m(-p.net)}`}</T> : null}
                  </View>
                </Row>
              ))}
            </Card>
          </>
        ) : null}

        <SectionTitle right={<Btn title="Add bills" icon="plus" small variant="ghost" onPress={() => router.push({ pathname: '/trip/add', params: { tripId: trip.id } })} />}>Bills</SectionTitle>
        {tripBills.map((b) => (
          <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space(1) }}>
            <View style={{ flex: 1 }}><BillRow bill={b} /></View>
            <IconBtn icon="x" label={`Remove ${billTitle(b)} from the trip`} onPress={() => updateBill(b.id, (d) => { d.tripId = undefined; })} />
          </View>
        ))}

        <Btn title="Delete trip" icon="trash" variant="ghost" small onPress={() => confirmAction('Delete this trip?', 'The bills stay in My Bills, they just won\'t be grouped any more.', () => {
          deleteTrip(trip.id);
          router.back();
        }, 'Delete')} />
        <Row gap={2} style={{ justifyContent: 'center' }}>
          <Icon name="lock" size={14} color={c.textMuted} />
          <T v="small" muted>Friends are matched across bills by phone number, then by name.</T>
        </Row>
      </Screen>
    </>
  );
}
