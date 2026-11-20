import React, { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { canPromptInstall, isInstalled, isIosSafari, onInstallChange, promptInstall } from '../lib/install';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space } from '../theme/theme';
import { Icon } from './Icon';
import { Btn, T } from './ui';

const KEY = 'fb.installCard.dismissed';
const read = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

/** Web only: "Install FairBill" — a one-tap install on Android/desktop, or the steps on iPhone. */
export function InstallCard() {
  const { c } = useTheme();
  const [, tick] = useState(0);
  const [dismissed, setDismissed] = useState(read);
  useEffect(() => onInstallChange(() => tick((n) => n + 1)), []);
  if (Platform.OS !== 'web' || dismissed || isInstalled()) return null;
  const prompt = canPromptInstall();
  const ios = isIosSafari();
  if (!prompt && !ios) return null;
  const close = () => { try { localStorage.setItem(KEY, '1'); } catch { /* private mode */ } setDismissed(true); };
  return (
    <View style={{ flexDirection: 'row', gap: space(3), backgroundColor: c.primarySoft, borderRadius: radius.lg, padding: space(4), alignItems: 'center' }}>
      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="scan" color={c.onPrimary} size={24} />
      </View>
      <View style={{ flex: 1, gap: space(1) }}>
        <T v="bodyStrong">Install FairBill</T>
        <T v="small" muted>
          {prompt ? 'Add it to your home screen — opens full screen, works offline.' : 'Tap Share, then “Add to Home Screen” to use it like an app.'}
        </T>
        {prompt ? <Btn title="Install" icon="download" small onPress={() => promptInstall()} style={{ alignSelf: 'flex-start', marginTop: space(1) }} /> : null}
      </View>
      <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Hide install tip" style={{ alignSelf: 'flex-start', padding: space(1) }}>
        <Icon name="x" color={c.textMuted} size={18} />
      </Pressable>
    </View>
  );
}
