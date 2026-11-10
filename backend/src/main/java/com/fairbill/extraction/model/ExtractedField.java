package com.fairbill.extraction.model;

import com.fasterxml.jackson.annotation.JsonIgnore;

/**
 * A single extracted value with its provenance. A field is only "ok" when
 * OCR confidence is at or above the verification threshold; it is never
 * upgraded because it "looks right".
 */
public record ExtractedField<T>(T value, double confidence, FieldStatus status, String text, BoundingBox box, String note) {

    public static final double VERIFIED_THRESHOLD = 0.85;

    public static <T> ExtractedField<T> of(T value, double confidence, String text, BoundingBox box) {
        FieldStatus status = confidence >= VERIFIED_THRESHOLD ? FieldStatus.ok : FieldStatus.verify;
        String note = status == FieldStatus.verify ? "Low OCR confidence (" + Math.round(confidence * 100) + "%)" : null;
        return new ExtractedField<>(value, round(confidence), status, text, box, note);
    }

    public static <T> ExtractedField<T> missing(String note) {
        return new ExtractedField<>(null, 0, FieldStatus.missing, null, null, note);
    }

    public static <T> ExtractedField<T> missing(String note, String text, BoundingBox box) {
        return new ExtractedField<>(null, 0, FieldStatus.missing, text, box, note);
    }

    public ExtractedField<T> needsVerification(String reason) {
        if (status == FieldStatus.missing) return this;
        return new ExtractedField<>(value, confidence, FieldStatus.verify, text, box, reason);
    }

    public ExtractedField<T> mapBox(java.util.function.UnaryOperator<BoundingBox> f) {
        return box == null ? this : new ExtractedField<>(value, confidence, status, text, f.apply(box), note);
    }

    @JsonIgnore
    public boolean isMissing() {
        return status == FieldStatus.missing || value == null;
    }

    private static double round(double c) {
        return Math.round(Math.max(0, Math.min(1, c)) * 1000) / 1000.0;
    }
}
