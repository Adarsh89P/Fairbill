package com.fairbill.share;

import com.fairbill.common.ApiException;
import com.fairbill.config.FairBillProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ShareService {
    private static final Duration TTL = Duration.ofDays(90);
    private final SecureRandom random = new SecureRandom();
    private final ShareRepository shares;
    private final SharePaymentRepository payments;
    private final ObjectMapper mapper;
    private final FairBillProperties props;

    public ShareService(ShareRepository shares, SharePaymentRepository payments, ObjectMapper mapper, FairBillProperties props) {
        this.shares = shares;
        this.payments = payments;
        this.mapper = mapper;
        this.props = props;
    }

    public record ShareView(String token, String url, ShareSnapshot bill, Map<String, PaidMark> paid, Instant expiresAt) {}
    public record PaidMark(Instant at, String by) {}

    /** Server-side reconciliation: never publish a summary that creates or loses money. */
    static void validate(ShareSnapshot s) {
        long sum = 0;
        for (ShareSnapshot.Person p : s.people()) {
            long lines = p.lines().stream().mapToLong(ShareSnapshot.Line::amount).sum();
            if (lines != p.total()) throw ApiException.badRequest("PERSON_MISMATCH", "Breakdown for " + p.name() + " does not add up.");
            sum += p.total();
        }
        if (sum != s.total()) throw ApiException.badRequest("TOTAL_MISMATCH", "Individual shares do not add up to the bill total.");
        Set<String> ids = s.people().stream().map(ShareSnapshot.Person::id).collect(Collectors.toSet());
        if (ids.size() != s.people().size()) throw ApiException.badRequest("DUPLICATE_PERSON", "Duplicate participant ids.");
        for (ShareSnapshot.Transfer t : s.transfers()) {
            if (!ids.contains(t.from()) || !ids.contains(t.to()) || t.amount() <= 0) {
                throw ApiException.badRequest("BAD_TRANSFER", "Invalid settlement entry.");
            }
        }
    }

    @Transactional
    public ShareView publish(UUID owner, String billClientId, ShareSnapshot snapshot) {
        validate(snapshot);
        String json = write(snapshot);
        Share share = shares.findFirstByOwnerIdAndBillClientIdAndRevokedFalseOrderByCreatedAtDesc(owner, billClientId)
                .filter(Share::isActive)
                .orElse(null);
        if (share == null) {
            share = new Share(newToken(), owner, billClientId, json, Instant.now().plus(TTL));
        } else {
            share.setSnapshot(json);
        }
        shares.save(share);
        return view(share);
    }

    public ShareView publicView(String token) {
        return view(active(token));
    }

    public ShareView ownerView(UUID owner, String token) {
        return view(owned(owner, token));
    }

    @Transactional
    public ShareView mark(String token, String participantId, boolean paid, String by, UUID owner) {
        Share share = owner == null ? active(token) : owned(owner, token);
        ShareSnapshot snap = read(share);
        if (snap.people().stream().noneMatch(p -> p.id().equals(participantId))) throw ApiException.notFound("Participant");
        if (paid) {
            if (!payments.existsById(new SharePayment.Key(token, participantId))) payments.save(new SharePayment(token, participantId, by));
        } else {
            if (owner == null) throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Only the bill owner can undo a payment.");
            payments.deleteByTokenAndParticipantId(token, participantId);
        }
        return view(share);
    }

    @Transactional
    public void revoke(UUID owner, String token) {
        owned(owner, token).revoke();
    }

    private Share active(String token) {
        return shares.findById(token).filter(Share::isActive).orElseThrow(() -> ApiException.notFound("Shared bill"));
    }

    private Share owned(UUID owner, String token) {
        return shares.findById(token).filter(s -> s.getOwnerId().equals(owner)).orElseThrow(() -> ApiException.notFound("Shared bill"));
    }

    private ShareView view(Share s) {
        Map<String, PaidMark> paid = new LinkedHashMap<>();
        for (SharePayment p : payments.findByToken(s.getToken())) paid.put(p.getParticipantId(), new PaidMark(p.getMarkedAt(), p.getMarkedBy()));
        return new ShareView(s.getToken(), url(s.getToken()), read(s), paid, s.getExpiresAt());
    }

    public String url(String token) {
        String base = props.publicBaseUrl();
        if (base == null || base.isBlank()) {
            // Use the address the request came in on (honours X-Forwarded-* behind proxies).
            base = org.springframework.web.servlet.support.ServletUriComponentsBuilder.fromCurrentContextPath().toUriString();
        }
        return base.replaceAll("/+$", "") + "/s/" + token;
    }

    private String newToken() {
        byte[] b = new byte[24];
        random.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    private String write(ShareSnapshot s) {
        try {
            return mapper.writeValueAsString(s);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    ShareSnapshot read(Share s) {
        try {
            return mapper.readValue(s.getSnapshot(), ShareSnapshot.class);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
