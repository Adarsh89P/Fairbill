package com.fairbill.extraction.model;

public record BoundingBox(int x, int y, int width, int height) {
    public int bottom() { return y + height; }
    public int right() { return x + width; }

    public static BoundingBox union(BoundingBox a, BoundingBox b) {
        if (a == null) return b;
        if (b == null) return a;
        int x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
        return new BoundingBox(x, y, Math.max(a.right(), b.right()) - x, Math.max(a.bottom(), b.bottom()) - y);
    }
}
