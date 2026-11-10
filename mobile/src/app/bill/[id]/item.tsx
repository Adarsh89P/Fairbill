import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { MoneyField } from '../../../components/MoneyField';
import { Banner, Btn, Card, Empty, Field, Row, Screen, T } from '../../../components/ui';
import { newItem } from '../../../engine/factory';
import { currencyFor, formatMoney, Minor } from '../../../engine/money';
import { confirmAction } from '../../../lib/confirm';
import { useBill } from '../../../store/AppStore';
import { space } from '../../../theme/theme';

export default function ItemEditor() {
  const { id, itemId } = useLocalSearchParams<{ id: string; itemId: string }>();
  const { bill, update } = useBill(id);
  const existing = bill?.items.find((i) => i.id === itemId);
  const [name, setName] = useState(existing?.name.value ?? '');
  const [qty, setQty] = useState(existing?.quantity.value != null ? String(existing.quantity.value) : '1');
  const [rate, setRate] = useState<Minor | null>(existing?.unitPrice.value ?? null);
  const [amount, setAmount] = useState<Minor | null>(existing?.amount.value ?? null);
  const [discount, setDiscount] = useState<Minor | null>(existing?.discount || null);
  if (!bill) return <Screen><Empty icon="receipt" title="Bill not found" /></Screen>;

  const cur = currencyFor(bill.currency);
  const q = qty.trim() === '' ? null : Number(qty);
  const qtyError = q !== null && (!Number.isInteger(q) || q <= 0 || q > 999) ? 'Quantity must be a whole number' : undefined;
  const computed = q && rate !== null && !qtyError ? q * rate : null;
  const nameError = !name.trim() ? 'Enter the item name' : undefined;
  const discountError = discount !== null && amount !== null && discount > amount ? 'Discount is larger than the price' : undefined;
  const canSave = !nameError && !qtyError && amount !== null && !discountError;

  const save = () => {
    update((d) => {
      const target = d.items.find((i) => i.id === itemId) ?? (() => {
        const n = newItem(null, null);
        d.items.push(n);
        return n;
      })();
      // Everything saved here was entered or confirmed by the user.
      target.name = { value: name.trim(), status: 'ok' };
      target.quantity = q === null ? { value: null, status: 'ok', note: 'Not printed' } : { value: q, status: 'ok' };
      target.unitPrice = rate === null ? { value: null, status: 'missing' } : { value: rate, status: 'ok' };
      target.amount = { value: amount, status: 'ok' };
      target.discount = discount ?? 0;
    });
    router.back();
  };

  const issues = existing ? [existing.name, existing.quantity, existing.amount].filter((f) => f.status !== 'ok' && f.note).map((f) => f.note!) : [];

  return (
    <>
      <Stack.Screen options={{ title: existing ? 'Edit item' : 'Add item' }} />
      <Screen footer={
        <Row gap={2}>
          {existing ? <Btn title="Delete" icon="trash" variant="danger" onPress={() => confirmAction('Delete item?', `Remove "${name || 'this item'}"?`, () => {
            update((d) => { d.items = d.items.filter((i) => i.id !== itemId); delete d.assignments[itemId]; });
            router.back();
          })} /> : null}
          <Btn title={existing ? 'Save' : 'Add item'} icon="check" disabled={!canSave} onPress={save} style={{ flex: 1 }} />
        </Row>
      }>
        {issues.map((n) => <Banner key={n} tone="warning">{n}</Banner>)}
        {existing?.source === 'ocr' && existing.amount.confidence !== undefined ? (
          <T v="small" muted>Scanned with {Math.round(existing.amount.confidence * 100)}% confidence. Compare with the bill photo before saving.</T>
        ) : null}
        <Card style={{ gap: space(4) }}>
          <Field label="Item name" value={name} onChangeText={setName} placeholder="e.g. Chicken Biryani" autoFocus={!existing} error={name ? nameError : undefined} />
          <Row gap={3} style={{ alignItems: 'flex-start' }}>
            <View style={{ width: 100 }}>
              <Field label="Qty" value={qty} onChangeText={setQty} keyboardType="number-pad" inputMode="numeric" error={qtyError} />
            </View>
            <View style={{ flex: 1 }}>
              <MoneyField label="Rate (per unit, optional)" currency={bill.currency} value={rate} onChange={setRate} />
            </View>
          </Row>
          <MoneyField label="Amount (as printed)" currency={bill.currency} value={amount} onChange={setAmount}
            hint={computed !== null && computed !== amount ? `Qty × rate = ${formatMoney(computed, cur)}` : 'The line total printed on the bill'} />
          {computed !== null && computed !== amount ? (
            <Btn small variant="secondary" title={`Use ${formatMoney(computed, cur)} (qty × rate)`} onPress={() => setAmount(computed)} />
          ) : null}
          <MoneyField label="Item discount (optional)" currency={bill.currency} value={discount} onChange={setDiscount}
            hint={discountError ?? 'Only if the bill shows a discount on this line'} warn={!!discountError} />
        </Card>
      </Screen>
    </>
  );
}
