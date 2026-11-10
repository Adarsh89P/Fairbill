package com.fairbill.share;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface SharePhotoRepository extends JpaRepository<SharePhoto, String> {
    @Query("select count(p) > 0 from SharePhoto p where p.token = ?1")
    boolean hasPhoto(String token);
}
