package com.fairbill.share;

import com.fairbill.common.ApiException;
import com.fairbill.config.FairBillProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.MemoryCacheImageOutputStream;
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
    private static final int MAX_PEOPLE = 50;
    private static final int PHOTO_MAX_EDGE = 1800;
    private final SharePaymentRepository payments;
    private final SharePickRepository picks;
    private final ShareGuestRepository guests;
    private final SharePhotoRepository photos;
    private final ObjectMapper mapper;
    private final FairBillProperties props;

    public ShareService(ShareRepository shares, SharePaymentRepository payments, SharePickRepository picks, ShareGuestRepository guests,
                        SharePhotoRepository photos, ObjectMapper mapper, FairBillProperties props) {
        this.shares = shares;
        this.payments = payments;
        this.picks = picks;
        this.guests = guests;
        this.photos = photos;
        this.mapper = mapper;
        this.props = props;
    }

    /**
     * phase: "picking" while friends choose their items, "final" once the split is published.
     * claim.people includes friends who added themselves (guest = true). picks: participantId -> item ids.
     */
    public record ShareView(String token, String url, String phase, ShareSnapshot bill, ClaimSnapshot claim,
                            Map<String, List<String>> picks, Map<String, PaidMark> paid, boolean hasPhoto, Instant expiresAt) {}
    public record JoinResult(String participantId, ShareView share) {}
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

    static void validate(ClaimSnapshot c) {
        Set<String> items = new HashSet<>(), people = new HashSet<>();
        for (ClaimSnapshot.Item i : c.items()) if (!items.add(i.id())) throw ApiException.badRequest("DUPLICATE_ITEM", "Duplicate item ids.");
        for (ClaimSnapshot.Person p : c.people()) if (!people.add(p.id())) throw ApiException.badRequest("DUPLICATE_PERSON", "Duplicate participant ids.");
    }

    /** One link per bill: reuse the active share for this bill, or start a new one. */
    private Share forBill(UUID owner, String billClientId) {
        return shares.findFirstByOwnerIdAndBillClientIdAndRevokedFalseOrderByCreatedAtDesc(owner, billClientId)
                .filter(Share::isActive)
                .orElseGet(() -> new Share(newToken(), owner, billClientId, Instant.now().plus(TTL)));
    }

    @Transactional
    public ShareView publish(UUID owner, String billClientId, ShareSnapshot snapshot) {
        validate(snapshot);
        Share share = forBill(owner, billClientId);
        share.setSnapshot(write(snapshot));
        shares.save(share);
        return view(share);
    }

    /** Opens (or reopens) the link for friends to pick their own items. Any published split is withdrawn until republished. */
    @Transactional
    public ShareView openPicking(UUID owner, String billClientId, ClaimSnapshot claim) {
        validate(claim);
        Share share = forBill(owner, billClientId);
        // Guests are kept by the server; the app sends back the ones it already imported, marked guest=true.
        List<ClaimSnapshot.Person> people = claim.people().stream().map(p -> new ClaimSnapshot.Person(p.id(), p.name(), null)).toList();
        share.setClaim(write(new ClaimSnapshot(claim.restaurant(), claim.currency(), claim.items(), people)));
        share.setSnapshot(null);
        shares.save(share);
        return view(share);
    }

    @Transactional
    public ShareView pick(String token, String participantId, List<String> itemIds) {
        Share share = active(token);
        ClaimSnapshot claim = pickingClaim(share);
        if (people(share, claim).stream().noneMatch(p -> p.id().equals(participantId))) throw ApiException.notFound("Participant");
        Set<String> valid = new HashSet<>();
        claim.items().forEach(i -> valid.add(i.id()));
        List<String> clean = itemIds.stream().distinct().toList();
        if (!valid.containsAll(clean)) throw ApiException.badRequest("UNKNOWN_ITEM", "Some of those items are no longer on the bill. Refresh the page.");
        SharePick pick = picks.findById(new SharePayment.Key(token, participantId)).orElseGet(() -> new SharePick(token, participantId));
        pick.set(clean);
        picks.save(pick);
        return view(share);
    }

    @Transactional
    public JoinResult join(String token, String rawName) {
        Share share = active(token);
        ClaimSnapshot claim = pickingClaim(share);
        String name = rawName == null ? "" : rawName.replaceAll("\\p{Cntrl}", "").trim().replaceAll("\\s+", " ");
        if (name.isEmpty() || name.length() > 40) throw ApiException.badRequest("BAD_NAME", "Enter your name (up to 40 letters).");
        List<ClaimSnapshot.Person> everyone = people(share, claim);
        for (ClaimSnapshot.Person p : everyone) if (p.name().equalsIgnoreCase(name)) return new JoinResult(p.id(), view(share));
        if (everyone.size() >= MAX_PEOPLE) throw new ApiException(HttpStatus.CONFLICT, "FULL", "This bill already has the maximum number of people.");
        byte[] b = new byte[9];
        random.nextBytes(b);
        String id = "g_" + Base64.getUrlEncoder().withoutPadding().encodeToString(b);
        guests.save(new ShareGuest(token, id, name));
        return new JoinResult(id, view(share));
    }

    @Transactional
    public ShareView setPhoto(UUID owner, String token, byte[] data) {
        Share share = owned(owner, token);
        photos.save(new SharePhoto(token, "image/jpeg", reencode(data)));
        return view(share);
    }

    @Transactional
    public ShareView deletePhoto(UUID owner, String token) {
        Share share = owned(owner, token);
        photos.deleteById(token);
        return view(share);
    }

    @Transactional(readOnly = true)
    public SharePhoto photo(String token) {
        active(token);
        return photos.findById(token).orElseThrow(() -> ApiException.notFound("Bill photo"));
    }

    private ClaimSnapshot pickingClaim(Share share) {
        if (share.getClaim() == null || share.getSnapshot() != null) {
            throw new ApiException(HttpStatus.CONFLICT, "PICKING_CLOSED", "Item picking is closed for this bill. Refresh to see the final split.");
        }
        return readClaim(share);
    }

    private List<ClaimSnapshot.Person> people(Share share, ClaimSnapshot claim) {
        List<ClaimSnapshot.Person> out = new ArrayList<>(claim.people());
        Set<String> ids = new HashSet<>();
        out.forEach(p -> ids.add(p.id()));
        for (ShareGuest g : guests.findByTokenOrderByCreatedAt(share.getToken())) {
            if (ids.add(g.getParticipantId())) out.add(new ClaimSnapshot.Person(g.getParticipantId(), g.getName(), true));
        }
        return out;
    }

    /**
     * Decodes, downsizes and re-encodes the photo as JPEG. Re-encoding drops all metadata (EXIF location,
     * device details) and guarantees we only ever serve a plain image.
     */
    static byte[] reencode(byte[] data) {
        BufferedImage src;
        try {
            src = ImageIO.read(new ByteArrayInputStream(data));
        } catch (IOException e) {
            src = null;
        }
        if (src == null) throw ApiException.badRequest("NOT_AN_IMAGE", "That file isn't a photo we can read. Use a JPEG or PNG.");
        double s = Math.min(1.0, (double) PHOTO_MAX_EDGE / Math.max(src.getWidth(), src.getHeight()));
        int w = Math.max(1, (int) Math.round(src.getWidth() * s)), h = Math.max(1, (int) Math.round(src.getHeight() * s));
        BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, w, h);
        g.drawImage(src, 0, 0, w, h, null);
        g.dispose();
        try (ByteArrayOutputStream bos = new ByteArrayOutputStream(); MemoryCacheImageOutputStream ios = new MemoryCacheImageOutputStream(bos)) {
            ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
            ImageWriteParam param = writer.getDefaultWriteParam();
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionQuality(0.85f);
            writer.setOutput(ios);
            writer.write(null, new IIOImage(out, null, null), param);
            writer.dispose();
            ios.flush();
            return bos.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
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
        if (share.getSnapshot() == null) throw new ApiException(HttpStatus.CONFLICT, "NOT_FINAL", "The split hasn't been shared yet.");
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
        ShareSnapshot bill = s.getSnapshot() == null ? null : read(s);
        ClaimSnapshot claim = null;
        Map<String, List<String>> picked = new LinkedHashMap<>();
        if (s.getClaim() != null) {
            ClaimSnapshot stored = readClaim(s);
            List<ClaimSnapshot.Person> people = people(s, stored);
            claim = new ClaimSnapshot(stored.restaurant(), stored.currency(), stored.items(), people);
            Set<String> itemIds = new HashSet<>(), personIds = new HashSet<>();
            stored.items().forEach(i -> itemIds.add(i.id()));
            people.forEach(p -> personIds.add(p.id()));
            for (SharePick p : picks.findByToken(s.getToken())) {
                if (personIds.contains(p.getParticipantId())) picked.put(p.getParticipantId(), p.items().stream().filter(itemIds::contains).toList());
            }
        }
        String phase = bill != null ? "final" : claim != null ? "picking" : "none";
        return new ShareView(s.getToken(), url(s.getToken()), phase, bill, claim, picked, paid, photos.hasPhoto(s.getToken()), s.getExpiresAt());
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

    private String write(Object s) {
        try {
            return mapper.writeValueAsString(s);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    ClaimSnapshot readClaim(Share s) {
        try {
            return mapper.readValue(s.getClaim(), ClaimSnapshot.class);
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
