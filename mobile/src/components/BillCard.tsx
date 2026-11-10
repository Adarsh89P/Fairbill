import React, { forwardRef } from 'react';
import { Text, View } from 'react-native';
import type { Bill } from '../engine/types';
import { billTitle, Computed, displayDate, fmt, lineLabel, nameOf, payersText } from '../lib/billText';
import { avatarColor, light as c } from '../theme/theme';

/**
 * The picture that gets shared. Always uses the light palette so the image
 * looks the same whatever theme the sender uses. Pass personId for one
 * person's own breakdown, or omit it for the whole bill.
 */
export const BillCard = forwardRef<React.ComponentRef<typeof View>, { bill: Bill; computed: Computed; personId?: string }>(function BillCard({ bill, computed, personId }, ref) {
  const { split, settlement } = computed;
  const person = personId ? split.people.find((p) => p.participantId === personId) : undefined;
  const transfers = settlement.transfers.filter((t) => !personId || t.from === personId || t.to === personId);
  const t = (size: number, weight: '400' | '600' | '700' | '800' = '400', color = c.text) => ({ fontSize: size, fontWeight: weight, color });

  return (
    <View ref={ref} collapsable={false} style={{ width: 360, backgroundColor: '#FFFFFF', borderRadius: 20, overflow: 'hidden' }}>
      <View style={{ backgroundColor: c.primary, padding: 20, gap: 4 }}>
        <Text style={t(13, '700', '#CDEBDD')}>FAIRBILL</Text>
        <Text style={t(15, '600', '#FFFFFF')} numberOfLines={2}>{billTitle(bill)}{bill.date.value ? ` · ${displayDate(bill.date.value)}` : ''}</Text>
        {person ? (
          <>
            <Text style={t(14, '400', '#DDF1E8')}>{nameOf(bill, person.participantId)}'s share</Text>
            <Text style={t(36, '800', '#FFFFFF')}>{fmt(bill, person.total)}</Text>
            <Text style={t(13, '400', '#DDF1E8')}>of {fmt(bill, split.computedTotal)} total{payersText(bill) ? ` · paid by ${payersText(bill)}` : ''}</Text>
          </>
        ) : (
          <>
            <Text style={t(36, '800', '#FFFFFF')}>{fmt(bill, split.computedTotal)}</Text>
            <Text style={t(13, '400', '#DDF1E8')}>Total bill{payersText(bill) ? ` · paid by ${payersText(bill)}` : ''} · {split.people.length} people</Text>
          </>
        )}
      </View>

      <View style={{ padding: 20, gap: 8 }}>
        {person ? (
          person.lines.map((l) => (
            <View key={l.kind + l.refId} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <Text style={[t(14, '400', c.textMuted), { flex: 1 }]} numberOfLines={1}>{lineLabel(l)}</Text>
              <Text style={t(14, '600')}>{fmt(bill, l.amount)}</Text>
            </View>
          ))
        ) : (
          split.people.map((p) => (
            <View key={p.participantId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: avatarColor(p.participantId), alignItems: 'center', justifyContent: 'center' }}>
                <Text style={t(12, '700', '#FFFFFF')}>{nameOf(bill, p.participantId).slice(0, 1).toUpperCase()}</Text>
              </View>
              <Text style={[t(15, '600'), { flex: 1 }]} numberOfLines={1}>{nameOf(bill, p.participantId)}</Text>
              <Text style={t(15, '700')}>{fmt(bill, p.total)}</Text>
            </View>
          ))
        )}

        {transfers.length ? (
          <View style={{ marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderColor: c.border, gap: 6 }}>
            <Text style={t(12, '700', c.textMuted)}>SETTLE UP</Text>
            {transfers.map((tr) => (
              <View key={tr.key} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <Text style={[t(14), { flex: 1 }]} numberOfLines={1}>{nameOf(bill, tr.from)} → {nameOf(bill, tr.to)}</Text>
                <Text style={t(14, '700', tr.settled ? c.success : c.text)}>{fmt(bill, tr.amount)}{tr.settled ? ' ✓' : ''}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <View style={{ backgroundColor: c.surfaceAlt, paddingVertical: 10, paddingHorizontal: 20 }}>
        <Text style={t(11, '600', c.textMuted)}>Split with FairBill · Eat Together. Pay Fairly.</Text>
      </View>
    </View>
  );
});
