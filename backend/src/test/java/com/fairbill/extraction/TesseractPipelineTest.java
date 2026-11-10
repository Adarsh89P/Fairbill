package com.fairbill.extraction;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.fairbill.extraction.image.ImageQualityChecker;
import com.fairbill.extraction.image.Images;
import com.fairbill.extraction.model.ExtractionResult;
import com.fairbill.extraction.ocr.OcrEngine;
import com.fairbill.extraction.ocr.TesseractOcrEngine;
import com.fairbill.extraction.parse.ReceiptParser;
import com.fairbill.extraction.validate.ExtractionValidator;
import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.awt.image.ConvolveOp;
import java.awt.image.Kernel;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** End-to-end: rendered receipt image -> Tesseract -> parser -> validator. Skipped if Tesseract is absent. */
public class TesseractPipelineTest {

    public static final String[] RECEIPT = {
            "SPICE GARDEN RESTAURANT",
            "Bill No: 2045      Date: 14/09/2025",
            "Item              Qty   Rate    Amount",
            "Chicken Biryani     2  250.00   500.00",
            "Paneer Tikka        1  300.00   300.00",
            "Cold Drink          2   50.00   100.00",
            "Sub Total                       900.00",
            "CGST 2.5%                        22.50",
            "SGST 2.5%                        22.50",
            "Grand Total                     945.00",
            "Thank you, visit again",
    };

    ReceiptExtractionService service;

    @BeforeEach
    void setUp() {
        TesseractOcrEngine tess = new TesseractOcrEngine("tesseract", "eng");
        assumeTrue(tess.available(), "tesseract not installed");
        service = new ReceiptExtractionService(List.<OcrEngine>of(tess), new ImageQualityChecker(), new ReceiptParser(),
                new ExtractionValidator(), "auto");
    }

    public static BufferedImage render(String[] lines) {
        int w = 1200, lh = 60, h = lines.length * lh + 160;
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, w, h);
        g.setColor(Color.BLACK);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setFont(new Font(Font.MONOSPACED, Font.PLAIN, 34));
        for (int i = 0; i < lines.length; i++) g.drawString(lines[i], 60, 100 + i * lh);
        g.dispose();
        return img;
    }

    static BufferedImage blur(BufferedImage src, int radius) {
        int size = radius * 2 + 1;
        float[] k = new float[size * size];
        java.util.Arrays.fill(k, 1f / k.length);
        BufferedImage out = src;
        for (int pass = 0; pass < 3; pass++) out = new ConvolveOp(new Kernel(size, size, k), ConvolveOp.EDGE_NO_OP, null).filter(out, null);
        return out;
    }

    @Test
    void readsCleanReceipt() throws Exception {
        ExtractionResult r = service.extract(Images.png(render(RECEIPT)));
        assertThat(r.engine()).isEqualTo("tesseract");
        assertThat(r.items()).extracting(i -> i.amount().value()).containsExactly("500.00", "300.00", "100.00");
        assertThat(r.items()).extracting(i -> i.name().value()).containsExactly("Chicken Biryani", "Paneer Tikka", "Cold Drink");
        assertThat(r.subtotal().value()).isEqualTo("900.00");
        assertThat(r.total().value()).isEqualTo("945.00");
        // anything Tesseract read below the threshold must not be reported as verified
        r.items().forEach(i -> assertThat(i.amount().status() == com.fairbill.extraction.model.FieldStatus.ok)
                .isEqualTo(i.amount().confidence() >= 0.85));
        assertThat(r.billDate().value()).isEqualTo("2025-09-14");
        assertThat(r.warnings()).extracting(w -> w.code()).doesNotContain("TOTAL_MISMATCH", "SUBTOTAL_MISMATCH", "IMAGE_BLURRY");
    }

    @Test
    void handlesRotatedPhoto() throws Exception {
        BufferedImage upright = render(RECEIPT);
        ExtractionResult r = service.extract(Images.png(Images.rotate(upright, 90)));
        assertThat(r.total().value()).isEqualTo("945.00");
        assertThat(r.items()).hasSize(3);
        // Boxes point at the photo as sent (rotated), not at the corrected image the OCR read.
        var straight = service.extract(Images.png(upright)).total().box();
        var b = r.total().box();
        int H = upright.getHeight();
        assertThat(b.x()).isCloseTo(H - straight.bottom(), org.assertj.core.data.Offset.offset(15));
        assertThat(b.y()).isCloseTo(straight.x(), org.assertj.core.data.Offset.offset(15));
        assertThat(b.width()).isCloseTo(straight.height(), org.assertj.core.data.Offset.offset(15));
    }

    @Test
    void mapsBoxesBackThroughScaleAndRotation() {
        var box = new com.fairbill.extraction.model.BoundingBox(10, 20, 30, 40);
        // identity
        assertThat(com.fairbill.extraction.ocr.TesseractOcrEngine.toInput(box, 0, 100, 200, 1.0)).isEqualTo(box);
        // scaled 2x, no rotation
        assertThat(com.fairbill.extraction.ocr.TesseractOcrEngine.toInput(box, 0, 100, 200, 2.0))
                .isEqualTo(new com.fairbill.extraction.model.BoundingBox(5, 10, 15, 20));
        // 180 degrees inside a 100x200 image
        assertThat(com.fairbill.extraction.ocr.TesseractOcrEngine.toInput(box, 180, 100, 200, 1.0))
                .isEqualTo(new com.fairbill.extraction.model.BoundingBox(60, 140, 30, 40));
    }

    @Test
    void warnsOnBlurryPhoto() throws Exception {
        ExtractionResult r = service.extract(Images.png(blur(render(RECEIPT), 4)));
        assertThat(r.imageQuality().issues()).contains("BLURRY");
        assertThat(r.warnings()).extracting(w -> w.code()).contains("IMAGE_BLURRY");
    }

    @Test
    void warnsWhenBottomIsCutOff() throws Exception {
        BufferedImage full = render(RECEIPT);
        BufferedImage cropped = full.getSubimage(0, 0, full.getWidth(), 100 + 6 * 60 - 20);
        ExtractionResult r = service.extract(Images.png(cropped));
        assertThat(r.total().value()).isNull();
        assertThat(r.warnings()).extracting(w -> w.code()).contains("TOTAL_NOT_DETECTED", "BOTTOM_CUT_OFF");
    }
}
