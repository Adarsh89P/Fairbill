import type { Minor } from './money';

/** ok = verified (OCR high confidence or user-confirmed); verify = low confidence; missing = not detected. */
export type FieldStatus = 'ok' | 'verify' | 'missing';
export type Source = 'ocr' | 'manual';

/** A rectangle on the bill photo, in the photo's own pixels. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Tracked<T> {
  value: T | null;
  status: FieldStatus;
  confidence?: number; // 0..1, from OCR
  note?: string; // human readable reason for verify/missing
  /** Where on the bill photo this value was read from (scanned bills only). */
  box?: Box;
}

export interface BillItem {
  id: string;
  name: Tracked<string>;
  quantity: Tracked<number>;
  /** Rate per unit as printed on the bill (optional, informational). */
  unitPrice: Tracked<Minor>;
  /** Line amount as printed on the bill. This is what gets split. */
  amount: Tracked<Minor>;
  /** Item-level discount printed on the bill, as a positive number. */
  discount: Minor;
  source: Source;
}

export type ChargeKind =
  | 'CGST'
  | 'SGST'
  | 'IGST'
  | 'GST'
  | 'SERVICE'
  | 'PACKAGING'
  | 'DISCOUNT'
  | 'TIP'
  | 'ROUND_OFF'
  | 'OTHER';

export const CHARGE_LABELS: Record<ChargeKind, string> = {
  CGST: 'CGST',
  SGST: 'SGST',
  IGST: 'IGST',
  GST: 'GST',
  SERVICE: 'Service charge',
  PACKAGING: 'Packaging charge',
  DISCOUNT: 'Discount',
  TIP: 'Tip',
  ROUND_OFF: 'Round-off',
  OTHER: 'Other charge',
};

export const TAX_KINDS: ChargeKind[] = ['CGST', 'SGST', 'IGST', 'GST'];

export interface BillCharge {
  id: string;
  kind: ChargeKind;
  label: string;
  /** Signed amount: discounts are negative, round-off may be either sign. */
  amount: Tracked<Minor>;
  source: Source;
}

export interface Participant {
  id: string;
  name: string;
  isMe?: boolean;
  /** Phone number from contacts, used to message this person their share. */
  phone?: string;
}

export type ShareMode = 'equal' | 'percent' | 'quantity';

export interface ItemAssignment {
  mode: ShareMode;
  /**
   * participantId -> share.
   * equal: 1 for each selected person; percent: percentage (may have 2 decimals);
   * quantity: units consumed.
   */
  shares: Record<string, number>;
}

export type DistributionMethod = 'equal' | 'proportional' | 'custom';

export interface DistributionRule {
  method: DistributionMethod;
  /** participantId -> weight (used when method = custom). */
  custom?: Record<string, number>;
}

export type BillStatus = 'draft' | 'confirmed' | 'final';

export interface ExtractionWarning {
  code: string;
  message: string;
  field?: string;
}

export interface Bill {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: BillStatus;
  currency: string;
  origin: 'scan' | 'upload' | 'manual';
  restaurant: Tracked<string>;
  billNumber: Tracked<string>;
  date: Tracked<string>; // ISO yyyy-mm-dd when known
  subtotal: Tracked<Minor>;
  total: Tracked<Minor>;
  /**
   * Set when the user added things that aren't on the printed bill and chose to include them:
   * the amount printed on the bill. total is then printedTotal + the extra (not on the bill).
   */
  printedTotal?: Minor;
  items: BillItem[];
  charges: BillCharge[];
  warnings: ExtractionWarning[];
  participants: Participant[];
  assignments: Record<string, ItemAssignment>;
  rules: Partial<Record<ChargeKind, DistributionRule>>;
  /** participantId -> amount paid to the restaurant. */
  payments: Record<string, Minor>;
  /** settlement key `${from}->${to}` -> settled */
  settled: Record<string, boolean>;
  receiptImageUri?: string;
  /** Pixel size of the photo the scanner read; boxes refer to this. */
  receiptSize?: { width: number; height: number };
  receiptId?: string;
  /**
   * One link per bill. phase "picking": friends tick their items; "final": the split is published.
   * photo: whether the bill photo is attached to the link.
   */
  share?: { token: string; url: string; phase?: 'picking' | 'final'; photo?: boolean };
  groupId?: string;
  tripId?: string;
}
