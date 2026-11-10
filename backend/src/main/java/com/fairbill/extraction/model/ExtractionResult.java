package com.fairbill.extraction.model;

import java.util.List;

/** Structured output of the receipt extraction pipeline. Money values are decimal strings. */
public record ExtractionResult(
        String engine,
        ImageQuality imageQuality,
        ExtractedField<String> restaurantName,
        ExtractedField<String> billNumber,
        ExtractedField<String> billDate,
        ExtractedField<String> subtotal,
        ExtractedField<String> total,
        List<ExtractedItem> items,
        List<ExtractedCharge> charges,
        List<String> missingFields,
        List<String> uncertainFields,
        List<ExtractionWarning> warnings,
        String receiptId) {

    public ExtractionResult withReceiptId(String id) {
        return new ExtractionResult(engine, imageQuality, restaurantName, billNumber, billDate, subtotal, total,
                items, charges, missingFields, uncertainFields, warnings, id);
    }
}
