package com.fairbill.receipts;

import com.fairbill.auth.CurrentUser;
import com.fairbill.common.ApiException;
import com.fairbill.common.RateLimiter;
import com.fairbill.config.FairBillProperties;
import com.fairbill.extraction.ReceiptExtractionService;
import com.fairbill.extraction.model.ExtractionResult;
import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
public class ReceiptController {
    private static final Logger log = LoggerFactory.getLogger(ReceiptController.class);
    private static final Set<String> TYPES = Set.of("image/jpeg", "image/png", "image/webp", "image/heic", "image/heif");

    private final ReceiptExtractionService extraction;
    private final ReceiptRepository receipts;
    private final RateLimiter limiter;
    private final FairBillProperties props;

    public ReceiptController(ReceiptExtractionService extraction, ReceiptRepository receipts, RateLimiter limiter, FairBillProperties props) {
        this.extraction = extraction;
        this.receipts = receipts;
        this.limiter = limiter;
        this.props = props;
    }

    @GetMapping("/api/receipts/capabilities")
    public Map<String, Object> capabilities() {
        return Map.of("ocr", extraction.ocrAvailable(), "maxBytes", 12 * 1024 * 1024);
    }

    /**
     * Scan a bill photo. The image is processed in memory and discarded unless
     * store=true (the user opted in to keeping receipt images).
     */
    @PostMapping(value = "/api/receipts/scan", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Transactional
    public ExtractionResult scan(@RequestPart("image") MultipartFile image, @RequestParam(defaultValue = "false") boolean store) throws IOException {
        UUID user = CurrentUser.id();
        limiter.check("scan:" + user, props.limits().scansPerHour(), "You've scanned a lot of bills this hour. Please try again later.");
        if (image.isEmpty()) throw ApiException.badRequest("NO_IMAGE", "No bill image was uploaded.");
        String type = image.getContentType() == null ? "" : image.getContentType().toLowerCase();
        if (!TYPES.contains(type)) throw ApiException.badRequest("UNSUPPORTED_TYPE", "Please upload a JPG or PNG photo of the bill.");
        byte[] bytes = image.getBytes();
        ExtractionResult result;
        try {
            result = extraction.extract(bytes);
        } catch (ReceiptExtractionService.ExtractionException e) {
            HttpStatus status = "OCR_UNAVAILABLE".equals(e.code()) ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.UNPROCESSABLE_ENTITY;
            throw new ApiException(status, e.code(), e.getMessage());
        }
        log.info("Scanned receipt: engine={} items={} warnings={}", result.engine(), result.items().size(), result.warnings().size());
        if (store) {
            StoredReceipt r = receipts.save(new StoredReceipt(user, type, bytes,
                    Instant.now().plus(Duration.ofDays(props.receipts().retentionDays()))));
            result = result.withReceiptId(r.getId().toString());
        }
        return result;
    }

    @GetMapping("/api/receipts/{id}/image")
    @Transactional(readOnly = true)
    public ResponseEntity<byte[]> image(@PathVariable UUID id) {
        StoredReceipt r = receipts.findByIdAndOwnerId(id, CurrentUser.id()).orElseThrow(() -> ApiException.notFound("Receipt"));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.parseMediaType(r.getContentType())).body(r.getImage());
    }

    @DeleteMapping("/api/receipts/{id}")
    @Transactional
    public void delete(@PathVariable UUID id) {
        receipts.findByIdAndOwnerId(id, CurrentUser.id()).ifPresent(receipts::delete);
    }

    @DeleteMapping("/api/receipts")
    @Transactional
    public Map<String, Integer> deleteAll() {
        return Map.of("deleted", receipts.deleteAllForOwner(CurrentUser.id()));
    }

    @Scheduled(fixedDelay = 3_600_000, initialDelay = 60_000)
    @Transactional
    public void purgeExpired() {
        int n = receipts.deleteExpired(Instant.now());
        if (n > 0) log.info("Deleted {} expired receipt images", n);
    }
}
