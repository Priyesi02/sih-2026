# Artisan AI Listing Module

Standalone Node.js module for the SIH hackathon project. Takes a product
photo + an audio recording of the artisan describing their product, and
returns a complete, ready-to-publish listing (English + Hindi + the
artisan's own-language description, craft story, suggested price range,
category, relevant government scheme suggestions).

This module has **no frontend dependency** — you can build and test it
entirely from the terminal, then import it into the React app later.

## What it does

1. `enhanceImage(imagePath)` — removes the photo background and fixes
   lighting/contrast, saves the result to `output/`.
2. `transcribeVoice(audioPath, language)` — sends the audio recording to
   Gemini (which understands audio directly) and gets back a text
   transcript in the original language/script spoken. `language` is an
   optional hint (e.g. `"Hindi"`) to improve accuracy; leave it out and
   Gemini auto-detects.
3. `generateListing({ transcriptText, imagePath, category })` — sends the
   photo + transcript to Gemini for descriptions (English, Hindi, AND
   the artisan's own detected language)/craft-story/category/a formal
   B2B description, prices it with a locally trained regression model
   (see `HANDOFF.md` 5.5 — pricing is NOT a Gemini guess), computes
   wholesale price + MOQ deterministically (also not Gemini — see
   `HANDOFF.md` 2.7), and suggests 1-2 relevant government schemes
   chosen ONLY from a hand-verified real list — see `HANDOFF.md` 5.7,
   this one has stricter accuracy handling than the other fields.
4. `speakListing(listing)` — **standalone, on-demand** — synthesizes a
   spoken confirmation (description + price) in the artisan's own
   detected language, using Gemini's native TTS, saved as a `.wav`. NOT
   part of `runFullPipeline` — see "Text-to-speech" below for why.
5. `runFullPipeline({ imagePath, audioPath, language, category })` — runs
   steps 1-3 and returns one final object shaped for Firestore. Does
   **not** call `speakListing`.
6. `computeArtisanStats(listings)` — **not AI, no API calls** — pure math
   over an artisan's existing listings (published count, potential
   earnings, a simple monthly projection). For an "Impact/Earnings"
   screen. See `HANDOFF.md` 2.6.
7. `generateMockMarketplaceSync(listing)` — **NOT a real API call, ever**
   — a local, instant mock of a govt e-marketplace (ONDC/GeM-style)
   catalog sync, matching the PRD's "mock only" scope for this feature.
   For the "B2B / Govt Marketplace" screen. See `HANDOFF.md` 2.7.
8. `generateProductVideo({ imagePath, listing, audioPath? })` — **not AI,
   no Gemini call** — composites a caption (category/price/description)
   onto the product photo and encodes a short MP4 with a zoom-in effect,
   locally via `sharp` + `ffmpeg`. Optional narration audio (not
   generated automatically — pass in an existing `speakListing()`
   output if you want it). See `HANDOFF.md` 2.8.

Plus `server.js` — an Express HTTP layer over all of the above, for the
Expo/React Native frontend to actually call. See `HANDOFF.md` section 6.

Audio input is **mandatory** — there's no typed-text fallback. The
artisan speaks their description; everything downstream works off the
transcript Gemini produces from that audio.

## Text-to-speech is separate and on-demand — read this before using it

`speakListing` is **not** wired into `runFullPipeline`. Call it
separately, only when the artisan explicitly asks to hear their listing
(e.g. taps a "Listen" button). Two real, tested reasons why:

1. **It's slow** — ~20-25s per call, versus ~5-10s for the rest of the
   pipeline combined.
2. **The free tier caps out at 10 requests PER DAY, for the whole
   project** — not per-minute, per-day, total. This is a real `429` we
   hit during testing (`quotaValue: "10"`, model `gemini-2.5-flash-tts`),
   not a guess from docs. Wiring it into every listing generation would
   exhaust the day's quota in about 5 pipeline runs.

It speaks in the artisan's own detected language (not just Hindi) —
verified working with real audio output for Tamil, Telugu, and Bengali
during testing, not just assumed from Gemini's documented language
support. Full details in `HANDOFF.md` section 5.6.

## Reliability

Because this runs live during a demo, the pipeline is built to degrade
gracefully instead of crashing:

- **enhanceImage() failures fall back automatically.** If background
  removal / lighting correction fails for any reason, `runFullPipeline`
  logs a warning and continues with the original, unenhanced photo
  instead of aborting.
- **Gemini calls get one automatic retry.** `transcribeVoice` and
  `generateListing` each get one retry (with a 2-second delay) via
  `lib/withRetry.js` before being treated as failed. (`speakListing`
  does not use this — see below.)
- **API failures don't throw — they return a result object.**
  `runFullPipeline` returns either:
  ```js
  { success: true, imageUrl, enhancedImageUrl, transcriptText, descriptionEn, ... }
  ```
  or, if transcription/listing generation still fails after the retry:
  ```js
  { success: false, error: "Voice transcription failed: ..." }
  ```
  Check `result.success` in the frontend and show a "try again" message
  on `false` instead of expecting a thrown exception. (Missing required
  arguments like `imagePath`/`audioPath` still throw — those are caller
  bugs, not runtime failures.)
- **`speakListing` behaves differently — it just throws on failure.**
  Since it's a single on-demand action (not a pipeline stage with
  something to fall back to), wrap calls to it in a plain try/catch.
- **Every stage logs its input, output, and timing** (via
  `console.time`/`console.timeEnd`), so a terminal run makes it obvious
  which stage is slow or which one failed.
- **generateListing()** logs the raw Gemini response and throws
  `Gemini returned invalid JSON: <raw response>` if parsing fails, and
  throws a message naming the exact field if schema validation fails
  (e.g. `field "suggestedPriceMin" should be number, got string`).

## Setup

```bash
npm install
cp .env.example .env
```

Then open `.env` and paste in your Gemini API key (free at
https://aistudio.google.com/app/apikey):

```
GEMINI_API_KEY=your_key_here
```

## Running the test script

```bash
node test.js <path-to-image> <path-to-audio> [language] [category]
```

Example:

```bash
node test.js ./samples/pot.jpg ./samples/pot-description.wav Hindi pottery
```

Supported audio formats: `.mp3`, `.wav`, `.aiff`/`.aif`, `.aac`, `.ogg`,
`.flac`, `.m4a`, `.webm`.

Both `language` and `category` are optional — Gemini will auto-detect the
spoken language and guess the category from the photo + transcript if you
leave them out.

This will:
- remove the background + fix lighting on the photo (saved to `output/`,
  falling back to the original photo if enhancement fails)
- transcribe the audio recording via Gemini (retried once on failure)
- send the enhanced photo + transcript to Gemini for descriptions/category,
  and price it with the trained regression model (retried once on failure)
- print stage-by-stage progress + timing, then the full listing JSON:

```json
{
  "success": true,
  "imageUrl": "./samples/pot.jpg",
  "enhancedImageUrl": "/path/to/output/pot-enhanced.png",
  "transcriptText": "...",
  "descriptionEn": "...",
  "descriptionHi": "...",
  "descriptionLocal": "...",
  "detectedLanguage": "Hindi",
  "craftStory": "...",
  "suggestedPriceMin": 450,
  "suggestedPriceMax": 900,
  "priceReasoning": "...",
  "category": "pottery",
  "suggestedSchemes": [
    { "name": "PM Vishwakarma Yojana", "reason": "..." }
  ],
  "status": "draft"
}
```

Total pipeline time is **~5-10 seconds** (audio/TTS is a separate
on-demand step, not part of this — see above).

If a step fails even after its retry, you'll instead see
`{ "success": false, "error": "..." }` printed and the script exits with
a non-zero code.

## Other test scripts

**`test-pipeline.js`** — tests image enhancement + listing generation
using a **typed transcript** (no audio file needed), for quickly trying
photo/description combos. Text-to-speech is opt-in via `--speak` (costs
1 of the 10/day TTS quota, so it's off by default):

```bash
node test-pipeline.js <path-to-image> "<transcript text>" [category]
node test-pipeline.js <path-to-image> "<transcript text>" [category] --speak
```

**`test-suite.js`** — runs `generateListing()` against 5 fixed test
cases (high-value item, low-value item, a one-word transcript, a long
rambling transcript, and an English-only transcript) and prints a
pass/fail summary table plus the full Hindi description for each, so
you can eyeball output quality across different inputs:

```bash
node test-suite.js
```

Drop your own sample photos into `samples/` matching the filenames in
`TEST_CASES` at the top of `test-suite.js` (or edit the paths) before
running it — cases with missing images will show up as clean `FAIL`
rows instead of crashing the whole suite.

**`test-artisan-stats.js`** — tests `computeArtisanStats()` against
realistic mock listing data (no AI, no API key needed, instant):

```bash
node test-artisan-stats.js
```

## Using it inside another script (or later, the React backend)

```js
const { runFullPipeline, speakListing } = require('./index');

const result = await runFullPipeline({
  imagePath: './uploads/photo.jpg',
  audioPath: './uploads/description.wav',
  language: 'Hindi', // optional
});

if (!result.success) {
  // show a "something went wrong, try again" message
  console.error(result.error);
} else {
  // save result to Firestore, show the draft listing, etc.

  // ONLY when the artisan explicitly taps "Listen" — never automatically,
  // and remember the 10 requests/day free-tier cap on this specific model:
  try {
    const audioPath = await speakListing(result);
    // play audioPath
  } catch (err) {
    // show "couldn't generate audio, try again" — this throws, doesn't return { success: false }
  }
}
```

You can also import the individual steps (`enhanceImage`,
`transcribeVoice`, `generateListing`) if you only need one part of the
pipeline.

## Project structure

```
lib/
  enhanceImage.js          background removal + lighting fix
  transcribeVoice.js       Gemini audio transcription
  generateListing.js       Gemini call (descriptions/category/quality+size tier) + JSON parsing/validation
  pricingModel.js           runtime inference for the trained pricing model
  pricingModel.weights.json the trained model itself (weights, metrics)
  pricingReference.js      category price-range table, used as a safety-net clamp
  governmentSchemesReference.js  hand-verified real govt. scheme list, used to ground/filter suggestedSchemes
  speakListing.js          on-demand: builds spoken text from a listing, calls textToSpeech
  textToSpeech.js          Gemini TTS call + raw PCM -> playable .wav conversion
  runFullPipeline.js       orchestrates enhanceImage/transcribeVoice/generateListing, with fallbacks/retries
  withRetry.js             generic "retry once" helper used by runFullPipeline
  artisanStats.js          NOT AI — pure math for the Impact/Earnings screen
  b2bPricing.js            NOT AI — wholesale price + MOQ, computed/reference-table
  mockMarketplaceSync.js   NOT AI, NO real API call — mocked ONDC/GeM catalog sync
  generateVideo.js         NOT AI — sharp caption compositing + ffmpeg video encoding
scripts/
  generatePricingDataset.js  generates the synthetic pricing training data
  trainPricingModel.js       trains the regression model, writes pricingModel.weights.json
data/
  pricingTrainingData.json   the training dataset (243 rows)
index.js               single entry point, re-exports everything
server.js              HTTP layer over index.js — what the Expo app actually calls (see HANDOFF.md 6)
render.yaml            Render deployment config for server.js
test.js                CLI for the full audio-based pipeline (no TTS)
test-pipeline.js       CLI for image + typed transcript (no audio needed; --speak/--video optional)
test-suite.js          fixed test cases against generateListing(), pass/fail table
test-artisan-stats.js  CLI for computeArtisanStats() against mock listing data
samples/               put your sample product photos here for test-suite.js
uploads/               temp storage for files uploaded via server.js — cleaned up after each request
output/                enhanced images, spoken audio .wav, and product .mp4 files get saved here
```

## Notes / gotchas

- `@imgly/background-removal-node` downloads a small ML model on first
  run — the first call to `enhanceImage` will be slower than later ones.
- Gemini sometimes wraps JSON in ```` ```json ... ``` ```` code fences even
  when told not to — `generateListing.js` strips that automatically.
- If `generateListing` throws a parsing error, it prints Gemini's raw
  response so you can see exactly what came back.
- The model name is `gemini-3.5-flash-lite` (Google retired
  `gemini-2.5-flash-lite` for new users) — check `lib/transcribeVoice.js`
  and `lib/generateListing.js` if Google changes model names again.
- The TTS model name is `gemini-2.5-flash-preview-tts` (in
  `lib/textToSpeech.js`) — it's a "preview" model, so it's especially
  likely to be renamed/retired; check
  https://ai.google.dev/gemini-api/docs/models if `speakListing` starts
  failing with a 404.
- **`speakListing`'s free tier is 10 requests/day, TOTAL, for the whole
  project** — not per-user, not per-minute. Test it sparingly. This is
  why it's not wired into the automatic pipeline — see "Text-to-speech"
  above.
- `generateListing`'s schema got bigger (descriptions in 3 languages +
  quality/size tier classification, all from one Gemini call) — this
  occasionally causes Gemini to drop a field and needs its one retry;
  that's expected, not a bug.
- **`suggestedSchemes` is held to a stricter accuracy bar than everything
  else** — it's real government-benefit info shown to a real person.
  Gemini can only pick from 4 hand-verified real schemes in
  `lib/governmentSchemesReference.js`; anything else it returns gets
  silently dropped. Read `HANDOFF.md` section 5.7 before displaying this
  field — the "may be eligible, not guaranteed" framing must carry
  through to the UI.
