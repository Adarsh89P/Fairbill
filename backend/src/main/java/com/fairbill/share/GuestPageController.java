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
    private final com.fasterxml.jackson.databind.ObjectMapper mapper;

    public GuestPageController(ShareService service, com.fasterxml.jackson.databind.ObjectMapper mapper) {
        this.service = service;
        this.mapper = mapper;
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
        if ("picking".equals(view.phase())) return picking(token, view);
        if (!"final".equals(view.phase())) {
            return ResponseEntity.ok().contentType(HTML_UTF8).body(shell("FairBill", "<header><div class='brand'>FairBill</div></header>"
                    + "<div class='card'><h2>Not ready yet</h2><p class='muted'>The split for this bill hasn't been shared yet. Check back soon.</p></div>"));
        }
        ShareSnapshot b = view.bill();
        int digits = digits(b.currency());
        String symbol = symbol(b.currency());
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
        if (view.hasPhoto()) sb.append(photoBlock(token));
        sb.append("<p class='muted small center'>Shared with FairBill · amounts reconcile exactly with the restaurant bill</p>");
        sb.append("<script>function markPaid(pid,btn){if(!confirm('Mark this as paid?'))return;btn.disabled=true;")
          .append("fetch('/api/public/shares/").append(esc(token)).append("/participants/'+encodeURIComponent(pid)+'/paid',{method:'POST'})")
          .append(".then(r=>{if(!r.ok)throw 0;btn.outerHTML=\"<span class='pill ok'>Paid</span>\"}).catch(()=>{btn.disabled=false;alert('Could not update. Try again.')})}</script>");
        return ResponseEntity.ok().contentType(HTML_UTF8).body(shell("FairBill · " + (b.restaurant() == null ? "Shared bill" : b.restaurant()), sb.toString()));
    }

    /** Friends tick what they had. Rendered in the browser from the embedded data; works without an account. */
    private ResponseEntity<String> picking(String token, ShareService.ShareView view) {
        ClaimSnapshot c = view.claim();
        String data;
        try {
            data = mapper.writeValueAsString(Map.of("token", token, "claim", c, "picks", view.picks(), "hasPhoto", view.hasPhoto(),
                    "symbol", symbol(c.currency()), "digits", digits(c.currency())));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        // Safe inside <script>: no closing tags or HTML comment openers can appear.
        data = data.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026");
        String title = c.restaurant() == null ? "Shared bill" : c.restaurant();
        StringBuilder sb = new StringBuilder();
        sb.append("<header><div class='brand'>FairBill</div><div class='muted small'>Eat Together. Pay Fairly.</div></header>");
        sb.append("<div class='card hero'><div class='muted'>").append(esc(title)).append("</div><div class='big' style='font-size:26px'>What did you have?</div>")
          .append("<div class='muted small'>Tick your items. Shared dishes are split between everyone who ticks them. You'll get the final amount, with taxes, on this same link.</div></div>");
        sb.append("<h3>Who are you?</h3><div id='people' class='chips'></div>");
        sb.append("<div id='join' class='card' hidden><label for='jn' class='small muted'>Your name</label><div class='row'><input id='jn' maxlength='40' autocomplete='given-name' placeholder='e.g. Priya'><button id='jb'>Add me</button></div></div>");
        sb.append("<div id='items' hidden><h3>Tick what you had</h3><div id='list'></div></div>");
        if (view.hasPhoto()) sb.append(photoBlock(token));
        sb.append("<div id='bar' class='bar' hidden><div><div class='small muted'>Your items so far</div><b id='mine'></b><div class='small muted'>before tax &amp; service</div></div><button id='save'>Save my picks</button></div>");
        sb.append("<p class='muted small center' style='margin-bottom:110px'>Shared with FairBill</p>");
        sb.append("<script id='data' type='application/json'>").append(data).append("</script>");
        sb.append("<script>").append(PICKING_JS).append("</script>");
        return ResponseEntity.ok().contentType(HTML_UTF8).body(shell("FairBill · " + title, sb.toString()));
    }

    private static String photoBlock(String token) {
        return "<details class='card'><summary><span>Photo of the bill</span><span class='muted small'>Tap to view</span></summary>"
                + "<img alt='Photo of the original bill' loading='lazy' src='/api/public/shares/" + esc(token) + "/photo' "
                + "style='width:100%;margin-top:10px;border-radius:10px;border:1px solid var(--line)'>"
                + "<a class='small' href='/api/public/shares/" + esc(token) + "/photo' target='_blank' rel='noopener'>Open full size</a></details>";
    }

    private static final String PICKING_JS = String.join("\n",
        "const D=JSON.parse(document.getElementById('data').textContent);const T=D.token;let C=D.claim,P=D.picks||{};",
        "const KEY='fb.me.'+T;let me=null;try{me=localStorage.getItem(KEY)}catch(e){}",
        "let sel=new Set();let dirty=false;const $=id=>document.getElementById(id);",
        "const money=m=>{const neg=m<0;m=Math.abs(m);const s=D.digits?Math.floor(m/100).toLocaleString('en-IN')+'.'+String(m%100).padStart(2,'0'):m.toLocaleString('en-IN');return(neg?'−':'')+D.symbol+s};",
        "const nameOf=id=>(C.people.find(p=>p.id===id)||{}).name||'Someone';",
        "function el(t,a,txt){const e=document.createElement(t);if(a)for(const k in a)e.setAttribute(k,a[k]);if(txt!=null)e.textContent=txt;return e}",
        "function others(itemId){return Object.keys(P).filter(pid=>pid!==me&&(P[pid]||[]).includes(itemId))}",
        "function renderPeople(){const box=$('people');box.innerHTML='';",
        " for(const p of C.people){const b=el('button',{class:'chip'+(p.id===me?' on':''),'aria-pressed':String(p.id===me)},p.name);b.onclick=()=>choose(p.id);box.appendChild(b)}",
        " const n=el('button',{class:'chip ghost'},'Not on the list?');n.onclick=()=>{$('join').hidden=false;$('jn').focus()};box.appendChild(n)}",
        "function choose(id){if(dirty&&me&&id!==me&&!confirm('Switch person? Unsaved ticks will be lost.'))return;me=id;try{localStorage.setItem(KEY,id)}catch(e){}sel=new Set(P[id]||[]);dirty=false;renderPeople();renderItems()}",
        "function renderItems(){if(!me||!C.people.some(p=>p.id===me)){$('items').hidden=true;$('bar').hidden=true;return}",
        " $('items').hidden=false;$('bar').hidden=false;const list=$('list');list.innerHTML='';",
        " for(const it of C.items){const o=others(it.id);const on=sel.has(it.id);",
        "  const row=el('label',{class:'card item'+(on?' on':'')});const cb=el('input',{type:'checkbox'});cb.checked=on;",
        "  cb.onchange=()=>{cb.checked?sel.add(it.id):sel.delete(it.id);dirty=true;renderItems()};row.appendChild(cb);",
        "  const mid=el('div',{class:'grow'});mid.appendChild(el('div',{class:'iname'},it.name+(it.quantity>1?' × '+it.quantity:'')));",
        "  mid.appendChild(el('div',{class:'small muted'},o.length?'Also ticked by '+o.map(nameOf).join(', '):'Nobody else yet'));row.appendChild(mid);",
        "  row.appendChild(el('b',{class:'r'},money(it.amount)));list.appendChild(row)}",
        " let t=0;for(const it of C.items)if(sel.has(it.id))t+=Math.round(it.amount/(others(it.id).length+1));$('mine').textContent='≈ '+money(t);",
        " const s=$('save');s.textContent=dirty?'Save my picks':'Saved ✓';s.disabled=!dirty}",
        "async function call(method,path,body){const r=await fetch('/api/public/shares/'+encodeURIComponent(T)+path,{method,headers:{'Content-Type':'application/json'},body:body&&JSON.stringify(body)});",
        " const j=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(j.message||'Something went wrong. Try again.');e.code=j.code;throw e}return j}",
        "function apply(v){if(v.phase!=='picking'){location.reload();return}C=v.claim;P=v.picks||{};renderPeople();renderItems()}",
        "$('save').onclick=async()=>{const b=$('save');b.disabled=true;b.textContent='Saving…';try{const v=await call('PUT','/picks/'+encodeURIComponent(me),{itemIds:[...sel]});dirty=false;apply(v)}",
        " catch(e){alert(e.message);if(e.code==='PICKING_CLOSED')location.reload();b.disabled=false;b.textContent='Save my picks'}};",
        "$('jb').onclick=async()=>{const n=$('jn').value.trim();if(!n)return;try{const r=await call('POST','/guests',{name:n});$('join').hidden=true;C=r.share.claim;P=r.share.picks||{};choose(r.participantId)}catch(e){alert(e.message)}};",
        "$('jn').onkeydown=e=>{if(e.key==='Enter')$('jb').click()};",
        "setInterval(async()=>{if(document.hidden)return;try{const v=await call('GET','');if(v.phase!=='picking'){if(!dirty)location.reload();return}C=v.claim;P=v.picks||{};if(!dirty&&me)sel=new Set(P[me]||[]);renderPeople();renderItems()}catch(e){}},15000);",
        "if(me&&!C.people.some(p=>p.id===me))me=null;if(me)sel=new Set(P[me]||[]);renderPeople();renderItems();");

    static int digits(String currency) {
        return "JPY".equals(currency) ? 0 : 2;
    }

    static String symbol(String currency) {
        return switch (currency) {
            case "INR" -> "₹"; case "USD" -> "$"; case "EUR" -> "€"; case "GBP" -> "£"; case "JPY" -> "¥"; case "SGD" -> "S$";
            default -> currency + " ";
        };
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
                + ".chips{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}.chip{background:var(--card);color:var(--text);border:1.5px solid var(--line);border-radius:999px;padding:10px 16px}"
                + ".chip.on{background:var(--brand);color:#fff;border-color:var(--brand)}.chip.ghost{border-style:dashed;color:var(--muted)}"
                + ".item{display:flex;align-items:center;gap:12px;cursor:pointer}.item.on{border-color:var(--brand);box-shadow:0 0 0 1px var(--brand) inset}"
                + ".item input{width:22px;height:22px;accent-color:var(--brand);flex:none}.grow{flex:1;min-width:0}.iname{font-weight:600}"
                + "input:not([type]),input[type=text]{flex:1;font:inherit;padding:11px 12px;border-radius:12px;border:1.5px solid var(--line);background:var(--bg);color:var(--text);min-width:0}"
                + ".bar{position:fixed;left:0;right:0;bottom:0;background:var(--card);border-top:1px solid var(--line);padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px}"
                + ".bar>div{max-width:300px}button:disabled{opacity:.6}a{color:var(--brand)}"
                + "</style></head><body>" + body + "</body></html>";
    }
}
