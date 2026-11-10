package com.fairbill.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "users")
public class UserAccount {
    @Id
    private UUID id;
    @Column(unique = true)
    private String email;
    @Column(name = "password_hash")
    private String passwordHash;
    @Column(name = "display_name", nullable = false)
    private String displayName;
    @Column(nullable = false)
    private boolean anonymous;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected UserAccount() {}

    public static UserAccount anonymous(String name) {
        UserAccount u = new UserAccount();
        u.id = UUID.randomUUID();
        u.displayName = name;
        u.anonymous = true;
        u.createdAt = Instant.now();
        return u;
    }

    public void upgrade(String email, String passwordHash, String name) {
        this.email = email;
        this.passwordHash = passwordHash;
        this.displayName = name;
        this.anonymous = false;
    }

    public UUID getId() { return id; }
    public String getEmail() { return email; }
    public String getPasswordHash() { return passwordHash; }
    public String getDisplayName() { return displayName; }
    public void setDisplayName(String n) { this.displayName = n; }
    public boolean isAnonymous() { return anonymous; }
}
