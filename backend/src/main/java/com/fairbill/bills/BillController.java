package com.fairbill.bills;

import com.fairbill.auth.CurrentUser;
import com.fairbill.common.ApiException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Backup/sync of bills between the user's devices. */
@RestController
@RequestMapping("/api/bills")
public class BillController {
    private static final int MAX_PAYLOAD = 512 * 1024;
    private final BillRepository bills;
    private final ObjectMapper mapper;

    public BillController(BillRepository bills, ObjectMapper mapper) {
        this.bills = bills;
        this.mapper = mapper;
    }

    @GetMapping
    public List<JsonNode> list() {
        return bills.findTop200ByOwnerIdOrderByUpdatedAtDesc(CurrentUser.id()).stream().map(b -> read(b.getPayload())).toList();
    }

    @GetMapping("/{clientId}")
    public JsonNode get(@PathVariable String clientId) {
        return read(bills.findByOwnerIdAndClientId(CurrentUser.id(), clientId).orElseThrow(() -> ApiException.notFound("Bill")).getPayload());
    }

    @PutMapping("/{clientId}")
    @Transactional
    public JsonNode put(@PathVariable String clientId, @RequestBody JsonNode bill) {
        if (!clientId.matches("[A-Za-z0-9_\\-]{1,64}")) throw ApiException.badRequest("BAD_ID", "Invalid bill id.");
        if (!clientId.equals(bill.path("id").asText())) throw ApiException.badRequest("ID_MISMATCH", "Bill id does not match.");
        String json;
        try {
            json = mapper.writeValueAsString(bill);
        } catch (Exception e) {
            throw ApiException.badRequest("BAD_JSON", "Invalid bill.");
        }
        if (json.length() > MAX_PAYLOAD) throw ApiException.badRequest("TOO_LARGE", "Bill is too large to sync.");
        var uid = CurrentUser.id();
        StoredBill b = bills.findByOwnerIdAndClientId(uid, clientId).orElseGet(() -> new StoredBill(uid, clientId));
        JsonNode total = bill.path("total").path("value");
        b.update(trim(bill.path("restaurant").path("value").asText(null), 200),
                trim(bill.path("currency").asText("INR"), 3),
                total.canConvertToLong() ? total.asLong() : null,
                date(bill.path("date").path("value").asText(null)),
                trim(bill.path("status").asText("draft"), 16),
                json);
        bills.save(b);
        return bill;
    }

    @DeleteMapping("/{clientId}")
    @Transactional
    public void delete(@PathVariable String clientId) {
        bills.deleteByOwnerIdAndClientId(CurrentUser.id(), clientId);
    }

    private JsonNode read(String json) {
        try {
            return mapper.readTree(json);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String trim(String s, int max) {
        return s == null ? null : s.length() > max ? s.substring(0, max) : s;
    }

    private static LocalDate date(String s) {
        try {
            return s == null ? null : LocalDate.parse(s);
        } catch (DateTimeParseException e) {
            return null;
        }
    }
}
