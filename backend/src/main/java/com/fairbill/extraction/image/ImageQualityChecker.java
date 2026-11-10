package com.fairbill.extraction.image;

import com.fairbill.extraction.model.ImageQuality;
import java.awt.image.BufferedImage;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * Cheap checks run before OCR so the user gets a clear reason when a photo
 * cannot be read (blur, darkness, tiny image) instead of a silent bad result.
 */
@Component
public class ImageQualityChecker {

    static final int MIN_SHORT_SIDE = 400;
    static final double BLUR_THRESHOLD = 45.0; // variance of Laplacian on a ~1000px wide grayscale image
    static final double DARK_THRESHOLD = 60.0;
    static final double BRIGHT_THRESHOLD = 245.0;

    public ImageQuality check(BufferedImage image) {
        List<String> issues = new ArrayList<>();
        int w = image.getWidth(), h = image.getHeight();
        if (Math.min(w, h) < MIN_SHORT_SIDE) issues.add("LOW_RESOLUTION");

        int[][] gray = Images.grayscale(Images.scaleToWidth(image, Math.min(1000, w)));
        double brightness = mean(gray);
        double sharpness = laplacianVariance(gray);
        if (sharpness < BLUR_THRESHOLD) issues.add("BLURRY");
        if (brightness < DARK_THRESHOLD) issues.add("TOO_DARK");
        if (brightness > BRIGHT_THRESHOLD) issues.add("OVEREXPOSED");

        boolean acceptable = !issues.contains("LOW_RESOLUTION") && sharpness >= BLUR_THRESHOLD / 2;
        return new ImageQuality(acceptable, w, h, Math.round(sharpness * 10) / 10.0, Math.round(brightness * 10) / 10.0, issues);
    }

    static double mean(int[][] g) {
        long total = 0;
        int n = 0;
        for (int[] row : g) for (int v : row) { total += v; n++; }
        return n == 0 ? 0 : (double) total / n;
    }

    static double laplacianVariance(int[][] g) {
        int h = g.length, w = h == 0 ? 0 : g[0].length;
        if (h < 3 || w < 3) return 0;
        double sum = 0, sumSq = 0;
        int n = 0;
        for (int y = 1; y < h - 1; y++) {
            for (int x = 1; x < w - 1; x++) {
                int lap = g[y - 1][x] + g[y + 1][x] + g[y][x - 1] + g[y][x + 1] - 4 * g[y][x];
                sum += lap;
                sumSq += (double) lap * lap;
                n++;
            }
        }
        double m = sum / n;
        return sumSq / n - m * m;
    }
}
