import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Card, Row, Screen, Segmented, T } from '../components/ui';
import { currencyFor, formatMoney } from '../engine/money';
import type { Bill } from '../engine/types';
import { billTitle, myShare } from '../lib/billText';
import { useStore } from '../store/AppStore';
import { useTheme } from '../theme/ThemeProvider';
import { space } from '../theme/theme';

interface Month { key: string; label: string; total: number; bills: Bill[] }

/** Your own share per month (finalized bills where you were a participant), in the default currency. */
function monthly(bills: Bill[], months: number, currency: string): Month[] {
  const now = new Date();
  const out: Month[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ key, label: d.toLocaleDateString('en-IN', { month: 'short' }), total: 0, bills: [] });
  }
  for (const b of bills) {
    if (b.currency !== currency) continue;
    const share = myShare(b);
    if (share === null) continue;
    const key = (b.date.value ?? b.createdAt).slice(0, 7);
    const m = out.find((x) => x.key === key);
    if (m) { m.total += share; m.bills.push(b); }
  }
  return out;
}

export function MonthlyChart({ bills, months, compact }: { bills: Bill[]; months: number; compact?: boolean }) {
  const { c } = useTheme();
  const { settings } = useStore();
  const cur = currencyFor(settings.currency);
  const data = useMemo(() => monthly(bills, months, cur.code), [bills, months, cur.code]);
  const [sel, setSel] = useState(data.length - 1);
  const max = Math.max(...data.map((d) => d.total), 1);
  const H = compact ? 110 : 180;
  const active = data[Math.min(sel, data.length - 1)];
  const avg = Math.round(data.reduce((a, d) => a + d.total, 0) / data.length);

  return (
    <View style={{ gap: space(3) }}>
      {/* Headline: the selected month (defaults to this month). */}
      <View>
        <T v="small" muted>Your share · {active.label}</T>
        <T v="title">{formatMoney(active.total, cur, { compact: true })}</T>
        <T v="small" muted>{active.bills.length} bill{active.bills.length === 1 ? '' : 's'} · {months}-month average {formatMoney(avg, cur, { compact: true })}</T>
      </View>
      <View accessibilityRole="image" accessibilityLabel={`Bar chart of your monthly share: ${data.map((d) => `${d.label} ${formatMoney(d.total, cur)}`).join(', ')}`}
        style={{ height: H, flexDirection: 'row', alignItems: 'flex-end', gap: 2, borderBottomWidth: 1, borderColor: c.border }}>
        {data.map((d, i) => (
          // Hit target is the whole column, wider and taller than the bar.
          <Pressable key={d.key} onPress={() => setSel(i)} accessibilityRole="button" accessibilityLabel={`${d.label}: ${formatMoney(d.total, cur)}`}
            style={{ flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' }}>
            <View style={{
              width: '56%', maxWidth: 28, height: d.total ? Math.max(3, (d.total / max) * (H - 8)) : 0,
              backgroundColor: c.chart, opacity: i === sel ? 1 : 0.45, borderTopLeftRadius: 4, borderTopRightRadius: 4,
            }} />
          </Pressable>
        ))}
      </View>
      <Row gap={0.5}>
        {data.map((d, i) => <T key={d.key} v="small" muted={i !== sel} style={{ flex: 1, textAlign: 'center', fontWeight: i === sel ? '700' : '400' }}>{d.label}</T>)}
      </Row>
      {data.every((d) => d.total === 0) ? <T v="small" muted>Finish splitting a bill that includes you to see your spending here.</T> : null}
      {!compact ? (
        <View style={{ gap: space(2), marginTop: space(2) }}>
          <T v="caption" muted>TABLE</T>
          {[...data].reverse().map((d) => (
            <Row key={d.key} style={{ justifyContent: 'space-between' }}>
              <T>{d.label} {d.key.slice(0, 4)}</T>
              <T v="small" muted>{d.bills.length} bills</T>
              <T v="bodyStrong" style={{ minWidth: 90, textAlign: 'right' }}>{formatMoney(d.total, cur)}</T>
            </Row>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function Stats() {
  const { bills, settings } = useStore();
  const [range, setRange] = useState<'6' | '12'>('6');
  const cur = currencyFor(settings.currency);
  const recent = bills.filter((b) => myShare(b) !== null && b.currency === cur.code).slice(0, 10);
  return (
    <Screen>
      <Segmented options={[{ key: '6', label: '6 months' }, { key: '12', label: '12 months' }]} value={range} onChange={setRange} />
      <Card><MonthlyChart key={range} bills={bills} months={Number(range)} /></Card>
      <T v="heading">Recent bills</T>
      {recent.map((b) => (
        <Row key={b.id} style={{ justifyContent: 'space-between' }}>
          <T style={{ flex: 1 }} numberOfLines={1}>{billTitle(b)}</T>
          <T v="bodyStrong">{formatMoney(myShare(b)!, cur)}</T>
        </Row>
      ))}
      <T v="small" muted>Only finished bills where you are a participant are counted, in {cur.code}.</T>
    </Screen>
  );
}
