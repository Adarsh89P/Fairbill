package com.fairbill.extraction.model;

public record ExtractionWarning(String code, String message, String field) {
    public static ExtractionWarning of(String code, String message) {
        return new ExtractionWarning(code, message, null);
    }
}
