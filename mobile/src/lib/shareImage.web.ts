import html2canvas from 'html2canvas-pro';
import type React from 'react';
import type { View } from 'react-native';
import type { ShareImageResult } from './shareImage';

/** Web: draw the card's DOM node to a PNG, then use the Web Share API or fall back to showing the image. */
export async function shareCardImage(ref: React.RefObject<React.ComponentRef<typeof View> | null>, title: string, text: string): Promise<ShareImageResult> {
  const node = ref.current as unknown as HTMLElement | null;
  if (!node) throw new Error('Nothing to capture');
  const canvas = await html2canvas(node, { backgroundColor: null, scale: Math.min(3, Math.max(2, window.devicePixelRatio || 1)), logging: false });
  const uri = canvas.toDataURL('image/png');
  try {
    const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'));
    const file = new File([blob], 'fairbill.png', { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title, text });
      return { kind: 'shared' };
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') return { kind: 'cancelled' };
  }
  return { kind: 'preview', uri };
}
