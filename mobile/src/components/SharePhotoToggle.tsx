import React, { useState } from 'react';
import { ActivityIndicator, Switch, View } from 'react-native';
import { api, ApiError, ShareView } from '../api/client';
import type { Bill } from '../engine/types';
import { notify } from '../lib/confirm';
import { pickBillPhoto } from '../lib/photo';
import { useBill, useStore } from '../store/AppStore';
import { useTheme } from '../theme/ThemeProvider';
import { space } from '../theme/theme';
import { Btn, Card, Row, T } from './ui';

/** Uploads or removes the bill photo on the shared link so it matches what the user wants. */
export async function syncSharePhoto(apiUrl: string, token: string, bill: Bill, view: ShareView, want: boolean): Promise<ShareView> {
  const client = api(apiUrl, token);
  if (want && bill.receiptImageUri && !view.hasPhoto) return client.uploadSharePhoto(view.token, bill.receiptImageUri);
  if (!want && view.hasPhoto) return client.deleteSharePhoto(view.token);
  return view;
}

/** "Show the bill photo to friends" switch, with a way to attach a photo to bills entered by hand. */
export function SharePhotoToggle({ bill, view, onView }: { bill: Bill; view: ShareView | null; onView: (v: ShareView) => void }) {
  const { c } = useTheme();
  const { settings, updateSettings, session } = useStore();
  const { update } = useBill(bill.id);
  const [busy, setBusy] = useState(false);
  const has = !!view?.hasPhoto;

  const set = async (want: boolean, b: Bill = bill) => {
    updateSettings({ sharePhoto: want });
    if (!view || !session) return;
    setBusy(true);
    try {
      const v = await syncSharePhoto(settings.apiUrl, session.token, b, view, want);
      onView(v);
      update((d) => { if (d.share) d.share.photo = v.hasPhoto; });
    } catch (e) {
      notify("Couldn't update the photo", e instanceof ApiError ? e.message : 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const attach = async () => {
    try {
      const p = await pickBillPhoto('library');
      if (!p) return;
      update((d) => { d.receiptImageUri = p.uri; });
      await set(true, { ...bill, receiptImageUri: p.uri });
    } catch {
      notify('Could not open your photos');
    }
  };

  return (
    <Card style={{ gap: space(2) }}>
      <Row>
        <View style={{ flex: 1 }}>
          <T v="bodyStrong">Show the bill photo</T>
          <T v="small" muted>{bill.receiptImageUri ? 'Friends can check the original bill themselves. Location and camera details are removed.' : 'No photo for this bill yet.'}</T>
        </View>
        {busy ? <ActivityIndicator color={c.primary} /> : (
          <Switch value={has} disabled={!bill.receiptImageUri || !view} onValueChange={(v) => set(v)} accessibilityLabel="Show the bill photo on the shared link"
            trackColor={{ true: c.primary, false: c.border }} />
        )}
      </Row>
      {!bill.receiptImageUri ? <Btn title="Attach a photo of the bill" icon="image" variant="secondary" small onPress={attach} disabled={!view || busy} /> : null}
    </Card>
  );
}
