package com.fairbill.extraction.parse;

import com.fairbill.extraction.model.BoundingBox;
import com.fairbill.extraction.model.ChargeKind;
import com.fairbill.extraction.model.ExtractedCharge;
import com.fairbill.extraction.model.ExtractedField;
import com.fairbill.extraction.model.ExtractedItem;
import com.fairbill.extraction.model.OcrLine;
import com.fairbill.extraction.model.OcrResult;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * Turns OCR lines into a structured receipt. The parser only reports what it
 * can actually read: anything ambiguous is marked "verify" and anything
 * unreadable is marked "missing" with a reason. It never invents values.
 */
@Component
public class ReceiptParser {

    // ---- keyword patterns (case-insensitive) ----
    private static final Pattern ROUND_OFF = p("\\b(round(ed)?\\s*-?\\s*off|rounding|r\\s*/\\s*o)\\b");
    private static final Pattern CGST = p("\\bc\\.?\\s?gst\\b");
    private static final Pattern SGST = p("\\b(s|u)\\.?\\s?gst\\b");
    private static final Pattern IGST = p("\\bi\\.?\\s?gst\\b");
    private static final Pattern GST = p("\\b(gst|vat|tax)\\b");
    private static final Pattern SERVICE = p("\\b(service\\s*(charge|chg|chrg|tax)?|s\\.?\\s?c\\.?)\\b");
    private static final Pattern PACKAGING = p("\\b(packag(ing|e)|packing\\s*(charge|chg|chrg)?|(parcel|container|takeaway)\\s*(charge|chg|chrg)s?)\\b");
    private static final Pattern DISCOUNT = p("\\b(discount|disc\\.?|coupon|promo|less\\s*:)");
    private static final Pattern TIP = p("\\b(tip|gratuity)\\b");
    private static final Pattern OTHER_CHARGE = p("\\b(delivery|convenience|platform|cover)\\s*(charge|fee|chg)?\\b|\\bcess\\b");

    private static final Pattern SUBTOTAL = p("\\b(sub[\\s\\-]?total|item\\s*total|food\\s*total|gross\\s*(amount|total)|total\\s*before\\s*tax|bill\\s*total\\s*before)\\b");
    private static final Pattern STRONG_TOTAL = p("\\b(grand\\s*total|net\\s*(amount|payable|total|amt)|amount\\s*payable|total\\s*payable|payable\\s*amount|bill\\s*amount|total\\s*amount\\s*payable|total\\s*due|amount\\s*due)\\b");
    private static final Pattern PLAIN_TOTAL = p("\\btotal\\b|\\btotal\\s*(amount|amt|rs)\\b");
    private static final Pattern NOT_MONEY_TOTAL = p("\\btotal\\s*(qty|quantity|items?|no\\.?\\s*of\\s*items|pax)\\b|\\b(no\\.?\\s*of\\s*items|item\\s*count)\\b");
    private static final Pattern GST_ID = p("\\b(gstin|gst\\s*(no|number|reg|regn|#|in)\\b|tax\\s*invoice)");
    private static final Pattern TAXABLE = p("\\b(taxable\\s*(amount|value|amt)|tax\\s*summary)\\b");

    private static final Pattern HEADER = p("\\b(item|items|particulars|description|dish|food)\\b.*\\b(qty|quantity|amount|amt|rate|price|total)\\b");
    private static final Pattern SERIAL_HEADER = p("\\b(s\\.?\\s?no|sr\\.?\\s?no|sl\\.?\\s?no|#)\\b");
    private static final Pattern PAYMENT = p("\\b(cash|card|upi|paytm|gpay|phonepe|tendered|change|balance|paid|visa|master|tender)\\b");
    private static final Pattern META = p("\\b(gstin|gst\\s*no|fssai|cin|pan|ph(one)?|mob(ile)?|tel|email|www\\.|\\.com|address|table|tbl|cover|pax|waiter|steward|captain|cashier|server|kot|time|date|bill\\s*no|invoice|order|token|thank|visit|again|welcome|customer|guest|counter|dine|outlet|hsn|sac)\\b");
    private static final Pattern TITLE_NOISE = p("^(tax\\s*invoice|invoice|bill|retail\\s*invoice|estimate|duplicate|original|cash\\s*memo|kot)$");

    private static final Pattern BILL_NO = p("\\b(bill|invoice|inv|receipt|order|check|chk)\\s*(no|num|number|#|id)?\\.?\\s*[:#\\-]?\\s*([A-Z0-9][A-Z0-9/\\-]{1,24})");
    private static final Pattern DATE_NUMERIC = Pattern.compile("\\b(\\d{1,2})[/\\-.](\\d{1,2})[/\\-.](\\d{2,4})\\b");
    private static final Pattern DATE_ISO = Pattern.compile("\\b(20\\d{2})[/\\-.](\\d{1,2})[/\\-.](\\d{1,2})\\b");
    private static final Pattern DATE_WORD = p("\\b(\\d{1,2})[\\s\\-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\\s\\-,']*(\\d{2,4})\\b");
    private static final Pattern LEADING_QTY = p("^(\\d{1,2})\\s*(x|\\*|no\\.?|nos\\.?|pcs?)?\\s+(?=[a-z])");
    private static final Pattern TRAILING_QTY = p("\\s+(x|\\*)\\s*(\\d{1,2})$");

    private static Pattern p(String regex) {
        return Pattern.compile(regex, Pattern.CASE_INSENSITIVE);
    }

    public ParsedReceipt parse(OcrResult ocr) {
        List<OcrLine> lines = ocr.lines().stream().filter(l -> !l.text().isBlank()).toList();
        ParsedReceipt r = new ParsedReceipt();
        r.lineCount = lines.size();
        r.lastLineBottom = lines.isEmpty() || lines.get(lines.size() - 1).box() == null ? 0 : lines.get(lines.size() - 1).box().bottom();
        r.restaurantName = findRestaurant(lines);
        r.billNumber = findBillNumber(lines);
        r.billDate = findDate(lines);

        boolean serialColumn = false;
        int headerIdx = -1;
        for (int i = 0; i < lines.size(); i++) {
            String t = lines.get(i).text();
            if (HEADER.matcher(t).find() && trailingNumbers(lines.get(i)).isEmpty()) {
                headerIdx = i;
                serialColumn = SERIAL_HEADER.matcher(t).find();
                break;
            }
        }

        boolean inSummary = false;
        String pendingName = null;
        OcrLine pendingLine = null;
        List<ExtractedField<String>> plainTotals = new ArrayList<>();
        int itemsEndIdx = -1;

        for (int i = Math.max(0, headerIdx + 1); i < lines.size(); i++) {
            OcrLine line = lines.get(i);
            String text = line.text();
            String lower = text.toLowerCase(Locale.ROOT);
            List<Num> nums = trailingNumbers(line);

            if (GST_ID.matcher(lower).find()) continue;
            if (NOT_MONEY_TOTAL.matcher(lower).find() || TAXABLE.matcher(lower).find()) {
                inSummary = inSummary || NOT_MONEY_TOTAL.matcher(lower).find() && !r.items.isEmpty();
                continue;
            }
            ChargeKind kind = chargeKind(lower);
            boolean isSubtotal = SUBTOTAL.matcher(lower).find();
            boolean isStrongTotal = STRONG_TOTAL.matcher(lower).find();
            boolean isPlainTotal = !isSubtotal && !isStrongTotal && kind == null && PLAIN_TOTAL.matcher(lower).find();

            boolean summaryLine = isSubtotal || isStrongTotal || isPlainTotal || kind != null;
            // Titles like "TAX INVOICE" or "Total" headings above the items carry no amount: skip them.
            if (summaryLine && r.items.isEmpty() && pendingName == null && nums.isEmpty()) continue;
            if (summaryLine) {
                flushPendingAsMissing(r, pendingName, pendingLine);
                pendingName = null;
                if (!inSummary) itemsEndIdx = i;
                inSummary = true;
                ExtractedField<String> amount = amountField(line, nums, labelOf(text));
                if (isSubtotal) {
                    if (r.subtotal == null || r.subtotal.isMissing()) r.subtotal = amount;
                } else if (isStrongTotal) {
                    r.total = amount; // last strong total wins (e.g. "Net Amount" after "Grand Total")
                    r.strongTotalSeen = true;
                } else if (isPlainTotal) {
                    plainTotals.add(amount);
                } else {
                    String rate = percentOf(text);
                    r.charges.add(new ExtractedCharge(kind, cleanLabel(text, kind), amount, rate));
                    r.chargesAfterPlainTotal |= !plainTotals.isEmpty();
                }
                continue;
            }
            if (inSummary) {
                if (!PAYMENT.matcher(lower).find() && !META.matcher(lower).find() && !nums.isEmpty() && Tokens.hasLetters(text, 3)) {
                    r.unclassifiedSummaryLines.add(text);
                }
                continue;
            }
            if (PAYMENT.matcher(lower).find() && r.items.isEmpty()) continue;
            if (META.matcher(lower).find() && (nums.isEmpty() || headerIdx < 0 && r.items.isEmpty())) continue;
            if (headerIdx < 0 && r.items.isEmpty() && (nums.isEmpty() || !nums.get(nums.size() - 1).value.contains("."))) {
                continue; // no table header: items start at the first line ending in a decimal amount
            }

            // ---- item lines ----
            String namePart = stripNumbers(text, nums);
            if (nums.isEmpty()) {
                if (Tokens.hasLetters(text, 3)) {
                    flushPendingAsMissing(r, pendingName, pendingLine);
                    pendingName = text.trim();
                    pendingLine = line;
                } else {
                    r.unreadableItemLines++;
                }
                continue;
            }
            boolean merged = false;
            if (pendingName != null) {
                // Long names wrap onto the next line ("Chicken Tikka Butter" / "Masala 1 300.00").
                // Only merge when this line's own name is too short to be a dish by itself;
                // otherwise the previous line is an item whose price could not be read.
                String own = namePart.replaceFirst("^\\s*\\d{1,3}[.)]?\\s+", "").trim();
                boolean continuation = own.isEmpty() || (own.split("\\s+").length == 1 && own.replaceAll("[^A-Za-z]", "").length() < 8);
                if (continuation) {
                    namePart = (pendingName + " " + namePart).trim();
                    merged = true;
                } else {
                    flushPendingAsMissing(r, pendingName, pendingLine);
                }
                pendingName = null;
            }
            r.items.add(parseItem(line, namePart, nums, serialColumn, merged));
        }
        flushPendingAsMissing(r, pendingName, pendingLine);
        r.itemsEndIdx = itemsEndIdx;

        // A plain "Total" followed by taxes is really the subtotal; the last plain total is the final amount.
        if (!plainTotals.isEmpty()) {
            if (r.chargesAfterPlainTotal && (r.subtotal == null || r.subtotal.isMissing())) {
                r.subtotal = plainTotals.get(0);
                if (plainTotals.size() > 1 && r.total == null) r.total = plainTotals.get(plainTotals.size() - 1);
            } else if (r.total == null) {
                r.total = plainTotals.get(plainTotals.size() - 1);
            }
        }
        return r;
    }

    // ---------------------------------------------------------------- items

    private ExtractedItem parseItem(OcrLine line, String rawName, List<Num> nums, boolean serialColumn, boolean mergedName) {
        String name = rawName;
        ExtractedField<Integer> qty = null;
        ExtractedField<String> rate = ExtractedField.missing("Rate not printed");
        ExtractedField<String> amount;

        if (serialColumn) name = name.replaceFirst("^\\s*\\d{1,3}[.)]?\\s+", "");

        Num amt = nums.get(nums.size() - 1);
        amount = ExtractedField.of(Tokens.format(Tokens.money(amt.value)), amt.conf, amt.raw, amt.box);

        if (nums.size() >= 3) {
            Num a = nums.get(nums.size() - 3), b = nums.get(nums.size() - 2);
            Num q = Tokens.isSmallInt(a.value) ? a : Tokens.isSmallInt(b.value) ? b : null;
            Num rt = q == a ? b : a;
            if (q != null) {
                qty = ExtractedField.of(Tokens.intValue(q.value), q.conf, q.raw, q.box);
                rate = ExtractedField.of(Tokens.format(Tokens.money(rt.value)), rt.conf, rt.raw, rt.box);
            }
        } else if (nums.size() == 2) {
            Num a = nums.get(0);
            boolean sameAsAmount = Tokens.money(a.value).compareTo(Tokens.money(amt.value)) == 0;
            if (Tokens.isSmallInt(a.value) && !sameAsAmount) {
                qty = ExtractedField.of(Tokens.intValue(a.value), a.conf, a.raw, a.box);
                if (qty.value() > 20) qty = qty.needsVerification("Unusually large quantity");
            } else {
                rate = ExtractedField.of(Tokens.format(Tokens.money(a.value)), a.conf, a.raw, a.box);
            }
        }
        if (qty == null) {
            Matcher lead = LEADING_QTY.matcher(name);
            Matcher trail = TRAILING_QTY.matcher(name);
            if (!serialColumn && lead.find()) {
                qty = ExtractedField.of(Integer.parseInt(lead.group(1)), line.confidenceOf(lead.group(1)), lead.group(1), line.boxOf(lead.group(1)));
                name = name.substring(lead.end());
            } else if (trail.find()) {
                qty = ExtractedField.of(Integer.parseInt(trail.group(2)), line.confidenceOf(trail.group(2)), trail.group(2), line.boxOf(trail.group(2)));
                name = name.substring(0, trail.start());
            }
        }
        if (qty == null) qty = ExtractedField.missing("Quantity not detected");

        // Arithmetic check: qty x rate must equal amount when all three are printed.
        if (!qty.isMissing() && !rate.isMissing()) {
            BigDecimal expected = new BigDecimal(rate.value()).multiply(BigDecimal.valueOf(qty.value()));
            if (expected.compareTo(new BigDecimal(amount.value())) != 0) {
                amount = amount.needsVerification("Quantity × rate (" + Tokens.format(expected) + ") does not match the amount");
            }
        }

        name = name.replaceAll("[|_*~]+", " ").replaceAll("\\s{2,}", " ").replaceAll("^[\\s.:\\-]+|[\\s.:\\-]+$", "");
        ExtractedField<String> nameField;
        if (!Tokens.hasLetters(name, 2)) {
            nameField = ExtractedField.missing("Item name could not be identified", line.text(), line.box());
        } else {
            double conf = line.words().stream()
                    .filter(w -> Tokens.hasLetters(w.text(), 1))
                    .mapToDouble(w -> w.confidence()).average().orElse(0);
            nameField = ExtractedField.of(name, conf, name, line.box());
            if (mergedName) nameField = nameField.needsVerification("Name read across two lines");
        }
        return new ExtractedItem(nameField, qty, rate, amount, null, line.text());
    }

    private void flushPendingAsMissing(ParsedReceipt r, String name, OcrLine line) {
        if (name == null) return;
        r.items.add(new ExtractedItem(
                ExtractedField.of(name, line.confidence(), name, line.box()).needsVerification("Price could not be read for this item"),
                ExtractedField.missing("Quantity not detected"),
                ExtractedField.missing("Rate not detected"),
                ExtractedField.missing("The price of this item is unclear", line.text(), line.box()),
                null, line.text()));
    }

    // ---------------------------------------------------------------- numbers

    record Num(String value, String raw, double conf, BoundingBox box) {}

    /** Numeric tokens at the end of the line (right-hand columns), left to right. */
    static List<Num> trailingNumbers(OcrLine line) {
        List<Num> out = new ArrayList<>();
        var words = line.words();
        for (int i = words.size() - 1; i >= 0; i--) {
            String raw = words.get(i).text();
            if (Tokens.PERCENT.matcher(raw).matches()) break;
            if (raw.matches("(?i)rs\\.?|inr|₹|/-|:|-")) continue;
            String clean = Tokens.cleanNumber(raw);
            if (clean == null) break;
            out.add(0, new Num(clean, raw, words.get(i).confidence(), words.get(i).box()));
            if (out.size() == 3) break;
        }
        return out;
    }

    private static String stripNumbers(String text, List<Num> nums) {
        String s = text;
        for (int i = nums.size() - 1; i >= 0; i--) {
            int idx = s.lastIndexOf(nums.get(i).raw);
            if (idx >= 0) s = s.substring(0, idx);
        }
        return s.replaceAll("(?i)\\s*(rs\\.?|₹|inr)\\s*$", "").trim();
    }

    private static ExtractedField<String> amountField(OcrLine line, List<Num> nums, String label) {
        if (nums.isEmpty()) return ExtractedField.missing("Amount for \"" + label + "\" could not be read", line.text(), line.box());
        Num n = nums.get(nums.size() - 1);
        return ExtractedField.of(Tokens.format(Tokens.money(n.value)), n.conf, n.raw, n.box);
    }

    private static String percentOf(String text) {
        Matcher m = Pattern.compile("(\\d{1,2}(\\.\\d{1,2})?)\\s*%").matcher(text);
        return m.find() ? m.group(1) + "%" : null;
    }

    // ---------------------------------------------------------------- classification

    static ChargeKind chargeKind(String lower) {
        if (ROUND_OFF.matcher(lower).find()) return ChargeKind.ROUND_OFF;
        if (CGST.matcher(lower).find()) return ChargeKind.CGST;
        if (SGST.matcher(lower).find()) return ChargeKind.SGST;
        if (IGST.matcher(lower).find()) return ChargeKind.IGST;
        if (SERVICE.matcher(lower).find() && !lower.contains("gst")) return ChargeKind.SERVICE;
        if (PACKAGING.matcher(lower).find()) return ChargeKind.PACKAGING;
        if (DISCOUNT.matcher(lower).find()) return ChargeKind.DISCOUNT;
        if (TIP.matcher(lower).find()) return ChargeKind.TIP;
        if (OTHER_CHARGE.matcher(lower).find()) return ChargeKind.OTHER;
        if (GST.matcher(lower).find() && !lower.contains("gstin") && !lower.contains("incl")) return ChargeKind.GST;
        return null;
    }

    private static String labelOf(String text) {
        return text.replaceAll("[\\d.,₹:/\\-%@()]+", " ").replaceAll("(?i)\\brs\\b", "").replaceAll("\\s{2,}", " ").trim();
    }

    private static String cleanLabel(String text, ChargeKind kind) {
        String l = labelOf(text);
        return l.isEmpty() ? kind.name() : l.length() > 40 ? l.substring(0, 40) : l;
    }

    // ---------------------------------------------------------------- header fields

    private ExtractedField<String> findRestaurant(List<OcrLine> lines) {
        int limit = Math.min(lines.size(), 6);
        for (int i = 0; i < limit; i++) {
            OcrLine l = lines.get(i);
            String t = l.text().replaceAll("[*=_~|]+", " ").trim();
            String lower = t.toLowerCase(Locale.ROOT);
            if (!Tokens.hasLetters(t, 3) || TITLE_NOISE.matcher(lower).matches() || META.matcher(lower).find()) continue;
            long digits = t.chars().filter(Character::isDigit).count();
            if (digits > 3) continue; // addresses and phone numbers
            double conf = Math.min(l.confidence(), 0.95);
            return ExtractedField.of(t, conf, l.text(), l.box());
        }
        return ExtractedField.missing("Restaurant name not detected");
    }

    private ExtractedField<String> findBillNumber(List<OcrLine> lines) {
        for (OcrLine l : lines) {
            Matcher m = BILL_NO.matcher(l.text());
            while (m.find()) {
                String v = m.group(3);
                if (v.matches(".*\\d.*") && !DATE_NUMERIC.matcher(v).find()) {
                    return ExtractedField.of(v, l.confidenceOf(v), l.text(), l.boxOf(v));
                }
            }
        }
        return ExtractedField.missing("Bill number not detected");
    }

    private ExtractedField<String> findDate(List<OcrLine> lines) {
        for (OcrLine l : lines) {
            String t = l.text();
            try {
                Matcher iso = DATE_ISO.matcher(t);
                if (iso.find()) {
                    LocalDate d = LocalDate.of(Integer.parseInt(iso.group(1)), Integer.parseInt(iso.group(2)), Integer.parseInt(iso.group(3)));
                    return ExtractedField.of(d.toString(), l.confidenceOf(iso.group()), iso.group(), l.boxOf(iso.group()));
                }
                Matcher num = DATE_NUMERIC.matcher(t);
                if (num.find()) {
                    int a = Integer.parseInt(num.group(1)), b = Integer.parseInt(num.group(2)), y = Integer.parseInt(num.group(3));
                    if (y < 100) y += 2000;
                    // Indian bills print DD/MM/YYYY.
                    LocalDate d = LocalDate.of(y, b, a);
                    ExtractedField<String> f = ExtractedField.of(d.toString(), l.confidenceOf(num.group()), num.group(), l.boxOf(num.group()));
                    if (a <= 12 && b <= 12 && a != b) f = f.needsVerification("Date read as DD/MM/YYYY");
                    return f;
                }
                Matcher w = DATE_WORD.matcher(t);
                if (w.find()) {
                    int y = Integer.parseInt(w.group(3));
                    if (y < 100) y += 2000;
                    String mon = w.group(2).substring(0, 3);
                    LocalDate d = LocalDate.parse(String.format("%02d-%s-%d", Integer.parseInt(w.group(1)),
                            mon.substring(0, 1).toUpperCase() + mon.substring(1).toLowerCase(), y),
                            DateTimeFormatter.ofPattern("dd-MMM-yyyy", Locale.ENGLISH));
                    return ExtractedField.of(d.toString(), l.confidenceOf(w.group()), w.group(), l.boxOf(w.group()));
                }
            } catch (RuntimeException ignored) {
                // invalid calendar date: keep looking
            }
        }
        return ExtractedField.missing("Bill date not detected");
    }

    /** Mutable parse state handed to the validator. */
    public static class ParsedReceipt {
        public ExtractedField<String> restaurantName;
        public ExtractedField<String> billNumber;
        public ExtractedField<String> billDate;
        public ExtractedField<String> subtotal;
        public ExtractedField<String> total;
        public final List<ExtractedItem> items = new ArrayList<>();
        public final List<ExtractedCharge> charges = new ArrayList<>();
        public final List<String> unclassifiedSummaryLines = new ArrayList<>();
        public int unreadableItemLines;
        public int lineCount;
        public int lastLineBottom;
        public int itemsEndIdx;
        boolean strongTotalSeen;
        boolean chargesAfterPlainTotal;
    }
}
