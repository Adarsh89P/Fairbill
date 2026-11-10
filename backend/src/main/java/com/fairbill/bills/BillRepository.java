package com.fairbill.bills;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BillRepository extends JpaRepository<StoredBill, UUID> {
    List<StoredBill> findTop200ByOwnerIdOrderByUpdatedAtDesc(UUID ownerId);
    Optional<StoredBill> findByOwnerIdAndClientId(UUID ownerId, String clientId);
    void deleteByOwnerIdAndClientId(UUID ownerId, String clientId);
}
