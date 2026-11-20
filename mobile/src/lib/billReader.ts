/**
 * Chooses where a bill photo is read:
 *  - phone apps: the FairBill server (as before)
 *  - web: the FairBill server if one answers at the app's server address, otherwise right here in the
 *    browser (see extraction/local/browserReader). So the web app can scan on a static host like GitHub Pages.
 */
import { Platform } from 'react-native';
import { api, ApiError, Session } from '../api/client';
import type { ExtractionResult } from '../extraction/types';
import type { ScanProgress } from '../extraction/local/browserReader';

const serverChecks = new Map<string, Promise<boolean>>();

/** The normal web build ships the in-browser reader; the single-file preview (Claude artifact) does not. */
function localReaderShipped(): boolean {
  return typeof document !== 'undefined' && !!document.querySelector('script[src*="/_expo/"]');
}

/** Whether a FairBill server answers at this address (checked once per address per visit). */
export function hasServer(apiUrl: string): Promise<boolean> {
  const base = apiUrl.replace(/\/+$/, '');
  let check = serverChecks.get(base);
  if (!check) {
    check = (async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3500);
      try {
        const res = await fetch(base + '/actuator/health', { signal: ctrl.signal, headers: { Accept: 'application/json' } });
        const data = await res.json().catch(() => null);
        return res.ok && data?.status === 'UP';
      } catch {
        return false;
      } finally {
        clearTimeout(t);
      }
    })();
    serverChecks.set(base, check);
  }
  return check;
}

/** Web only: when there's no server, start downloading the in-browser reader (e.g. while the camera is open). */
export function prepareBillReader(apiUrl: string): void {
  if (Platform.OS !== 'web') return;
  if (!localReaderShipped()) return;
  hasServer(apiUrl).then(async (ok) => {
    if (ok) return;
    const { warmUpLocalReader } = await import('../extraction/local/browserReader');
    warmUpLocalReader();
  });
}

/**
 * Preloads the in-browser reader in the background on a fast, unmetered-looking connection, so the first
 * scan doesn't wait for the download. Skipped when the user asked to save data or the connection is slow.
 */
export function preloadBillReaderIfCheap(apiUrl: string): void {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return;
  const conn = (navigator as any).connection;
  if (conn?.saveData) return;
  if (conn && (conn.type === 'cellular' || /(^|-)2g|3g/.test(conn.effectiveType ?? ''))) return;
  setTimeout(() => prepareBillReader(apiUrl), 4000);
}

export interface ReadBillDeps {
  apiUrl: string;
  keepReceipts: boolean;
  ensureSession: () => Promise<Session>;
  setSession: (s: Session | null) => void;
}

export async function readBill(uri: string, mimeType: string, deps: ReadBillDeps, progress?: (p: ScanProgress) => void): Promise<ExtractionResult> {
  if (Platform.OS === 'web' && !(await hasServer(deps.apiUrl))) {
    if (!localReaderShipped()) {
      throw new ApiError(0, 'LOCAL_UNAVAILABLE', "Bill reading isn't available in this preview. Open the FairBill web link to scan, or enter the bill manually.");
    }
    const { scanBillLocally } = await import('../extraction/local/browserReader');
    return scanBillLocally(uri, progress);
  }
  const run = async () => {
    const s = await deps.ensureSession();
    return api(deps.apiUrl, s.token).scanReceipt(uri, mimeType, deps.keepReceipts);
  };
  try {
    return await run();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      deps.setSession(null); // stale token (e.g. server key rotated): get a fresh anonymous session once
      return run();
    }
    throw e;
  }
}

/**
 * Free servers sleep when idle: ping it as soon as the app opens so it is awake by the time the user shares a
 * bill. Only when a separate server address is configured (not the site's own origin, which has none on Pages).
 */
export function wakeServer(apiUrl: string): void {
  if (typeof fetch === 'undefined') return;
  if (Platform.OS === 'web' && typeof window !== 'undefined' && apiUrl.replace(/\/+$/, '') === window.location.origin) return;
  fetch(apiUrl.replace(/\/+$/, '') + '/actuator/health').catch(() => {});
}
