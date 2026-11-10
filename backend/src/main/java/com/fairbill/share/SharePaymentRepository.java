package com.fairbill.share;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SharePaymentRepository extends JpaRepository<SharePayment, SharePayment.Key> {
    List<SharePayment> findByToken(String token);
    void deleteByTokenAndParticipantId(String token, String participantId);
}
