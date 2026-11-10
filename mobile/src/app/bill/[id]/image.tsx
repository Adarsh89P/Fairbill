import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { Image, Linking, Platform, ScrollView, View } from 'react-native';
import { BillCard } from '../../../components/BillCard';
import { Banner, Btn, Card, Empty, Field, Screen, T } from '../../../components/ui';
import { billTitle, compute, nameOf, personText, wholeBillText } from '../../../lib/billText';
import { notify } from '../../../lib/confirm';
import { waNumber } from '../../../lib/phone';
import { shareCardImage } from '../../../lib/shareImage';
import { useBill, useStore } from '../../../store/AppStore';
import { space } from '../../../theme/theme';

/** Preview the bill picture, then share it — to everyone, or one person's own breakdown. */
export default function ShareImage() {
  const { id, person } = useLocalSearchParams<{ id: string; person?: string }>();
  const { bill, update } = useBill(id);
  const { updateSettings } = useStore();
  const [myName, setMyName] = useState('');
  const computed = useMemo(() => (bill ? compute(bill) : null), [bill]);
  const card = useRef<React.ComponentRef<typeof View>>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  if (!bill || !computed) return <Screen><Empty icon="receipt" title="Bill not found" /></Screen>;

  const p = person ? bill.participants.find((x) => x.id === person) : undefined;
  const me = bill.participants.find((x) => x.isMe);
  // The picture goes to friends, so "Me" has to become a real name first.
  if (me && /^(me|you)$/i.test(me.name.trim())) {
    const save = () => {
      const n = myName.trim();
      if (!n) return;
      updateSettings({ name: n });
      update((d) => { const x = d.participants.find((y) => y.id === me.id); if (x) x.name = n; });
    };
    return (
      <Screen>
        <Card style={{ gap: space(3) }}>
          <T v="heading">What should friends call you?</T>
          <T muted>The picture says who to pay, so “Me” won't make sense to them.</T>
          <Field label="Your name" value={myName} onChangeText={setMyName} placeholder="e.g. Adarsh" autoFocus onSubmitEditing={save} />
          <Btn title="Continue" disabled={!myName.trim()} onPress={save} />
        </Card>
      </Screen>
    );
  }
  const text = p ? personText(bill, computed, p.id) : wholeBillText(bill, computed, bill.share?.url);
  const wa = waNumber(p?.phone);

  const share = async () => {
    setBusy(true);
    try {
      const r = await shareCardImage(card, billTitle(bill), text);
      if (r.kind === 'preview') setPreview(r.uri);
    } catch {
      notify("Couldn't create the image", 'Please try again, or share the text summary instead.');
    } finally {
      setBusy(false);
    }
  };
  const whatsapp = () => {
    const url = `https://wa.me/${wa ?? ''}?text=${encodeURIComponent(text)}`;
    Linking.openURL(url).catch(() => notify("Couldn't open WhatsApp"));
  };

  return (
    <>
      <Stack.Screen options={{ title: p ? `Send to ${p.name}` : 'Share bill image' }} />
      <Screen footer={
        <>
          <Btn title={Platform.OS === 'web' ? 'Share image' : 'Share image…'} icon="share" loading={busy} onPress={share} />
          {p ? <Btn title={wa ? `Message ${p.name} on WhatsApp` : 'Send text on WhatsApp'} icon="whatsapp" variant="secondary" onPress={whatsapp} /> : null}
        </>
      }>
        <ScrollView horizontal contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} showsHorizontalScrollIndicator={false}>
          <BillCard ref={card} bill={bill} computed={computed} personId={p?.id} />
        </ScrollView>
        {p && !p.phone ? <T v="small" muted>Tip: add {p.name} from your contacts to open a WhatsApp chat with them directly.</T> : null}
        <T v="small" muted>
          {p ? `“Share image” opens your share sheet — pick WhatsApp, then ${nameOf(bill, p.id)}. ` : '“Share image” opens your share sheet — pick an app and your friends or group. '}
          WhatsApp can't attach a picture and pick the chat for you in one step, so the chat button sends the summary as text.
        </T>
        {preview ? (
          <View style={{ gap: space(2) }}>
            <Banner tone="info" title="Save or copy the image">Your browser can't share files directly. Press and hold (or right-click) the image to save or copy it.</Banner>
            <Image source={{ uri: preview }} style={{ width: '100%', aspectRatio: 0.7, borderRadius: 12 }} resizeMode="contain" accessibilityLabel="Bill image" />
          </View>
        ) : null}
      </Screen>
    </>
  );
}
