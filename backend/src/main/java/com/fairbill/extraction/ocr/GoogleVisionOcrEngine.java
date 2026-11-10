package com.fairbill.extraction.ocr;

import com.fairbill.extraction.image.Images;
import com.fairbill.extraction.model.BoundingBox;
import com.fairbill.extraction.model.OcrResult;
import com.fairbill.extraction.model.OcrWord;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Google Cloud Vision DOCUMENT_TEXT_DETECTION. Enabled when
 * fairbill.ocr.google.api-key is set. Usually more accurate than Tesseract on
 * phone photos of thermal-paper receipts.
 */
@Component
public class GoogleVisionOcrEngine implements OcrEngine {
    private static final String ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

    private final String apiKey;
    private final ObjectMapper mapper;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    public GoogleVisionOcrEngine(@Value("${fairbill.ocr.google.api-key:}") String apiKey, ObjectMapper mapper) {
        this.apiKey = apiKey;
        this.mapper = mapper;
    }

    @Override
    public String name() { return "google-vision"; }

    @Override
    public boolean available() { return apiKey != null && !apiKey.isBlank(); }

    @Override
    public OcrResult recognize(BufferedImage image) throws OcrException {
        try {
            String content = Base64.getEncoder().encodeToString(Images.png(image));
            Map<String, Object> body = Map.of("requests", List.of(Map.of(
                    "image", Map.of("content", content),
                    "features", List.of(Map.of("type", "DOCUMENT_TEXT_DETECTION")),
                    "imageContext", Map.of("languageHints", List.of("en", "hi")))));
            HttpRequest req = HttpRequest.newBuilder(URI.create(ENDPOINT))
                    .timeout(Duration.ofSeconds(45))
                    .header("Content-Type", "application/json")
                    .header("X-Goog-Api-Key", apiKey)
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                    .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() != 200) throw new OcrException("Vision API returned HTTP " + res.statusCode());
            JsonNode root = mapper.readTree(res.body()).path("responses").path(0);
            if (root.has("error")) throw new OcrException("Vision API error: " + root.path("error").path("message").asText());
            return new OcrResult(name(), image.getWidth(), image.getHeight(), LineAssembler.assemble(words(root)));
        } catch (IOException e) {
            throw new OcrException("Vision API request failed", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new OcrException("Vision API request interrupted", e);
        }
    }

    static List<OcrWord> words(JsonNode response) {
        List<OcrWord> out = new ArrayList<>();
        for (JsonNode page : response.path("fullTextAnnotation").path("pages")) {
            for (JsonNode block : page.path("blocks")) {
                for (JsonNode para : block.path("paragraphs")) {
                    for (JsonNode word : para.path("words")) {
                        StringBuilder sb = new StringBuilder();
                        for (JsonNode s : word.path("symbols")) sb.append(s.path("text").asText());
                        double conf = word.path("confidence").asDouble(0);
                        out.add(new OcrWord(sb.toString(), conf, box(word.path("boundingBox").path("vertices"))));
                    }
                }
            }
        }
        return out;
    }

    private static BoundingBox box(JsonNode vertices) {
        int minX = Integer.MAX_VALUE, minY = Integer.MAX_VALUE, maxX = 0, maxY = 0;
        for (JsonNode v : vertices) {
            int x = v.path("x").asInt(0), y = v.path("y").asInt(0);
            minX = Math.min(minX, x); minY = Math.min(minY, y);
            maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
        if (minX == Integer.MAX_VALUE) return null;
        return new BoundingBox(minX, minY, maxX - minX, maxY - minY);
    }
}
