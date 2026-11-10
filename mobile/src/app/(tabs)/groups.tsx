import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { Avatar, Btn, Card, Empty, IconBtn, Row, Screen, T } from '../../components/ui';
import { useStore } from '../../store/AppStore';
import { space } from '../../theme/theme';

export default function Groups() {
  const { groups, saveGroup } = useStore();
  const sorted = [...groups].sort((a, b) => Number(b.favourite) - Number(a.favourite) || a.name.localeCompare(b.name));
  return (
    <Screen footer={<Btn title="New group" icon="plus" onPress={() => router.push('/group/new')} />}>
      <T muted>Save the people you eat with often, then add them to a bill in one tap.</T>
      {sorted.length === 0 ? (
        <Card><Empty icon="users" title="No groups yet" body="Create a group like “Office lunch” or “College friends”." /></Card>
      ) : (
        sorted.map((g) => (
          <Card key={g.id} onPress={() => router.push(`/group/${g.id}`)} accessibilityLabel={`${g.name}, ${g.members.length} people`}>
            <Row>
              <View style={{ flex: 1, gap: space(2) }}>
                <T v="bodyStrong">{g.name}</T>
                <Row gap={1}>
                  {g.members.slice(0, 6).map((m) => <Avatar key={m.id} name={m.name} id={m.id} size={28} />)}
                  <T v="small" muted style={{ marginLeft: 4 }}>{g.members.length} people</T>
                </Row>
              </View>
              <IconBtn icon={g.favourite ? 'starFilled' : 'star'} tone="primary" label={g.favourite ? 'Remove from favourites' : 'Add to favourites'}
                onPress={() => saveGroup({ ...g, favourite: !g.favourite })} />
            </Row>
          </Card>
        ))
      )}
    </Screen>
  );
}
