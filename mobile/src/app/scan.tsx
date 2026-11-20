import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '../api/client';
import { Icon } from '../components/Icon';
import { LiveScanner, liveScannerSupported } from '../components/LiveScanner';
import { Banner, Btn, Row, T } from '../components/ui';
import { newBill } from '../engine/factory';
import { formatMoney, currencyFor, sum } from '../engine/money';
import type { Bill } from '../engine/types';
import { LocalScanError, ScanProgress } from '../extraction/local/browserReader';
import { extractionToBill } from '../extraction/toBill';
import { prepareBillReader, readBill } from '../lib/billReader';
import { pickBillPhoto, Photo, PhotoError, takeStartedPhoto } from '../lib/photo';
import { useStore } from '../store/AppStore';
import { useTheme } from '../theme/ThemeProvider';
import { dark, radius, space } from '../theme/theme';

const STEPS = ['Checking photo quality', 'Reading text', 'Finding items, taxes & total', 'Double-checking the numbers'];

/**
 * Scan flow: live scanner (web) or the phone's camera → reading the bill → "Ready to split?" sheet.
 * The bill is only saved when the user taps "Review & split".
 */
export default function Scan() {
  const { source = 'camera', replace } = useLocalSearchParams<{ source?: 'camera' | 'library'; replace?: string }>();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { settings, ensureSession, setSession, saveBill, getBill } = useStore();
  const [useLive, setUseLive] = useState(() => source !== 'library' && Platform.OS === 'web' && liveScannerSupported());
  const [liveNote, setLiveNote] = useState<string | null>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<{ message: string; canRetry: boolean } | null>(null);
  const [live, setLive] = useState<ScanProgress | null>(null);
  const [result, setResult] = useState<Bill | null>(null);
  const [waiting, setWaiting] = useState(false);
  /** Captured by the live scanner (straightened & cropped), not a plain photo. */
  const [straightened, setStraightened] = useState(false);
  const started = useRef(false);

  const process = useCallback(async (p: Photo) => {
    setError(null);
    setResult(null);
    setStep(0);
    setLive(null);
    const ticker = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1200);
    try {
      const extraction = await readBill(p.uri, p.mimeType, { apiUrl: settings.apiUrl, keepReceipts: settings.keepReceipts, ensureSession, setSession },
        (pr) => setLive(pr));
      let bill = extractionToBill(extraction, source === 'library' ? 'upload' : 'scan', settings.currency, p.uri);
      bill.tripId = settings.activeTripId;
      const old = replace ? getBill(replace) : undefined;
      if (old) {
        // Retake: keep the people, replace everything read from the old photo.
        bill = { ...bill, id: old.id, createdAt: old.createdAt, participants: old.participants, payments: old.payments, groupId: old.groupId, tripId: old.tripId };
      }
      setResult(bill);
    } catch (e) {
      const code = e instanceof ApiError || e instanceof LocalScanError ? e.code : '';
      const message = e instanceof ApiError || e instanceof LocalScanError ? e.message : 'Something went wrong while reading the bill.';
      setError({ message, canRetry: !['UNREADABLE_IMAGE', 'UNSUPPORTED_TYPE', 'NO_SERVER', 'LOW_RESOLUTION', 'LOCAL_UNAVAILABLE'].includes(code) });
    } finally {
      clearInterval(ticker);
      setLive(null);
    }
  }, [ensureSession, getBill, replace, setSession, settings.apiUrl, settings.currency, settings.keepReceipts, settings.activeTripId, source]);

  const got = useCallback((p: Photo) => { setPhoto(p); process(p); }, [process]);

  const pick = useCallback(async (src: 'camera' | 'library', already?: Promise<Photo | null> | null) => {
    // pickBillPhoto has to run before any state update: on the web it opens the picker inside the tap.
    const picking = already ?? pickBillPhoto(src);
    setError(null);
    setWaiting(true);
    try {
      const p = await picking;
      setWaiting(false);
      if (!p) {
        if (!photo && !useLive && Platform.OS !== 'web') router.back();
        return;
      }
      got(p);
    } catch (e) {
      setWaiting(false);
      setError({ message: e instanceof PhotoError ? e.message : 'Could not open the camera.', canRetry: false });
    }
  }, [got, photo, useLive]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    prepareBillReader(settings.apiUrl); // web without a server: download the reader while the camera is open
    if (useLive) return;
    // Upload: the tap that brought us here already opened the picker (see startBillPhoto). Phones: open the camera.
    const already = takeStartedPhoto();
    if (already || Platform.OS !== 'web') pick(source === 'library' ? 'library' : 'camera', already);
  }, [pick, source, useLive, settings.apiUrl]);

  const retake = () => {
    setPhoto(null); setResult(null); setError(null); setStraightened(false);
    if (!useLive) pick('camera');
  };

  const manual = () => {
    const b = newBill('manual', settings.currency);
    if (photo) b.receiptImageUri = photo.uri;
    b.tripId = settings.activeTripId;
    b.warnings = [{ code: 'MANUAL_FALLBACK', message: 'The bill could not be read automatically. Enter the items from the photo.' }];
    saveBill(b);
    router.replace(`/bill/${b.id}/review`);
  };

  const reviewAndSplit = () => {
    if (!result) return;
    saveBill(result);
    router.replace(`/bill/${result.id}/review`);
  };

  // ------------------------------------------------------------ live scanner (web)
  if (useLive && !photo) {
    return (
      <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: '#000' }}>
        <LiveScanner
          onCapture={(p) => { setStraightened(true); got(p); }}
          onClose={() => router.back()}
          onGallery={() => { setUseLive(false); pick('library'); }}
          onUnavailable={(m) => { setUseLive(false); setLiveNote(m); }}
        />
      </View>
    );
  }

  // ------------------------------------------------------------ photo / reading / ready / error
  const sheet = { backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: space(5), paddingTop: space(2.5), paddingBottom: insets.bottom + space(6), gap: space(3) };
  const grabber = <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.border }} />;

  return (
    <View style={{ flex: 1, backgroundColor: dark.bg, paddingTop: insets.top }}>
      <Row style={{ paddingHorizontal: space(4), paddingTop: space(4), paddingBottom: space(2) }}>
        <Btn title="" icon="x" variant="ghost" small onPress={() => router.back()} accessibilityHint="Close the scanner" style={{ minWidth: 44 }} />
        <Text style={{ flex: 1, textAlign: 'center', color: dark.text, fontSize: 18, fontWeight: '700' }}>{source === 'library' ? 'Upload bill' : 'Scan bill'}</Text>
        <View style={{ width: 44 }} />
      </Row>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space(6), paddingVertical: space(3) }}>
        {photo ? (
          <>
            {result || !error ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.5)', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, marginBottom: space(3) }}>
                <Icon name="check" color={dark.primary} size={16} strokeWidth={3} />
                <Text style={{ color: dark.text, fontSize: 14 }}>{straightened ? (result ? 'Scanned · straightened & cropped' : 'Got it — reading the whole bill') : result ? 'Read from your photo' : 'Reading your photo'}</Text>
              </View>
            ) : null}
            <Image source={{ uri: photo.uri }} resizeMode="contain" accessibilityLabel="The scanned bill"
              style={{ flex: 1, width: '100%', borderRadius: 6 }} />
          </>
        ) : (
          <View style={{ alignItems: 'center', gap: space(3), padding: space(6) }}>
            <Icon name="scan" size={48} color={dark.primary} />
            <Text style={{ color: dark.textMuted, textAlign: 'center', fontSize: 16 }}>
              {liveNote ?? 'Lay the bill flat, fit the whole bill in the frame, and avoid shadows.'}
            </Text>
          </View>
        )}
      </View>

      {error ? (
        <View style={sheet}>
          {grabber}
          <Banner tone="danger" title="We couldn't read this bill">{error.message}</Banner>
          {error.canRetry && photo ? <Btn title="Try again" icon="refresh" onPress={() => process(photo)} /> : null}
          <Row gap={2}>
            <Btn title="Retake" icon="camera" variant="secondary" style={{ flex: 1 }} onPress={retake} />
            <Btn title="Upload" icon="upload" variant="secondary" style={{ flex: 1 }} onPress={() => { setPhoto(null); pick('library'); }} />
          </Row>
          <Btn title="Enter bill manually" icon="edit" variant="ghost" onPress={manual} />
        </View>
      ) : result ? (
        <ReadySheet bill={result} sheetStyle={sheet} grabber={grabber} onRetake={retake} onContinue={reviewAndSplit} />
      ) : photo ? (
        <View style={sheet} accessibilityLiveRegion="polite">
          {grabber}
          <T v="heading">Scanning bill…</T>
          {STEPS.map((s, i) => (
            <Row key={s} gap={3}>
              {i < step ? <Icon name="check" color={c.success} size={20} strokeWidth={3} /> : i === step ? <ActivityIndicator color={c.primary} /> : <View style={{ width: 20 }} />}
              <T v={i === step ? 'bodyStrong' : 'body'} muted={i > step}>{s}</T>
            </Row>
          ))}
          {live ? <T v="small" muted>{live.step}{live.progress != null && live.progress > 0 && live.progress < 1 ? ` · ${Math.round(live.progress * 100)}%` : ''}</T> : null}
          <View style={{ height: 6, borderRadius: 3, backgroundColor: c.border, overflow: 'hidden' }}>
            <View style={{ height: 6, width: `${((step + (live?.progress ?? 0.4)) / STEPS.length) * 100}%`, backgroundColor: c.primary, borderRadius: 3 }} />
          </View>
        </View>
      ) : Platform.OS === 'web' ? (
        // No live camera here (or it was closed): take or choose a photo with a tap.
        <View style={sheet}>
          {grabber}
          <Btn title="Take photo" icon="camera" onPress={() => pick('camera')} />
          <Btn title="Choose from gallery" icon="upload" variant="secondary" onPress={() => pick('library')} />
          {waiting ? null : <Btn title="Enter bill manually" icon="edit" variant="ghost" onPress={manual} />}
        </View>
      ) : null}
    </View>
  );
}

/** "Ready to split?" — what was read, at a glance, before the full review. */
function ReadySheet({ bill, sheetStyle, grabber, onRetake, onContinue }: {
  bill: Bill; sheetStyle: object; grabber: React.ReactNode; onRetake: () => void; onContinue: () => void;
}) {
  const { c } = useTheme();
  const cur = currencyFor(bill.currency);
  const items = bill.items.length;
  const charges = bill.charges.length;
  const computed = sum(bill.items.map((i) => i.amount.value ?? 0)) + sum(bill.charges.map((ch) => ch.amount.value ?? 0));
  const toCheck = bill.items.filter((i) => i.amount.status !== 'ok' || i.name.status !== 'ok').length
    + bill.charges.filter((ch) => ch.amount.status !== 'ok').length + (bill.total.status !== 'ok' ? 1 : 0);
  const adds = bill.total.value !== null && bill.total.value === computed && toCheck === 0;
  const date = bill.date.value ? new Date(bill.date.value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : null;
  return (
    <View style={sheetStyle}>
      {grabber}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2), backgroundColor: adds ? c.successSoft : c.warningSoft, borderRadius: radius.md, padding: space(3) }}>
        <Icon name={adds ? 'check' : 'alert'} color={adds ? c.success : c.warning} size={18} strokeWidth={adds ? 3 : 2} />
        <T v="small" color={adds ? c.success : c.warning} style={{ flex: 1, fontWeight: '600' }}>
          {adds ? 'Bill scanned — everything adds up. Ready to split?' : bill.total.value === null
            ? "Bill scanned — the total wasn't found. You can add it on the next screen."
            : `Bill scanned — ${toCheck === 1 ? '1 value needs' : `${toCheck || 'a few'} values need`} a quick check.`}
        </T>
      </View>
      <Row gap={3}>
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="receipt" color={c.primary} size={22} />
        </View>
        <View style={{ flex: 1 }}>
          <T v="bodyStrong" numberOfLines={1}>{bill.restaurant.value ?? 'Restaurant bill'}</T>
          <T v="small" muted numberOfLines={1}>{[`${items} item${items === 1 ? '' : 's'}`, `${charges} charge${charges === 1 ? '' : 's'}`, date].filter(Boolean).join(' · ')}</T>
        </View>
        <T v="amount">{bill.total.value !== null ? formatMoney(bill.total.value, cur) : '—'}</T>
      </Row>
      <Row gap={2}>
        <Btn title="Retake" icon="camera" variant="secondary" onPress={onRetake} />
        <Btn title="Review & split" icon="chevronRight" onPress={onContinue} style={{ flex: 1 }} />
      </Row>
    </View>
  );
}
