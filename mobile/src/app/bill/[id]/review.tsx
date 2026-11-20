import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { Icon } from '../../../components/Icon';
import { MoneyField } from '../../../components/MoneyField';
import { canShowOnPhoto, ReceiptCrop, ReceiptOverview, unionBox } from '../../../components/ReceiptCrop';
import { Banner, Btn, Card, Divider, Empty, Field, IconBtn, Row, Screen, SectionTitle, StatusPill, Steps, T } from '../../../components/ui';
import { newCharge } from '../../../engine/factory';
import { sum } from '../../../engine/money';
import { computeSplit, findDuplicates, itemNet, itemStatus, pendingReview } from '../../../engine/split';
import type { Bill, BillCharge, BillItem, Box, Tracked } from '../../../engine/types';
import { fmt } from '../../../lib/billText';
import { confirmAction } from '../../../lib/confirm';
import { useBill } from '../../../store/AppStore';
import { useTheme } from '../../../theme/ThemeProvider';
import { radius, space } from '../../../theme/theme';

export default function Review() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { bill, update } = useBill(id);
  const { c } = useTheme();
  const [showImage, setShowImage] = useState(false);

  const derived = useMemo(() => {
    if (!bill) return null;
    const review = pendingReview(bill);
    const dups = findDuplicates(bill.items);
    const itemsTotal = sum(bill.items.map((i) => itemNet(i) ?? 0));
    const chargesTotal = sum(bill.charges.map((ch) => ch.amount.value ?? 0));
    const computed = itemsTotal + chargesTotal;
    const notDetected: string[] = [];
    if (bill.total.value === null) notDetected.push('Final bill amount');
    if (bill.origin !== 'manual') {
      if (bill.restaurant.value === null) notDetected.push('Restaurant name');
      if (bill.subtotal.value === null) notDetected.push('Subtotal');
      if (!bill.charges.some((ch) => ['CGST', 'SGST', 'IGST', 'GST'].includes(ch.kind))) notDetected.push('Taxes (none found)');
    }
    const split = computeSplit({ ...bill, participants: [{ id: '_', name: '_' }], assignments: Object.fromEntries(bill.items.map((i) => [i.id, { mode: 'equal' as const, shares: { _: 1 } }])) });
    const reconcileIssues = split.issues.filter((i) => ['TOTAL_MISMATCH', 'SUBTOTAL_MISMATCH', 'CGST_SGST_DIFFER', 'IGST_WITH_CGST'].includes(i.code));
    return { review, dups, itemsTotal, chargesTotal, computed, notDetected, reconcileIssues };
  }, [bill]);

  // Keep "extra not on the bill" in step with the items: total = items + charges while it is included.
  const syncComputed = derived?.computed;
  useEffect(() => {
    if (!bill || bill.printedTotal == null || syncComputed === undefined) return;
    if (syncComputed > bill.printedTotal) {
      if (bill.total.value !== syncComputed) update((d) => { d.total = { ...d.total, value: syncComputed, status: 'ok' }; });
    } else {
      // Nothing extra any more: go back to the printed amount.
      update((d) => { d.total = { ...d.total, value: d.printedTotal!, status: 'ok' }; delete d.printedTotal; });
    }
  }, [syncComputed, bill?.printedTotal]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!bill || !derived) return <Screen><Empty icon="receipt" title="Bill not found" /></Screen>;
  const { review, dups, computed, notDetected, reconcileIssues } = derived;
  const isOcr = bill.origin !== 'manual';
  const headerVerify = [bill.total, bill.subtotal, bill.restaurant, bill.date, bill.billNumber].filter((f) => f.status === 'verify').length;
  const missingPrices = bill.items.filter((i) => i.amount.value === null).length;
  const totalMismatch = bill.total.value !== null && bill.total.value !== computed;
  const printed = bill.printedTotal ?? bill.total.value;
  const extra = bill.printedTotal != null && bill.total.value !== null ? bill.total.value - bill.printedTotal : 0;

  const blockers: string[] = [];
  if (bill.items.length === 0) blockers.push('Add at least one item');
  if (missingPrices) blockers.push(`${missingPrices} item${missingPrices > 1 ? 's need' : ' needs'} a price`);
  if (review.counts.needsVerification) blockers.push(`Check ${review.counts.needsVerification} highlighted item${review.counts.needsVerification > 1 ? 's' : ''}`);
  if (bill.charges.some((ch) => ch.amount.status !== 'ok')) blockers.push('Check the highlighted taxes/charges');
  if (bill.total.value === null) blockers.push('Enter the final bill amount');
  else if (bill.total.status === 'verify') blockers.push('Confirm the final bill amount');
  if (totalMismatch) blockers.push('Items + charges must match the bill total');

  const setTracked = <K extends 'restaurant' | 'billNumber' | 'date'>(key: K, v: string) =>
    update((d) => {
      (d[key] as Tracked<string>) = v.trim() ? { value: v, status: 'ok' } : { value: null, status: 'missing' };
    });

  const confirm = () => {
    update((d) => {
      d.status = 'confirmed';
      d.subtotal.status = d.subtotal.value === null ? 'missing' : 'ok';
      // A single payer always covers the whole (possibly corrected) total.
      const payers = Object.keys(d.payments).filter((k) => d.payments[k] > 0);
      if (payers.length === 1 && d.total.value !== null) d.payments = { [payers[0]]: d.total.value };
    });
    router.push(bill.participants.length ? `/bill/${bill.id}/assign` : `/bill/${bill.id}/people`);
  };

  return (
    <>
      <Stack.Screen options={{ title: isOcr ? 'Review scanned bill' : 'Enter bill' }} />
      <Screen
        footer={
          <>
            {blockers.length ? <T v="small" muted style={{ textAlign: 'center' }}>To continue: {blockers[0]}{blockers.length > 1 ? ` (+${blockers.length - 1} more)` : ''}</T> : null}
            <Btn title="Confirm Bill" icon="check" disabled={blockers.length > 0} onPress={confirm} accessibilityHint="Confirms the bill details and continues to adding people" />
          </>
        }>
        <Steps current={0} />

        {/* ---------- receipt photo ---------- */}
        {bill.receiptImageUri || isOcr ? (
          <Card style={{ gap: space(3) }}>
            <Row>
              {bill.receiptImageUri ? (
                <Pressable onPress={() => setShowImage((s) => !s)} accessibilityLabel="Show bill photo">
                  <Image source={{ uri: bill.receiptImageUri }} style={{ width: 56, height: 72, borderRadius: radius.sm, backgroundColor: c.surfaceAlt }} />
                </Pressable>
              ) : null}
              <View style={{ flex: 1 }}>
                <T v="bodyStrong">Bill photo</T>
                <T v="small" muted>{!bill.receiptImageUri ? 'Photo not kept on this device' : bill.receiptSize ? 'Values to check are zoomed in below. Tap for the full photo.' : 'Tap to compare with what we read'}</T>
              </View>
              <Btn title="Retake" icon="camera" variant="secondary" small
                onPress={() => { router.push({ pathname: '/scan', params: { source: 'camera', replace: bill.id } }); }} />
            </Row>
            {showImage && bill.receiptImageUri ? <ReceiptOverview bill={bill} marks={flaggedMarks(bill)} /> : null}
          </Card>
        ) : null}

        {/* ---------- Review Required ---------- */}
        {isOcr || bill.warnings.length ? (
          <Card style={{ gap: space(3) }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="heading">Review Required</T>
              {blockers.length === 0 ? <StatusPill status="ok" label="All checked" /> : null}
            </Row>
            <View style={{ gap: space(2) }}>
              <CountTile tone="ok" count={review.counts.verified} label="Successfully Extracted" />
              <CountTile tone="verify" count={review.counts.needsVerification + headerVerify} label="Needs Verification" />
              <CountTile tone="missing" count={review.counts.notDetected + notDetected.length} label="Not Detected" />
            </View>
            {bill.warnings.map((w, i) => (
              <Banner key={w.code + i} tone={/BLUR|DARK|GLARE|SMALL|CUT_OFF|NOT_DETECTED|UNIDENTIFIED|UNCLEAR|PARTIAL|NO_/.test(w.code) ? 'warning' : 'info'}>
                {w.message}
              </Banner>
            ))}
            {notDetected.length ? (
              <View style={{ gap: space(2) }}>
                <T v="caption" muted>NOT DETECTED</T>
                {notDetected.map((n) => (
                  <Row key={n} style={{ justifyContent: 'space-between' }}>
                    <Row gap={2}><StatusPill status="missing" label="Not detected" /><T>{n}</T></Row>
                    {n.startsWith('Taxes') ? <Btn title="Add manually" small variant="ghost" onPress={() => router.push(`/bill/${bill.id}/charge?kind=CGST`)} /> : null}
                  </Row>
                ))}
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* ---------- bill details ---------- */}
        <Card style={{ gap: space(3) }}>
          <Field label="Restaurant" value={bill.restaurant.value ?? ''} onChangeText={(v) => setTracked('restaurant', v)} placeholder="Restaurant name"
            warn={bill.restaurant.status === 'verify'} hint={bill.restaurant.status === 'verify' ? 'Please check — read with low confidence' : undefined} />
          <Row gap={3}>
            <View style={{ flex: 1 }}>
              <Field label="Bill no." value={bill.billNumber.value ?? ''} onChangeText={(v) => setTracked('billNumber', v)} placeholder="Optional"
                warn={bill.billNumber.status === 'verify'} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Date" value={bill.date.value ?? ''} onChangeText={(v) => setTracked('date', v)} placeholder="YYYY-MM-DD"
                warn={bill.date.status === 'verify'} hint={bill.date.note} />
            </View>
          </Row>
          {bill.date.status === 'verify' && canShowOnPhoto(bill, bill.date.box) ? <ReceiptCrop bill={bill} focus={bill.date.box} label="the date" /> : null}
        </Card>

        {/* ---------- items ---------- */}
        <SectionTitle right={<T v="small" muted>{bill.items.length} item{bill.items.length === 1 ? '' : 's'}</T>}>Items</SectionTitle>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <Row style={{ paddingHorizontal: space(4), paddingVertical: space(2), backgroundColor: c.surfaceAlt }} gap={2}>
            <T v="caption" muted style={{ flex: 1 }}>ITEM</T>
            <T v="caption" muted style={{ width: 36, textAlign: 'center' }}>QTY</T>
            <T v="caption" muted style={{ width: 84, textAlign: 'right' }}>PRICE</T>
            <View style={{ width: 80 }} />
          </Row>
          {bill.items.length === 0 ? (
            <View style={{ padding: space(4) }}><T muted>No items yet. Add what's on the bill.</T></View>
          ) : (
            bill.items.map((it, i) => (
              <ItemRow key={it.id} bill={bill} item={it} first={i === 0} duplicate={dups.has(it.id)}
                onVerify={() => update((d) => {
                  const x = d.items.find((y) => y.id === it.id)!;
                  if (x.amount.value !== null) x.amount.status = 'ok';
                  if (x.name.value) x.name.status = 'ok';
                  if (x.quantity.value !== null) x.quantity.status = 'ok';
                  else x.quantity = { value: null, status: 'ok', note: 'Not printed' };
                })}
                onDelete={() => confirmAction('Delete item?', `Remove "${it.name.value ?? 'this item'}" from the bill?`, () => update((d) => {
                  d.items = d.items.filter((y) => y.id !== it.id);
                  delete d.assignments[it.id];
                }))} />
            ))
          )}
        </Card>
        <Btn title="Add Item" icon="plus" variant="secondary" onPress={() => router.push(`/bill/${bill.id}/item?itemId=new`)} />

        {/* ---------- taxes & charges ---------- */}
        <SectionTitle>Taxes & charges</SectionTitle>
        {bill.charges.length ? (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {bill.charges.map((ch, i) => <ChargeRow key={ch.id} bill={bill} charge={ch} first={i === 0}
              onVerify={() => update((d) => { const x = d.charges.find((y) => y.id === ch.id)!; if (x.amount.value !== null) x.amount.status = 'ok'; })}
              onDelete={() => confirmAction('Remove charge?', `Remove ${ch.label}?`, () => update((d) => { d.charges = d.charges.filter((y) => y.id !== ch.id); }), 'Remove')} />)}
          </Card>
        ) : (
          <T muted v="small">No taxes or charges{isOcr ? ' were found on the bill' : ''}. Add them exactly as printed.</T>
        )}
        <Row gap={2}>
          <Btn title="Add Tax" icon="percent" variant="secondary" style={{ flex: 1 }} onPress={() => router.push(`/bill/${bill.id}/charge?kind=CGST`)} />
          <Btn title="Add Charge" icon="plus" variant="secondary" style={{ flex: 1 }} onPress={() => router.push(`/bill/${bill.id}/charge?kind=SERVICE`)} />
        </Row>

        {/* ---------- totals & reconciliation ---------- */}
        <SectionTitle>Totals</SectionTitle>
        <Card style={{ gap: space(3) }}>
          <MoneyField label="Subtotal (as printed, optional)" currency={bill.currency} value={bill.subtotal.value} warn={bill.subtotal.status === 'verify'}
            hint={bill.subtotal.note}
            onChange={(v) => update((d) => { d.subtotal = v === null ? { value: null, status: 'missing' } : { value: v, status: 'ok' }; })} />
          <MoneyField label="Final bill amount (as printed)" currency={bill.currency} value={printed}
            warn={bill.total.status !== 'ok'} hint={bill.total.status === 'missing' ? 'Not detected — enter the amount printed on the bill' : bill.total.note}
            onChange={(v) => update((d) => {
              if (d.printedTotal != null && v !== null) { d.printedTotal = v; return; } // extra is re-synced from the items
              delete d.printedTotal;
              d.total = v === null ? { value: null, status: 'missing' } : { value: v, status: 'ok' };
            })} />
          {bill.total.status !== 'ok' && canShowOnPhoto(bill, bill.total.box) ? <ReceiptCrop bill={bill} focus={bill.total.box} tone={bill.total.status} label="the bill total" /> : null}
          {bill.total.status === 'verify' && bill.total.value !== null ? (
            <Btn title="This amount is correct" icon="check" variant="secondary" small onPress={() => update((d) => { d.total.status = 'ok'; })} />
          ) : null}
          <Divider />
          <Row style={{ justifyContent: 'space-between' }}>
            <T muted>Items + taxes & charges</T>
            <T v="amount">{fmt(bill, computed)}</T>
          </Row>
          {bill.total.value === null ? null : extra > 0 && !totalMismatch ? (
            <View style={{ gap: space(2) }}>
              <ExtraBreakdown bill={bill} printed={bill.printedTotal!} extra={extra} />
              <Btn small variant="secondary" title={`Skip the extra · keep ${fmt(bill, bill.printedTotal!)}`}
                onPress={() => update((d) => {
                  const p = d.printedTotal!;
                  d.charges.push(newCharge('OTHER', p - computed, 'Not on the bill (skipped)'));
                  d.total = { ...d.total, value: p, status: 'ok' };
                  delete d.printedTotal;
                })} />
            </View>
          ) : totalMismatch && computed > bill.total.value && bill.printedTotal == null ? (
            <View style={{ gap: space(2) }}>
              <Banner tone="warning" title={`${fmt(bill, computed - bill.total.value)} more than the printed bill`}>
                <T v="small">Items and charges add up to {fmt(bill, computed)} but the bill says {fmt(bill, bill.total.value)}. If you added things that aren't on this bill, include them as an extra amount. Otherwise check for a misread price.</T>
              </Banner>
              <ExtraBreakdown bill={bill} printed={bill.total.value} extra={computed - bill.total.value} />
              <Btn icon="check" title={`Include extra · Final ${fmt(bill, computed)}`}
                onPress={() => update((d) => { d.printedTotal = d.total.value!; d.total = { ...d.total, value: computed, status: 'ok' }; })} />
              <Btn small variant="secondary" title={`Skip the extra · keep ${fmt(bill, bill.total.value)}`}
                onPress={() => update((d) => { d.charges.push(newCharge('OTHER', bill.total.value! - computed, 'Not on the bill (skipped)')); })} />
            </View>
          ) : totalMismatch ? (
            <Banner tone="danger" title={`Off by ${fmt(bill, bill.total.value - computed)}`}>
              <View style={{ gap: space(2) }}>
                <T v="small">Items and charges add up to {fmt(bill, computed)} but the bill says {fmt(bill, bill.total.value)}. Check for a missing item, a misread price or a charge like round-off.</T>
                <Btn small variant="secondary" title={`Add ${fmt(bill, bill.total.value - computed)} as "Unexplained difference"`}
                  onPress={() => update((d) => { d.charges.push(newCharge('OTHER', bill.total.value! - computed, 'Unexplained difference')); })} />
              </View>
            </Banner>
          ) : (
            <Banner tone="success">Matches the bill total exactly.</Banner>
          )}
          {reconcileIssues.filter((i) => i.code !== 'TOTAL_MISMATCH').map((i) => <Banner key={i.code} tone="warning">{i.message}</Banner>)}
        </Card>
      </Screen>
    </>
  );
}

/** Printed amount + extra not on the bill = what everyone pays. */
function ExtraBreakdown({ bill, printed, extra }: { bill: Bill; printed: number; extra: number }) {
  const { c } = useTheme();
  const line = (label: string, value: string, strong = false) => (
    <Row style={{ justifyContent: 'space-between' }}>
      <T v={strong ? 'bodyStrong' : 'body'} muted={!strong}>{label}</T>
      <T v={strong ? 'amount' : 'bodyStrong'}>{value}</T>
    </Row>
  );
  return (
    <View style={{ gap: space(2), borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: space(3) }}
      accessibilityLabel={`Printed bill ${fmt(bill, printed)}, extra not on the bill ${fmt(bill, extra)}, final amount ${fmt(bill, printed + extra)}`}>
      {line('Printed bill amount', fmt(bill, printed))}
      {line('Extra (not on the bill)', '+ ' + fmt(bill, extra))}
      <Divider />
      {line('Final amount', fmt(bill, printed + extra), true)}
    </View>
  );
}

function CountTile({ tone, count, label }: { tone: 'ok' | 'verify' | 'missing'; count: number; label: string }) {
  const { c } = useTheme();
  const [bg, fg] = tone === 'ok' ? [c.successSoft, c.success] : tone === 'verify' ? [c.warningSoft, c.warning] : [c.dangerSoft, c.danger];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: bg, borderRadius: radius.md, paddingHorizontal: space(3), paddingVertical: space(2) }}
      accessibilityLabel={`${count} ${label}`}>
      <Icon name={tone === 'ok' ? 'check' : tone === 'verify' ? 'alert' : 'help'} color={fg} size={18} />
      <T v="bodyStrong" color={fg} style={{ flex: 1 }}>{label}</T>
      <T v="heading" color={fg}>{count}</T>
    </View>
  );
}

function ItemRow({ bill, item, first, duplicate, onDelete, onVerify }: {
  bill: Bill; item: BillItem; first: boolean; duplicate: boolean; onDelete: () => void; onVerify: () => void;
}) {
  const { c } = useTheme();
  const st = itemStatus(item);
  const net = itemNet(item);
  const note = item.amount.status !== 'ok' ? item.amount.note : item.name.status !== 'ok' ? item.name.note : item.quantity.status !== 'ok' ? item.quantity.note : undefined;
  return (
    <View style={{
        paddingHorizontal: space(4), paddingVertical: space(3), gap: space(1.5), borderTopWidth: first ? 0 : 1, borderColor: c.border,
        backgroundColor: st === 'missing' ? c.dangerSoft + '55' : st === 'verify' ? c.warningSoft + '66' : 'transparent',
      }}>
      <Row gap={2}>
        <Pressable onPress={() => router.push(`/bill/${bill.id}/item?itemId=${item.id}`)} accessibilityRole="button" accessibilityLabel={`Edit ${item.name.value ?? 'item'}`}
          style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space(2), opacity: pressed ? 0.6 : 1 })}>
          <T v="bodyStrong" style={{ flex: 1 }} numberOfLines={2} color={item.name.value ? undefined : c.danger}>{item.name.value ?? 'Unnamed item'}</T>
          <T style={{ width: 36, textAlign: 'center' }} color={item.quantity.value === null ? c.textMuted : undefined}>{item.quantity.value ?? '—'}</T>
          <T v="bodyStrong" style={{ width: 84, textAlign: 'right' }} color={net === null ? c.danger : undefined}>{net === null ? 'Missing' : fmt(bill, net)}</T>
        </Pressable>
        <Row gap={0} style={{ width: 80, justifyContent: 'flex-end' }}>
          {st !== 'ok' && item.amount.value !== null && item.name.value ? <IconBtn icon="check" label="Mark as verified" tone="primary" onPress={onVerify} /> : <IconBtn icon="edit" label="Edit item" onPress={() => router.push(`/bill/${bill.id}/item?itemId=${item.id}`)} />}
          <IconBtn icon="trash" label="Delete item" tone="danger" onPress={onDelete} />
        </Row>
      </Row>
      <Row gap={2} style={{ flexWrap: 'wrap' }}>
        <StatusPill status={st} label={st === 'ok' ? 'Verified' : st === 'verify' ? 'Needs review' : 'Not detected'} />
        {duplicate ? <StatusPill status="verify" label="Possible duplicate" /> : null}
        {item.discount ? <T v="small" muted>incl. discount {fmt(bill, item.discount)}</T> : null}
        {note && st !== 'ok' ? <T v="small" muted style={{ flexShrink: 1 }}>{note}</T> : null}
      </Row>
      {st !== 'ok' && canShowOnPhoto(bill, itemLine(item)) ? (
        <ReceiptCrop bill={bill} line={itemLine(item)} focus={itemFocus(item)} tone={st} label={item.name.value ?? 'this item'} />
      ) : null}
    </View>
  );
}

function itemLine(it: BillItem): Box | undefined {
  return unionBox(it.name.box, it.quantity.box, it.unitPrice.box, it.amount.box);
}

/** The specific value that needs checking: the price first, then the name, then the quantity. */
function itemFocus(it: BillItem): Box | undefined {
  return [it.amount, it.name, it.quantity].find((f) => f.status !== 'ok' && f.box)?.box;
}

function flaggedMarks(bill: Bill): { box: Box; tone: 'verify' | 'missing' }[] {
  const marks: { box: Box; tone: 'verify' | 'missing' }[] = [];
  for (const it of bill.items) {
    const st = itemStatus(it);
    const b = itemFocus(it) ?? itemLine(it);
    if (st !== 'ok' && b) marks.push({ box: b, tone: st });
  }
  for (const ch of bill.charges) if (ch.amount.status !== 'ok' && ch.amount.box) marks.push({ box: ch.amount.box, tone: ch.amount.status });
  for (const f of [bill.total, bill.subtotal, bill.date, bill.restaurant]) if (f.status === 'verify' && f.box) marks.push({ box: f.box, tone: 'verify' });
  return marks;
}

function ChargeRow({ bill, charge, first, onDelete, onVerify }: { bill: Bill; charge: BillCharge; first: boolean; onDelete: () => void; onVerify: () => void }) {
  const { c } = useTheme();
  const st = charge.amount.value === null ? 'missing' : charge.amount.status;
  return (
    <View style={{ paddingHorizontal: space(4), paddingVertical: space(3), borderTopWidth: first ? 0 : 1, borderColor: c.border, gap: space(1),
      backgroundColor: st === 'missing' ? c.dangerSoft + '55' : st === 'verify' ? c.warningSoft + '66' : 'transparent' }}>
      <Row gap={2}>
        <Pressable onPress={() => router.push(`/bill/${bill.id}/charge?chargeId=${charge.id}`)} accessibilityRole="button" accessibilityLabel={`Edit ${charge.label}`}
          style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space(2), opacity: pressed ? 0.6 : 1 })}>
          <T style={{ flex: 1 }} numberOfLines={1}>{charge.label}</T>
          <T v="bodyStrong" color={charge.amount.value === null ? c.danger : undefined}>{charge.amount.value === null ? 'Missing' : fmt(bill, charge.amount.value)}</T>
        </Pressable>
        {st === 'verify' ? <IconBtn icon="check" label="Mark as verified" tone="primary" onPress={onVerify} /> : null}
        <IconBtn icon="trash" label="Remove charge" tone="danger" onPress={onDelete} />
      </Row>
      {st !== 'ok' ? <Row gap={2}><StatusPill status={st} label={st === 'verify' ? 'Needs review' : 'Not detected'} />{charge.amount.note ? <T v="small" muted style={{ flexShrink: 1 }}>{charge.amount.note}</T> : null}</Row> : null}
      {st !== 'ok' && canShowOnPhoto(bill, charge.amount.box) ? <ReceiptCrop bill={bill} focus={charge.amount.box} tone={st} label={charge.label} /> : null}
    </View>
  );
}
