package com.fairbill.receipts;

import jakarta.persistence.Basic;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** A receipt photo the user chose to keep. Stored only on explicit opt-in and deleted after the retention period. */
@Entity
@Table(name = "receipts")
public class StoredReceipt {
    @Id private UUID id;
    @Column(name = "owner_id", nullable = false) private UUID ownerId;
    @Column(name = "content_type", nullable = false) private String contentType;
    @Basic(fetch = FetchType.LAZY) @Column(nullable = false) private byte[] image;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "expires_at", nullable = false) private Instant expiresAt;

    protected StoredReceipt() {}

    public StoredReceipt(UUID ownerId, String contentType, byte[] image, Instant expiresAt) {
        this.id = UUID.randomUUID();
        this.ownerId = ownerId;
        this.contentType = contentType;
        this.image = image;
        this.createdAt = Instant.now();
        this.expiresAt = expiresAt;
    }

    public UUID getId() { return id; }
    public UUID getOwnerId() { return ownerId; }
    public String getContentType() { return contentType; }
    public byte[] getImage() { return image; }
}
