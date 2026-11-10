package com.fairbill.extraction.image;

import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import javax.imageio.ImageIO;

public final class Images {
    private Images() {}

    public static BufferedImage decode(byte[] bytes) throws IOException {
        BufferedImage img = ImageIO.read(new ByteArrayInputStream(bytes));
        if (img == null) throw new IOException("Unsupported or corrupt image");
        return img;
    }

    public static byte[] png(BufferedImage img) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return out.toByteArray();
    }

    public static BufferedImage scaleToWidth(BufferedImage src, int width) {
        if (width <= 0 || src.getWidth() == width) return src;
        int height = Math.max(1, (int) Math.round(src.getHeight() * (width / (double) src.getWidth())));
        BufferedImage out = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.drawImage(src, 0, 0, width, height, null);
        g.dispose();
        return out;
    }

    public static int[][] grayscale(BufferedImage img) {
        int w = img.getWidth(), h = img.getHeight();
        int[][] g = new int[h][w];
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int rgb = img.getRGB(x, y);
                int r = (rgb >> 16) & 0xff, gr = (rgb >> 8) & 0xff, b = rgb & 0xff;
                g[y][x] = (r * 299 + gr * 587 + b * 114) / 1000;
            }
        }
        return g;
    }

    public static BufferedImage toGray(BufferedImage src) {
        BufferedImage out = new BufferedImage(src.getWidth(), src.getHeight(), BufferedImage.TYPE_BYTE_GRAY);
        Graphics2D g = out.createGraphics();
        g.drawImage(src, 0, 0, null);
        g.dispose();
        return out;
    }

    /** Rotate clockwise by a multiple of 90 degrees. */
    public static BufferedImage rotate(BufferedImage src, int degrees) {
        int d = ((degrees % 360) + 360) % 360;
        if (d == 0) return src;
        boolean swap = d == 90 || d == 270;
        int w = src.getWidth(), h = src.getHeight();
        BufferedImage out = new BufferedImage(swap ? h : w, swap ? w : h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        AffineTransform t = new AffineTransform();
        t.translate(out.getWidth() / 2.0, out.getHeight() / 2.0);
        t.rotate(Math.toRadians(d));
        t.translate(-w / 2.0, -h / 2.0);
        g.drawImage(src, t, null);
        g.dispose();
        return out;
    }
}
