package com.fairbill.share;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

/** The items friends can pick from and the people on the bill so far. Amounts in minor units. */
public record ClaimSnapshot(
        @Size(max = 200) String restaurant,
        @NotBlank @Pattern(regexp = "[A-Z]{3}") String currency,
        @NotNull @Size(min = 1, max = 200) List<@Valid Item> items,
        @NotNull @Size(min = 1, max = 50) List<@Valid Person> people) {

    public record Item(@NotBlank @Pattern(regexp = ShareSnapshot.ID) String id, @NotBlank @Size(max = 120) String name,
                       @NotNull Long amount, @Min(1) Integer quantity) {}

    public record Person(@NotBlank @Pattern(regexp = ShareSnapshot.ID) String id, @NotBlank @Size(max = 80) String name, Boolean guest) {}
}
