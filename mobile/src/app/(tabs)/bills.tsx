import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { BillRow } from '../../components/BillRow';
import { Btn, Card, Chip, Empty, Field, Screen, T } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { billTitle, phaseOf } from '../../lib/billText';
import { useStore } from '../../store/AppStore';
import { useTheme } from '../../theme/ThemeProvider';
import { space } from '../../theme/theme';

const FILTERS = ['All', 'Needs review', 'Pending payments', 'Settled'] as const;

export default function Bills() {
  const { bills } = useStore();
  const { c } = useTheme();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return bills.filter((b) => {
      if (needle && !(billTitle(b).toLowerCase().includes(needle) || b.participants.some((p) => p.name.toLowerCase().includes(needle)))) return false;
      if (filter === 'All') return true;
      const ph = phaseOf(b);
      return filter === 'Needs review' ? ph === 'Needs review' || ph === 'Assigning' : ph === filter;
    });
  }, [bills, q, filter]);

  return (
    <Screen>
      <Field value={q} onChangeText={setQ} placeholder="Search restaurant or friend" accessibilityLabel="Search bills"
        right={<Icon name="search" color={c.textMuted} size={20} />} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
        {FILTERS.map((f) => <Chip key={f} label={f} selected={filter === f} onPress={() => setFilter(f)} />)}
      </View>
      {list.length === 0 ? (
        <Card>
          <Empty icon="receipt" title={bills.length ? 'No matching bills' : 'No bills yet'} body={bills.length ? 'Try another search or filter.' : 'Bills you scan or create appear here.'}
            action={bills.length ? undefined : <Btn title="Scan a bill" icon="camera" onPress={() => { router.push({ pathname: '/scan', params: { source: 'camera' } }); }} />} />
        </Card>
      ) : (
        list.map((b) => <BillRow key={b.id} bill={b} />)
      )}
      {bills.length ? <T v="small" muted style={{ textAlign: 'center' }}>{bills.length} bill{bills.length > 1 ? 's' : ''} stored on this device</T> : null}
    </Screen>
  );
}
