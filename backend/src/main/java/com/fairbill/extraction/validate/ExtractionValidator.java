package com.fairbill.extraction.validate;

import com.fairbill.extraction.model.ChargeKind;
import com.fairbill.extraction.model.ExtractedCharge;
import com.fairbill.extraction.model.ExtractedField;
import com.fairbill.extraction.model.ExtractedItem;
import com.fairbill.extraction.model.ExtractionResult;
import com.fairbill.extraction.model.ExtractionWarning;
import com.fairbill.extraction.model.FieldStatus;
import com.fairbill.extraction.model.ImageQuality;
import com.fairbill.extraction.parse.ReceiptParser.ParsedReceipt;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * Confidence validation and missing-field detection. Cross-checks the numbers
 * printed on the bill against each other and downgrades anything that does
 * not add up to "verify". Produces plain-language warnings for the app's
 * "Review Required" section.
 */
@Component
public class ExtractionValidator {

    public ExtractionResult validate(ParsedReceipt p, ImageQuality quality, String engine, int imageHeight) {
        List<ExtractionWarning> warnings = new ArrayList<>();
        Set<String> missing = new LinkedHashSet<>();
        Set<String> uncertain = new LinkedHashSet<>();

        for (String issue : quality.issues()) {
            switch (issue) {
                case "BLURRY" -> warnings.add(ExtractionWarning.of("IMAGE_BLURRY", "The uploaded image is blurry. Some values may be misread — retake the photo if possible."));
                case "TOO_DARK" -> warnings.add(ExtractionWarning.of("IMAGE_DARK", "The photo is too dark. Try again with more light."));
                case "OVEREXPOSED" -> warnings.add(ExtractionWarning.of("IMAGE_GLARE", "The photo is overexposed or has glare."));
                case "LOW_RESOLUTION" -> warnings.add(ExtractionWarning.of("IMAGE_SMALL", "The image resolution is too low to read reliably."));
                default -> { }
            }
        }
        if (p.lineCount == 0) {
            warnings.add(ExtractionWarning.of("NO_TEXT", "No text could be read from this image. Make sure the whole bill is in the photo."));
        }

        ExtractedField<String> subtotal = orMissing(p.subtotal, "Subtotal not detected");
        ExtractedField<String> total = orMissing(p.total, "The final bill amount could not be detected");
        List<ExtractedItem> items = new ArrayList<>(p.items);
        List<ExtractedCharge> charges = dropSummaryGst(new ArrayList<>(p.charges), warnings);

        // ---- items ----
        if (items.isEmpty() && p.lineCount > 0) {
            warnings.add(new ExtractionWarning("NO_ITEMS", "No food items could be identified. Add them manually.", "items"));
            missing.add("items");
        }
        if (p.unreadableItemLines > 0 || items.stream().anyMatch(i -> i.name().isMissing())) {
            warnings.add(new ExtractionWarning("ITEMS_UNIDENTIFIED", "Some items could not be identified.", "items"));
        }
        Map<String, Integer> seen = new HashMap<>();
        for (int i = 0; i < items.size(); i++) {
            ExtractedItem it = items.get(i);
            String path = "items[" + i + "]";
            track(it.name(), path + ".name", missing, uncertain);
            track(it.quantity(), path + ".quantity", missing, uncertain);
            track(it.amount(), path + ".amount", missing, uncertain);
            if (it.amount().isMissing()) {
                String n = it.name().isMissing() ? "an item" : "\"" + it.name().value() + "\"";
                warnings.add(new ExtractionWarning("ITEM_PRICE_UNCLEAR", "The price of " + n + " is unclear.", path + ".amount"));
            }
            if (!it.name().isMissing() && !it.amount().isMissing()) {
                String key = it.name().value().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ") + "|" + it.amount().value();
                Integer first = seen.putIfAbsent(key, i);
                if (first != null) {
                    warnings.add(new ExtractionWarning("POSSIBLE_DUPLICATE",
                            "\"" + it.name().value() + "\" appears more than once with the same price. Check it isn't a duplicate.", path));
                }
            }
        }

        // ---- charges ----
        boolean taxUnreadable = false;
        for (int i = 0; i < charges.size(); i++) {
            ExtractedCharge c = charges.get(i);
            track(c.amount(), "charges[" + i + "].amount", missing, uncertain);
            if (c.amount().isMissing() && isTax(c.kind())) taxUnreadable = true;
            else if (c.amount().isMissing()) {
                warnings.add(new ExtractionWarning("CHARGE_UNREADABLE", "The amount for \"" + c.label() + "\" could not be read.", "charges[" + i + "]"));
            }
        }
        if (taxUnreadable) warnings.add(new ExtractionWarning("TAX_PARTIAL", "The tax section is partially unreadable.", "charges"));
        BigDecimal cgst = sumOf(charges, ChargeKind.CGST), sgst = sumOf(charges, ChargeKind.SGST);
        if (cgst != null && sgst != null && cgst.compareTo(sgst) != 0) {
            warnings.add(new ExtractionWarning("CGST_SGST_DIFFER", "CGST and SGST differ; they are normally equal. Please verify the tax lines.", "charges"));
            charges = markKinds(charges, Set.of(ChargeKind.CGST, ChargeKind.SGST), "CGST and SGST differ", uncertain);
        }
        if (!p.unclassifiedSummaryLines.isEmpty()) {
            warnings.add(new ExtractionWarning("UNRECOGNISED_LINES",
                    "Some lines near the totals were not recognised: " + String.join("; ", p.unclassifiedSummaryLines.subList(0, Math.min(3, p.unclassifiedSummaryLines.size()))) + ". Add them as charges if needed.", "charges"));
        }

        // ---- totals ----
        track(subtotal, "subtotal", missing, uncertain);
        if (total.isMissing()) {
            boolean cutOff = imageHeight > 0 && p.lastLineBottom > imageHeight * 0.96;
            if (cutOff || p.itemsEndIdx < 0 && !items.isEmpty()) {
                warnings.add(new ExtractionWarning("BOTTOM_CUT_OFF", "The bottom section of the bill is not visible.", "total"));
            }
            warnings.add(new ExtractionWarning("TOTAL_NOT_DETECTED", "The final bill amount could not be detected.", "total"));
            missing.add("total");
        } else {
            track(total, "total", missing, uncertain);
        }

        BigDecimal itemsSum = items.stream().allMatch(i -> !i.amount().isMissing())
                ? items.stream().map(i -> new BigDecimal(i.amount().value())).reduce(BigDecimal.ZERO, BigDecimal::add) : null;
        BigDecimal chargesSum = charges.stream().allMatch(c -> !c.amount().isMissing())
                ? charges.stream().map(ExtractionValidator::signedAmount).reduce(BigDecimal.ZERO, BigDecimal::add) : null;

        if (!subtotal.isMissing() && itemsSum != null && !items.isEmpty()
                && itemsSum.compareTo(new BigDecimal(subtotal.value())) != 0) {
            warnings.add(new ExtractionWarning("SUBTOTAL_MISMATCH",
                    "Items add up to ₹" + itemsSum.toPlainString() + " but the subtotal reads ₹" + subtotal.value() + ". An item may be missing or misread.", "subtotal"));
            subtotal = subtotal.needsVerification("Does not match the sum of items");
            uncertain.add("subtotal");
        }
        if (!total.isMissing() && chargesSum != null) {
            BigDecimal base = !subtotal.isMissing() ? new BigDecimal(subtotal.value()) : itemsSum;
            if (base != null && base.add(chargesSum).compareTo(new BigDecimal(total.value())) != 0) {
                warnings.add(new ExtractionWarning("TOTAL_MISMATCH",
                        "Subtotal and charges add up to ₹" + base.add(chargesSum).toPlainString() + " but the final amount reads ₹" + total.value() + ". Please check the totals.", "total"));
                total = total.needsVerification("Does not match subtotal + charges");
                uncertain.add("total");
            }
        }

        ExtractedField<String> restaurant = orMissing(p.restaurantName, "Restaurant name not detected");
        ExtractedField<String> billNo = orMissing(p.billNumber, "Bill number not detected");
        ExtractedField<String> date = orMissing(p.billDate, "Bill date not detected");
        track(restaurant, "restaurantName", missing, uncertain);
        track(billNo, "billNumber", missing, uncertain);
        track(date, "billDate", missing, uncertain);

        return new ExtractionResult(engine, quality, restaurant, billNo, date, subtotal, total, items, charges,
                List.copyOf(missing), List.copyOf(uncertain), warnings, null);
    }

    private static boolean isTax(ChargeKind k) {
        return k == ChargeKind.CGST || k == ChargeKind.SGST || k == ChargeKind.IGST || k == ChargeKind.GST;
    }

    static BigDecimal signedAmount(ExtractedCharge c) {
        BigDecimal v = new BigDecimal(c.amount().value());
        return c.kind() == ChargeKind.DISCOUNT ? v.abs().negate() : v;
    }

    private static BigDecimal sumOf(List<ExtractedCharge> charges, ChargeKind kind) {
        BigDecimal s = null;
        for (ExtractedCharge c : charges) {
            if (c.kind() != kind || c.amount().isMissing()) continue;
            s = (s == null ? BigDecimal.ZERO : s).add(new BigDecimal(c.amount().value()));
        }
        return s;
    }

    /** A "GST" line equal to CGST + SGST is a summary of them, not an extra charge. */
    private static List<ExtractedCharge> dropSummaryGst(List<ExtractedCharge> charges, List<ExtractionWarning> warnings) {
        BigDecimal cgst = sumOf(charges, ChargeKind.CGST), sgst = sumOf(charges, ChargeKind.SGST);
        if (cgst == null || sgst == null) return charges;
        BigDecimal both = cgst.add(sgst);
        List<ExtractedCharge> out = new ArrayList<>();
        for (ExtractedCharge c : charges) {
            if (c.kind() == ChargeKind.GST && !c.amount().isMissing() && new BigDecimal(c.amount().value()).compareTo(both) == 0) {
                warnings.add(ExtractionWarning.of("GST_SUMMARY_LINE", "\"" + c.label() + "\" equals CGST + SGST, so it was treated as a summary and not added again."));
                continue;
            }
            out.add(c);
        }
        return out;
    }

    private static List<ExtractedCharge> markKinds(List<ExtractedCharge> charges, Set<ChargeKind> kinds, String reason, Set<String> uncertain) {
        List<ExtractedCharge> out = new ArrayList<>();
        for (int i = 0; i < charges.size(); i++) {
            ExtractedCharge c = charges.get(i);
            if (kinds.contains(c.kind())) {
                out.add(new ExtractedCharge(c.kind(), c.label(), c.amount().needsVerification(reason), c.rate()));
                if (!c.amount().isMissing()) uncertain.add("charges[" + i + "].amount");
            } else out.add(c);
        }
        return out;
    }

    private static <T> ExtractedField<T> orMissing(ExtractedField<T> f, String note) {
        return f == null ? ExtractedField.missing(note) : f;
    }

    private static void track(ExtractedField<?> f, String path, Set<String> missing, Set<String> uncertain) {
        if (f == null || f.isMissing()) missing.add(path);
        else if (f.status() == FieldStatus.verify) uncertain.add(path);
    }
}
