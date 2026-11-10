package com.fairbill.extraction.model;

import java.util.List;

public record ImageQuality(boolean acceptable, int width, int height, double sharpness, double brightness, List<String> issues) {}
