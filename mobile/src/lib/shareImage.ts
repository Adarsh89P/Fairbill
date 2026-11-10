import * as Sharing from 'expo-sharing';
import type React from "react";
import { Platform, View } from "react-native";
import { captureRef } from 'react-native-view-shot';

export type ShareImageResult = { kind: 'shared' } | { kind: 'cancelled' } | { kind: 'preview'; uri: string };

/** Turns the card into a PNG and opens the share sheet (WhatsApp, Messages, …). */
export async function shareCardImage(ref: React.RefObject<React.ComponentRef<typeof View> | null>, title: string, text: string): Promise<ShareImageResult> {
  if (!ref.current) throw new Error('Nothing to capture');
  if (Platform.OS !== 'web') {
    const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
    await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: title });
    return { kind: 'shared' };
  }
  const dataUri = await captureRef(ref, { format: 'png', quality: 1, result: 'data-uri' });
  try {
    const blob = await (await fetch(dataUri)).blob();
    const file = new File([blob], 'fairbill.png', { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title, text });
      return { kind: 'shared' };
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') return { kind: 'cancelled' };
  }
  // Browsers without file sharing: show the image so it can be saved or copied by hand.
  return { kind: 'preview', uri: dataUri };
}
