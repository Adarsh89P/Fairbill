package com.fairbill.extraction.model;

import java.util.List;

/** Raw OCR output, independent of which OCR engine produced it. */
public record OcrResult(String engine, int imageWidth, int imageHeight, List<OcrLine> lines) {}
