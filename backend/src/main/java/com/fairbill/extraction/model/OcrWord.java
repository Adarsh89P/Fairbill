package com.fairbill.extraction.model;

/** One recognised word. Confidence is normalised to 0..1. */
public record OcrWord(String text, double confidence, BoundingBox box) {}
