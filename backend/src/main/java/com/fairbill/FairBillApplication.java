package com.fairbill;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@ConfigurationPropertiesScan
@EnableScheduling
public class FairBillApplication {
    public static void main(String[] args) {
        // Hosted databases give one DATABASE_URL; turn it into Spring's datasource settings.
        com.fairbill.config.DatabaseUrl.applyFrom(System.getenv());
        SpringApplication.run(FairBillApplication.class, args);
    }
}
