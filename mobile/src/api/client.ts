import { Platform } from 'react-native';
import type { Bill } from '../engine/types';
import type { ExtractionResult } from '../extraction/types';

export interface SessionUser {
  id: string;
  name: string;
  email: string | null;
  anonymous: boolean;
}
export interface Session {
  token: string;
  user: SessionUser;
}

export interface ShareSnapshot {
  restaurant: string | null;
  date: string | null;
  currency: string;
  total: number;
  paidBy: string | null;
  people: { id: string; name: string; total: number; lines: { label: string; amount: number }[] }[];
  transfers: { from: string; to: string; amount: number }[];
}
/** What friends pick from on the shared link. Amounts in minor units. */
export interface ClaimSnapshot {
  restaurant: string | null;
  currency: string;
  items: { id: string; name: string; amount: number; quantity: number | null }[];
  /** guest = added themselves from the link. */
  people: { id: string; name: string; guest?: boolean | null }[];
}
export interface ShareView {
  token: string;
  url: string;
  /** picking: friends tick their items; final: the split is published. */
  phase: 'picking' | 'final' | 'none';
  bill: ShareSnapshot | null;
  claim: ClaimSnapshot | null;
  /** participantId -> item ids they ticked. */
  picks: Record<string, string[]>;
  paid: Record<string, { at: string; by: 'guest' | 'owner' }>;
  hasPhoto: boolean;
  expiresAt: string;
}

/** Error with a message that is safe to show to the user. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

// Free hosting sleeps when idle and takes up to about a minute to wake.
const TIMEOUT_MS = 90_000;

/** data: URIs are decoded here because the page's security policy doesn't let fetch() read them. */
async function webBlob(uri: string): Promise<Blob> {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(uri);
  if (!m) return (await fetch(uri)).blob();
  const raw = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], { type: m[1] || 'application/octet-stream' });
}

async function imageForm(uri: string, mimeType: string): Promise<FormData> {
  const form = new FormData();
  const png = mimeType === 'image/png' || uri.startsWith('data:image/png');
  if (Platform.OS === 'web') {
    form.append('image', await webBlob(uri), png ? 'bill.png' : 'bill.jpg');
  } else {
    form.append('image', { uri, name: png ? 'bill.png' : 'bill.jpg', type: png ? 'image/png' : mimeType } as any);
  }
  return form;
}

export function api(baseUrl: string, token?: string) {
  const base = baseUrl.replace(/\/+$/, '');

  async function request<T>(method: string, path: string, body?: unknown, form?: FormData): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(base + path, {
        method,
        signal: ctrl.signal,
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
      });
    } catch (e: any) {
      throw new ApiError(0, e?.name === 'AbortError' ? 'TIMEOUT' : 'OFFLINE',
        e?.name === 'AbortError' ? 'The server took too long to respond. Please try again.' : "Can't reach the FairBill server. Check your internet connection.");
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON */
    }
    if (!res.ok && data === null && [404, 405, 501].includes(res.status)) {
      // The FairBill server always answers in JSON; a plain-page error means there is no FairBill server at this address
      // (e.g. the web app hosted on GitHub Pages on its own).
      throw new ApiError(res.status, 'NO_SERVER', "This version of FairBill isn't connected to a server, so bills can't be read from photos yet. Tap \"Enter bill manually\" and type in the items from your photo.");
    }
    if (!res.ok) {
      throw new ApiError(res.status, data?.code ?? 'HTTP_' + res.status,
        data?.message ?? (res.status === 401 ? 'Your session expired. Please try again.' : 'Something went wrong. Please try again.'));
    }
    return data as T;
  }

  return {
    anonymous: (name: string) => request<Session>('POST', '/api/auth/anonymous', { name }),
    register: (email: string, password: string, name: string) => request<Session>('POST', '/api/auth/register', { email, password, name }),
    login: (email: string, password: string) => request<Session>('POST', '/api/auth/login', { email, password }),
    me: () => request<SessionUser>('GET', '/api/auth/me'),

    async scanReceipt(uri: string, mimeType: string, store: boolean): Promise<ExtractionResult> {
      return request<ExtractionResult>('POST', `/api/receipts/scan?store=${store}`, undefined, await imageForm(uri, mimeType));
    },
    deleteReceipt: (id: string) => request<void>('DELETE', `/api/receipts/${encodeURIComponent(id)}`),
    deleteAllReceipts: () => request<{ deleted: number }>('DELETE', '/api/receipts'),

    putBill: (bill: Bill) => request<Bill>('PUT', `/api/bills/${encodeURIComponent(bill.id)}`, bill),
    listBills: () => request<Bill[]>('GET', '/api/bills'),
    deleteBill: (id: string) => request<void>('DELETE', `/api/bills/${encodeURIComponent(id)}`),

    publishShare: (billId: string, bill: ShareSnapshot) => request<ShareView>('POST', '/api/shares', { billId, bill }),
    shareStatus: (shareToken: string) => request<ShareView>('GET', `/api/shares/${encodeURIComponent(shareToken)}`),
    openPicking: (billId: string, claim: ClaimSnapshot) => request<ShareView>('POST', '/api/shares/picking', { billId, claim }),
    async uploadSharePhoto(shareToken: string, uri: string, mimeType = 'image/jpeg'): Promise<ShareView> {
      return request<ShareView>('PUT', `/api/shares/${encodeURIComponent(shareToken)}/photo`, undefined, await imageForm(uri, mimeType));
    },
    deleteSharePhoto: (shareToken: string) => request<ShareView>('DELETE', `/api/shares/${encodeURIComponent(shareToken)}/photo`),
    markPaid: (shareToken: string, pid: string, paid: boolean) =>
      request<ShareView>(paid ? 'POST' : 'DELETE', `/api/shares/${encodeURIComponent(shareToken)}/participants/${encodeURIComponent(pid)}/paid`),
  };
}
