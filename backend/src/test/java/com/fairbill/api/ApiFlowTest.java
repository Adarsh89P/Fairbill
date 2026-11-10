package com.fairbill.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fairbill.extraction.TesseractPipelineTest;
import com.fairbill.extraction.image.Images;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ApiFlowTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;

    String anonToken() throws Exception {
        String body = mvc.perform(post("/api/auth/anonymous").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Adarsh\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return mapper.readTree(body).path("token").asText();
    }

    @Test
    void protectedEndpointsNeedAToken() throws Exception {
        mvc.perform(get("/api/bills")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/bills").header("Authorization", "Bearer not-a-jwt")).andExpect(status().isUnauthorized());
    }

    @Test
    void registerUpgradesAnonymousAndLoginWorks() throws Exception {
        String t = anonToken();
        mvc.perform(post("/api/auth/register").header("Authorization", "Bearer " + t).contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"a@example.com\",\"password\":\"correct horse\",\"name\":\"Adarsh\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.user.anonymous").value(false));
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"A@example.com\",\"password\":\"wrong pass\"}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"A@example.com\",\"password\":\"correct horse\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.user.name").value("Adarsh"));
    }

    @Test
    void scanSyncShareAndGuestPayFlow() throws Exception {
        String auth = "Bearer " + anonToken();

        // scan: rejects non-images clearly, reads a real receipt image
        mvc.perform(multipart("/api/receipts/scan").file(new MockMultipartFile("image", "x.png", "image/png", new byte[]{1, 2, 3})).header("Authorization", auth))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("UNREADABLE_IMAGE"));
        byte[] png = Images.png(TesseractPipelineTest.render(TesseractPipelineTest.RECEIPT));
        var scan = mvc.perform(multipart("/api/receipts/scan").file(new MockMultipartFile("image", "bill.png", "image/png", png))
                        .param("store", "true").header("Authorization", auth)).andReturn().getResponse();
        if (scan.getStatus() == 200) {
            JsonNode r = mapper.readTree(scan.getContentAsString());
            assertThat(r.path("total").path("value").asText()).isEqualTo("945.00");
            assertThat(r.path("receiptId").asText()).isNotBlank();
            mvc.perform(get("/api/receipts/" + r.path("receiptId").asText() + "/image").header("Authorization", auth)).andExpect(status().isOk());
            mvc.perform(get("/api/receipts/" + r.path("receiptId").asText() + "/image").header("Authorization", "Bearer " + anonToken())).andExpect(status().isNotFound());
        } else {
            assertThat(scan.getStatus()).isEqualTo(503); // no OCR engine on this machine
        }

        // bill sync
        String bill = "{\"id\":\"bill_1\",\"status\":\"final\",\"currency\":\"INR\",\"restaurant\":{\"value\":\"Spice Garden\"},\"total\":{\"value\":68000},\"date\":{\"value\":\"2025-09-14\"}}";
        mvc.perform(put("/api/bills/bill_1").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(bill)).andExpect(status().isOk());
        mvc.perform(get("/api/bills").header("Authorization", auth)).andExpect(jsonPath("$[0].id").value("bill_1"));

        // share: server rejects a summary that does not reconcile
        String bad = "{\"billId\":\"bill_1\",\"bill\":{\"restaurant\":\"Spice Garden\",\"currency\":\"INR\",\"total\":68000,\"people\":["
                + "{\"id\":\"a\",\"name\":\"Adarsh\",\"total\":41500,\"lines\":[{\"label\":\"Biryani\",\"amount\":41500}]},"
                + "{\"id\":\"r\",\"name\":\"Rahul\",\"total\":26400,\"lines\":[{\"label\":\"Tikka\",\"amount\":26400}]}],\"transfers\":[]}}";
        mvc.perform(post("/api/shares").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(bad))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("TOTAL_MISMATCH"));

        String good = bad.replace("26400", "26500").replace("\"transfers\":[]", "\"transfers\":[{\"from\":\"r\",\"to\":\"a\",\"amount\":26500}]")
                .replace("\"currency\"", "\"paidBy\":\"Adarsh\",\"currency\"");
        JsonNode share = mapper.readTree(mvc.perform(post("/api/shares").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(good))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        String token = share.path("token").asText();
        assertThat(share.path("url").asText()).endsWith("/s/" + token);

        // guest: no account needed
        String html = mvc.perform(get("/s/" + token)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(html).contains("Spice Garden", "₹680.00", "Rahul", "I've paid");
        mvc.perform(post("/api/public/shares/" + token + "/participants/r/paid")).andExpect(status().isOk())
                .andExpect(jsonPath("$.paid.r.by").value("guest"));
        mvc.perform(get("/api/shares/" + token).header("Authorization", auth)).andExpect(jsonPath("$.paid.r").exists());
        mvc.perform(get("/s/doesnotexist")).andExpect(status().isNotFound());
        // other users cannot read the owner's share status
        mvc.perform(get("/api/shares/" + token).header("Authorization", "Bearer " + anonToken())).andExpect(status().isNotFound());
    }

    @Test
    void friendsPickTheirItemsThenSeeTheFinalSplitOnTheSameLink() throws Exception {
        String auth = "Bearer " + anonToken();
        String claim = "{\"billId\":\"bill_9\",\"claim\":{\"restaurant\":\"Spice Garden\",\"currency\":\"INR\","
                + "\"items\":[{\"id\":\"i1\",\"name\":\"Biryani\",\"amount\":50000,\"quantity\":1},{\"id\":\"i2\",\"name\":\"Beer <b>\",\"amount\":60000,\"quantity\":2}],"
                + "\"people\":[{\"id\":\"a\",\"name\":\"Adarsh\"},{\"id\":\"r\",\"name\":\"Rahul\"}]}}";
        JsonNode v = mapper.readTree(mvc.perform(post("/api/shares/picking").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(claim))
                .andExpect(status().isOk()).andExpect(jsonPath("$.phase").value("picking")).andReturn().getResponse().getContentAsString());
        String token = v.path("token").asText();

        String html = mvc.perform(get("/s/" + token)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(html).contains("What did you have?", "Rahul").doesNotContain("Beer <b>");

        // a listed friend picks; unknown items and unknown people are refused
        mvc.perform(put("/api/public/shares/" + token + "/picks/r").contentType(MediaType.APPLICATION_JSON).content("{\"itemIds\":[\"i1\",\"i2\"]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.picks.r[1]").value("i2"));
        mvc.perform(put("/api/public/shares/" + token + "/picks/r").contentType(MediaType.APPLICATION_JSON).content("{\"itemIds\":[\"nope\"]}"))
                .andExpect(status().isBadRequest());
        mvc.perform(put("/api/public/shares/" + token + "/picks/zz").contentType(MediaType.APPLICATION_JSON).content("{\"itemIds\":[]}"))
                .andExpect(status().isNotFound());

        // someone not on the list adds themselves; adding the same name again returns the same person
        JsonNode joined = mapper.readTree(mvc.perform(post("/api/public/shares/" + token + "/guests").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"  Priya \"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        String priya = joined.path("participantId").asText();
        assertThat(priya).startsWith("g_");
        mvc.perform(post("/api/public/shares/" + token + "/guests").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"priya\"}"))
                .andExpect(jsonPath("$.participantId").value(priya));
        mvc.perform(put("/api/public/shares/" + token + "/picks/" + priya).contentType(MediaType.APPLICATION_JSON).content("{\"itemIds\":[\"i2\"]}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/shares/" + token).header("Authorization", auth))
                .andExpect(jsonPath("$.claim.people[2].name").value("Priya")).andExpect(jsonPath("$.claim.people[2].guest").value(true))
                .andExpect(jsonPath("$.picks." + priya + "[0]").value("i2"));

        // bill photo: must be a real image; stored re-encoded as JPEG and visible to guests
        mvc.perform(multipart("/api/shares/" + token + "/photo").file(new MockMultipartFile("image", "x.jpg", "image/jpeg", new byte[]{1, 2, 3}))
                .with(r -> { r.setMethod("PUT"); return r; }).header("Authorization", auth)).andExpect(status().isBadRequest());
        byte[] png = Images.png(TesseractPipelineTest.render(TesseractPipelineTest.RECEIPT));
        mvc.perform(multipart("/api/shares/" + token + "/photo").file(new MockMultipartFile("image", "bill.png", "image/png", png))
                .with(r -> { r.setMethod("PUT"); return r; }).header("Authorization", auth)).andExpect(jsonPath("$.hasPhoto").value(true));
        byte[] served = mvc.perform(get("/api/public/shares/" + token + "/photo")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();
        assertThat(served[0] & 0xff).isEqualTo(0xFF);
        assertThat(served[1] & 0xff).isEqualTo(0xD8); // JPEG
        // only the owner can attach a photo
        mvc.perform(multipart("/api/shares/" + token + "/photo").file(new MockMultipartFile("image", "bill.png", "image/png", png))
                .with(r -> { r.setMethod("PUT"); return r; }).header("Authorization", "Bearer " + anonToken())).andExpect(status().isNotFound());

        // publishing the split closes picking; the same link now shows amounts
        String fin = "{\"billId\":\"bill_9\",\"bill\":{\"restaurant\":\"Spice Garden\",\"currency\":\"INR\",\"total\":110000,\"people\":["
                + "{\"id\":\"a\",\"name\":\"Adarsh\",\"total\":0,\"lines\":[]},"
                + "{\"id\":\"r\",\"name\":\"Rahul\",\"total\":80000,\"lines\":[{\"label\":\"Biryani\",\"amount\":50000},{\"label\":\"Beer\",\"amount\":30000}]},"
                + "{\"id\":\"" + priya + "\",\"name\":\"Priya\",\"total\":30000,\"lines\":[{\"label\":\"Beer\",\"amount\":30000}]}],"
                + "\"transfers\":[{\"from\":\"r\",\"to\":\"a\",\"amount\":80000},{\"from\":\"" + priya + "\",\"to\":\"a\",\"amount\":30000}]}}";
        mvc.perform(post("/api/shares").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(fin))
                .andExpect(jsonPath("$.token").value(token)).andExpect(jsonPath("$.phase").value("final"));
        mvc.perform(put("/api/public/shares/" + token + "/picks/r").contentType(MediaType.APPLICATION_JSON).content("{\"itemIds\":[]}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PICKING_CLOSED"));
        html = mvc.perform(get("/s/" + token)).andReturn().getResponse().getContentAsString();
        assertThat(html).contains("Who owes what", "Priya", "Photo of the bill");
    }
}
