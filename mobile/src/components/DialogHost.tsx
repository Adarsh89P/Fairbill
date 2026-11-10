import React, { useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { DialogRequest, setDialogListener } from '../lib/confirm';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space } from '../theme/theme';
import { Btn, Row, T } from './ui';

/** Renders confirmations and notices inside the app (works where browser dialogs are blocked). */
export function DialogHost() {
  const { c } = useTheme();
  const [d, setD] = useState<DialogRequest | null>(null);
  useEffect(() => {
    setDialogListener(setD);
    return () => setDialogListener(null);
  }, []);
  useEffect(() => {
    if (d && !d.onConfirm) {
      const t = setTimeout(() => setD((cur) => (cur === d ? null : cur)), 2600);
      return () => clearTimeout(t);
    }
  }, [d]);
  if (!d) return null;

  if (!d.onConfirm) {
    // Notice: a toast that doesn't block the screen.
    return (
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 90, alignItems: 'center', paddingHorizontal: space(4) }}>
        <Pressable onPress={() => setD(null)} accessibilityRole="alert"
          style={{ backgroundColor: c.text, borderRadius: radius.md, paddingHorizontal: space(4), paddingVertical: space(3), maxWidth: 420, gap: 2 }}>
          <T v="bodyStrong" color={c.bg}>{d.title}</T>
          {d.message ? <T v="small" color={c.bg}>{d.message}</T> : null}
        </Pressable>
      </View>
    );
  }
  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => setD(null)}>
      <Pressable onPress={() => setD(null)} style={{ flex: 1, backgroundColor: c.overlay, justifyContent: 'center', padding: space(6) }}>
        <Pressable accessibilityRole="alert" onPress={() => {}}
          style={{ backgroundColor: c.surface, borderRadius: radius.lg, padding: space(5), gap: space(3), maxWidth: 420, width: '100%', alignSelf: 'center' }}>
          <T v="heading">{d.title}</T>
          {d.message ? <T muted>{d.message}</T> : null}
          <Row gap={2} style={{ justifyContent: 'flex-end', marginTop: space(2) }}>
            <Btn title="Cancel" variant="ghost" small onPress={() => setD(null)} />
            <Btn title={d.confirmLabel ?? 'OK'} variant={d.destructive ? 'danger' : 'primary'} small
              onPress={() => { const f = d.onConfirm; setD(null); f?.(); }} />
          </Row>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
