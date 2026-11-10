import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { MoneyField } from '../../../components/MoneyField';
import { Avatar, Banner, Btn, Card, Chip, Empty, Field, IconBtn, Row, Screen, SectionTitle, Segmented, Steps, T } from '../../../components/ui';
import { uid } from '../../../engine/factory';
import { sum } from '../../../engine/money';
import { fmt } from '../../../lib/billText';
import { contactsSupported } from '../../../lib/contacts';
import { notify } from '../../../lib/confirm';
import { personKey } from '../../../lib/trip';
import { useBill, useStore } from '../../../store/AppStore';
import { useTheme } from '../../../theme/ThemeProvider';
import { space } from '../../../theme/theme';

export default function People() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { bill, update } = useBill(id);
  const { settings, groups, saveGroup, trips, bills } = useStore();
  const { c } = useTheme();
  const [name, setName] = useState('');
  const [multi, setMulti] = useState(false);

  // Start with "you" so the most common case needs no typing.
  useEffect(() => {
    if (bill && bill.participants.length === 0) {
      update((d) => {
        const me = { id: uid('p'), name: settings.name || 'Me', isMe: true };
        d.participants.push(me);
        if (d.total.value !== null) d.payments = { [me.id]: d.total.value };
      });
    }
    if (bill && Object.keys(bill.payments).filter((k) => bill.payments[k] > 0).length > 1) setMulti(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bill?.id]);

  if (!bill) return <Screen><Empty icon="receipt" title="Bill not found" /></Screen>;
  const total = bill.total.value ?? 0;
  const paidSum = sum(Object.values(bill.payments));
  const payerIds = Object.keys(bill.payments).filter((k) => bill.payments[k] > 0);

  const add = (n: string) => {
    const clean = n.trim();
    if (!clean) return;
    if (bill.participants.some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
      notify(`${clean} is already added`);
      return;
    }
    update((d) => { d.participants.push({ id: uid('p'), name: clean.slice(0, 40) }); });
    setName('');
  };
  const remove = (pid: string) =>
    update((d) => {
      d.participants = d.participants.filter((p) => p.id !== pid);
      for (const a of Object.values(d.assignments)) delete a.shares[pid];
      delete d.payments[pid];
      for (const r of Object.values(d.rules)) if (r?.custom) delete r.custom[pid];
    });
  const addGroup = (gid: string) => {
    const g = groups.find((x) => x.id === gid);
    if (!g) return;
    update((d) => {
      for (const m of g.members) {
        if (!d.participants.some((p) => p.name.toLowerCase() === m.name.toLowerCase())) d.participants.push({ id: uid('p'), name: m.name, phone: m.phone });
      }
      d.groupId = g.id;
    });
  };
  const saveAsGroup = () => {
    const others = bill.participants.filter((p) => !p.isMe);
    if (!others.length) return notify('Add some friends first');
    saveGroup({ id: uid('g'), name: bill.restaurant.value ? `${bill.restaurant.value} group` : 'My group', members: others.map((p) => ({ id: uid('m'), name: p.name, phone: p.phone })), favourite: true, updatedAt: '' });
    notify('Saved as a favourite group', 'Find it under Groups.');
  };
  const setSinglePayer = (pid: string) => update((d) => { d.payments = { [pid]: d.total.value ?? 0 }; });

  // Everyone from the trip's other bills who isn't on this one yet.
  const trip = trips.find((t) => t.id === bill.tripId);
  const here = new Set(bill.participants.map(personKey));
  const tripPeople = new Map<string, { name: string; phone?: string }>();
  if (trip) {
    for (const b of bills) {
      if (b.tripId !== trip.id || b.id === bill.id) continue;
      for (const p of b.participants) {
        const k = personKey(p);
        if (!here.has(k) && !tripPeople.has(k)) tripPeople.set(k, { name: p.name, phone: p.phone });
      }
    }
  }
  const addTripPeople = () =>
    update((d) => {
      for (const p of tripPeople.values()) {
        if (!d.participants.some((x) => x.name.toLowerCase() === p.name.toLowerCase())) d.participants.push({ id: uid('p'), name: p.name, phone: p.phone });
      }
    });

  const favs = [...groups].sort((a, b) => Number(b.favourite) - Number(a.favourite)).slice(0, 6);
  const paymentsOk = paidSum === total && payerIds.length > 0;

  return (
    <Screen footer={
      <>
        {!paymentsOk && multi ? <T v="small" muted style={{ textAlign: 'center' }}>Payments must add up to {fmt(bill, total)}</T> : null}
        <Btn title="Continue" icon="chevronRight" disabled={bill.participants.length === 0 || !paymentsOk} onPress={() => router.push(`/bill/${bill.id}/assign`)} />
      </>
    }>
      <Steps current={1} />

      {trip && tripPeople.size ? (
        <Chip label={`Everyone from ${trip.name} · ${tripPeople.size}`} icon="trip" onPress={addTripPeople} />
      ) : null}
      {favs.length ? (
        <>
          <SectionTitle>Add a group</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
            {favs.map((g) => <Chip key={g.id} label={`${g.name} · ${g.members.length}`} icon={g.favourite ? 'starFilled' : 'users'} selected={bill.groupId === g.id} onPress={() => addGroup(g.id)} />)}
          </View>
        </>
      ) : null}

      <SectionTitle right={<T v="small" muted>{bill.participants.length} people</T>}>People</SectionTitle>
      <Field value={name} onChangeText={setName} placeholder="Friend's name" returnKeyType="done" onSubmitEditing={() => add(name)} blurOnSubmit={false}
        accessibilityLabel="Friend's name" right={<Btn title="Add" small onPress={() => add(name)} disabled={!name.trim()} />} />
      {contactsSupported ? (
        <Btn title="Add from contacts" icon="users" variant="secondary" onPress={() => router.push(`/bill/${bill.id}/contacts`)} />
      ) : null}
      <Card style={{ padding: 0 }}>
        {bill.participants.map((p, i) => (
          <Row key={p.id} style={{ paddingHorizontal: space(4), paddingVertical: space(2.5), borderTopWidth: i ? 1 : 0, borderColor: c.border }}>
            <Avatar name={p.name} id={p.id} />
            <View style={{ flex: 1 }}>
              <T v="bodyStrong">{p.name}</T>
              {p.isMe ? <T v="small" muted>You</T> : p.phone ? <T v="small" muted>{p.phone}</T> : null}
            </View>
            <IconBtn icon="x" label={`Remove ${p.name}`} onPress={() => remove(p.id)} />
          </Row>
        ))}
      </Card>
      {bill.participants.length > 1 ? <Btn title="Save as favourite group" icon="star" variant="ghost" small onPress={saveAsGroup} /> : null}

      <SectionTitle>Who paid the restaurant?</SectionTitle>
      <Segmented options={[{ key: 'one', label: 'One person' }, { key: 'multi', label: 'Multiple people' }]} value={multi ? 'multi' : 'one'}
        onChange={(k) => {
          setMulti(k === 'multi');
          if (k === 'one') setSinglePayer(payerIds[0] ?? bill.participants[0]?.id);
        }} />
      {!multi ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
          {bill.participants.map((p) => (
            <Chip key={p.id} label={p.name} avatarId={p.id} selected={bill.payments[p.id] === total && total > 0} onPress={() => setSinglePayer(p.id)} />
          ))}
        </View>
      ) : (
        <Card style={{ gap: space(3) }}>
          {bill.participants.map((p) => (
            <MoneyField key={p.id} label={p.name} currency={bill.currency} value={bill.payments[p.id] ?? null}
              onChange={(v) => update((d) => { if (v === null || v === 0) delete d.payments[p.id]; else d.payments[p.id] = v; })} />
          ))}
          <Banner tone={paidSum === total ? 'success' : 'warning'}>
            {paidSum === total ? `Payments add up to ${fmt(bill, total)}.` : `Paid ${fmt(bill, paidSum)} of ${fmt(bill, total)} — ${fmt(bill, total - paidSum)} ${total > paidSum ? 'left' : 'too much'}.`}
          </Banner>
        </Card>
      )}
      <T v="small" muted>Friends don't need the app — you'll get a link and QR code to share at the end.</T>
    </Screen>
  );
}
