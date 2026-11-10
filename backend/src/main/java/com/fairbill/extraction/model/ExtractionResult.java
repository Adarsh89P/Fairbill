package com.fairbill.extraction.model;

import java.util.List;
import java.util.function.UnaryOperator;

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

    /** Returns a copy with every bounding box passed through {@code f}. */
    public ExtractionResult mapBoxes(UnaryOperator<BoundingBox> f) {
        return new ExtractionResult(engine, imageQuality, restaurantName.mapBox(f), billNumber.mapBox(f), billDate.mapBox(f),
                subtotal.mapBox(f), total.mapBox(f),
                items.stream().map(i -> new ExtractedItem(i.name().mapBox(f), i.quantity().mapBox(f), i.unitPrice().mapBox(f),
                        i.amount().mapBox(f), i.discount() == null ? null : i.discount().mapBox(f), i.lineText())).toList(),
                charges.stream().map(c -> new ExtractedCharge(c.kind(), c.label(), c.amount().mapBox(f), c.rate())).toList(),
                missingFields, uncertainFields, warnings, receiptId);
    }

    public ExtractionResult withReceiptId(String id) {
        return new ExtractionResult(engine, imageQuality, restaurantName, billNumber, billDate, subtotal, total,
                items, charges, missingFields, uncertainFields, warnings, id);
    }
}
