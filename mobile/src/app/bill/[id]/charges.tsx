import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { TextInput, View } from 'react-native';
import { Avatar, Banner, Btn, Card, Empty, Row, Screen, Segmented, Steps, T } from '../../../components/ui';
import { allocate, sum } from '../../../engine/money';
import { computeSplit, ruleFor } from '../../../engine/split';
import { ChargeKind, CHARGE_LABELS, DistributionMethod } from '../../../engine/types';
import { fmt } from '../../../lib/billText';
import { useBill } from '../../../store/AppStore';
import { useTheme } from '../../../theme/ThemeProvider';
import { radius, space, type } from '../../../theme/theme';

const METHOD_HELP: Record<DistributionMethod, string> = {
  equal: 'Everyone pays the same share.',
  proportional: 'By consumption: in proportion to what each person ate and drank.',
  custom: 'Set shares per person (e.g. 1 and 2 means one-third and two-thirds).',
};

export default function Charges() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { bill, update } = useBill(id);
  const { c } = useTheme();
  const split = useMemo(() => (bill ? computeSplit(bill) : null), [bill]);

  // Tips default to a custom split; start everyone at one share so it is ready to adjust.
  useEffect(() => {
    if (!bill) return;
    const kinds = new Set(bill.charges.map((ch) => ch.kind));
    for (const k of kinds) {
      const r = ruleFor(bill, k);
      if (r.method === 'custom' && !r.custom) {
        update((d) => { d.rules[k] = { method: 'custom', custom: Object.fromEntries(d.participants.map((p) => [p.id, 1])) }; });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bill?.id]);

  if (!bill || !split) return <Screen><Empty icon="receipt" title="Bill not found" /></Screen>;
  const kinds = Array.from(new Set(bill.charges.map((ch) => ch.kind)));
  const errors = split.issues.filter((i) => i.level === 'error');

  const finalize = () => {
    update((d) => { d.status = 'final'; });
    router.push(`/bill/${bill.id}/summary`);
  };

  return (
    <Screen footer={
      <>
        {errors.length ? <T v="small" muted style={{ textAlign: 'center' }}>{errors[0].message}</T> : null}
        <Btn title="See final split" icon="check" disabled={errors.length > 0} onPress={finalize} />
      </>
    }>
      <Steps current={3} />
      {kinds.length === 0 ? (
        <Card><T muted>This bill has no taxes or charges. You're ready to see the split.</T></Card>
      ) : (
        <Banner tone="info">Taxes and charges are copied exactly from the bill. FairBill only decides how to share them — it never recalculates tax.</Banner>
      )}
      {kinds.map((k) => {
        const rule = ruleFor(bill, k);
        const amount = sum(bill.charges.filter((ch) => ch.kind === k).map((ch) => ch.amount.value ?? 0));
        const setMethod = (m: DistributionMethod) =>
          update((d) => {
            d.rules[k] = m === 'custom' ? { method: m, custom: rule.custom ?? Object.fromEntries(d.participants.map((p) => [p.id, 1])) } : { method: m };
          });
        const weights = bill.participants.map((p) => Math.max(0, Math.round((rule.custom?.[p.id] ?? 0) * 100)));
        const preview = rule.method === 'custom' && sum(weights) > 0 ? allocate(amount, weights) : null;
        return (
          <Card key={k} style={{ gap: space(3) }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <T v="bodyStrong">{labelFor(bill.charges.filter((ch) => ch.kind === k).map((ch) => ch.label), k)}</T>
                <T v="small" muted>{METHOD_HELP[rule.method]}</T>
              </View>
              <T v="amount">{fmt(bill, amount)}</T>
            </Row>
            <Segmented options={[{ key: 'equal', label: 'Equally' }, { key: 'proportional', label: 'By items' }, { key: 'custom', label: 'Custom' }]}
              value={rule.method} onChange={setMethod} />
            {rule.method === 'custom' ? (
              <View style={{ gap: space(2) }}>
                {bill.participants.map((p, i) => (
                  <Row key={p.id}>
                    <Avatar name={p.name} id={p.id} size={28} />
                    <T style={{ flex: 1 }}>{p.name}</T>
                    <TextInput accessibilityLabel={`Shares for ${p.name}`} keyboardType="decimal-pad" inputMode="decimal" defaultValue={String(rule.custom?.[p.id] ?? 0)}
                      onChangeText={(t) => update((d) => {
                        const v = Number(t.replace(',', '.'));
                        const r = d.rules[k] ?? { method: 'custom' };
                        r.custom = { ...(r.custom ?? {}), [p.id]: Number.isFinite(v) && v >= 0 ? v : 0 };
                        d.rules[k] = r;
                      })}
                      style={[type.body, { color: c.text, width: 64, textAlign: 'right', borderWidth: 1.5, borderColor: c.border, borderRadius: radius.sm, paddingHorizontal: 8, minHeight: 40 }]} />
                    <T v="bodyStrong" style={{ width: 90, textAlign: 'right' }}>{preview ? fmt(bill, preview[i]) : '—'}</T>
                  </Row>
                ))}
                {!preview ? <Banner tone="danger">Give at least one person a share.</Banner> : null}
              </View>
            ) : null}
          </Card>
        );
      })}

      <Card style={{ gap: space(2) }}>
        <T v="caption" muted>EACH PERSON PAYS</T>
        {split.people.map((p) => (
          <Row key={p.participantId} style={{ justifyContent: 'space-between' }}>
            <T>{bill.participants.find((x) => x.id === p.participantId)?.name}</T>
            <T v="bodyStrong">{fmt(bill, p.total)}</T>
          </Row>
        ))}
        <Row style={{ justifyContent: 'space-between', borderTopWidth: 1, borderColor: c.border, paddingTop: space(2) }}>
          <T v="bodyStrong">Total</T>
          <T v="bodyStrong">{fmt(bill, split.computedTotal)}</T>
        </Row>
      </Card>
    </Screen>
  );
}

function labelFor(labels: string[], k: ChargeKind): string {
  const uniq = Array.from(new Set(labels));
  return uniq.length === 1 ? uniq[0] : `${CHARGE_LABELS[k]} (${uniq.length} lines)`;
}
