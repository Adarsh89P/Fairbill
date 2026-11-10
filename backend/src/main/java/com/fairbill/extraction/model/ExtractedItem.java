package com.fairbill.extraction.model;

public record ExtractedItem(
        ExtractedField<String> name,
        ExtractedField<Integer> quantity,
        ExtractedField<String> unitPrice,
        ExtractedField<String> amount,
        ExtractedField<String> discount,
        String lineText) {}
