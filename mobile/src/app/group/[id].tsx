import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Avatar, Btn, Card, Field, IconBtn, Row, Screen, Segmented, T } from '../../components/ui';
import { uid } from '../../engine/factory';
import { confirmAction } from '../../lib/confirm';
import { GroupMember, useStore } from '../../store/AppStore';
import { useTheme } from '../../theme/ThemeProvider';
import { space } from '../../theme/theme';

export default function GroupEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { groups, saveGroup, deleteGroup } = useStore();
  const { c } = useTheme();
  const existing = groups.find((g) => g.id === id);
  const [name, setName] = useState(existing?.name ?? '');
  const [members, setMembers] = useState<GroupMember[]>(existing?.members ?? []);
  const [fav, setFav] = useState(existing?.favourite ?? true);
  const [person, setPerson] = useState('');

  const add = () => {
    const n = person.trim();
    if (!n || members.some((m) => m.name.toLowerCase() === n.toLowerCase())) return;
    setMembers((m) => [...m, { id: uid('m'), name: n.slice(0, 40) }]);
    setPerson('');
  };
  const save = () => {
    saveGroup({ id: existing?.id ?? uid('g'), name: name.trim(), members, favourite: fav, updatedAt: '' });
    router.back();
  };

  return (
    <>
      <Stack.Screen options={{ title: existing ? 'Edit group' : 'New group' }} />
      <Screen footer={
        <Row gap={2}>
          {existing ? <Btn title="Delete" icon="trash" variant="danger" onPress={() => confirmAction('Delete group?', `Delete “${existing.name}”? Bills are not affected.`, () => { deleteGroup(existing.id); router.back(); })} /> : null}
          <Btn title="Save group" icon="check" style={{ flex: 1 }} disabled={!name.trim() || members.length === 0} onPress={save} />
        </Row>
      }>
        <Field label="Group name" value={name} onChangeText={setName} placeholder="e.g. Office lunch" autoFocus={!existing} />
        <Segmented options={[{ key: 'fav', label: '★ Favourite' }, { key: 'normal', label: 'Normal' }]} value={fav ? 'fav' : 'normal'} onChange={(k) => setFav(k === 'fav')} />
        <Field label="Add person" value={person} onChangeText={setPerson} placeholder="Name" onSubmitEditing={add} blurOnSubmit={false}
          right={<Btn title="Add" small onPress={add} disabled={!person.trim()} />} />
        <Card style={{ padding: 0 }}>
          {members.length === 0 ? <View style={{ padding: space(4) }}><T muted>No one added yet.</T></View> : members.map((m, i) => (
            <Row key={m.id} style={{ paddingHorizontal: space(4), paddingVertical: space(2), borderTopWidth: i ? 1 : 0, borderColor: c.border }}>
              <Avatar name={m.name} id={m.id} size={36} />
              <T style={{ flex: 1 }}>{m.name}</T>
              <IconBtn icon="x" label={`Remove ${m.name}`} onPress={() => setMembers((ms) => ms.filter((x) => x.id !== m.id))} />
            </Row>
          ))}
        </Card>
        <T v="small" muted>You are added to every bill automatically, so you don't need to add yourself here.</T>
      </Screen>
    </>
  );
}
