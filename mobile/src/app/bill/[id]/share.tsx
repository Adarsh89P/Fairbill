import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Share, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { api, ApiError, ShareView } from '../../../api/client';
import { SharePhotoToggle, syncSharePhoto } from '../../../components/SharePhotoToggle';
import { Banner, Btn, Card, Empty, Field, Row, Screen, T } from '../../../components/ui';
import { compute, fmt, nameOf, snapshot } from '../../../lib/billText';
import { notify } from '../../../lib/confirm';
import { useBill, useStore } from '../../../store/AppStore';
import { useTheme } from '../../../theme/ThemeProvider';
import { radius, space } from '../../../theme/theme';

/** Publishes a read-only summary so friends can view it and mark their payment without an account. */
export default function ShareBill() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { bill, update } = useBill(id);
  const { settings, ensureSession, setSession, updateSettings } = useStore();
  const me = bill?.participants.find((p) => p.isMe);
  const needsName = !!me && /^(me|you)$/i.test(me.name.trim());
  const [myName, setMyName] = useState('');
  const { c } = useTheme();
  const [state, setState] = useState<{ loading: boolean; error?: string; paid: string[] }>({ loading: true, paid: [] });
  const [view, setView] = useState<ShareView | null>(null);
  const computed = useMemo(() => (bill ? compute(bill) : null), [bill]);

  const publish = useCallback(async () => {
    if (!bill || !computed) return;
    if (computed.errors.length || computed.settlement.issues.length) {
      setState({ loading: false, paid: [], error: 'Finish the split (all items assigned and who paid) before sharing.' });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: undefined }));
    const run = async () => {
      const s = await ensureSession();
      const v = await api(settings.apiUrl, s.token).publishShare(bill.id, snapshot(bill, computed));
      // The link works without the photo, so a failed upload doesn't block sharing.
      return syncSharePhoto(settings.apiUrl, s.token, bill, v, settings.sharePhoto && !!bill.receiptImageUri).catch(() => v);
    };
    try {
      let view;
      try {
        view = await run();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          setSession(null);
          view = await run();
        } else throw e;
      }
      update((d) => { d.share = { token: view.token, url: view.url, phase: 'final', photo: view.hasPhoto }; });
      setView(view);
      setState({ loading: false, paid: Object.keys(view.paid) });
    } catch (e) {
      setState({ loading: false, paid: [], error: e instanceof ApiError ? e.message : 'Could not create a share link.' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bill?.id, computed]);

  useEffect(() => {
    if (!needsName) publish();
    else setState({ loading: false, paid: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsName]);

  const saveName = () => {
    const n = myName.trim();
    if (!n || !me) return;
    updateSettings({ name: n });
    update((d) => { const p = d.participants.find((x) => x.id === me.id); if (p) p.name = n; });
  };

  if (!bill || !computed) return <Screen><Empty icon="receipt" title="Bill not found" /></Screen>;
  const url = bill.share?.url;

  return (
    <Screen>
      {needsName ? (
        <Card style={{ gap: space(3) }}>
          <T v="heading">What should friends call you?</T>
          <T muted>The shared page says who to pay, so “Me” won't make sense to them.</T>
          <Field label="Your name" value={myName} onChangeText={setMyName} placeholder="e.g. Adarsh" autoFocus onSubmitEditing={saveName} />
          <Btn title="Continue" disabled={!myName.trim()} onPress={saveName} />
        </Card>
      ) : state.loading ? (
        <View style={{ alignItems: 'center', padding: space(10), gap: space(3) }}>
          <ActivityIndicator color={c.primary} />
          <T muted>Creating a secure link…</T>
        </View>
      ) : state.error ? (
        <>
          <Banner tone="danger" title="Couldn't share">{state.error}</Banner>
          <Btn title="Try again" icon="refresh" onPress={publish} />
          <T v="small" muted>You can still share the summary as text using WhatsApp or Copy on the summary screen — that works offline.</T>
        </>
      ) : url ? (
        <>
          <Card style={{ alignItems: 'center', gap: space(4), paddingVertical: space(6) }}>
            <T v="heading" style={{ textAlign: 'center' }}>Scan to see your share</T>
            <View style={{ padding: space(3), backgroundColor: '#fff', borderRadius: radius.md }} accessibilityLabel="QR code for the shared bill">
              <QRCode value={url} size={220} color="#0E1E16" backgroundColor="#FFFFFF" />
            </View>
            <T v="small" muted style={{ textAlign: 'center' }}>Friends can view the breakdown and mark their payment — no app or sign-up needed.</T>
            <T v="small" selectable style={{ textAlign: 'center', wordBreak: 'break-all' } as object}>{url}</T>
          </Card>
          <Row gap={2}>
            <Btn title="Copy link" icon="copy" variant="secondary" style={{ flex: 1 }} onPress={async () => { await Clipboard.setStringAsync(url); notify('Link copied'); }} />
            <Btn title="Share link" icon="share" style={{ flex: 1 }} onPress={() => Share.share({ message: `Your share of the ${bill.restaurant.value ?? 'restaurant'} bill: ${url}` })} />
          </Row>
          {computed.settlement.transfers.map((t) => (
            <Row key={t.key} style={{ justifyContent: 'space-between' }}>
              <T>{nameOf(bill, t.from)} → {nameOf(bill, t.to)}</T>
              <T v="bodyStrong" color={state.paid.includes(t.from) || t.settled ? c.success : undefined}>
                {fmt(bill, t.amount)} {state.paid.includes(t.from) || t.settled ? '· paid' : ''}
              </T>
            </Row>
          ))}
          <SharePhotoToggle bill={bill} view={view} onView={setView} />
          <Btn title="Refresh payment status" icon="refresh" variant="ghost" onPress={publish} />
        </>
      ) : null}
    </Screen>
  );
}
