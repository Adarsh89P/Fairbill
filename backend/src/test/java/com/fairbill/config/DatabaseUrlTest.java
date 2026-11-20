package com.fairbill.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class DatabaseUrlTest {
    @Test
    void splitsANeonConnectionString() {
        var j = DatabaseUrl.parse("postgresql://fairbill_owner:p%40ss:w0rd@ep-cool-name-123.ap-southeast-1.aws.neon.tech/fairbill?sslmode=require&channel_binding=require");
        assertThat(j.url()).isEqualTo("jdbc:postgresql://ep-cool-name-123.ap-southeast-1.aws.neon.tech/fairbill?sslmode=require");
        assertThat(j.username()).isEqualTo("fairbill_owner");
        assertThat(j.password()).isEqualTo("p@ss:w0rd");
    }

    @Test
    void addsSslAndKeepsThePort() {
        var j = DatabaseUrl.parse("postgres://u:p@db.example.com:6543/app");
        assertThat(j.url()).isEqualTo("jdbc:postgresql://db.example.com:6543/app?sslmode=require");
    }
}
