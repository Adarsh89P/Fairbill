import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Bill } from '../engine/types';
import { api, Session } from '../api/client';
import type { Trip } from '../lib/trip';

export interface GroupMember {
  id: string;
  name: string;
  phone?: string;
}
export interface Group {
  id: string;
  name: string;
  members: GroupMember[];
  favourite: boolean;
  updatedAt: string;
}
export type ThemeMode = 'system' | 'light' | 'dark';
export interface Settings {
  name: string;
  currency: string;
  theme: ThemeMode;
  keepReceipts: boolean;
  apiUrl: string;
  /** Attach the bill photo to shared links so friends can check it. */
  sharePhoto: boolean;
  /** New bills join this trip automatically. */
  activeTripId?: string;
}

const DEFAULT_API =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080');
const DEFAULT_SETTINGS: Settings = { name: 'Me', currency: 'INR', theme: 'system', keepReceipts: false, apiUrl: DEFAULT_API, sharePhoto: true };
const KEYS = { bills: 'fb.bills.v1', groups: 'fb.groups.v1', settings: 'fb.settings.v1', session: 'fb.session.v1', trips: 'fb.trips.v1' };

interface Store {
  ready: boolean;
  bills: Bill[]; // newest first
  getBill: (id: string) => Bill | undefined;
  saveBill: (bill: Bill) => void;
  updateBill: (id: string, fn: (draft: Bill) => void) => void;
  deleteBill: (id: string) => void;
  groups: Group[];
  saveGroup: (g: Group) => void;
  deleteGroup: (id: string) => void;
  trips: Trip[]; // newest first
  saveTrip: (t: Trip) => void;
  updateTrip: (id: string, fn: (draft: Trip) => void) => void;
  /** Deletes the trip; its bills stay, just no longer grouped. */
  deleteTrip: (id: string) => void;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  session: Session | null;
  setSession: (s: Session | null) => void;
  ensureSession: () => Promise<Session>;
}

const Ctx = createContext<Store | null>(null);

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

async function load<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [billMap, setBillMap] = useState<Record<string, Bill>>({});
  const [groups, setGroups] = useState<Group[]>([]);
  const [tripMap, setTripMap] = useState<Record<string, Trip>>({});
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [session, setSessionState] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  sessionRef.current = session;
  const syncTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    (async () => {
      const [b, g, s, sess, t] = await Promise.all([
        load<Record<string, Bill>>(KEYS.bills, {}),
        load<Group[]>(KEYS.groups, []),
        load<Settings>(KEYS.settings, DEFAULT_SETTINGS),
        load<Session | null>(KEYS.session, null),
        load<Record<string, Trip>>(KEYS.trips, {}),
      ]);
      setBillMap(b);
      setGroups(g);
      setTripMap(t);
      setSettings({ ...DEFAULT_SETTINGS, ...s });
      setSessionState(sess);
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEYS.bills, JSON.stringify(billMap)).catch(() => {});
  }, [billMap, ready]);
  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEYS.groups, JSON.stringify(groups)).catch(() => {});
  }, [groups, ready]);
  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEYS.trips, JSON.stringify(tripMap)).catch(() => {});
  }, [tripMap, ready]);
  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEYS.settings, JSON.stringify(settings)).catch(() => {});
  }, [settings, ready]);

  const setSession = useCallback((s: Session | null) => {
    setSessionState(s);
    sessionRef.current = s;
    if (s) AsyncStorage.setItem(KEYS.session, JSON.stringify(s)).catch(() => {});
    else AsyncStorage.removeItem(KEYS.session).catch(() => {});
  }, []);

  /** Anonymous device account: created silently the first time the server is needed. */
  const ensureSession = useCallback(async () => {
    if (sessionRef.current) return sessionRef.current;
    const s = await api(settingsRef.current.apiUrl).anonymous(settingsRef.current.name);
    setSession(s);
    return s;
  }, [setSession]);

  /** Best-effort backup to the server; the app works fully offline without it. */
  const scheduleSync = useCallback((bill: Bill) => {
    const s = sessionRef.current;
    if (!s) return;
    clearTimeout(syncTimers.current[bill.id]);
    syncTimers.current[bill.id] = setTimeout(() => {
      const { receiptImageUri, ...rest } = bill; // local file paths stay on the device
      api(settingsRef.current.apiUrl, s.token).putBill(rest as Bill).catch(() => {});
    }, 1500);
  }, []);

  const saveBill = useCallback((bill: Bill) => {
    const next = { ...bill, updatedAt: new Date().toISOString() };
    setBillMap((m) => ({ ...m, [bill.id]: next }));
    scheduleSync(next);
  }, [scheduleSync]);

  const updateBill = useCallback((id: string, fn: (draft: Bill) => void) => {
    setBillMap((m) => {
      if (!m[id]) return m;
      const draft = clone(m[id]);
      fn(draft);
      draft.updatedAt = new Date().toISOString();
      scheduleSync(draft);
      return { ...m, [id]: draft };
    });
  }, [scheduleSync]);

  const deleteBill = useCallback((id: string) => {
    setBillMap((m) => {
      const { [id]: _, ...rest } = m;
      return rest;
    });
    const s = sessionRef.current;
    if (s) api(settingsRef.current.apiUrl, s.token).deleteBill(id).catch(() => {});
  }, []);

  const saveGroup = useCallback((g: Group) => {
    setGroups((gs) => {
      const next = { ...g, updatedAt: new Date().toISOString() };
      const i = gs.findIndex((x) => x.id === g.id);
      return i >= 0 ? gs.map((x) => (x.id === g.id ? next : x)) : [next, ...gs];
    });
  }, []);
  const deleteGroup = useCallback((id: string) => setGroups((gs) => gs.filter((g) => g.id !== id)), []);
  const saveTrip = useCallback((t: Trip) => {
    setTripMap((m) => ({ ...m, [t.id]: { ...t, updatedAt: new Date().toISOString() } }));
  }, []);
  const updateTrip = useCallback((id: string, fn: (draft: Trip) => void) => {
    setTripMap((m) => {
      if (!m[id]) return m;
      const draft = clone(m[id]);
      fn(draft);
      draft.updatedAt = new Date().toISOString();
      return { ...m, [id]: draft };
    });
  }, []);
  const deleteTrip = useCallback((id: string) => {
    setTripMap(({ [id]: _, ...rest }) => rest);
    setBillMap((m) => {
      const next = { ...m };
      for (const b of Object.values(m)) if (b.tripId === id) next[b.id] = { ...b, tripId: undefined };
      return next;
    });
    setSettings((s) => (s.activeTripId === id ? { ...s, activeTripId: undefined } : s));
  }, []);
  const updateSettings = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);

  const bills = useMemo(() => Object.values(billMap).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [billMap]);
  const getBill = useCallback((id: string) => billMap[id], [billMap]);
  const trips = useMemo(() => Object.values(tripMap).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [tripMap]);

  const value = useMemo<Store>(
    () => ({ ready, bills, getBill, saveBill, updateBill, deleteBill, groups, saveGroup, deleteGroup, trips, saveTrip, updateTrip, deleteTrip, settings, updateSettings, session, setSession, ensureSession }),
    [ready, bills, getBill, saveBill, updateBill, deleteBill, groups, saveGroup, deleteGroup, trips, saveTrip, updateTrip, deleteTrip, settings, updateSettings, session, setSession, ensureSession],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside provider');
  return s;
}

export function useBill(id: string | undefined) {
  const { getBill, updateBill } = useStore();
  const bill = id ? getBill(id) : undefined;
  const update = useCallback((fn: (draft: Bill) => void) => id && updateBill(id, fn), [id, updateBill]);
  return { bill, update };
}
