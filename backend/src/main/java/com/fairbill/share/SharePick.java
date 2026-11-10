package com.fairbill.share;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.time.Instant;

/** The items one person said they had, as a comma-separated list of item ids. */
@Entity
@Table(name = "share_picks")
@IdClass(SharePayment.Key.class)
public class SharePick {
    @Id private String token;
    @Id @Column(name = "participant_id") private String participantId;
    @Column(name = "item_ids", nullable = false, columnDefinition = "TEXT") private String itemIds;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;

    protected SharePick() {}

    public SharePick(String token, String participantId) {
        this.token = token;
        this.participantId = participantId;
    }

    public void set(java.util.List<String> ids) {
        this.itemIds = String.join(",", ids);
        this.updatedAt = Instant.now();
    }

    public java.util.List<String> items() {
        return itemIds == null || itemIds.isEmpty() ? java.util.List.of() : java.util.List.of(itemIds.split(","));
    }

    public String getParticipantId() { return participantId; }
    public Instant getUpdatedAt() { return updatedAt; }
}
