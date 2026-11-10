package com.fairbill.share;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ShareGuestRepository extends JpaRepository<ShareGuest, SharePayment.Key> {
    List<ShareGuest> findByTokenOrderByCreatedAt(String token);
}
