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
export interface ShareView {
  token: string;
  url: string;
  bill: ShareSnapshot;
  paid: Record<string, { at: string; by: 'guest' | 'owner' }>;
  expiresAt: string;
}

/** Error with a message that is safe to show to the user. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const TIMEOUT_MS = 60_000;

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
      const form = new FormData();
      if (Platform.OS === 'web') {
        const blob = await (await fetch(uri)).blob();
        form.append('image', blob, mimeType === 'image/png' ? 'bill.png' : 'bill.jpg');
      } else {
        form.append('image', { uri, name: 'bill.jpg', type: mimeType } as any);
      }
      return request<ExtractionResult>('POST', `/api/receipts/scan?store=${store}`, undefined, form);
    },
    deleteReceipt: (id: string) => request<void>('DELETE', `/api/receipts/${encodeURIComponent(id)}`),
    deleteAllReceipts: () => request<{ deleted: number }>('DELETE', '/api/receipts'),

    putBill: (bill: Bill) => request<Bill>('PUT', `/api/bills/${encodeURIComponent(bill.id)}`, bill),
    listBills: () => request<Bill[]>('GET', '/api/bills'),
    deleteBill: (id: string) => request<void>('DELETE', `/api/bills/${encodeURIComponent(id)}`),

    publishShare: (billId: string, bill: ShareSnapshot) => request<ShareView>('POST', '/api/shares', { billId, bill }),
    shareStatus: (shareToken: string) => request<ShareView>('GET', `/api/shares/${encodeURIComponent(shareToken)}`),
    markPaid: (shareToken: string, pid: string, paid: boolean) =>
      request<ShareView>(paid ? 'POST' : 'DELETE', `/api/shares/${encodeURIComponent(shareToken)}/participants/${encodeURIComponent(pid)}/paid`),
  };
}
