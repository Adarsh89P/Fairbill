package com.fairbill.share;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "shares")
public class Share {
    @Id private String token;
    @Column(name = "owner_id", nullable = false) private UUID ownerId;
    @Column(name = "bill_client_id", nullable = false) private String billClientId;
    @Column(columnDefinition = "TEXT") private String snapshot;
    @Column(columnDefinition = "TEXT") private String claim;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "expires_at", nullable = false) private Instant expiresAt;
    @Column(nullable = false) private boolean revoked;

    protected Share() {}

    public Share(String token, UUID ownerId, String billClientId, Instant expiresAt) {
        this.token = token;
        this.ownerId = ownerId;
        this.billClientId = billClientId;
        this.createdAt = Instant.now();
        this.expiresAt = expiresAt;
    }

    public boolean isActive() { return !revoked && Instant.now().isBefore(expiresAt); }
    public void revoke() { this.revoked = true; }
    public void setSnapshot(String s) { this.snapshot = s; }
    public String getToken() { return token; }
    public UUID getOwnerId() { return ownerId; }
    public String getBillClientId() { return billClientId; }
    public String getSnapshot() { return snapshot; }
    public String getClaim() { return claim; }
    public void setClaim(String c) { this.claim = c; }
    public Instant getExpiresAt() { return expiresAt; }
}
