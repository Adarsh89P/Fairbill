import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { Icon } from '../../../components/Icon';
import { Avatar, Banner, Btn, Empty, Field, Row, T } from '../../../components/ui';
import { uid } from '../../../engine/factory';
import { ContactsError, loadContacts, PhoneContact } from '../../../lib/contacts';
import { waNumber } from '../../../lib/phone';
import { useBill } from '../../../store/AppStore';
import { useTheme } from '../../../theme/ThemeProvider';
import { radius, space } from '../../../theme/theme';

/** Multi-select picker over the phone's contacts. Adds people (with their number) to the bill. */
export default function PickContacts() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { bill, update } = useBill(id);
  const { c } = useTheme();
  const [all, setAll] = useState<PhoneContact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Record<string, PhoneContact>>({});

  useEffect(() => {
    loadContacts().then(setAll).catch((e) => setError(e instanceof ContactsError ? e.message : 'Could not read your contacts.'));
  }, []);

  const existing = useMemo(() => {
    const names = new Set(bill?.participants.map((p) => p.name.toLowerCase()) ?? []);
    const phones = new Set(bill?.participants.map((p) => waNumber(p.phone)).filter(Boolean) as string[]);
    return (ct: PhoneContact) => names.has(ct.name.toLowerCase()) || ct.phones.some((ph) => phones.has(waNumber(ph) ?? ''));
  }, [bill?.participants]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const digits = needle.replace(/\D/g, '');
    return (all ?? []).filter((ct) => !needle || ct.name.toLowerCase().includes(needle) || (digits.length > 2 && ct.phones.some((p) => p.replace(/\D/g, '').includes(digits))));
  }, [all, q]);

  if (!bill) return <Empty icon="receipt" title="Bill not found" />;
  const count = Object.keys(picked).length;

  const add = () => {
    update((d) => {
      for (const ct of Object.values(picked)) {
        if (d.participants.some((p) => p.name.toLowerCase() === ct.name.toLowerCase())) continue;
        d.participants.push({ id: uid('p'), name: ct.name.slice(0, 40), phone: ct.phones[0] });
      }
    });
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ padding: space(4), gap: space(3) }}>
        <Field value={q} onChangeText={setQ} placeholder="Search name or number" accessibilityLabel="Search contacts" autoCorrect={false}
          right={<Icon name="search" color={c.textMuted} size={20} />} />
        <T v="small" muted>Only names and numbers are used, and they stay on this phone unless you share the bill.</T>
      </View>
      {error ? (
        <View style={{ paddingHorizontal: space(4) }}><Banner tone="warning" title="Can't open contacts">{error}</Banner></View>
      ) : all === null ? (
        <ActivityIndicator color={c.primary} style={{ marginTop: space(8) }} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(ct) => ct.id}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={30}
          ListEmptyComponent={<Empty icon="users" title={all.length ? 'No matches' : 'No contacts found'} />}
          renderItem={({ item: ct }) => {
            const already = existing(ct);
            const on = !!picked[ct.id];
            return (
              <Pressable disabled={already} aria-checked={on || already} accessibilityRole="checkbox" accessibilityLabel={ct.name}
                onPress={() => setPicked((p) => { const n = { ...p }; if (n[ct.id]) delete n[ct.id]; else n[ct.id] = ct; return n; })}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4), paddingVertical: space(2.5),
                  backgroundColor: pressed ? c.surfaceAlt : 'transparent', opacity: already ? 0.5 : 1 })}>
                <Avatar name={ct.name} id={ct.id} size={40} />
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong" numberOfLines={1}>{ct.name}</T>
                  <T v="small" muted numberOfLines={1}>{already ? 'Already on this bill' : ct.phones[0] ?? 'No phone number'}</T>
                </View>
                <View style={{ width: 26, height: 26, borderRadius: radius.sm, borderWidth: 2, borderColor: on || already ? c.primary : c.border,
                  backgroundColor: on || already ? c.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {on || already ? <Icon name="check" size={16} color={c.onPrimary} strokeWidth={3} /> : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}
      <View style={{ padding: space(4), borderTopWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
        <Row gap={2}>
          <Btn title="Cancel" variant="secondary" onPress={() => router.back()} />
          <Btn title={count ? `Add ${count} ${count === 1 ? 'person' : 'people'}` : 'Select people'} icon="plus" disabled={!count} onPress={add} style={{ flex: 1 }} />
        </Row>
      </View>
    </View>
  );
}
