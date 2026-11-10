package com.fairbill.extraction.ocr;

import com.fairbill.extraction.image.Images;
import com.fairbill.extraction.model.BoundingBox;
import com.fairbill.extraction.model.OcrResult;
import com.fairbill.extraction.model.OcrWord;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Local OCR using the Tesseract CLI (TSV output gives per-word confidence and boxes). */
@Component
public class TesseractOcrEngine implements OcrEngine {
    private static final Logger log = LoggerFactory.getLogger(TesseractOcrEngine.class);
    private static final Pattern ROTATE = Pattern.compile("Rotate:\\s*(\\d+)");
    private static final Pattern ORIENT_CONF = Pattern.compile("Orientation confidence:\\s*([\\d.]+)");

    private final String binary;
    private final String languages;
    private Boolean available;

    public TesseractOcrEngine(@Value("${fairbill.ocr.tesseract.binary:tesseract}") String binary,
                              @Value("${fairbill.ocr.tesseract.languages:eng}") String languages) {
        this.binary = binary;
        this.languages = languages;
    }

    @Override
    public String name() { return "tesseract"; }

    @Override
    public synchronized boolean available() {
        if (available == null) {
            try {
                Process p = new ProcessBuilder(binary, "--version").redirectErrorStream(true).start();
                available = p.waitFor(10, TimeUnit.SECONDS) && p.exitValue() == 0;
            } catch (IOException | InterruptedException e) {
                available = false;
            }
        }
        return available;
    }

    @Override
    public OcrResult recognize(BufferedImage input) throws OcrException {
        Path tmp = null;
        try {
            BufferedImage image = input.getWidth() < 1400 ? Images.scaleToWidth(input, 1800) : input;
            double scale = (double) image.getWidth() / input.getWidth();
            image = Images.toGray(image);
            int scaledW = image.getWidth(), scaledH = image.getHeight();
            tmp = Files.createTempFile("receipt", ".png");
            Files.write(tmp, Images.png(image));

            int rotation = detectRotation(tmp);
            if (rotation != 0) {
                image = Images.rotate(image, rotation);
                Files.write(tmp, Images.png(image));
            }
            String tsv = run(List.of(binary, tmp.toString(), "stdout", "-l", languages, "--psm", "4", "tsv"), 90);
            List<OcrWord> words = parseTsv(tsv);
            final int rot = rotation;
            return new OcrResult(name(), image.getWidth(), image.getHeight(), LineAssembler.assemble(words),
                    b -> toInput(b, rot, scaledW, scaledH, scale));
        } catch (IOException e) {
            throw new OcrException("Tesseract failed: " + e.getMessage(), e);
        } finally {
            if (tmp != null) try { Files.deleteIfExists(tmp); } catch (IOException ignored) { }
        }
    }

    /**
     * Maps a box from the processed image (scaled, then rotated clockwise by {@code rotation}) back to the
     * input image. {@code w}/{@code h} are the scaled image's size before rotation.
     */
    public static BoundingBox toInput(BoundingBox b, int rotation, int w, int h, double scale) {
        int x1 = b.x(), y1 = b.y(), x2 = b.right(), y2 = b.bottom();
        int ax, ay, bx, by;
        switch (((rotation % 360) + 360) % 360) {
            case 90 -> { ax = y1; ay = h - x2; bx = y2; by = h - x1; }
            case 180 -> { ax = w - x2; ay = h - y2; bx = w - x1; by = h - y1; }
            case 270 -> { ax = w - y2; ay = x1; bx = w - y1; by = x2; }
            default -> { ax = x1; ay = y1; bx = x2; by = y2; }
        }
        int x = (int) Math.floor(Math.min(ax, bx) / scale), y = (int) Math.floor(Math.min(ay, by) / scale);
        int r = (int) Math.ceil(Math.max(ax, bx) / scale), btm = (int) Math.ceil(Math.max(ay, by) / scale);
        return new BoundingBox(x, y, Math.max(1, r - x), Math.max(1, btm - y));
    }

    /** Uses Tesseract orientation detection; returns clockwise degrees needed to make text upright. */
    private int detectRotation(Path file) {
        try {
            String osd = run(List.of(binary, file.toString(), "stdout", "--psm", "0"), 30);
            Matcher r = ROTATE.matcher(osd), c = ORIENT_CONF.matcher(osd);
            if (r.find() && c.find() && Double.parseDouble(c.group(1)) >= 2.0) return Integer.parseInt(r.group(1));
        } catch (IOException e) {
            log.debug("Orientation detection skipped: {}", e.getMessage());
        }
        return 0;
    }

    static List<OcrWord> parseTsv(String tsv) {
        List<OcrWord> words = new ArrayList<>();
        String[] rows = tsv.split("\\R");
        for (int i = 1; i < rows.length; i++) {
            String[] f = rows[i].split("\t", -1);
            if (f.length < 12 || !"5".equals(f[0])) continue;
            String text = f[11].trim();
            if (text.isEmpty()) continue;
            double conf = Double.parseDouble(f[10]);
            if (conf < 0) continue;
            words.add(new OcrWord(text, conf / 100.0, new BoundingBox(
                    Integer.parseInt(f[6]), Integer.parseInt(f[7]), Integer.parseInt(f[8]), Integer.parseInt(f[9]))));
        }
        return words;
    }

    private static String run(List<String> cmd, int timeoutSeconds) throws IOException {
        Process p = new ProcessBuilder(cmd).redirectError(ProcessBuilder.Redirect.DISCARD).start();
        try {
            byte[] out = p.getInputStream().readAllBytes();
            if (!p.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
                p.destroyForcibly();
                throw new IOException("OCR timed out");
            }
            if (p.exitValue() != 0) throw new IOException("exit code " + p.exitValue());
            return new String(out, StandardCharsets.UTF_8);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("interrupted", e);
        }
    }
}
