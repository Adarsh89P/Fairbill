import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '../api/client';
import { Icon } from '../components/Icon';
import { Banner, Btn, Row, T } from '../components/ui';
import { newBill } from '../engine/factory';
import { extractionToBill } from '../extraction/toBill';
import { pickBillPhoto, Photo, PhotoError, takeStartedPhoto } from '../lib/photo';
import { prepareBillReader, readBill } from '../lib/billReader';
import { LocalScanError, ScanProgress } from '../extraction/local/browserReader';
import { useStore } from '../store/AppStore';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space } from '../theme/theme';

const STEPS = ['Checking photo quality', 'Reading text', 'Finding items, taxes & total', 'Double-checking the numbers'];

export default function Scan() {
  const { source = 'camera', replace } = useLocalSearchParams<{ source?: 'camera' | 'library'; replace?: string }>();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { settings, ensureSession, setSession, saveBill, getBill } = useStore();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<{ message: string; canRetry: boolean } | null>(null);
  /** Live step from the in-browser reader (download / reading progress). */
  const [live, setLive] = useState<ScanProgress | null>(null);
  const started = useRef(false);

  const process = useCallback(async (p: Photo) => {
    setError(null);
    setStep(0);
    const ticker = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1200);
    setLive(null);
    try {
      const result = await readBill(p.uri, p.mimeType, { apiUrl: settings.apiUrl, keepReceipts: settings.keepReceipts, ensureSession, setSession },
        (pr) => setLive(pr));
      const origin = source === 'library' ? 'upload' : 'scan';
      let bill = extractionToBill(result, origin, settings.currency, p.uri);
      bill.tripId = settings.activeTripId;
      const old = replace ? getBill(replace) : undefined;
      if (old) {
        // Retake: keep the people, replace everything read from the old photo.
        bill = { ...bill, id: old.id, createdAt: old.createdAt, participants: old.participants, payments: old.payments, groupId: old.groupId, tripId: old.tripId };
      }
      saveBill(bill);
      router.replace(`/bill/${bill.id}/review`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Something went wrong while reading the bill.';
      const code = e instanceof ApiError || e instanceof LocalScanError ? e.code : '';
      const msg2 = e instanceof LocalScanError ? e.message : msg;
      setError({ message: msg2, canRetry: !['UNREADABLE_IMAGE', 'UNSUPPORTED_TYPE', 'NO_SERVER', 'LOW_RESOLUTION', 'LOCAL_UNAVAILABLE'].includes(code) });
    } finally {
      clearInterval(ticker);
      setLive(null);
    }
  }, [ensureSession, getBill, replace, saveBill, setSession, settings.apiUrl, settings.currency, settings.keepReceipts, settings.activeTripId, source]);

  const [waiting, setWaiting] = useState(false);
  const pick = useCallback(async (src: 'camera' | 'library', already?: Promise<Photo | null> | null) => {
    // pickBillPhoto has to run before any state update: on the web it opens the picker inside the tap.
    const picking = already ?? pickBillPhoto(src);
    setError(null);
    setWaiting(true);
    try {
      const p = await picking;
      setWaiting(false);
      if (!p) {
        if (!photo) router.back();
        return;
      }
      setPhoto(p);
      process(p);
    } catch (e) {
      setWaiting(false);
      setError({ message: e instanceof PhotoError ? e.message : 'Could not open the camera.', canRetry: false });
    }
  }, [photo, process]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    prepareBillReader(settings.apiUrl); // web without a server: download the reader while the camera is open
    // On the web the tap that brought us here already opened the picker (see startBillPhoto).
    pick(source === 'library' ? 'library' : 'camera', takeStartedPhoto());
  }, [pick, source]);

  const manual = () => {
    const b = newBill('manual', settings.currency);
    if (photo) b.receiptImageUri = photo.uri;
    b.tripId = settings.activeTripId;
    b.warnings = [{ code: 'MANUAL_FALLBACK', message: 'The bill could not be read automatically. Enter the items from the photo.' }];
    saveBill(b);
    router.replace(`/bill/${b.id}/review`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + space(2), paddingBottom: insets.bottom + space(4), paddingHorizontal: space(4), gap: space(4) }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T v="heading">{source === 'library' ? 'Upload bill' : 'Scan bill'}</T>
        <Btn title="Cancel" variant="ghost" small onPress={() => router.back()} />
      </Row>

      <View style={{ flex: 1, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
        {photo ? (
          <Image source={{ uri: photo.uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" accessibilityLabel="Photo of the bill" />
        ) : (
          <View style={{ alignItems: 'center', gap: space(3), padding: space(6) }}>
            <Icon name="camera" size={44} color={c.primary} />
            <T muted style={{ textAlign: 'center' }}>Lay the bill flat, fit the whole bill in the frame, and avoid shadows.</T>
          </View>
        )}
      </View>

      {error ? (
        <View style={{ gap: space(3) }}>
          <Banner tone="danger" title="We couldn't read this bill">{error.message}</Banner>
          {error.canRetry && photo ? <Btn title="Try again" icon="refresh" onPress={() => process(photo)} /> : null}
          <Row gap={2}>
            <Btn title="Retake" icon="camera" variant="secondary" style={{ flex: 1 }} onPress={() => pick('camera')} />
            <Btn title="Upload" icon="upload" variant="secondary" style={{ flex: 1 }} onPress={() => pick('library')} />
          </Row>
          <Btn title="Enter bill manually" icon="edit" variant="ghost" onPress={manual} />
        </View>
      ) : !photo && Platform.OS === 'web' ? (
        // If the browser didn't open the camera by itself (or it was closed), let the user open it with a tap.
        <View style={{ gap: space(2) }}>
          <Btn title="Take photo" icon="camera" onPress={() => pick('camera')} />
          <Btn title="Choose from gallery" icon="upload" variant="secondary" onPress={() => pick('library')} />
          {waiting ? null : <Btn title="Enter bill manually" icon="edit" variant="ghost" onPress={manual} />}
        </View>
      ) : photo ? (
        <View style={{ gap: space(2), backgroundColor: c.surface, borderRadius: radius.lg, padding: space(4), borderWidth: 1, borderColor: c.border }} accessibilityLiveRegion="polite">
          {STEPS.map((s, i) => (
            <Row key={s} gap={3}>
              {i < step ? <Icon name="check" color={c.success} size={20} strokeWidth={3} /> : i === step ? <ActivityIndicator color={c.primary} /> : <View style={{ width: 20 }} />}
              <T v={i === step ? 'bodyStrong' : 'body'} muted={i > step}>{s}</T>
            </Row>
          ))}
          {live ? (
            <T v="small" muted>{live.step}{live.progress != null && live.progress > 0 && live.progress < 1 ? ` · ${Math.round(live.progress * 100)}%` : ''}</T>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
