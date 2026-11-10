package com.fairbill.share;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.time.Instant;

/** Someone who opened the link, was not on the list, and added their own name. */
@Entity
@Table(name = "share_guests")
@IdClass(SharePayment.Key.class)
public class ShareGuest {
    @Id private String token;
    @Id @Column(name = "participant_id") private String participantId;
    @Column(nullable = false) private String name;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    protected ShareGuest() {}

    public ShareGuest(String token, String participantId, String name) {
        this.token = token;
        this.participantId = participantId;
        this.name = name;
        this.createdAt = Instant.now();
    }

    public String getParticipantId() { return participantId; }
    public String getName() { return name; }
    public Instant getCreatedAt() { return createdAt; }
}
