package com.fairbill.receipts;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface ReceiptRepository extends JpaRepository<StoredReceipt, UUID> {
    Optional<StoredReceipt> findByIdAndOwnerId(UUID id, UUID ownerId);

    @Modifying
    @Query("delete from StoredReceipt r where r.expiresAt < :now")
    int deleteExpired(Instant now);

    @Modifying
    @Query("delete from StoredReceipt r where r.ownerId = :owner")
    int deleteAllForOwner(UUID owner);
}
