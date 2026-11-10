package com.fairbill.extraction.model;

public record ExtractedCharge(ChargeKind kind, String label, ExtractedField<String> amount, String rate) {}
