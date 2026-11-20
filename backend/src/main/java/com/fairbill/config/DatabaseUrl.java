package com.fairbill.config;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Hosted databases (Neon, Render, Railway…) hand out one connection string like
 * {@code postgresql://user:password@host/db?sslmode=require}. Spring needs a JDBC URL plus a separate user and
 * password, so this splits it. Used only when DATABASE_URL is set and FAIRBILL_DB_URL is not.
 */
public final class DatabaseUrl {
    private DatabaseUrl() {}

    public record Jdbc(String url, String username, String password) {}

    public static Jdbc parse(String databaseUrl) {
        URI u = URI.create(databaseUrl.trim());
        String scheme = u.getScheme();
        if (!"postgres".equals(scheme) && !"postgresql".equals(scheme)) {
            throw new IllegalArgumentException("DATABASE_URL must start with postgres:// or postgresql://");
        }
        String user = null, pass = null;
        if (u.getRawUserInfo() != null) {
            String[] parts = u.getRawUserInfo().split(":", 2);
            user = URLDecoder.decode(parts[0], StandardCharsets.UTF_8);
            if (parts.length > 1) pass = URLDecoder.decode(parts[1], StandardCharsets.UTF_8);
        }
        String query = u.getRawQuery() == null ? "" : u.getRawQuery();
        // Hosted databases need TLS; keep their params and require SSL if none was given.
        if (!query.contains("sslmode=")) query = query.isEmpty() ? "sslmode=require" : query + "&sslmode=require";
        // libpq-only params that the JDBC driver rejects.
        query = query.replaceAll("(^|&)channel_binding=[^&]*", "").replaceAll("^&", "");
        String url = "jdbc:postgresql://" + u.getHost() + (u.getPort() > 0 ? ":" + u.getPort() : "") + u.getRawPath() + "?" + query;
        return new Jdbc(url, user, pass);
    }

    /** Applies DATABASE_URL to Spring's datasource settings (as system properties) when needed. */
    public static void applyFrom(Map<String, String> env) {
        String databaseUrl = env.get("DATABASE_URL");
        if (databaseUrl == null || databaseUrl.isBlank() || env.containsKey("FAIRBILL_DB_URL")) return;
        Jdbc j = parse(databaseUrl);
        System.setProperty("spring.datasource.url", j.url());
        if (j.username() != null) System.setProperty("spring.datasource.username", j.username());
        if (j.password() != null) System.setProperty("spring.datasource.password", j.password());
    }
}
