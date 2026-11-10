package com.fairbill.extraction.model;

import java.util.List;
import java.util.function.UnaryOperator;

/**
 * Raw OCR output, independent of which OCR engine produced it. Boxes are in the coordinates of the image the
 * engine actually read (it may have scaled or rotated the photo); {@code toInput} maps them back to the photo
 * the user sent.
 */
public record OcrResult(String engine, int imageWidth, int imageHeight, List<OcrLine> lines, UnaryOperator<BoundingBox> toInput) {
    public OcrResult(String engine, int imageWidth, int imageHeight, List<OcrLine> lines) {
        this(engine, imageWidth, imageHeight, lines, UnaryOperator.identity());
    }
}
