package com.fairbill.share;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ShareRepository extends JpaRepository<Share, String> {
    Optional<Share> findFirstByOwnerIdAndBillClientIdAndRevokedFalseOrderByCreatedAtDesc(UUID ownerId, String billClientId);
}
