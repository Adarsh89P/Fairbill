/**
 * JSON contract returned by the backend receipt extraction engine
 * (POST /api/receipts/scan). Money values are decimal strings ("123.45")
 * so no precision is lost in transport.
 */
export type ExtractedStatus = 'ok' | 'verify' | 'missing';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExtractedField<T> {
  value: T | null;
  confidence: number; // 0..1
  status: ExtractedStatus;
  text?: string | null; // raw OCR text the value came from
  box?: BoundingBox | null;
  note?: string | null;
}

export interface ExtractedItem {
  name: ExtractedField<string>;
  quantity: ExtractedField<number>;
  unitPrice: ExtractedField<string>;
  amount: ExtractedField<string>;
  discount?: ExtractedField<string> | null;
  lineText: string;
}

export type ExtractedChargeKind =
  | 'CGST' | 'SGST' | 'IGST' | 'GST' | 'SERVICE' | 'PACKAGING' | 'DISCOUNT' | 'TIP' | 'ROUND_OFF' | 'OTHER';

export interface ExtractedCharge {
  kind: ExtractedChargeKind;
  label: string;
  amount: ExtractedField<string>;
  rate?: string | null; // e.g. "2.5%" as printed
}

export interface ImageQuality {
  acceptable: boolean;
  width: number;
  height: number;
  sharpness: number;
  brightness: number;
  issues: string[];
}

export interface ExtractionWarningDto {
  code: string;
  message: string;
  field?: string | null;
}

export interface ExtractionResult {
  engine: string;
  imageQuality: ImageQuality;
  restaurantName: ExtractedField<string>;
  billNumber: ExtractedField<string>;
  billDate: ExtractedField<string>;
  subtotal: ExtractedField<string>;
  total: ExtractedField<string>;
  items: ExtractedItem[];
  charges: ExtractedCharge[];
  missingFields: string[];
  uncertainFields: string[];
  warnings: ExtractionWarningDto[];
  receiptId?: string | null;
}
