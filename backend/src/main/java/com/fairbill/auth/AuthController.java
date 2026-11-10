package com.fairbill.auth;

import com.fairbill.common.ApiException;
import com.fairbill.common.RateLimiter;
import com.fairbill.config.FairBillProperties;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Accounts. New installs get an anonymous device account (no sign-up needed);
 * it can later be upgraded to an email account, keeping its bills.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final TokenService tokens;
    private final RateLimiter limiter;
    private final FairBillProperties props;

    public AuthController(UserRepository users, PasswordEncoder encoder, TokenService tokens, RateLimiter limiter, FairBillProperties props) {
        this.users = users;
        this.encoder = encoder;
        this.tokens = tokens;
        this.limiter = limiter;
        this.props = props;
    }

    public record AnonymousRequest(@Size(max = 80) String name) {}
    public record RegisterRequest(@NotBlank @Email @Size(max = 320) String email,
                                  @NotBlank @Size(min = 8, max = 128) String password,
                                  @NotBlank @Size(max = 80) String name) {}
    public record LoginRequest(@NotBlank String email, @NotBlank String password) {}
    public record ProfileUpdate(@NotBlank @Size(max = 80) String name) {}
    public record Session(String token, Me user) {}
    public record Me(String id, String name, String email, boolean anonymous) {
        static Me of(UserAccount u) { return new Me(u.getId().toString(), u.getDisplayName(), u.getEmail(), u.isAnonymous()); }
    }

    @PostMapping("/anonymous")
    @Transactional
    public Session anonymous(@Valid @RequestBody(required = false) AnonymousRequest req, HttpServletRequest http) {
        limiter.check("anon:" + http.getRemoteAddr(), props.limits().accountsPerIpPerHour(), "Too many new sessions from this network. Try again later.");
        String name = req == null || req.name() == null || req.name().isBlank() ? "Me" : req.name().trim();
        UserAccount u = users.save(UserAccount.anonymous(name));
        return new Session(tokens.issue(u), Me.of(u));
    }

    /** Registers an email account. When called with an anonymous session, upgrades it in place. */
    @PostMapping("/register")
    @Transactional
    public Session register(@Valid @RequestBody RegisterRequest req, HttpServletRequest http) {
        limiter.check("reg:" + http.getRemoteAddr(), props.limits().accountsPerIpPerHour(), "Too many attempts. Try again later.");
        String email = req.email().trim().toLowerCase();
        if (users.findByEmailIgnoreCase(email).isPresent()) {
            throw new ApiException(HttpStatus.CONFLICT, "EMAIL_TAKEN", "An account with this email already exists. Sign in instead.");
        }
        UserAccount u;
        try {
            u = users.findById(CurrentUser.id()).filter(UserAccount::isAnonymous).orElseGet(() -> UserAccount.anonymous(req.name()));
        } catch (ApiException notSignedIn) {
            u = UserAccount.anonymous(req.name());
        }
        u.upgrade(email, encoder.encode(req.password()), req.name().trim());
        u = users.save(u);
        return new Session(tokens.issue(u), Me.of(u));
    }

    @PostMapping("/login")
    public Session login(@Valid @RequestBody LoginRequest req, HttpServletRequest http) {
        limiter.check("login:" + http.getRemoteAddr() + ":" + req.email().toLowerCase(), 10, "Too many sign-in attempts. Try again later.");
        UserAccount u = users.findByEmailIgnoreCase(req.email().trim())
                .filter(x -> x.getPasswordHash() != null && encoder.matches(req.password(), x.getPasswordHash()))
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "BAD_CREDENTIALS", "Email or password is incorrect."));
        return new Session(tokens.issue(u), Me.of(u));
    }

    @GetMapping("/me")
    public Me me() {
        return Me.of(users.findById(CurrentUser.id()).orElseThrow(() -> ApiException.notFound("Account")));
    }

    @PatchMapping("/me")
    @Transactional
    public Me update(@Valid @RequestBody ProfileUpdate req) {
        UserAccount u = users.findById(CurrentUser.id()).orElseThrow(() -> ApiException.notFound("Account"));
        u.setDisplayName(req.name().trim());
        return Me.of(u);
    }
}
