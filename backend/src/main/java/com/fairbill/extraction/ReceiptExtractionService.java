package com.fairbill.extraction;

import com.fairbill.extraction.image.ImageQualityChecker;
import com.fairbill.extraction.image.Images;
import com.fairbill.extraction.model.ExtractionResult;
import com.fairbill.extraction.model.ImageQuality;
import com.fairbill.extraction.model.OcrResult;
import com.fairbill.extraction.ocr.OcrEngine;
import com.fairbill.extraction.ocr.OcrException;
import com.fairbill.extraction.parse.ReceiptParser;
import com.fairbill.extraction.validate.ExtractionValidator;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Receipt extraction pipeline:
 * image -> quality check -> OCR -> structured extraction -> confidence
 * validation & missing-field detection -> ExtractionResult.
 *
 * This package knows nothing about bills, people or splitting; the bill
 * calculation engine lives in the app and only consumes the result after the
 * user has reviewed and confirmed it.
 */
@Service
public class ReceiptExtractionService {
    private static final Logger log = LoggerFactory.getLogger(ReceiptExtractionService.class);

    private final List<OcrEngine> engines;
    private final ImageQualityChecker qualityChecker;
    private final ReceiptParser parser;
    private final ExtractionValidator validator;
    private final String preferredEngine;

    public ReceiptExtractionService(List<OcrEngine> engines, ImageQualityChecker qualityChecker, ReceiptParser parser,
                                    ExtractionValidator validator, @Value("${fairbill.ocr.engine:auto}") String preferredEngine) {
        this.engines = engines;
        this.qualityChecker = qualityChecker;
        this.parser = parser;
        this.validator = validator;
        this.preferredEngine = preferredEngine;
    }

    public ExtractionResult extract(byte[] imageBytes) throws ExtractionException {
        BufferedImage image;
        try {
            image = Images.decode(imageBytes);
        } catch (IOException e) {
            throw new ExtractionException("UNREADABLE_IMAGE", "This file could not be opened as an image. Please upload a JPG or PNG photo of the bill.");
        }
        ImageQuality quality = qualityChecker.check(image);
        if (!quality.acceptable() && quality.issues().contains("LOW_RESOLUTION")) {
            throw new ExtractionException("LOW_RESOLUTION", "The image is too small to read. Please take a closer, sharper photo of the bill.");
        }
        OcrEngine engine = pickEngine();
        OcrResult ocr;
        try {
            ocr = engine.recognize(image);
        } catch (OcrException e) {
            log.warn("OCR failed with {}: {}", engine.name(), e.getMessage());
            throw new ExtractionException("OCR_FAILED", "We couldn't read this bill right now. Please try again or enter it manually.");
        }
        return validator.validate(parser.parse(ocr), quality, engine.name(), ocr.imageHeight());
    }

    public boolean ocrAvailable() {
        return engines.stream().anyMatch(OcrEngine::available);
    }

    private OcrEngine pickEngine() throws ExtractionException {
        if (!"auto".equals(preferredEngine)) {
            return engines.stream().filter(e -> e.name().equals(preferredEngine) && e.available()).findFirst()
                    .orElseThrow(() -> new ExtractionException("OCR_UNAVAILABLE", "Bill scanning is not available on this server. You can still enter the bill manually."));
        }
        return engines.stream().filter(e -> e.name().equals("google-vision") && e.available()).findFirst()
                .or(() -> engines.stream().filter(OcrEngine::available).findFirst())
                .orElseThrow(() -> new ExtractionException("OCR_UNAVAILABLE", "Bill scanning is not available on this server. You can still enter the bill manually."));
    }

    public static class ExtractionException extends Exception {
        private final String code;

        public ExtractionException(String code, String message) {
            super(message);
            this.code = code;
        }

        public String code() { return code; }
    }
}
