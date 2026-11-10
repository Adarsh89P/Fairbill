package com.fairbill.extraction.ocr;

import com.fairbill.extraction.model.OcrLine;
import com.fairbill.extraction.model.OcrWord;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Groups words into visual rows by vertical position, so an item name on the
 * left and its price in a far-right column end up on the same line even when
 * the OCR engine reports them as separate blocks.
 */
public final class LineAssembler {
    private LineAssembler() {}

    public static List<OcrLine> assemble(List<OcrWord> words) {
        List<OcrWord> sorted = new ArrayList<>(words.stream().filter(w -> w.box() != null && !w.text().isBlank()).toList());
        if (sorted.isEmpty()) return List.of();
        sorted.sort(Comparator.comparingDouble(w -> w.box().y() + w.box().height() / 2.0));
        double medianH = sorted.stream().mapToInt(w -> w.box().height()).sorted().skip(sorted.size() / 2).findFirst().orElse(10);

        List<List<OcrWord>> rows = new ArrayList<>();
        List<Double> centers = new ArrayList<>();
        for (OcrWord w : sorted) {
            double cy = w.box().y() + w.box().height() / 2.0;
            int match = -1;
            for (int i = rows.size() - 1; i >= Math.max(0, rows.size() - 3); i--) {
                if (Math.abs(centers.get(i) - cy) <= medianH * 0.55) { match = i; break; }
            }
            if (match < 0) {
                rows.add(new ArrayList<>(List.of(w)));
                centers.add(cy);
            } else {
                List<OcrWord> row = rows.get(match);
                row.add(w);
                centers.set(match, (centers.get(match) * (row.size() - 1) + cy) / row.size());
            }
        }
        List<OcrLine> lines = new ArrayList<>();
        for (List<OcrWord> row : rows) {
            row.sort(Comparator.comparingInt(w -> w.box().x()));
            lines.add(new OcrLine(List.copyOf(row)));
        }
        return lines;
    }
}
