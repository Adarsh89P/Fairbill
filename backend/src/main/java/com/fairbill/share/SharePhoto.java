package com.fairbill.share;

import jakarta.persistence.Basic;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/** Photo of the original bill that the payer chose to show friends on the shared link. */
@Entity
@Table(name = "share_photos")
public class SharePhoto {
    @Id private String token;
    @Column(name = "content_type", nullable = false) private String contentType;
    @Basic(fetch = FetchType.LAZY) @Column(nullable = false) private byte[] image;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    protected SharePhoto() {}

    public SharePhoto(String token, String contentType, byte[] image) {
        this.token = token;
        this.contentType = contentType;
        this.image = image;
        this.createdAt = Instant.now();
    }

    public String getContentType() { return contentType; }
    public byte[] getImage() { return image; }
}
