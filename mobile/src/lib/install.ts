/**
 * "Install FairBill" on the web: Android/desktop Chrome offer a real install prompt (captured here early,
 * before React mounts); iPhone Safari has no prompt, so the app explains Share → Add to Home Screen.
 */
import { Platform } from 'react-native';

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: PromptEvent | null = null;
const listeners = new Set<() => void>();

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as PromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((l) => l()); });
}

export function onInstallChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Already opened from the home screen (installed). */
export function isInstalled(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return true;
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}

export function canPromptInstall(): boolean {
  return !!deferred;
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  await e.prompt();
  const choice = await e.userChoice.catch(() => ({ outcome: 'dismissed' }));
  listeners.forEach((l) => l());
  return choice.outcome === 'accepted';
}

export function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}
