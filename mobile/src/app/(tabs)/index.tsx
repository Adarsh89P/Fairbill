import { router } from 'expo-router';
import { startBillPhoto } from '../../lib/photo';
import { preloadBillReaderIfCheap, wakeServer } from '../../lib/billReader';
import React, { useEffect, useMemo } from 'react';
import { computeSplit } from '../../engine/split';
import { settle } from '../../engine/settle';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BillRow } from '../../components/BillRow';
import { Icon } from '../../components/Icon';
import { InstallCard } from '../../components/InstallCard';
import { Avatar, Btn, Card, Empty, Row, Screen, SectionTitle, T } from '../../components/ui';
import { newBill } from '../../engine/factory';
import { extractionToBill } from '../../extraction/toBill';
import { SAMPLES } from '../../samples';
import { useStore } from '../../store/AppStore';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/theme';

export default function Home() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { bills, saveBill, settings, trips } = useStore();
  // Web without a server: quietly fetch the bill reader in the background on a fast connection.
  useEffect(() => { wakeServer(settings.apiUrl); preloadBillReaderIfCheap(settings.apiUrl); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const activeTrip = trips.find((t) => t.id === settings.activeTripId);
  const hasName = !!settings.name.trim() && settings.name.trim() !== 'Me';
  /** Payments still to collect or make, across confirmed bills (the dot on the bell). */
  const pending = useMemo(() => bills.filter((b) => b.status !== 'draft').reduce((n, b) => {
    try { return n + settle(b, computeSplit(b)).transfers.filter((t) => !t.settled).length; } catch { return n; }
  }, 0), [bills]);
  const recent = bills.slice(0, 5);

  const manual = () => {
    const b = newBill('manual', settings.currency);
    b.tripId = settings.activeTripId;
    saveBill(b);
    router.push(`/bill/${b.id}/review`);
  };

  const sample = (kind: keyof typeof SAMPLES) => {
    const b = extractionToBill(SAMPLES[kind].result, 'upload', settings.currency, SAMPLES[kind].image);
    b.restaurant = { ...b.restaurant, value: `${b.restaurant.value ?? 'Restaurant'} (sample)` };
    b.tripId = settings.activeTripId;
    saveBill(b);
    router.push(`/bill/${b.id}/review`);
  };

  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: c.bg }}>
      <Screen>
        <Row gap={3} style={{ marginTop: space(2) }}>
          <Pressable onPress={() => router.push('/profile')} accessibilityRole="button" accessibilityLabel="Open your profile"
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
            <Avatar name={hasName ? settings.name : 'Me'} id="me" size={48} photo={settings.photo} />
            <View style={{ flex: 1 }}>
              <T v="small" muted>{greeting()} 👋</T>
              <T v="heading" numberOfLines={1}>{hasName ? settings.name : 'Add your name'}</T>
            </View>
          </Pressable>
          <Pressable onPress={() => router.push('/bills')} accessibilityRole="button"
            accessibilityLabel={pending ? `${pending} payment${pending > 1 ? 's' : ''} still to collect` : 'Payments'}
            style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, opacity: pressed ? 0.8 : 1 })}>
            <Icon name="bell" color={c.text} size={22} />
            {pending ? <View style={{ position: 'absolute', top: 9, right: 10, width: 10, height: 10, borderRadius: 5, backgroundColor: c.danger, borderWidth: 2, borderColor: c.surface }} /> : null}
          </Pressable>
        </Row>

        {activeTrip ? (
          <Card onPress={() => router.push(`/trip/${activeTrip.id}`)} accessibilityLabel={`Trip ${activeTrip.name} is on`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: c.primarySoft, borderColor: c.primarySoft }}>
            <Icon name="trip" color={c.primary} />
            <View style={{ flex: 1 }}>
              <T v="bodyStrong" color={c.primary}>{activeTrip.name}</T>
              <T v="small" muted>New bills go into this trip</T>
            </View>
            <Icon name="chevronRight" color={c.primary} />
          </Card>
        ) : null}

        <Pressable
          onPress={() => router.push({ pathname: '/scan', params: { source: 'camera' } })}
          accessibilityRole="button"
          accessibilityLabel="Scan a bill with the camera"
          style={({ pressed }) => ({
            backgroundColor: pressed ? c.primaryPressed : c.primary, borderRadius: radius.lg, padding: space(6), gap: space(3), marginTop: space(2),
          })}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="scan" color={c.onPrimary} size={30} />
          </View>
          <T v="title" color={c.onPrimary}>Scan a Bill</T>
          <T color={c.onPrimary} style={{ opacity: 0.9 }}>Point at the bill — we find the whole bill and read the items, taxes and total.</T>
        </Pressable>

        <Row gap={3}>
          <ActionTile icon="upload" title="Upload Bill" sub="From gallery" onPress={() => { startBillPhoto('library'); router.push({ pathname: '/scan', params: { source: 'library' } }); }} />
          <ActionTile icon="edit" title="Manual Bill" sub="Works offline" onPress={manual} />
        </Row>

        <InstallCard />

        <Card style={{ gap: space(2) }}>
          <T v="bodyStrong">No bill handy?</T>
          <T v="small" muted>Open a sample scan to see how FairBill reads a bill and flags anything unclear.</T>
          <Row gap={2}>
            <Btn title="Clear sample" small variant="secondary" icon="receipt" style={{ flex: 1 }} onPress={() => sample('clear')} />
            <Btn title="Blurry sample" small variant="secondary" icon="alert" style={{ flex: 1 }} onPress={() => sample('blurry')} />
          </Row>
        </Card>

        <SectionTitle right={bills.length > 5 ? <T v="small" color={c.primary} style={{ fontWeight: '700' }} onPress={() => router.push('/bills')}>See all</T> : null}>
          Recent bills
        </SectionTitle>
        {recent.length === 0 ? (
          <Card><Empty icon="receipt" title="No bills yet" body="Scan your first restaurant bill and split it in seconds." /></Card>
        ) : (
          recent.map((b) => <BillRow key={b.id} bill={b} />)
        )}
      </Screen>
    </View>
  );
}

function ActionTile({ icon, title, sub, onPress }: { icon: 'upload' | 'edit'; title: string; sub: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Card onPress={onPress} accessibilityLabel={title} style={{ flex: 1, gap: space(2) }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} color={c.primary} />
      </View>
      <T v="bodyStrong">{title}</T>
      <T v="small" muted>{sub}</T>
    </Card>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
