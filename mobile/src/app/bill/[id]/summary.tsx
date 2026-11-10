import * as Clipboard from 'expo-clipboard';
import * as Print from 'expo-print';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import { api } from '../../../api/client';
import { Icon, IconName } from '../../../components/Icon';
import { Avatar, Banner, Btn, Card, Empty, IconBtn, Row, Screen, SectionTitle, Steps, T } from '../../../components/ui';
import { billHtml, billTitle, compute, displayDate, fmt, lineLabel, nameOf, payersText, personText, wholeBillText } from '../../../lib/billText';
import { confirmAction, notify } from '../../../lib/confirm';
import { useBill, useStore } from '../../../store/AppStore';
import { useTheme } from '../../../theme/ThemeProvider';
import { radius, space } from '../../../theme/theme';

export default function Summary() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { bill, update } = useBill(id);
  const { settings, session, deleteBill } = useStore();
  const { c } = useTheme();
  const [busy, setBusy] = useState<string | null>(null);
  const computed = useMemo(() => (bill ? compute(bill) : null), [bill]);

  // Pull payments that guests marked on the shared web page.
  useFocusEffect(
    useCallback(() => {
      if (!bill?.share || !session) return;
      api(settings.apiUrl, session.token).shareStatus(bill.share.token).then((v) => {
        const paidIds = Object.keys(v.paid);
        if (!paidIds.length) return;
        update((d) => {
          const res = compute(d);
          for (const t of res.settlement.transfers) if (paidIds.includes(t.from)) d.settled[t.key] = true;
        });
      }).catch(() => {});
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bill?.share?.token, session?.token]),
  );

  if (!bill || !computed) return <Screen><Empty icon="receipt" title="Bill not found" /></Screen>;
  const { split, settlement, errors } = computed;
  const pendingTotal = settlement.transfers.filter((t) => !t.settled).reduce((a, t) => a + t.amount, 0);
  const allSettled = settlement.transfers.length > 0 && pendingTotal === 0;

  const toggleSettled = (key: string, from: string, value: boolean) => {
    update((d) => { d.settled[key] = value; });
    if (bill.share && session) api(settings.apiUrl, session.token).markPaid(bill.share.token, from, value).catch(() => {});
  };

  const whatsapp = async () => {
    const text = wholeBillText(bill, computed, bill.share?.url);
    const app = `whatsapp://send?text=${encodeURIComponent(text)}`;
    const web = `https://wa.me/?text=${encodeURIComponent(text)}`;
    try {
      if (Platform.OS !== 'web' && (await Linking.canOpenURL(app))) await Linking.openURL(app);
      else await Linking.openURL(web);
    } catch {
      notify("Couldn't open WhatsApp", 'Use Copy instead and paste the summary.');
    }
  };
  const pdf = async () => {
    setBusy('pdf');
    try {
      const html = billHtml(bill, computed);
      if (Platform.OS === 'web') await Print.printAsync({ html });
      else {
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: billTitle(bill) });
        else notify('PDF saved', uri);
      }
    } catch {
      notify("Couldn't create the PDF", 'Please try again.');
    } finally {
      setBusy(null);
    }
  };
  const copy = async (text: string, what: string) => {
    await Clipboard.setStringAsync(text);
    notify('Copied', `${what} copied to the clipboard.`);
  };

  return (
    <Screen>
      <Steps current={4} />
      {errors.length ? (
        <Banner tone="danger" title="This split needs attention">
          <View style={{ gap: space(2) }}>
            <T v="small">{errors[0].message}</T>
            <Btn small variant="secondary" title="Fix it" onPress={() => router.push(errors[0].itemId ? `/bill/${bill.id}/assign` : `/bill/${bill.id}/review`)} />
          </View>
        </Banner>
      ) : null}
      {settlement.issues.length ? (
        <Banner tone="warning" title="Who paid?">
          <View style={{ gap: space(2) }}>
            <T v="small">{settlement.issues[0]}</T>
            <Btn small variant="secondary" title="Choose payer" onPress={() => router.push(`/bill/${bill.id}/people`)} />
          </View>
        </Banner>
      ) : null}

      <Card style={{ backgroundColor: c.primary, borderColor: c.primary, gap: space(1) }}>
        <T color={c.onPrimary} style={{ opacity: 0.85 }}>{billTitle(bill)}{bill.date.value ? ` · ${displayDate(bill.date.value)}` : ''}</T>
        <T v="display" color={c.onPrimary}>{fmt(bill, split.computedTotal)}</T>
        <T color={c.onPrimary} style={{ opacity: 0.9 }}>Total restaurant bill{payersText(bill) ? ` · paid by ${payersText(bill)}` : ''}</T>
        <View style={{ alignSelf: 'flex-start', marginTop: space(2), backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4 }}>
          <T v="small" color={c.onPrimary} style={{ fontWeight: '700' }}>
            {settlement.transfers.length === 0 ? 'Nothing to settle' : allSettled ? 'All settled ✓' : `${fmt(bill, pendingTotal)} pending`}
          </T>
        </View>
      </Card>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
        <ShareTile icon="whatsapp" label="WhatsApp" onPress={whatsapp} />
        <ShareTile icon="qr" label="QR & link" onPress={() => router.push(`/bill/${bill.id}/share`)} />
        <ShareTile icon="download" label={busy === 'pdf' ? 'Creating…' : 'PDF'} onPress={pdf} />
        <ShareTile icon="copy" label="Copy all" onPress={() => copy(wholeBillText(bill, computed, bill.share?.url), 'Summary')} />
        <ShareTile icon="share" label="Image" onPress={() => router.push(`/bill/${bill.id}/image`)} />
      </View>

      {settlement.transfers.length ? (
        <>
          <SectionTitle>Settle up</SectionTitle>
          <Card style={{ padding: 0 }}>
            {settlement.transfers.map((t, i) => (
              <Row key={t.key} style={{ padding: space(4), borderTopWidth: i ? 1 : 0, borderColor: c.border }}>
                <Avatar name={nameOf(bill, t.from)} id={t.from} size={36} />
                <View style={{ flex: 1 }}>
                  <T><T v="bodyStrong">{nameOf(bill, t.from)}</T> pays <T v="bodyStrong">{nameOf(bill, t.to)}</T></T>
                  <T v="amount" style={{ textDecorationLine: t.settled ? 'line-through' : 'none', opacity: t.settled ? 0.6 : 1 }}>{fmt(bill, t.amount)}</T>
                </View>
                <Pressable onPress={() => toggleSettled(t.key, t.from, !t.settled)} accessibilityRole="checkbox" aria-checked={t.settled}
                  accessibilityLabel={`${nameOf(bill, t.from)} paid ${nameOf(bill, t.to)}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: t.settled ? c.successSoft : c.surfaceAlt }}>
                  <Icon name={t.settled ? 'check' : 'wallet'} size={16} color={t.settled ? c.success : c.textMuted} />
                  <T v="small" color={t.settled ? c.success : c.text} style={{ fontWeight: '700' }}>{t.settled ? 'Paid' : 'Mark paid'}</T>
                </Pressable>
              </Row>
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle>Everyone's share</SectionTitle>
      {split.people.map((p) => {
        const bal = settlement.balances.find((b) => b.participantId === p.participantId)!;
        const status = bal.paid > 0 ? (bal.toReceive > 0 ? `Paid the bill · gets back ${fmt(bill, bal.toReceive)}` : 'Paid the bill')
          : bal.pending > 0 ? `Pending ${fmt(bill, bal.pending)}` : 'Settled';
        return (
          <Card key={p.participantId} style={{ gap: space(2) }}>
            <Row>
              <Avatar name={nameOf(bill, p.participantId)} id={p.participantId} />
              <View style={{ flex: 1 }}>
                <T v="bodyStrong">{nameOf(bill, p.participantId)}</T>
                <T v="small" color={bal.pending > 0 ? c.warning : c.success} style={{ fontWeight: '600' }}>{status}</T>
              </View>
              <T v="amount">{fmt(bill, p.total)}</T>
              {!bill.participants.find((x) => x.id === p.participantId)?.isMe ? (
                <IconBtn icon="share" tone="primary" label={`Send ${nameOf(bill, p.participantId)} their share`} onPress={() => router.push(`/bill/${bill.id}/image?person=${p.participantId}`)} />
              ) : null}
              <IconBtn icon="copy" label={`Copy ${nameOf(bill, p.participantId)}'s summary`} onPress={() => copy(personText(bill, computed, p.participantId), `${nameOf(bill, p.participantId)}'s summary`)} />
            </Row>
            <View style={{ gap: 4, paddingLeft: 52 }}>
              {p.lines.map((l) => (
                <Row key={l.kind + l.refId} style={{ justifyContent: 'space-between' }}>
                  <T v="small" muted style={{ flex: 1 }} numberOfLines={1}>{lineLabel(l)}</T>
                  <T v="small">{fmt(bill, l.amount)}</T>
                </Row>
              ))}
            </View>
          </Card>
        );
      })}

      <Row gap={2} style={{ marginTop: space(2) }}>
        <Btn title="Edit items" icon="edit" variant="secondary" small style={{ flex: 1 }} onPress={() => { update((d) => { d.status = 'draft'; }); router.push(`/bill/${bill.id}/review`); }} />
        <Btn title="Edit split" icon="users" variant="secondary" small style={{ flex: 1 }} onPress={() => router.push(`/bill/${bill.id}/assign`)} />
      </Row>
      <Btn title="Done" variant="ghost" onPress={() => router.dismissTo('/')} />
      <Btn title="Delete bill" icon="trash" variant="danger" small onPress={() => confirmAction('Delete this bill?', 'This removes it from your history.', () => { deleteBill(bill.id); router.dismissTo('/'); })} />
    </Screen>
  );
}

function ShareTile({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ flexGrow: 1, flexBasis: '18%', minWidth: 64, alignItems: 'center', gap: 6, paddingVertical: space(3), borderRadius: radius.md, backgroundColor: pressed ? c.surfaceAlt : c.surface, borderWidth: 1, borderColor: c.border })}>
      <Icon name={icon} color={c.primary} />
      <T v="small" style={{ fontWeight: '600' }}>{label}</T>
    </Pressable>
  );
}
