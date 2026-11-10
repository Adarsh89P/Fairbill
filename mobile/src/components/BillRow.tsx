import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import type { Bill } from '../engine/types';
import { billTitle, displayDate, fmt, myShare, phaseOf } from '../lib/billText';
import { useTheme } from '../theme/ThemeProvider';
import { radius } from '../theme/theme';
import { Icon } from './Icon';
import { Card, Row, T } from './ui';

export function openBill(b: Bill) {
  if (b.status === 'draft') router.push(`/bill/${b.id}/review`);
  else if (b.status === 'confirmed') router.push(b.participants.length ? `/bill/${b.id}/assign` : `/bill/${b.id}/people`);
  else router.push(`/bill/${b.id}/summary`);
}

export function BillRow({ bill }: { bill: Bill }) {
  const { c } = useTheme();
  const phase = phaseOf(bill);
  const tone = phase === 'Settled' ? [c.successSoft, c.success] : phase === 'Needs review' ? [c.warningSoft, c.warning] : [c.primarySoft, c.primary];
  const total = bill.total.status === 'ok' ? bill.total.value : null; // never show an unverified OCR total
  const mine = myShare(bill);
  return (
    <Card onPress={() => openBill(bill)} accessibilityLabel={`${billTitle(bill)}, ${phase}`} style={{ padding: 14 }}>
      <Row>
        <View style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="receipt" color={c.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="bodyStrong" numberOfLines={1}>{billTitle(bill)}</T>
          <T v="small" muted numberOfLines={1}>
            {[displayDate(bill.date.value ?? bill.createdAt), bill.participants.length ? `${bill.participants.length} people` : null].filter(Boolean).join(' · ')}
          </T>
          <View style={{ alignSelf: 'flex-start', backgroundColor: tone[0], borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, marginTop: 2 }}>
            <T v="caption" color={tone[1]}>{phase}</T>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <T v="amount">{total === null ? '—' : fmt(bill, total, true)}</T>
          {mine !== null ? <T v="small" muted>You: {fmt(bill, mine, true)}</T> : null}
        </View>
      </Row>
    </Card>
  );
}
