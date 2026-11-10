package com.fairbill.share;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "share_payments")
@IdClass(SharePayment.Key.class)
public class SharePayment {
    @Id private String token;
    @Id @Column(name = "participant_id") private String participantId;
    @Column(name = "marked_at", nullable = false) private Instant markedAt;
    @Column(name = "marked_by", nullable = false) private String markedBy;

    protected SharePayment() {}

    public SharePayment(String token, String participantId, String markedBy) {
        this.token = token;
        this.participantId = participantId;
        this.markedBy = markedBy;
        this.markedAt = Instant.now();
    }

    public String getParticipantId() { return participantId; }
    public Instant getMarkedAt() { return markedAt; }
    public String getMarkedBy() { return markedBy; }

    public record Key(String token, String participantId) implements Serializable {
        public Key() { this(null, null); }
    }
}
