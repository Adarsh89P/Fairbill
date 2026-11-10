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
| GET / POST | `/api/public/shares/{token}`, `/api/public/shares/{token}/participants/{pid}/paid` | — guest |
| GET | `/s/{token}` | — mobile web page for guests (no app, no account) |

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

## Known gaps / next steps

- **Native devices not yet tested**: verified in a phone-sized browser (Expo web). Run on iOS/Android via Expo Go before release.
- **OCR accuracy on real photos**: Tesseract is fine on clear prints but weaker on crumpled thermal receipts. Use Google Vision in production, and consider an AI-vision fallback for complex layouts (not built yet; the `OcrEngine` interface is the plug-in point).
- On-device ML Kit isn't used (it needs a custom dev build); OCR runs on the server.
- Guest "I've paid" is trust-based (anyone with the link can mark a payment); the owner sees who marked it and can undo it.
- Rate limiting is in-memory per instance; use a shared store when scaling out.
- Dockerfile / compose were not built in the dev environment (no Docker daemon).
