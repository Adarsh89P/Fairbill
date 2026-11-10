package com.fairbill.common;

import java.time.Clock;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/** Small in-memory sliding-window limiter (per instance). */
@Component
public class RateLimiter {
    private final Map<String, Deque<Long>> hits = new ConcurrentHashMap<>();
    private final Clock clock = Clock.systemUTC();

    public void check(String key, int maxPerHour, String message) {
        long now = clock.millis(), cutoff = now - 3_600_000L;
        Deque<Long> q = hits.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (q) {
            while (!q.isEmpty() && q.peekFirst() < cutoff) q.pollFirst();
            if (q.size() >= maxPerHour) throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED", message);
            q.addLast(now);
        }
    }
}
