import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { MoneyField } from '../../../components/MoneyField';
import { Banner, Btn, Card, Chip, Empty, Field, Row, Screen, Segmented, T } from '../../../components/ui';
import { newCharge } from '../../../engine/factory';
import type { Minor } from '../../../engine/money';
import { ChargeKind, CHARGE_LABELS } from '../../../engine/types';
import { confirmAction } from '../../../lib/confirm';
import { useBill } from '../../../store/AppStore';
import { space } from '../../../theme/theme';

const KINDS: ChargeKind[] = ['CGST', 'SGST', 'IGST', 'GST', 'SERVICE', 'PACKAGING', 'DISCOUNT', 'TIP', 'ROUND_OFF', 'OTHER'];

export default function ChargeEditor() {
  const { id, chargeId, kind: initialKind } = useLocalSearchParams<{ id: string; chargeId?: string; kind?: ChargeKind }>();
  const { bill, update } = useBill(id);
  const existing = bill?.charges.find((ch) => ch.id === chargeId);
  const [kind, setKind] = useState<ChargeKind>(existing?.kind ?? initialKind ?? 'CGST');
  const [label, setLabel] = useState(existing?.label ?? CHARGE_LABELS[existing?.kind ?? initialKind ?? 'CGST']);
  const [amount, setAmount] = useState<Minor | null>(existing?.amount.value === null || existing === undefined ? null : Math.abs(existing.amount.value));
  const [sign, setSign] = useState<'+' | '-'>(existing?.amount.value != null && existing.amount.value < 0 && existing.kind !== 'DISCOUNT' ? '-' : '+');
  if (!bill) return <Screen><Empty icon="receipt" title="Bill not found" /></Screen>;

  const pickKind = (k: ChargeKind) => {
    if (label === CHARGE_LABELS[kind] || !label.trim()) setLabel(CHARGE_LABELS[k]);
    setKind(k);
  };
  const signed = amount === null ? null : kind === 'DISCOUNT' ? -amount : kind === 'ROUND_OFF' && sign === '-' ? -amount : amount;

  const save = () => {
    update((d) => {
      let ch = d.charges.find((x) => x.id === chargeId);
      if (!ch) {
        ch = newCharge(kind, signed, label);
        d.charges.push(ch);
      }
      ch.kind = kind;
      ch.label = label.trim() || CHARGE_LABELS[kind];
      ch.amount = { value: signed, status: 'ok' };
    });
    router.back();
  };

  return (
    <>
      <Stack.Screen options={{ title: existing ? 'Edit charge' : 'Add tax or charge' }} />
      <Screen footer={
        <Row gap={2}>
          {existing ? <Btn title="Remove" icon="trash" variant="danger" onPress={() => confirmAction('Remove charge?', `Remove ${label}?`, () => {
            update((d) => { d.charges = d.charges.filter((x) => x.id !== chargeId); });
            router.back();
          }, 'Remove')} /> : null}
          <Btn title={existing ? 'Save' : 'Add'} icon="check" disabled={amount === null} onPress={save} style={{ flex: 1 }} />
        </Row>
      }>
        {existing?.amount.status === 'verify' && existing.amount.note ? <Banner tone="warning">{existing.amount.note}</Banner> : null}
        <Card style={{ gap: space(3) }}>
          <T v="caption" muted>TYPE</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
            {KINDS.map((k) => <Chip key={k} label={CHARGE_LABELS[k]} selected={kind === k} onPress={() => pickKind(k)} />)}
          </View>
        </Card>
        <Card style={{ gap: space(4) }}>
          <Field label="Label" value={label} onChangeText={setLabel} placeholder={CHARGE_LABELS[kind]} />
          {kind === 'ROUND_OFF' ? (
            <Segmented options={[{ key: '+', label: 'Added (+)' }, { key: '-', label: 'Reduced (−)' }]} value={sign} onChange={setSign} />
          ) : null}
          <MoneyField label={kind === 'DISCOUNT' ? 'Discount amount' : 'Amount (as printed)'} currency={bill.currency} value={amount} onChange={setAmount} autoFocus={!existing}
            hint={kind === 'DISCOUNT' ? 'Enter the discount as a positive number; it will be subtracted.' : ['CGST', 'SGST', 'IGST', 'GST'].includes(kind) ? 'Copy the tax amount exactly as printed — FairBill never recalculates tax.' : undefined} />
        </Card>
      </Screen>
    </>
  );
}
