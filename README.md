# Kriya — AI-Powered Artisan Listing App (SIH 2026)

Kriya lets a marginalized artisan turn a **photo + a spoken description
in their own language** into a complete, ready-to-publish product
listing — no typing, no English required. Built for the SIH hackathon
as a full-stack project: a Node.js/Express AI backend and a React
Native (Expo) mobile app, shipped as a real installable Android app.

This README covers the backend module. See `frontend/` for the mobile
app, and `HANDOFF.md` for a deeper technical writeup of individual
design decisions.

## What it does

1. **`enhanceImage(imagePath)`** — removes the photo background and
   fixes lighting/contrast (`@imgly/background-removal-node` + `sharp`),
   saves the result to `output/`. Falls back to the original photo if
   it fails, rather than crashing the pipeline.
2. **`transcribeVoice(audioPath, language)`** — sends the audio
   recording to Gemini (which understands audio directly) and gets back
   a text transcript in the original language/script spoken. Works in
   **any language**, not just Hindi/English — `language` is only an
   optional accuracy hint.
3. **`generateListing({ transcriptText, imagePath, category })`** —
   sends the photo + transcript to Gemini in one call and gets back:
   - a short **title**, and full descriptions in **English, Hindi, and
     the artisan's own detected language**
   - a **craft story**, **category**, **material quality tier**, **size
     tier**, **eco/sustainability rating**, and a **use-case** phrase
   - **1-2 relevant government schemes**, chosen ONLY from a
     hand-verified real list (`lib/governmentSchemesReference.js`) —
     never invented
   - a **formal B2B/procurement-style description**

   Pricing is computed in two layers, not just asked from Gemini
   blindly — see **Dynamic pricing** below.
4. **`speakListing(listing)`** — **standalone, on-demand** — synthesizes
   a spoken confirmation in the artisan's own detected language via
   Gemini's native TTS, saved as a `.wav`. Not part of
   `runFullPipeline` — see "Text-to-speech" below for why.
5. **`runFullPipeline({ imagePath, audioPath, language, category })`** —
   runs steps 1-3 and returns one final object shaped for Firestore.
6. **`computeArtisanStats(listings)`** — **not AI, no API calls** — pure
   math over an artisan's listings: counts (total/published/draft) and
   an aggregate eco/"green rating". Deliberately does **not** report any
   earnings or units-sold figure — there's no real payment/order system
   in this app, so a sales number here would be fabricated.
7. **`generateMockMarketplaceSync(listing)`** — **NOT a real API call,
   ever** — a local, instant mock of a govt e-marketplace (ONDC/GeM
   -style) catalog approval check. Outcome is `approved` or
   `waitlisted` (never a hard rejection — material/eco quality issues
   go to manual review at most, and the AI's own price is never a
   rejection reason since it's already been safety-clamped by the time
   it gets here).
8. **`generateProductPoster({ imagePath, listing })`** — **not AI, no
   Gemini call** — composites a multi-section shareable poster (title,
   features, price, bulk/wholesale price, use-case) onto the product
   photo via `sharp` + an SVG overlay, sized for WhatsApp
   Status/Instagram Story.
9. **`sendOtp` / `verifyOtp`** (`lib/auth.js`) — phone number + OTP
   login via Twilio Verify, with a demo master code fallback (see
   `.env.example`) for testing when only one number is verified on a
   Twilio trial account.

Plus **`server.js`** — an Express HTTP layer over all of the above,
which is what the Expo app actually calls. See **API routes** below.

Audio input is **mandatory** — there's no typed-text fallback. The
artisan speaks their description; everything downstream works off the
transcript Gemini produces from that audio.

## Dynamic pricing — how it actually works

Two things combine, not just an LLM guess:

- **A real trained ML model** (`lib/pricingModel.js`) — a multivariate
  linear regression trained on a synthetic-but-market-researched
  dataset spanning 10 categories (pottery, handloom textile, jewelry,
  wood, bamboo, metal, embroidery, leather, painting, accessories).
  Category price ranges were calibrated against real Indian handicraft
  marketplace research, not guessed.
- **Gemini's own initial price guess** for a brand-new listing (the
  "cold start"), safety-clamped against the trained model's category
  ranges so it can never be wildly off.

`lib/adaptivePricing.js` blends the two: once a category has 5+ real
published listings, the price shown shifts toward the **average of
those real listings**, with the trained model kept as a stability
anchor (weighted down as more real data accumulates, up to 80% real
data at 25+ listings). Every listing's `priceSource` field says which
mode produced its price (`gemini-coldstart` or `active-learning`).

**Honesty note**: this learns from what *other artisans priced their
listings at*, not from real sales/transaction data — there's no
payment system in this app, so it can't yet learn from what actually
sold.

## Text-to-speech is separate and on-demand — read this before using it

`speakListing` is **not** wired into `runFullPipeline`. Call it
separately, only when the artisan explicitly asks to hear their listing
(e.g. taps a "Listen" button). Two real, tested reasons why:

1. **It's slow** — ~20-25s per call, versus ~5-10s for the rest of the
   pipeline combined.
2. **The free tier caps out at 10 requests PER DAY, for the whole
   project** — not per-minute, per-day, total. This is a real `429` we
   hit during testing, not a guess from docs.

It speaks in the artisan's own detected language — verified working
with real audio output for Tamil, Telugu, and Bengali during testing.

## Reliability

Because this runs live during a demo, the pipeline is built to degrade
gracefully instead of crashing:

- **enhanceImage() failures fall back automatically** to the original photo.
- **Gemini calls get one automatic retry** (`transcribeVoice`,
  `generateListing`) via `lib/withRetry.js`.
- **API failures don't throw — they return `{ success: false, error }`**
  from `runFullPipeline`. (Missing required arguments still throw —
  those are caller bugs, not runtime failures.)
- **`speakListing` just throws on failure** — wrap calls in try/catch.
- **Firestore-backed routes degrade to a clean 503**, not a server
  crash, if `serviceAccountKey.json` isn't present (see Setup below).
- **Twilio-backed auth routes degrade to a clean 503** if Twilio env
  vars aren't set.
- Every pipeline stage logs its input, output, and timing.

## Setup

```bash
npm install
cp .env.example .env
```

Then open `.env` and fill in:

```
GEMINI_API_KEY=your_key_here          # required — free at https://aistudio.google.com/app/apikey
TWILIO_ACCOUNT_SID=...                # optional — phone login won't work without it, rest of app still does
TWILIO_AUTH_TOKEN=...
TWILIO_VERIFY_SERVICE_SID=...
DEMO_MASTER_OTP=696969                # optional — bypasses real OTP check for demo purposes, see lib/auth.js
```

For Firestore-backed routes (`/api/save-listing`, `/api/listings`,
`/api/artisan-stats` with a `uid`), also place a real Firebase service
account key at `serviceAccountKey.json` in the project root (get one
from Firebase Console → Project Settings → Service Accounts). Without
it, those specific routes return a 503 but everything else still works.

## Running the server

```bash
npm start
# or: node server.js
```

Listens on `http://localhost:3000` by default (`PORT` env var to
override). For testing on a physical phone via Expo Go, update
`frontend/src/api/client.ts`'s `BASE_URL` to your Mac's LAN IP
(`ipconfig getifaddr en0`).

## API routes

| Route | Purpose |
|---|---|
| `GET /health` | health check |
| `POST /api/generate-listing` | full pipeline: photo + audio → listing |
| `POST /api/auth/send-otp` | Twilio Verify — send SMS OTP |
| `POST /api/auth/verify-otp` | check OTP, returns a Firestore-backed `uid` |
| `POST /api/auth/link-aadhaar` | **mock only** — stores a 12-digit number, simulates a "verified" state |
| `POST /api/save-listing` | create or update a listing in Firestore |
| `GET /api/listings` | published listings (or `?uid=` for one artisan's own, any status) |
| `POST /api/speak-listing` | on-demand TTS (10/day quota) |
| `POST /api/artisan-stats` | listing counts + eco rating aggregate — no earnings/sales data |
| `POST /api/marketplace-sync` | **mock only** — approve/waitlist check |
| `POST /api/generate-poster` | shareable poster PNG |

## Running the test scripts

```bash
node test.js <path-to-image> <path-to-audio> [language] [category]
node test-pipeline.js <path-to-image> "<transcript text>" [category] [--speak]
node test-suite.js            # 5 fixed test cases against generateListing()
node test-artisan-stats.js    # computeArtisanStats() against mock data, no API key needed
```

Supported audio formats: `.mp3`, `.wav`, `.aiff`/`.aif`, `.aac`, `.ogg`,
`.flac`, `.m4a`, `.webm`.

## Project structure

```
lib/
  enhanceImage.js               background removal + lighting fix
  transcribeVoice.js             Gemini audio transcription (any language)
  generateListing.js             core Gemini call + JSON parsing/validation
  pricingModel.js                 runtime inference for the trained pricing model
  pricingModel.weights.json       the trained model (weights, metrics, 10 categories)
  pricingReference.js            category price-range table, safety-net clamp
  adaptivePricing.js              blends Gemini's cold-start guess with real Firestore data over time
  governmentSchemesReference.js  hand-verified real govt. scheme list
  ecoRating.js                    per-listing + seller-level green rating
  b2bPricing.js                  wholesale price + MOQ, computed/reference-table
  mockMarketplaceSync.js         NOT a real API — mocked approve/waitlist check
  generatePoster.js               shareable poster image (sharp + SVG, no ffmpeg)
  auth.js                         Twilio Verify OTP send/check + demo master code
  artisanStats.js                 NOT AI — listing counts + eco aggregate, no earnings/sales
  speakListing.js / textToSpeech.js   on-demand TTS
  runFullPipeline.js / withRetry.js   orchestration + retry helper
scripts/
  generatePricingDataset.js      generates the synthetic pricing training data
  trainPricingModel.js            trains the regression model
data/
  pricingTrainingData.json        the training dataset (270 rows, 10 categories)
frontend/                        React Native (Expo) mobile app — see frontend/
index.js                         single entry point, re-exports everything
server.js                        HTTP layer over index.js
test.js / test-pipeline.js / test-suite.js / test-artisan-stats.js   CLI test scripts
uploads/                         temp storage for server.js uploads — cleaned up per request
output/                          enhanced images, TTS audio, posters get saved here
```

## Notes / gotchas

- `@imgly/background-removal-node` downloads a small ML model on first
  run — the first call to `enhanceImage` will be slower than later ones.
- The Gemini model name is `gemini-3.5-flash-lite`
  (`gemini-2.5-flash-lite` was retired) — check `lib/transcribeVoice.js`
  and `lib/generateListing.js` if Google changes model names again.
- The TTS model is `gemini-2.5-flash-preview-tts` — a "preview" model,
  likely to be renamed/retired; check
  https://ai.google.dev/gemini-api/docs/models if `speakListing` starts
  404ing.
- **`speakListing`'s free tier is 10 requests/day, TOTAL, for the whole
  project.** Test it sparingly.
- **`suggestedSchemes`** is held to a stricter accuracy bar than
  everything else — Gemini can only pick from 4 hand-verified real
  schemes; anything else it returns is silently dropped.
- `DEMO_MASTER_OTP` (default `696969`) always passes OTP verification —
  this exists because a Twilio trial account can only deliver real SMS
  to one manually-verified number. Remove or change it before any real
  deployment.
- There is **no video-generation feature** in this project (an earlier
  version had one; it was removed — the poster is the only shareable
  asset now).
- There is **no earnings/units-sold figure anywhere** in this app —
  removed on purpose, since there's no real payment/order system behind it.
