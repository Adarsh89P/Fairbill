import { router } from 'expo-router';
import React, { useState } from 'react';
import { Switch, View } from 'react-native';
import { api } from '../../api/client';
import { Avatar, Btn, Card, Chip, Field, Row, Screen, SectionTitle, Segmented, T } from '../../components/ui';
import { CURRENCIES } from '../../engine/money';
import { confirmAction, notify } from '../../lib/confirm';
import { ThemeMode, useStore } from '../../store/AppStore';
import { useTheme } from '../../theme/ThemeProvider';
import { space } from '../../theme/theme';
import { MonthlyChart } from '../stats';

export default function Profile() {
  const { settings, updateSettings, session, bills } = useStore();
  const { c } = useTheme();
  const [apiUrl, setApiUrl] = useState(settings.apiUrl);

  const deleteStored = () =>
    confirmAction('Delete stored bill photos?', 'Removes every receipt photo saved on the FairBill server for this account.', async () => {
      if (!session) return notify('Nothing stored', 'No photos have been uploaded from this device.');
      try {
        const r = await api(settings.apiUrl, session.token).deleteAllReceipts();
        notify('Deleted', `${r.deleted} stored photo${r.deleted === 1 ? '' : 's'} removed.`);
      } catch (e: any) {
        notify('Could not delete', e?.message);
      }
    });

  return (
    <Screen>
      <Card>
        <Row>
          <Avatar name={settings.name} id="me" size={56} />
          <View style={{ flex: 1 }}>
            <T v="heading">{settings.name}</T>
            <T v="small" muted>{session && !session.user.anonymous ? session.user.email : 'Not signed in · bills stay on this device'}</T>
          </View>
          <Btn title={session && !session.user.anonymous ? 'Account' : 'Sign in'} small variant="secondary" onPress={() => router.push('/account')} />
        </Row>
      </Card>

      <SectionTitle right={<T v="small" color={c.primary} style={{ fontWeight: '700' }} onPress={() => router.push('/stats')}>Details</T>}>Monthly spending</SectionTitle>
      <Card><MonthlyChart bills={bills} months={6} compact /></Card>

      <SectionTitle>Preferences</SectionTitle>
      <Card style={{ gap: space(4) }}>
        <Field label="Your name" value={settings.name} onChangeText={(name) => updateSettings({ name })} placeholder="Shown on bills you split" />
        <View style={{ gap: space(2) }}>
          <T v="caption" muted>DEFAULT CURRENCY</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
            {CURRENCIES.map((cur) => <Chip key={cur.code} label={`${cur.symbol.trim()} ${cur.code}`} selected={settings.currency === cur.code} onPress={() => updateSettings({ currency: cur.code })} />)}
          </View>
        </View>
        <View style={{ gap: space(2) }}>
          <T v="caption" muted>APPEARANCE</T>
          <Segmented<ThemeMode> options={[{ key: 'system', label: 'System' }, { key: 'light', label: 'Light' }, { key: 'dark', label: 'Dark' }]}
            value={settings.theme} onChange={(theme) => updateSettings({ theme })} />
        </View>
      </Card>

      <SectionTitle>Privacy</SectionTitle>
      <Card style={{ gap: space(3) }}>
        <Row>
          <View style={{ flex: 1 }}>
            <T v="bodyStrong">Keep bill photos online</T>
            <T v="small" muted>Off by default. When off, photos are read and immediately discarded by the server. When on, they are kept privately for 30 days.</T>
          </View>
          <Switch value={settings.keepReceipts} onValueChange={(keepReceipts) => updateSettings({ keepReceipts })} accessibilityLabel="Keep bill photos online"
            trackColor={{ true: c.primary, false: c.border }} />
        </Row>
        <Btn title="Delete stored photos" icon="trash" variant="danger" small onPress={deleteStored} />
      </Card>

      <SectionTitle>Server</SectionTitle>
      <Card style={{ gap: space(2) }}>
        <Field label="FairBill server URL" value={apiUrl} onChangeText={setApiUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url"
          onEndEditing={() => updateSettings({ apiUrl: apiUrl.trim() })} hint="Needed for scanning and share links. Manual splitting works offline." />
      </Card>
      <T v="small" muted style={{ textAlign: 'center', marginTop: space(4) }}>FairBill 0.1 · Eat Together. Pay Fairly.</T>
    </Screen>
  );
}
