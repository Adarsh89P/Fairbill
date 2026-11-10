package com.fairbill.extraction.ocr;

import com.fairbill.extraction.model.OcrResult;
import java.awt.image.BufferedImage;

/** Pluggable OCR backend. Implementations return words with confidences and boxes. */
public interface OcrEngine {
    String name();

    boolean available();

    OcrResult recognize(BufferedImage image) throws OcrException;
}
