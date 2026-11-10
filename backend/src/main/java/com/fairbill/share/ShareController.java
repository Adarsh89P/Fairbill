package com.fairbill.share;

import com.fairbill.auth.CurrentUser;
import com.fairbill.common.ApiException;
import com.fairbill.common.RateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.io.IOException;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.multipart.MultipartFile;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ShareController {
    private static final long MAX_PHOTO_BYTES = 12L * 1024 * 1024;
    private final ShareService service;
    private final RateLimiter limiter;

    public ShareController(ShareService service, RateLimiter limiter) {
        this.service = service;
        this.limiter = limiter;
    }

    public record PublishRequest(@NotBlank String billId, @NotNull @Valid ShareSnapshot bill) {}
    public record PickingRequest(@NotBlank String billId, @NotNull @Valid ClaimSnapshot claim) {}
    public record PicksRequest(@NotNull @Size(max = 200) List<@Pattern(regexp = ShareSnapshot.ID) String> itemIds) {}
    public record JoinRequest(@NotBlank @Size(max = 80) String name) {}

    // ---- owner (authenticated) ----

    @PostMapping("/api/shares")
    public ShareService.ShareView publish(@Valid @RequestBody PublishRequest req) {
        return service.publish(CurrentUser.id(), req.billId(), req.bill());
    }

    @PostMapping("/api/shares/picking")
    public ShareService.ShareView openPicking(@Valid @RequestBody PickingRequest req) {
        return service.openPicking(CurrentUser.id(), req.billId(), req.claim());
    }

    @PutMapping("/api/shares/{token}/photo")
    public ShareService.ShareView setPhoto(@PathVariable String token, @RequestPart("image") MultipartFile image) throws IOException {
        if (image.isEmpty() || image.getSize() > MAX_PHOTO_BYTES) throw ApiException.badRequest("BAD_PHOTO", "The photo is empty or too large.");
        return service.setPhoto(CurrentUser.id(), token, image.getBytes());
    }

    @DeleteMapping("/api/shares/{token}/photo")
    public ShareService.ShareView deletePhoto(@PathVariable String token) {
        return service.deletePhoto(CurrentUser.id(), token);
    }

    @GetMapping("/api/shares/{token}")
    public ShareService.ShareView status(@PathVariable String token) {
        return service.ownerView(CurrentUser.id(), token);
    }

    @PostMapping("/api/shares/{token}/participants/{pid}/paid")
    public ShareService.ShareView ownerMarkPaid(@PathVariable String token, @PathVariable String pid) {
        return service.mark(token, pid, true, "owner", CurrentUser.id());
    }

    @DeleteMapping("/api/shares/{token}/participants/{pid}/paid")
    public ShareService.ShareView ownerUnmark(@PathVariable String token, @PathVariable String pid) {
        return service.mark(token, pid, false, "owner", CurrentUser.id());
    }

    @DeleteMapping("/api/shares/{token}")
    public void revoke(@PathVariable String token) {
        service.revoke(CurrentUser.id(), token);
    }

    // ---- guests (no account needed; the unguessable token is the credential) ----

    @GetMapping("/api/public/shares/{token}")
    public ShareService.ShareView publicView(@PathVariable String token) {
        return service.publicView(token);
    }

    @PostMapping("/api/public/shares/{token}/participants/{pid}/paid")
    public ShareService.ShareView guestMarkPaid(@PathVariable String token, @PathVariable String pid) {
        return service.mark(token, pid, true, "guest", null);
    }

    @PutMapping("/api/public/shares/{token}/picks/{pid}")
    public ShareService.ShareView pick(@PathVariable String token, @PathVariable String pid, @Valid @RequestBody PicksRequest req, HttpServletRequest http) {
        limiter.check("pick:" + http.getRemoteAddr(), 300, "Too many changes. Try again in a while.");
        return service.pick(token, pid, req.itemIds());
    }

    @PostMapping("/api/public/shares/{token}/guests")
    public ShareService.JoinResult join(@PathVariable String token, @Valid @RequestBody JoinRequest req, HttpServletRequest http) {
        limiter.check("join:" + http.getRemoteAddr(), 30, "Too many names added from this network. Try again later.");
        return service.join(token, req.name());
    }

    @GetMapping("/api/public/shares/{token}/photo")
    public ResponseEntity<byte[]> photo(@PathVariable String token) {
        SharePhoto p = service.photo(token);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(p.getContentType()))
                .cacheControl(CacheControl.noStore()).header("X-Content-Type-Options", "nosniff").body(p.getImage());
    }
}
