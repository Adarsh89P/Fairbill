package com.fairbill.extraction.parse;

import java.math.BigDecimal;
import java.util.regex.Pattern;

/** Number recognition tuned for Indian receipts ("1,250.00", "500/-", "Rs.99", "(-)0.40"). */
final class Tokens {
    private Tokens() {}

    private static final Pattern MONEY = Pattern.compile("^-?\\d{1,7}(\\.\\d{1,2})?$");
    private static final Pattern INT = Pattern.compile("^\\d{1,2}(\\.0{1,3})?$");
    static final Pattern PERCENT = Pattern.compile("^@?\\(?\\d{1,2}(\\.\\d{1,2})?\\s*%\\)?$");

    /** Clean a token that may be money; returns null when it is not unambiguously a number. */
    static String cleanNumber(String raw) {
        if (raw == null) return null;
        // Stray marks OCR puts around digits ("?100.00", "|45.00", "300.00:"). The value keeps its OCR
        // confidence, so a low-confidence read still has to be verified by the user.
        String t = raw.trim().replaceAll("^[?|'\"`!:;,*]+|[?|'\"`!:;,*]+$", "");
        if (t.isEmpty() || t.contains("%")) return null;
        boolean negative = t.startsWith("-") || t.startsWith("(-)") || t.endsWith("-") && !t.endsWith("/-")
                || (t.startsWith("(") && t.endsWith(")"));
        t = t.replaceAll("(?i)^(rs\\.?|inr)", "")
             .replaceAll("[₹$€£¥]", "")
             .replaceAll("/-$", "")
             .replace("(-)", "")
             .replaceAll("[()\\-]", "")
             .replace(",", "");
        if (t.startsWith(".")) t = "0" + t;
        // Common OCR confusions, only inside tokens that are otherwise numeric.
        if (t.matches("[0-9OoIl.]+") && t.matches(".*\\d.*")) {
            t = t.replace('O', '0').replace('o', '0').replace('I', '1').replace('l', '1');
        }
        if (!MONEY.matcher(t).matches()) return null;
        return negative ? "-" + t : t;
    }

    static boolean isSmallInt(String cleaned) {
        return cleaned != null && INT.matcher(cleaned).matches() && intValue(cleaned) > 0;
    }

    static int intValue(String cleaned) {
        return new BigDecimal(cleaned).intValueExact();
    }

    static BigDecimal money(String cleaned) {
        return new BigDecimal(cleaned).setScale(2, java.math.RoundingMode.UNNECESSARY);
    }

    static String format(BigDecimal v) {
        return v.setScale(2, java.math.RoundingMode.UNNECESSARY).toPlainString();
    }

    static boolean hasLetters(String s, int min) {
        int n = 0;
        for (char c : s.toCharArray()) if (Character.isLetter(c)) n++;
        return n >= min;
    }
}
