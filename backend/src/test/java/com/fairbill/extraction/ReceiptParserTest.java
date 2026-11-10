package com.fairbill.extraction;

import static org.assertj.core.api.Assertions.assertThat;

import com.fairbill.extraction.model.BoundingBox;
import com.fairbill.extraction.model.ChargeKind;
import com.fairbill.extraction.model.ExtractionResult;
import com.fairbill.extraction.model.FieldStatus;
import com.fairbill.extraction.model.ImageQuality;
import com.fairbill.extraction.model.OcrLine;
import com.fairbill.extraction.model.OcrResult;
import com.fairbill.extraction.model.OcrWord;
import com.fairbill.extraction.parse.ReceiptParser;
import com.fairbill.extraction.validate.ExtractionValidator;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ReceiptParserTest {

    private final ReceiptParser parser = new ReceiptParser();
    private final ExtractionValidator validator = new ExtractionValidator();
    private static final ImageQuality GOOD = new ImageQuality(true, 1000, 2000, 300, 180, List.of());

    /** Build OCR lines; words listed in `low` get low confidence. */
    static OcrResult ocr(Map<String, Double> low, String... lines) {
        List<OcrLine> out = new ArrayList<>();
        int y = 10;
        for (String l : lines) {
            List<OcrWord> words = new ArrayList<>();
            int x = 10;
            for (String w : l.trim().split("\\s+")) {
                words.add(new OcrWord(w, low.getOrDefault(w, 0.96), new BoundingBox(x, y, w.length() * 12, 20)));
                x += w.length() * 12 + 10;
            }
            out.add(new OcrLine(words));
            y += 30;
        }
        return new OcrResult("test", 1000, 2000, out);
    }

    ExtractionResult run(OcrResult o) {
        return validator.validate(parser.parse(o), GOOD, "test", o.imageHeight());
    }

    @Test
    void parsesTypicalIndianBill() {
        ExtractionResult r = run(ocr(Map.of(),
                "SPICE GARDEN RESTAURANT",
                "MG Road, Bengaluru 560001",
                "GSTIN: 29ABCDE1234F1Z5",
                "TAX INVOICE",
                "Bill No: SG/2045   Date: 14/09/2025",
                "Item Qty Rate Amount",
                "Chicken Biryani 2 250.00 500.00",
                "Paneer Tikka 1 300.00 300.00",
                "Cold Drink 2 50.00 100.00",
                "Sub Total 900.00",
                "CGST @2.5% 22.50",
                "SGST @2.5% 22.50",
                "Service Charge 5% 45.00",
                "Round Off -0.00",
                "Grand Total 990.00",
                "Cash 1000.00",
                "Thank you! Visit again"));
        assertThat(r.restaurantName().value()).isEqualTo("SPICE GARDEN RESTAURANT");
        assertThat(r.billNumber().value()).isEqualTo("SG/2045");
        assertThat(r.billDate().value()).isEqualTo("2025-09-14");
        assertThat(r.items()).hasSize(3);
        assertThat(r.items().get(0).name().value()).isEqualTo("Chicken Biryani");
        assertThat(r.items().get(0).quantity().value()).isEqualTo(2);
        assertThat(r.items().get(0).amount().value()).isEqualTo("500.00");
        assertThat(r.items().get(0).amount().status()).isEqualTo(FieldStatus.ok);
        assertThat(r.subtotal().value()).isEqualTo("900.00");
        assertThat(r.total().value()).isEqualTo("990.00");
        assertThat(r.total().status()).isEqualTo(FieldStatus.ok);
        assertThat(r.charges()).extracting(c -> c.kind()).containsExactly(ChargeKind.CGST, ChargeKind.SGST, ChargeKind.SERVICE, ChargeKind.ROUND_OFF);
        assertThat(r.charges().get(0).rate()).isEqualTo("2.5%");
        assertThat(r.charges().get(2).amount().value()).isEqualTo("45.00");
        assertThat(r.warnings()).extracting(w -> w.code()).doesNotContain("TOTAL_MISMATCH", "SUBTOTAL_MISMATCH");
    }

    @Test
    void neverInventsUnreadablePriceAndFlagsLowConfidence() {
        ExtractionResult r = run(ocr(Map.of("300.00", 0.42),
                "Cafe Mocha",
                "Description Qty Amount",
                "Masala Dosa 1 120.00",
                "Filter Coffee",
                "Paneer Butter Masala 1 300.00",
                "Total 420.00"));
        assertThat(r.items()).hasSize(3);
        var coffee = r.items().get(1);
        assertThat(coffee.name().value()).isEqualTo("Filter Coffee");
        assertThat(coffee.amount().status()).isEqualTo(FieldStatus.missing);
        assertThat(coffee.amount().value()).isNull();
        assertThat(r.items().get(2).amount().status()).isEqualTo(FieldStatus.verify);
        assertThat(r.warnings()).extracting(w -> w.message()).contains("The price of \"Filter Coffee\" is unclear.");
        assertThat(r.missingFields()).contains("items[1].amount");
        assertThat(r.uncertainFields()).contains("items[2].amount");
    }

    @Test
    void reportsMissingTotalAndBottomCutOff() {
        ExtractionResult r = run(ocr(Map.of(),
                "Udupi Grand",
                "Item Qty Amount",
                "Idli Vada 2 140.00",
                "Coffee 2 60.00"));
        assertThat(r.total().status()).isEqualTo(FieldStatus.missing);
        assertThat(r.warnings()).extracting(w -> w.code()).contains("TOTAL_NOT_DETECTED", "BOTTOM_CUT_OFF");
    }

    @Test
    void detectsMismatchAndDuplicates() {
        ExtractionResult r = run(ocr(Map.of(),
                "Dhaba 21",
                "Particulars Qty Rate Amt",
                "Butter Naan 2 40.00 80.00",
                "Butter Naan 2 40.00 80.00",
                "Dal Makhani 1 220.00 260.00",
                "Sub Total 440.00",
                "CGST 2.5% 11.00",
                "SGST 2.5% 12.00",
                "Net Amount 463.00"));
        var codes = r.warnings().stream().map(w -> w.code()).toList();
        assertThat(codes).contains("POSSIBLE_DUPLICATE", "CGST_SGST_DIFFER");
        assertThat(r.items()).hasSize(3); // duplicates are kept
        assertThat(r.items().get(2).amount().status()).isEqualTo(FieldStatus.verify); // 1 x 220 != 260
        assertThat(r.charges().get(0).amount().status()).isEqualTo(FieldStatus.verify);
    }

    @Test
    void plainTotalBeforeTaxesIsSubtotalAndDiscountsParsed() {
        ExtractionResult r = run(ocr(Map.of(),
                "Barbeque Bay",
                "S.No Item Qty Amount",
                "1 Veg Platter 1 450.00",
                "2 Mocktail 2 300.00",
                "Total 750.00",
                "Discount 10% 75.00",
                "Packing Charges 20.00",
                "CGST 2.5% 17.38",
                "SGST 2.5% 17.38",
                "Round Off 0.24",
                "Net Payable 730.00"));
        assertThat(r.items().get(0).name().value()).isEqualTo("Veg Platter");
        assertThat(r.subtotal().value()).isEqualTo("750.00");
        assertThat(r.total().value()).isEqualTo("730.00");
        assertThat(r.charges()).extracting(c -> c.kind())
                .containsExactly(ChargeKind.DISCOUNT, ChargeKind.PACKAGING, ChargeKind.CGST, ChargeKind.SGST, ChargeKind.ROUND_OFF);
        assertThat(r.warnings()).extracting(w -> w.code()).doesNotContain("TOTAL_MISMATCH");
    }

    @Test
    void itemNamesThatLookLikeKeywordsStayItems() {
        ExtractionResult r = run(ocr(Map.of(),
                "Chai Point",
                "Item Qty Amount",
                "Sugar less Tea 2 60.00",
                "Parcel Veg Biryani 1 180.00",
                "Lassi 60.00 60.00",
                "Total 300.00"));
        assertThat(r.items()).extracting(i -> i.name().value()).containsExactly("Sugar less Tea", "Parcel Veg Biryani", "Lassi");
        assertThat(r.items().get(2).quantity().status()).isEqualTo(FieldStatus.missing);
        assertThat(r.charges()).isEmpty();
    }

    @Test
    void mergesWrappedItemNames() {
        ExtractionResult r = run(ocr(Map.of(),
                "Punjab Grill",
                "Item Qty Rate Amount",
                "Chicken Tikka Butter",
                "Masala 1 380.00 380.00",
                "Total 380.00"));
        assertThat(r.items()).hasSize(1);
        assertThat(r.items().get(0).name().value()).isEqualTo("Chicken Tikka Butter Masala");
        assertThat(r.items().get(0).name().status()).isEqualTo(FieldStatus.verify);
    }
}
