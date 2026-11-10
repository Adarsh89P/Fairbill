package com.fairbill.share;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

/** What a guest sees: the final per-person breakdown, computed by the app's split engine. Amounts in minor units. */
public record ShareSnapshot(
        @Size(max = 200) String restaurant,
        @Size(max = 20) String date,
        @NotBlank @Pattern(regexp = "[A-Z]{3}") String currency,
        @NotNull Long total,
        @Size(max = 200) String paidBy,
        @NotNull @Size(min = 1, max = 50) List<@Valid Person> people,
        @NotNull @Size(max = 100) List<@Valid Transfer> transfers) {

    public record Person(@NotBlank @Pattern(regexp = "[A-Za-z0-9_\\-]{1,64}") String id, @NotBlank @Size(max = 80) String name,
                         @NotNull Long total, @NotNull @Size(max = 300) List<@Valid Line> lines) {}

    public record Line(@NotBlank @Size(max = 120) String label, @NotNull Long amount) {}

    public record Transfer(@NotBlank String from, @NotBlank String to, @NotNull Long amount) {}
}
