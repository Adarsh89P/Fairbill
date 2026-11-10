import { router } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BillRow } from '../../components/BillRow';
import { Icon } from '../../components/Icon';
import { Card, Empty, Row, Screen, SectionTitle, T } from '../../components/ui';
import { newBill } from '../../engine/factory';
import { useStore } from '../../store/AppStore';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/theme';

export default function Home() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { bills, saveBill, settings } = useStore();
  const recent = bills.slice(0, 5);

  const manual = () => {
    const b = newBill('manual', settings.currency);
    saveBill(b);
    router.push(`/bill/${b.id}/review`);
  };

  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: c.bg }}>
      <Screen>
        <View style={{ gap: 2, marginTop: space(2) }}>
          <T v="title" color={c.primary}>FairBill</T>
          <T muted>Eat Together. Pay Fairly.</T>
        </View>

        <Pressable
          onPress={() => router.push({ pathname: '/scan', params: { source: 'camera' } })}
          accessibilityRole="button"
          accessibilityLabel="Scan a bill with the camera"
          style={({ pressed }) => ({
            backgroundColor: pressed ? c.primaryPressed : c.primary, borderRadius: radius.lg, padding: space(6), gap: space(3), marginTop: space(2),
          })}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="camera" color={c.onPrimary} size={30} />
          </View>
          <T v="title" color={c.onPrimary}>Scan a Bill</T>
          <T color={c.onPrimary} style={{ opacity: 0.9 }}>Take a photo — we read the items, taxes and total for you.</T>
        </Pressable>

        <Row gap={3}>
          <ActionTile icon="upload" title="Upload Bill" sub="From gallery" onPress={() => router.push({ pathname: '/scan', params: { source: 'library' } })} />
          <ActionTile icon="edit" title="Manual Bill" sub="Works offline" onPress={manual} />
        </Row>

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
