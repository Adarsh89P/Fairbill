import type { Minor } from './money';

/** ok = verified (OCR high confidence or user-confirmed); verify = low confidence; missing = not detected. */
export type FieldStatus = 'ok' | 'verify' | 'missing';
export type Source = 'ocr' | 'manual';

export interface Tracked<T> {
  value: T | null;
  status: FieldStatus;
  confidence?: number; // 0..1, from OCR
  note?: string; // human readable reason for verify/missing
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
  receiptId?: string;
  share?: { token: string; url: string };
  groupId?: string;
}
