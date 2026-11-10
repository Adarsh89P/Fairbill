package com.fairbill.share;

import com.fairbill.auth.CurrentUser;
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
    private final ShareService service;

    public ShareController(ShareService service) {
        this.service = service;
    }

    public record PublishRequest(@NotBlank String billId, @NotNull @Valid ShareSnapshot bill) {}

    // ---- owner (authenticated) ----

    @PostMapping("/api/shares")
    public ShareService.ShareView publish(@Valid @RequestBody PublishRequest req) {
        return service.publish(CurrentUser.id(), req.billId(), req.bill());
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
}
