package com.fairbill.extraction.model;

import java.util.List;
import java.util.stream.Collectors;

public record OcrLine(List<OcrWord> words) {
    public String text() {
        return words.stream().map(OcrWord::text).collect(Collectors.joining(" ")).trim();
    }

    public double confidence() {
        return words.stream().mapToDouble(OcrWord::confidence).average().orElse(0);
    }

    public BoundingBox box() {
        BoundingBox b = null;
        for (OcrWord w : words) b = BoundingBox.union(b, w.box());
        return b;
    }

    /** Lowest confidence among the words whose text contains the given fragment. */
    public double confidenceOf(String fragment) {
        double min = 1.0;
        boolean found = false;
        String target = fragment.replaceAll("\\s+", "");
        for (OcrWord w : words) {
            String t = w.text().replaceAll("\\s+", "");
            if (!t.isEmpty() && (target.contains(t) || t.contains(target))) {
                min = Math.min(min, w.confidence());
                found = true;
            }
        }
        return found ? min : confidence();
    }

    public BoundingBox boxOf(String fragment) {
        BoundingBox b = null;
        String target = fragment.replaceAll("\\s+", "");
        for (OcrWord w : words) {
            String t = w.text().replaceAll("\\s+", "");
            if (!t.isEmpty() && (target.contains(t) || t.contains(target))) b = BoundingBox.union(b, w.box());
        }
        return b != null ? b : box();
    }
}
