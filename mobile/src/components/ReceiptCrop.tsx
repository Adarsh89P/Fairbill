import React, { useEffect, useState } from 'react';
import { Image, LayoutChangeEvent, View } from 'react-native';
import type { Bill, Box } from '../engine/types';
import { useTheme } from '../theme/ThemeProvider';
import { radius } from '../theme/theme';
import { T } from './ui';

export function unionBox(...boxes: (Box | undefined)[]): Box | undefined {
  const bs = boxes.filter((b): b is Box => !!b);
  if (!bs.length) return undefined;
  const x = Math.min(...bs.map((b) => b.x));
  const y = Math.min(...bs.map((b) => b.y));
  return { x, y, width: Math.max(...bs.map((b) => b.x + b.width)) - x, height: Math.max(...bs.map((b) => b.y + b.height)) - y };
}

/** The real pixel size of the stored photo, or null if it doesn't match what the scanner read (then we show nothing). */
function usePhotoSize(uri: string | undefined, expected: { width: number; height: number } | undefined) {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    if (!uri || !expected) return setOk(false);
    let live = true;
    Image.getSize(uri, (w, h) => {
      // Same picture at any resolution has the same shape; a rotated or different photo doesn't.
      if (live) setOk(Math.abs(w / h - expected.width / expected.height) < 0.02);
    }, () => live && setOk(false));
    return () => { live = false; };
  }, [uri, expected?.width, expected?.height]);
  return ok;
}

export function canShowOnPhoto(bill: Bill, ...boxes: (Box | undefined)[]): boolean {
  return !!bill.receiptImageUri && !!bill.receiptSize && boxes.some(Boolean);
}

/**
 * A zoomed strip of the bill photo around one line, with the value in question outlined, so the user
 * can compare what was read with what is printed without hunting through the whole photo.
 */
export function ReceiptCrop({ bill, line, focus, tone = 'verify', maxHeight = 110, label }: {
  bill: Bill; line?: Box; focus?: Box; tone?: 'verify' | 'missing'; maxHeight?: number; label?: string;
}) {
  const { c } = useTheme();
  const [w, setW] = useState(0);
  const size = bill.receiptSize;
  const ok = usePhotoSize(bill.receiptImageUri, size);
  // Without a known line (totals, taxes), show the full width so the printed label is visible too.
  const region = line ?? (focus && size ? { x: 0, y: focus.y, width: size.width, height: focus.height } : undefined);
  if (!ok || !size || !region || !bill.receiptImageUri) return null;

  const padX = Math.max(size.width * 0.03, region.height);
  const padY = region.height * 0.9;
  const cx = Math.max(0, region.x - padX);
  const cy = Math.max(0, region.y - padY);
  const cw = Math.min(size.width, region.x + region.width + padX) - cx;
  const ch = Math.min(size.height, region.y + region.height + padY) - cy;
  const scale = w > 0 ? w / cw : 0;
  const height = Math.min(maxHeight, Math.max(36, ch * scale));
  // When the strip is capped, keep the outlined value vertically centred.
  const target = focus ?? region;
  const offsetY = ch * scale > height ? Math.max(0, (target.y + target.height / 2 - cy) * scale - height / 2) : 0;
  const color = tone === 'missing' ? c.danger : c.warning;

  return (
    <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
      accessible accessibilityRole="image" accessibilityLabel={`Bill photo, zoomed in on ${label ?? 'this line'}`}
      style={{ width: '100%', height, overflow: 'hidden', borderRadius: radius.sm, backgroundColor: '#fff', borderWidth: 1, borderColor: c.border }}>
      {scale > 0 ? (
        <>
          <Image source={{ uri: bill.receiptImageUri }} resizeMode="stretch"
            style={{ position: 'absolute', left: -cx * scale, top: -cy * scale - offsetY, width: size.width * scale, height: size.height * scale }} />
          {focus ? (
            <View pointerEvents="none" style={{
              position: 'absolute', left: (focus.x - cx) * scale - 4, top: (focus.y - cy) * scale - offsetY - 3,
              width: focus.width * scale + 8, height: focus.height * scale + 6, borderWidth: 2.5, borderColor: color, borderRadius: 6,
            }} />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/** The whole photo with every flagged value outlined. */
export function ReceiptOverview({ bill, marks }: { bill: Bill; marks: { box: Box; tone: 'verify' | 'missing' }[] }) {
  const { c } = useTheme();
  const size = bill.receiptSize;
  const ok = usePhotoSize(bill.receiptImageUri, size);
  if (!bill.receiptImageUri) return null;
  if (!ok || !size) {
    return <Image source={{ uri: bill.receiptImageUri }} style={{ width: '100%', aspectRatio: 0.6, borderRadius: radius.md }} resizeMode="contain" accessibilityLabel="Photo of the bill" />;
  }
  const pct = (v: number, of: number) => `${(v / of) * 100}%` as const;
  return (
    <View>
      <View style={{ width: '100%', aspectRatio: size.width / size.height, borderRadius: radius.md, overflow: 'hidden' }} accessibilityLabel="Photo of the bill">
        <Image source={{ uri: bill.receiptImageUri }} style={{ width: '100%', height: '100%' }} resizeMode="stretch" />
        {marks.map((m, i) => (
          <View key={i} pointerEvents="none" style={{
            position: 'absolute', left: pct(m.box.x, size.width), top: pct(m.box.y, size.height),
            width: pct(m.box.width, size.width), height: pct(m.box.height, size.height),
            borderWidth: 2, borderColor: m.tone === 'missing' ? c.danger : c.warning, borderRadius: 4, transform: [{ scale: 1.15 }],
          }} />
        ))}
      </View>
      {marks.length ? <T v="small" muted style={{ marginTop: 6 }}>Outlined: {marks.length} value{marks.length === 1 ? '' : 's'} to check</T> : null}
    </View>
  );
}
