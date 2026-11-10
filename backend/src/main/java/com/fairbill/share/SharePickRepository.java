package com.fairbill.share;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SharePickRepository extends JpaRepository<SharePick, SharePayment.Key> {
    List<SharePick> findByToken(String token);
}
