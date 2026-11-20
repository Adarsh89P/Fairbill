# FairBill — Eat Together. Pay Fairly.

Indian-first restaurant bill splitting. Scan a bill, check what was read, say who had what, and get an exact per-person breakdown that reconciles to the paisa with the restaurant total.

```
fairbill/
├── mobile/    React Native + Expo (SDK 58, TypeScript, Expo Router) — runs on iOS, Android and web
└── backend/   Java 21 + Spring Boot 3.5 REST API, PostgreSQL (Flyway), Tesseract / Google Vision OCR
```

## How it fits together

**Receipt extraction engine** (`backend/src/main/java/com/fairbill/extraction`) — knows nothing about people or splitting:

```
image ─► quality check ─► OCR ─► structured extraction ─► confidence validation ─► missing-field detection ─► JSON
         (blur, dark,     (Tesseract   (ReceiptParser:        (ExtractionValidator:   (missingFields,
          size, rotation)  or Google    items, qty×rate,       items vs subtotal,      uncertainFields,
                           Vision)      CGST/SGST/IGST, SC,    subtotal+charges vs     warnings)
                                        packaging, discount,   total, CGST≠SGST,
                                        round-off, totals)     duplicates)
```

Every field carries `value`, `confidence`, `status` (`ok` / `verify` / `missing`), the raw OCR `text` and a bounding `box`. A field is `ok` only at ≥ 85 % OCR confidence; arithmetic that doesn't add up downgrades it to `verify`. Unreadable values are `missing` — never guessed.

**Bill calculation engine** (`mobile/src/engine`) — pure TypeScript, runs offline:

- All money is integer minor units (paise). No floats in calculations.
- `allocate()` uses the largest-remainder method, so every split sums exactly to its input — rounding never creates or loses a paisa.
- Items: sole, equal, percentage or quantity shares.
- Charges: per-type rule — equally, by consumption (proportional) or custom. Defaults: GST/CGST/SGST/IGST equal, service equal, discount proportional, tip custom.
- Taxes are copied from the bill and only *distributed*; FairBill never recalculates tax.
- Settlement: who owes whom (supports multiple payers), with paid/pending status.

## Run it locally

**Backend** (needs Java 21, Maven, PostgreSQL 16, `tesseract-ocr`):

```bash
createdb fairbill   # user/password default to fairbill/fairbill — see application.yml
cd backend
FAIRBILL_JWT_SECRET=$(openssl rand -base64 32) mvn spring-boot:run
```

Or with Docker: `docker compose up --build` (PostgreSQL + API with Tesseract).

| Env var | Purpose |
|---|---|
| `FAIRBILL_DB_URL` / `_USER` / `_PASSWORD` | PostgreSQL connection |
| `FAIRBILL_JWT_SECRET` | base64, ≥ 32 bytes. If unset a random key is used and sessions reset on restart |
| `FAIRBILL_PUBLIC_URL` | Base URL used in share links / QR codes (must be reachable by friends' phones) |
| `GOOGLE_VISION_API_KEY` | Optional. When set, Google Vision is used instead of Tesseract (better on phone photos) |
| `FAIRBILL_OCR_ENGINE` | `auto` (default), `tesseract` or `google-vision` |
| `FAIRBILL_CORS_ORIGINS` | Allowed web origins (Expo web dev server) |

**App:**

```bash
cd mobile
npm install
EXPO_PUBLIC_API_URL=http://<your-computer-LAN-IP>:8080 npx expo start   # scan the QR with Expo Go, or press w for web
```

Manual bills, splitting, history, groups, stats, WhatsApp/copy/PDF all work with no server. Scanning and QR guest links need the backend.

**Web app on GitHub Pages** (published from the `gh-pages` branch):

```bash
cd mobile
npm run build:pages   # copies the in-browser bill reader into public/ocr, exports for /Fairbill/, adds 404.html
```

Then put the contents of `dist-pages/` on the `gh-pages` branch. With no server, the web app reads bill photos in the browser (below); friend links and photo sharing still need the server.

**Tests:**

```bash
cd mobile && npm test && npx tsc --noEmit    # engine + extraction mapper
cd backend && mvn test                        # parser, real Tesseract pipeline, API flow (H2)
```

## API

| Method | Path | Auth |
|---|---|---|
| POST | `/api/auth/anonymous` · `/register` · `/login` | — (anonymous device account is created silently; register upgrades it) |
| GET/PATCH | `/api/auth/me` | Bearer |
| POST | `/api/receipts/scan?store=false` (multipart `image`) | Bearer — photo discarded after reading unless `store=true` (kept 30 days) |
| GET/DELETE | `/api/receipts/{id}/image`, `/api/receipts/{id}`, `/api/receipts` | Bearer, owner only |
| GET/PUT/DELETE | `/api/bills`, `/api/bills/{id}` | Bearer — backup/sync |
| POST | `/api/shares` | Bearer — server re-checks that every person's lines and all shares add up before publishing |
| GET / POST / DELETE | `/api/shares/{token}`, `/api/shares/{token}/participants/{pid}/paid` | Bearer, owner |
| POST | `/api/shares/picking` | Bearer — opens (or reopens) the bill's link for friends to tick their items |
| PUT / DELETE | `/api/shares/{token}/photo` (multipart `image`) | Bearer, owner — photo is downsized and re-encoded as JPEG, so EXIF/GPS is dropped |
| GET / POST | `/api/public/shares/{token}`, `/api/public/shares/{token}/participants/{pid}/paid` | — guest |
| PUT | `/api/public/shares/{token}/picks/{pid}` (`{"itemIds":[…]}`) | — guest, only while picking is open |
| POST | `/api/public/shares/{token}/guests` (`{"name":"…"}`) | — guest not on the list adds themselves |
| GET | `/api/public/shares/{token}/photo` | — guest |
| GET | `/s/{token}` | — mobile web page for guests (no app, no account). One link per bill: item picking first, the final split once published |

## Status by phase

| Phase | State |
|---|---|
| 1. UI/UX & navigation | Done — Home, My Bills, Groups, Profile; light/dark; accessible labels/roles |
| 2. Manual bill + splitting engine | Done — unit tested |
| 3. Upload + OCR | Done with Tesseract (tested end to end). Google Vision engine written but **not tested** (no key here) |
| 4. Validation & manual correction | Done — Review Required (Successfully Extracted / Needs Verification / Not Detected), edit/add/delete, retake, confirm blocked until resolved and reconciled |
| 5. Assignment & tax distribution | Done |
| 6. QR guest sharing & settlement | Done — guest page, "I've paid", synced back to the app |
| 7. Testing / security / deployment | Partly — see below |

## Features added after the first version

- **Design refresh (from the Figma file)**: indigo brand color with cool-grey neutrals (light and dark); bottom nav Home · My Bills · **Scan** (raised center button) · Trips · Groups; Home starts with your profile photo, greeting and name (tap → Profile, where you add or change the photo) and a bell that shows a dot while payments are still open.
- **Live bill scanner (web)**: the camera view finds all four edges of the bill (`mobile/src/lib/docScan.ts`: Otsu threshold → largest light region → corners, must look like a rectangle and not run off the frame), auto-captures when it holds still for about a second, then straightens and crops it with a perspective transform before reading. "Long bill · scan in parts" captures several parts and stacks them. After reading, a "Ready to split?" sheet shows the restaurant, item count and total; the bill is saved only on "Review & split". Without camera access (or in the phone apps, which have no camera module in Expo Go) it falls back to taking or choosing a photo.

- **Scanning without a server (web)**: when no FairBill server answers, the web app reads the bill in the browser with Tesseract.js and a TypeScript port of the server's parser and validator (`mobile/src/extraction/local`, same tests as `ReceiptParserTest`). The reader (~7 MB) is served by the site, starts downloading when Scan is tapped and is cached afterwards. For hard photos it tries a second, adaptive black-and-white pass (shadows, creases, photos of screens) and turned versions for sideways photos, corrects for tilt when grouping rows, and when a misread amount disagrees with its own quantity × rate it uses qty × rate if that is what makes the items match the printed subtotal (still marked for review).

- **Check values on the photo**: the scanner reports where each value sits on the photo (mapped back through its own scaling and rotation). Flagged items, taxes, the total and the date show a zoomed strip of that line with the value outlined; the full photo outlines every value to check.
- **Friends tick their own items**: from *Who had what?*, send one link; each friend picks what they had (or adds themselves if they weren't listed). Their picks fill in the assignments; shared dishes are split equally between everyone who ticked them. The same link later shows the final split.
- **Everyone except…**: share several items at once between everybody but the people you tap out.
- **Trips**: group bills into a trip (new bills join the active trip automatically) and settle up once, with the fewest payments. Friends are matched across bills by phone number, then by name. Unfinished bills and other currencies are listed, not counted.
- **Bill photo on the shared link**: on by default, switchable per bill; bills entered by hand can attach a photo.

## Known gaps / next steps

- **Native devices not yet tested**: verified in a phone-sized browser (Expo web). Run on iOS/Android via Expo Go before release.
- **OCR accuracy on real photos**: Tesseract is fine on clear prints but weaker on crumpled thermal receipts. Use Google Vision in production, and consider an AI-vision fallback for complex layouts (not built yet; the `OcrEngine` interface is the plug-in point).
- On-device ML Kit isn't used (it needs a custom dev build); OCR runs on the server.
- Item picking is trust-based too: anyone with the link can tick items for any name on it. The payer reviews picks before using them.
- Picks for items with quantity > 1 are split equally between the people who ticked them; uneven counts (3 beers vs 1) are adjusted in the app.
- The tilt correction and the qty × rate repair exist only in the in-browser reader so far; port them to the server's `LineAssembler` / `ExtractionValidator`.
- Long-bill parts are stacked as captured; overlapping lines can show up twice and are flagged as possible duplicates on Review.
- The phone apps still use the phone's camera app for scanning; a live scanner there needs `expo-camera` and a development build.
- Trips are stored on the device only (not yet synced to the server).
- Guest "I've paid" is trust-based (anyone with the link can mark a payment); the owner sees who marked it and can undo it.
- Rate limiting is in-memory per instance; use a shared store when scaling out.
- Dockerfile / compose were not built in the dev environment (no Docker daemon).
