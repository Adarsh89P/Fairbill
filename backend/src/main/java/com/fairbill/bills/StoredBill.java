package com.fairbill.bills;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** A bill document synced from the app. The full bill is kept as JSON; key fields are columns for listing. */
@Entity
@Table(name = "bills")
public class StoredBill {
    @Id private UUID id;
    @Column(name = "owner_id", nullable = false) private UUID ownerId;
    @Column(name = "client_id", nullable = false) private String clientId;
    private String title;
    @Column(nullable = false) private String currency;
    @Column(name = "total_minor") private Long totalMinor;
    @Column(name = "bill_date") private LocalDate billDate;
    @Column(nullable = false) private String status;
    @Column(nullable = false, columnDefinition = "TEXT") private String payload;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;

    protected StoredBill() {}

    public StoredBill(UUID ownerId, String clientId) {
        this.id = UUID.randomUUID();
        this.ownerId = ownerId;
        this.clientId = clientId;
        this.createdAt = Instant.now();
    }

    public void update(String title, String currency, Long totalMinor, LocalDate billDate, String status, String payload) {
        this.title = title;
        this.currency = currency;
        this.totalMinor = totalMinor;
        this.billDate = billDate;
        this.status = status;
        this.payload = payload;
        this.updatedAt = Instant.now();
    }

    public UUID getOwnerId() { return ownerId; }
    public String getClientId() { return clientId; }
    public String getPayload() { return payload; }
    public Instant getUpdatedAt() { return updatedAt; }
}
