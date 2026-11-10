package com.fairbill.share;

import com.fairbill.common.ApiException;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.HtmlUtils;

/** Mobile web page for guests who open the shared link or scan the QR code — no app or account needed. */
@RestController
public class GuestPageController {
    private static final MediaType HTML_UTF8 = new MediaType("text", "html", java.nio.charset.StandardCharsets.UTF_8);
    private final ShareService service;

    public GuestPageController(ShareService service) {
        this.service = service;
    }

    @GetMapping(value = "/s/{token}", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> page(@PathVariable String token) {
        ShareService.ShareView view;
        try {
            view = service.publicView(token);
        } catch (ApiException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).contentType(HTML_UTF8)
                    .body(shell("Bill not found", "<div class='card'><h2>This bill link is no longer available</h2><p class='muted'>Ask the person who shared it for a new link.</p></div>"));
        }
        ShareSnapshot b = view.bill();
        int digits = "JPY".equals(b.currency()) ? 0 : 2;
        String symbol = switch (b.currency()) {
            case "INR" -> "₹"; case "USD" -> "$"; case "EUR" -> "€"; case "GBP" -> "£"; case "JPY" -> "¥"; case "SGD" -> "S$";
            default -> b.currency() + " ";
        };
        Map<String, String> names = new java.util.HashMap<>();
        b.people().forEach(p -> names.put(p.id(), p.name()));

        StringBuilder sb = new StringBuilder();
        sb.append("<header><div class='brand'>FairBill</div><div class='muted small'>Eat Together. Pay Fairly.</div></header>");
        sb.append("<div class='card hero'><div class='muted'>").append(esc(b.restaurant() == null ? "Restaurant bill" : b.restaurant()))
          .append(b.date() == null ? "" : " · " + esc(prettyDate(b.date()))).append("</div><div class='big'>")
          .append(money(b.total(), symbol, digits)).append("</div><div class='muted small'>Total bill")
          .append(b.paidBy() == null ? "" : " · paid by " + esc(b.paidBy())).append("</div></div>");

        sb.append("<h3>Who owes what</h3>");
        if (b.transfers().isEmpty()) sb.append("<div class='card muted'>Nobody owes anything.</div>");
        for (ShareSnapshot.Transfer t : b.transfers()) {
            boolean paid = view.paid().containsKey(t.from());
            sb.append("<div class='card row'><div><b>").append(esc(names.get(t.from()))).append("</b> pays <b>")
              .append(esc(names.get(t.to()))).append("</b><div class='amount'>").append(money(t.amount(), symbol, digits)).append("</div></div>");
            if (paid) sb.append("<span class='pill ok'>Paid</span>");
            else sb.append("<button onclick=\"markPaid('").append(esc(t.from())).append("', this)\">I've paid</button>");
            sb.append("</div>");
        }

        sb.append("<h3>Breakdown</h3>");
        for (ShareSnapshot.Person p : b.people()) {
            sb.append("<details class='card'><summary><span>").append(esc(p.name())).append("</span><b>")
              .append(money(p.total(), symbol, digits)).append("</b></summary><table>");
            for (ShareSnapshot.Line l : p.lines()) {
                sb.append("<tr><td>").append(esc(l.label())).append("</td><td class='r'>").append(money(l.amount(), symbol, digits)).append("</td></tr>");
            }
            sb.append("</table></details>");
        }
        sb.append("<p class='muted small center'>Shared with FairBill · amounts reconcile exactly with the restaurant bill</p>");
        sb.append("<script>function markPaid(pid,btn){if(!confirm('Mark this as paid?'))return;btn.disabled=true;")
          .append("fetch('/api/public/shares/").append(esc(token)).append("/participants/'+encodeURIComponent(pid)+'/paid',{method:'POST'})")
          .append(".then(r=>{if(!r.ok)throw 0;btn.outerHTML=\"<span class='pill ok'>Paid</span>\"}).catch(()=>{btn.disabled=false;alert('Could not update. Try again.')})}</script>");
        return ResponseEntity.ok().contentType(HTML_UTF8).body(shell("FairBill · " + (b.restaurant() == null ? "Shared bill" : b.restaurant()), sb.toString()));
    }

    static String money(long minor, String symbol, int digits) {
        boolean neg = minor < 0;
        long abs = Math.abs(minor);
        String s;
        if (digits == 0) s = String.valueOf(abs);
        else s = (abs / 100) + "." + String.format("%02d", abs % 100);
        return (neg ? "−" : "") + esc(symbol) + s;
    }

    static String prettyDate(String iso) {
        try {
            return java.time.LocalDate.parse(iso).format(java.time.format.DateTimeFormatter.ofPattern("d MMM yyyy", java.util.Locale.ENGLISH));
        } catch (RuntimeException e) {
            return iso;
        }
    }

    static String esc(String s) {
        return s == null ? "" : HtmlUtils.htmlEscape(s);
    }

    private static String shell(String title, String body) {
        return "<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
                + "<meta name='robots' content='noindex'><title>" + esc(title) + "</title><style>"
                + ":root{--bg:#F6F8F7;--card:#fff;--text:#0F1F17;--muted:#5B6B63;--brand:#0B6E4F;--line:#E3E9E6}"
                + "@media(prefers-color-scheme:dark){:root{--bg:#0B1210;--card:#131D19;--text:#E8F0EC;--muted:#93A39B;--brand:#3FC28F;--line:#22302A}}"
                + "*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.45 -apple-system,system-ui,Segoe UI,Roboto,sans-serif;padding:16px;max-width:560px;margin:auto}"
                + "header{margin:8px 0 16px}.brand{font-weight:800;font-size:22px;color:var(--brand)}.muted{color:var(--muted)}.small{font-size:13px}.center{text-align:center}"
                + ".card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px 16px;margin:10px 0}.hero .big{font-size:34px;font-weight:800;margin:4px 0}"
                + ".row{display:flex;align-items:center;justify-content:space-between;gap:12px}.amount{font-size:20px;font-weight:700;margin-top:2px}"
                + "button{background:var(--brand);color:#fff;border:0;border-radius:12px;padding:12px 16px;font-size:15px;font-weight:600;min-height:44px}"
                + ".pill{border-radius:999px;padding:6px 12px;font-weight:600;font-size:14px}.ok{background:#DDF3EA;color:#0B6E4F}"
                + "summary{display:flex;justify-content:space-between;cursor:pointer;list-style:none;font-size:17px}table{width:100%;margin-top:8px;border-collapse:collapse}"
                + "td{padding:6px 0;border-top:1px solid var(--line);font-size:15px}.r{text-align:right;white-space:nowrap}h3{margin:22px 0 4px}"
                + "</style></head><body>" + body + "</body></html>";
    }
}
