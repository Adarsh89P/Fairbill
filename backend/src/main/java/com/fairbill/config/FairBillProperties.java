package com.fairbill.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "fairbill")
public record FairBillProperties(String publicBaseUrl, Jwt jwt, Cors cors, Receipts receipts, Limits limits) {
    public record Jwt(String secret, int ttlDays) {}
    public record Cors(List<String> allowedOrigins) {}
    public record Receipts(int retentionDays) {}
    public record Limits(int scansPerHour, int accountsPerIpPerHour) {}
}
