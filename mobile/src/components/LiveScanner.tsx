/**
 * Phone apps: no live scanner yet (it needs a camera module in a custom build), so the scan screen uses the
 * phone's camera app. The web build uses LiveScanner.web.tsx.
 */
import type { Photo } from '../lib/photo';

export interface LiveScannerProps {
  onCapture: (photo: Photo) => void;
  onClose: () => void;
  onGallery: () => void;
  onUnavailable: (message: string) => void;
}

export function liveScannerSupported(): boolean {
  return false;
}

export function LiveScanner(_: LiveScannerProps): null {
  return null;
}
