import { router } from 'expo-router';
import React, { useState } from 'react';
import { api, ApiError } from '../api/client';
import { Banner, Btn, Card, Field, Screen, Segmented, T } from '../components/ui';
import { notify } from '../lib/confirm';
import { useStore } from '../store/AppStore';
import { space } from '../theme/theme';

export default function Account() {
  const { session, setSession, settings, updateSettings, saveBill } = useStore();
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedIn = session && !session.user.anonymous;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const client = api(settings.apiUrl, session?.token);
      const s = mode === 'register' ? await client.register(email.trim(), password, settings.name || 'Me') : await client.login(email.trim(), password);
      setSession(s);
      updateSettings({ name: s.user.name });
      // Bring down bills backed up from other devices.
      const remote = await api(settings.apiUrl, s.token).listBills().catch(() => []);
      remote.forEach((b) => saveBill(b));
      notify(mode === 'register' ? 'Account created' : 'Signed in', 'Your bills are now backed up.');
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (signedIn) {
    return (
      <Screen>
        <Card style={{ gap: space(2) }}>
          <T v="heading">{session.user.name}</T>
          <T muted>{session.user.email}</T>
          <T v="small" muted>Bills are backed up to your account and stay available offline on this device.</T>
        </Card>
        <Btn title="Sign out" variant="danger" onPress={() => { setSession(null); router.back(); }} />
      </Screen>
    );
  }

  return (
    <Screen>
      <T muted>An account is optional. It backs up your bills and lets you use FairBill on another phone. Friends never need one.</T>
      <Segmented options={[{ key: 'register', label: 'Create account' }, { key: 'login', label: 'Sign in' }]} value={mode} onChange={setMode} />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Card style={{ gap: space(3) }}>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          hint={mode === 'register' ? 'At least 8 characters' : undefined} />
      </Card>
      <Btn title={mode === 'register' ? 'Create account' : 'Sign in'} loading={busy} disabled={!email.includes('@') || password.length < (mode === 'register' ? 8 : 1)} onPress={submit} />
    </Screen>
  );
}
