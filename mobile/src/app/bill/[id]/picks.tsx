import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Share, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { api, ApiError, ShareView } from '../../../api/client';
import { SharePhotoToggle, syncSharePhoto } from '../../../components/SharePhotoToggle';
import { Avatar, Banner, Btn, Card, Empty, Field, Row, Screen, SectionTitle, T } from '../../../components/ui';
import { itemNet } from '../../../engine/split';
import { billTitle, fmt } from '../../../lib/billText';
import { notify } from '../../../lib/confirm';
import { applyPicks, claimFrom, pickStatus } from '../../../lib/picks';
import { openWhatsApp } from '../../../lib/whatsapp';
import { useBill, useStore } from '../../../store/AppStore';
import { useTheme } from '../../../theme/ThemeProvider';
import { radius, space } from '../../../theme/theme';

/** Sends one link where each friend ticks what they had; their picks fill in the assignments. */
export default function Picks() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { bill, update } = useBill(id);
  const { settings, session, ensureSession, setSession, updateSettings } = useStore();
  const { c } = useTheme();
  const [view, setView] = useState<ShareView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [myName, setMyName] = useState('');
  const wasFinal = useRef(bill?.share?.phase === 'final');
  const billRef = useRef(bill);
  billRef.current = bill; // open() must send the latest names, e.g. right after "What should friends call you?"
  const [confirmedReopen, setConfirmedReopen] = useState(!wasFinal.current);
  const me = bill?.participants.find((p) => p.isMe);
  const needsName = !!me && /^(me|you)$/i.test(me.name.trim());

  const open = useCallback(async () => {
    const bill = billRef.current;
    if (!bill) return;
    setLoading(true);
    setError(null);
    const run = async () => {
      const s = await ensureSession();
      let v = await api(settings.apiUrl, s.token).openPicking(bill.id, claimFrom(bill));
      if (settings.sharePhoto && bill.receiptImageUri && !v.hasPhoto) {
        v = await syncSharePhoto(settings.apiUrl, s.token, bill, v, true).catch(() => v); // the link works without the photo
      }
      return v;
    };
    try {
      let v: ShareView;
      try {
        v = await run();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          setSession(null);
          v = await run();
        } else throw e;
      }
      setView(v);
      update((d) => { d.share = { token: v.token, url: v.url, phase: 'picking', photo: v.hasPhoto }; });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create the link.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bill?.id, settings.apiUrl, settings.sharePhoto]);

  useEffect(() => {
    if (!needsName && confirmedReopen) open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsName, confirmedReopen]);

  // Friends' ticks arrive while this screen is open.
  useEffect(() => {
    if (!view || !session) return;
    const t = setInterval(() => {
      api(settings.apiUrl, session.token).shareStatus(view.token).then(setView).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [view?.token, session?.token, settings.apiUrl]);

  const status = useMemo(() => (bill && view ? pickStatus(bill, view) : null), [bill, view]);
  if (!bill) return <Screen><Empty icon="receipt" title="Bill not found" /></Screen>;

  const saveName = () => {
    const n = myName.trim();
    if (!n || !me) return;
    updateSettings({ name: n });
    update((d) => { const p = d.participants.find((x) => x.id === me.id); if (p) p.name = n; });
  };

  if (needsName) {
    return (
      <Screen>
        <Card style={{ gap: space(3) }}>
          <T v="heading">What should friends call you?</T>
          <T muted>They'll see the list of people on the link, so “Me” won't make sense to them.</T>
          <Field label="Your name" value={myName} onChangeText={setMyName} placeholder="e.g. Adarsh" autoFocus onSubmitEditing={saveName} />
          <Btn title="Continue" disabled={!myName.trim()} onPress={saveName} />
        </Card>
      </Screen>
    );
  }
  if (!confirmedReopen) {
    return (
      <Screen>
        <Banner tone="warning" title="You've already shared the final split">
          Opening item picking again replaces the amounts on the link with the list of items, until you share the split again.
        </Banner>
        <Btn title="Open item picking" onPress={() => setConfirmedReopen(true)} />
        <Btn title="Keep the final split" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const url = view?.url;
  const message = `Tick what you had at ${billTitle(bill)} so we can split the bill fairly 🍽️\n${url ?? ''}`;
  const apply = () => {
    if (!view) return;
    let res = { items: 0, people: 0 };
    update((d) => { res = applyPicks(d, view); });
    notify(`Filled in ${res.items} item${res.items === 1 ? '' : 's'}`, res.people ? `Added ${res.people} ${res.people === 1 ? 'person' : 'people'} who joined from the link.` : undefined);
    router.back();
  };
  const unclaimed = status ? bill.items.filter((i) => !status.byItem[i.id]?.length) : [];
  const everyone = view?.claim?.people ?? [];

  return (
    <Screen footer={view ? (
      <>
        {status && unclaimed.length ? <T v="small" muted style={{ textAlign: 'center' }}>{unclaimed.length} item{unclaimed.length === 1 ? '' : 's'} nobody ticked yet — you can assign those yourself</T> : null}
        <Btn title={status?.ticked ? 'Use these picks' : 'Waiting for friends…'} icon="check" disabled={!status?.ticked} onPress={apply} />
      </>
    ) : undefined}>
      {loading && !view ? (
        <View style={{ alignItems: 'center', padding: space(10), gap: space(3) }}>
          <ActivityIndicator color={c.primary} />
          <T muted>Creating a link…</T>
        </View>
      ) : error ? (
        <>
          <Banner tone="danger" title="Couldn't create the link">{error}</Banner>
          <Btn title="Try again" icon="refresh" onPress={open} />
          <T v="small" muted>This needs the FairBill server. You can still assign items yourself on the previous screen.</T>
        </>
      ) : url && view ? (
        <>
          <Card style={{ alignItems: 'center', gap: space(3), paddingVertical: space(5) }}>
            <T v="heading" style={{ textAlign: 'center' }}>Scan to tick what you had</T>
            <View style={{ padding: space(3), backgroundColor: '#fff', borderRadius: radius.md }} accessibilityLabel="QR code for picking items">
              <QRCode value={url} size={190} color="#0E1E16" backgroundColor="#FFFFFF" />
            </View>
            <T v="small" muted style={{ textAlign: 'center' }}>No app or sign-up needed. Later, the same link shows everyone's final share.</T>
            <T v="small" selectable style={{ textAlign: 'center', wordBreak: 'break-all' } as object}>{url}</T>
          </Card>
          <Row gap={2}>
            <Btn title="WhatsApp" icon="whatsapp" style={{ flex: 1 }} onPress={() => openWhatsApp(message)} />
            <Btn title="Share" icon="share" variant="secondary" style={{ flex: 1 }} onPress={() => Share.share({ message })} />
            <Btn title="Copy" icon="copy" variant="secondary" onPress={async () => { await Clipboard.setStringAsync(url); notify('Link copied'); }} />
          </Row>
          <SharePhotoToggle bill={bill} view={view} onView={setView} />

          <SectionTitle right={<T v="small" muted>{status?.ticked ?? 0} of {everyone.length} ticked</T>}>People</SectionTitle>
          <Card style={{ padding: 0 }}>
            {everyone.map((p, i) => {
              const n = view.picks[p.id]?.length ?? 0;
              return (
                <Row key={p.id} style={{ paddingHorizontal: space(4), paddingVertical: space(2.5), borderTopWidth: i ? 1 : 0, borderColor: c.border }}>
                  <Avatar name={p.name} id={p.id} />
                  <View style={{ flex: 1 }}>
                    <T v="bodyStrong">{p.name}</T>
                    {p.guest && status?.newPeople.some((x) => x.id === p.id) ? <T v="small" color={c.primary}>Joined from the link</T> : null}
                  </View>
                  <T v="small" color={n ? c.success : c.textMuted}>{n ? `${n} item${n === 1 ? '' : 's'}` : 'Not yet'}</T>
                </Row>
              );
            })}
          </Card>

          <SectionTitle>Items</SectionTitle>
          <Card style={{ padding: 0 }}>
            {bill.items.map((it, i) => {
              const who = status?.byItem[it.id] ?? [];
              const names = who.map((w) => bill.participants.find((p) => p.id === w)?.name ?? status?.newPeople.find((p) => p.id === w)?.name ?? 'Someone');
              return (
                <Row key={it.id} style={{ paddingHorizontal: space(4), paddingVertical: space(2.5), borderTopWidth: i ? 1 : 0, borderColor: c.border, alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <T v="bodyStrong">{it.name.value}</T>
                    <T v="small" color={who.length ? c.textMuted : c.warning}>{who.length ? names.join(', ') : 'Nobody yet'}</T>
                  </View>
                  <T>{fmt(bill, itemNet(it) ?? 0)}</T>
                </Row>
              );
            })}
          </Card>
          <T v="small" muted>Shared dishes are split equally between everyone who ticks them. You can still change anything afterwards.</T>
        </>
      ) : null}
    </Screen>
  );
}
