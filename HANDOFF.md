# AI Module Handoff

This is the AI integration module: photo + audio recording of an artisan
describing their product → a ready-to-publish listing (bilingual
description, craft story, suggested price, category, relevant government
schemes). Everything below is pulled directly from the actual code in
this repo — no guessed field names.

**There are three entry points, not one:**
- `runFullPipeline` — the main flow (photo + audio → listing). Fast
  (~5-10s), always call this first.
- `speakListing` — spoken audio confirmation, called SEPARATELY and
  ON DEMAND (e.g. a "Listen" button), never automatically. Slow (~20-25s)
  and has a hard **10 requests/day** free-tier cap — see section 5.6,
  read it before wiring this up.
- `computeArtisanStats` — **not AI at all**, pure math over an artisan's
  existing listings (count + potential earnings). Instant, free, call it
  as often as you want. See section 2.6.

**Architecture note — this is backend-only, and that's independent of
your frontend framework choice.** Every function in this module uses
Node-only APIs (`fs` for local files, `sharp`'s native addon for image
processing, etc.) — none of it can run inside a browser tab OR inside
Expo Go/React Native's JS runtime. That was always true, even under the
original PWA plan (a browser can't run `sharp` either). This module runs
on a server; your frontend — PWA or Expo, doesn't matter — calls it over
HTTP, the same way in both cases. Switching frontend frameworks doesn't
change anything about how this module needs to be deployed or called.
(This was double-checked directly against the actual installed package
metadata when the question came up — see the `enhanceImage` entry below,
it's genuinely Node-only, not a mislabeled browser library.)

## 1. Setup

```bash
npm install
```

Installs (from `package.json`): `@google/generative-ai`,
`@imgly/background-removal-node`, `sharp`, `dotenv`.

Create a `.env` file in the project root (copy `.env.example`):

```
GEMINI_API_KEY=your_gemini_api_key_here
```

Get a free key at **https://aistudio.google.com/app/apikey** (Google
account required, no credit card needed for the free tier).

`.env` is gitignored — never commit real keys. `.env.example` stays a
placeholder for the repo.

## 2. The one function you need: `runFullPipeline`

Imported from `./index.js` (or wherever this module is mounted in the
backend). **Real signature — it takes a single options object, not
positional args:**

```js
const { runFullPipeline } = require('./index');

const result = await runFullPipeline({
  imagePath: './uploads/photo.jpg',   // required — path to the product photo
  audioPath: './uploads/voice.m4a',   // required — path to the artisan's audio recording
  language: 'Hindi',                  // optional — hint for transcription accuracy
  category: 'pottery',                // optional — hint if the seller already picked one
});
```

Audio input is **mandatory** — there is no typed-transcript mode in this
function. `imagePath` and `audioPath` missing entirely will `throw`
(that's a caller bug, not a runtime failure — handle it as a 500/bad
request on your side, it shouldn't happen if your form validates inputs
before calling this).

Supported audio formats: `.mp3`, `.wav`, `.aiff`/`.aif`, `.aac`, `.ogg`,
`.flac`, `.m4a`, `.webm`. Supported image formats: `.jpg`/`.jpeg`,
`.png`, `.webp`.

### Return shape — success

```js
{
  success: true,
  imageUrl: './uploads/photo.jpg',              // string — original photo path, unchanged
  enhancedImageUrl: '/abs/path/to/photo-enhanced.png', // string — background-removed + lighting-corrected version
  transcriptText: '...',                        // string — what Gemini heard in the audio, original language/script
  descriptionEn: '...',                         // string — SEO-friendly English description (buyer-facing)
  descriptionHi: '...',                         // string — same description in Hindi (buyer-facing)
  descriptionLocal: '...',                      // string — same description in the ARTISAN's own detected language (see detectedLanguage) — used for reading back to them, see speakListing below
  detectedLanguage: 'Tamil',                    // string — language Gemini detected the transcript was actually written in (e.g. "Tamil", "Hindi", "English") — NOT necessarily Hindi
  craftStory: '...',                            // string — short heritage/craft story
  suggestedPriceMin: 350,                       // number — INR
  suggestedPriceMax: 750,                       // number — INR
  priceReasoning: '...',                        // string — one-line pricing rationale
  category: 'pottery',                          // string — inferred category (one of 9 fixed values, see section 5.5)
  suggestedSchemes: [                           // array, 0-2 items — real, verified Indian govt. schemes the artisan MAY want to check (see section 5.7 — read before displaying this to users)
    { name: 'PM Vishwakarma Yojana', reason: '...' },
  ],
  b2bDescription: '...',                        // string — formal/factual rewrite for wholesale/govt procurement buyers, NOT the consumer-facing tone (see section 2.7)
  wholesalePriceMin: 193,                       // number — INR, bulk/per-unit price, always < suggestedPriceMin (see section 2.7)
  wholesalePriceMax: 525,                       // number — INR
  minOrderQuantity: 15,                         // number — suggested MOQ for a B2B buyer, from category+size (see section 2.7)
  schemeMatches: ['PM Vishwakarma Yojana'],     // array of strings — SAME data as suggestedSchemes, just names only (see section 2.7 for why there are two forms)
  status: 'draft',                              // string — always "draft" on creation
}
```

Note: **no `spokenAudioUrl` here.** `runFullPipeline` does not generate
audio automatically anymore (it used to — see section 5.6 for why that
changed). Call `speakListing` separately, on demand, to get audio.

### Return shape — failure (does NOT throw)

```js
{
  success: false,
  error: 'Voice transcription failed: ...' // or 'Listing generation failed: ...'
}
```

`runFullPipeline` never throws for API-level failures (bad Gemini
response, network issue, rate limit) — it always resolves with this
shape. **Always check `result.success` before reading any other field.**

## 2.5. The on-demand function: `speakListing`

Also imported from `./index.js`. Call this ONLY when the artisan
explicitly asks to hear their listing (e.g. taps a "Listen" button) —
**never automatically after `runFullPipeline`.** Read section 5.6 before
wiring this up; the free tier caps out at 10 calls/day.

```js
const { speakListing } = require('./index');

// Pass it the listing object runFullPipeline returned (or generateListing's).
const audioPath = await speakListing(listing);
// audioPath: string, a local .wav file path — OR this throws on failure
```

Unlike `runFullPipeline`, this **throws** on failure rather than
returning `{ success: false }` — it's a single on-demand action, so a
plain try/catch around the button handler is the right pattern:

```js
async function handleListenClick() {
  setAudioLoading(true);
  try {
    const audioPath = await fetch('/api/speak-listing', { /* ... */ }).then((r) => r.json());
    setAudioUrl(audioPath.url);
  } catch (err) {
    setAudioError("Couldn't generate audio right now — try again in a bit.");
  } finally {
    setAudioLoading(false);
  }
}
```

Takes ~20-25s (it's genuinely slow, see section 5.6) — show a loading
state on the button itself, not a full-page blocker.

## 2.6. The non-AI function: `computeArtisanStats`

For the "Impact/Earnings" screen (see `Frontend_Feature_Brief.md`
screen 4). Also from `./index.js`. **No API calls, no latency, no
quota concerns** — it's pure arithmetic over listings you already have.

```js
const { computeArtisanStats } = require('./index');

// Pass the artisan's array of listing docs from Firestore (or anything
// with suggestedPriceMin/suggestedPriceMax/status on it).
const stats = computeArtisanStats(artisanListings);
```

**Returns:**
```js
{
  totalListings: 5,            // number — all listings, draft + published
  publishedListings: 4,        // number — status === 'published' only
  draftListings: 1,            // number — totalListings - publishedListings
  potentialEarningsMin: 8224,  // number — INR, sum of suggestedPriceMin across PUBLISHED listings only
  potentialEarningsMax: 14804, // number — INR, sum of suggestedPriceMax across PUBLISHED listings only
  monthlyProjectionMin: 8224,  // number — INR, see assumption below
  monthlyProjectionMax: 14804, // number — INR, see assumption below
  projectionAssumption: 'Assumes each published listing sells once this month — a simple illustrative estimate, not a data-driven sales forecast (there is no real sales/conversion data in this app yet).',
}
```

**Read `projectionAssumption` and actually show it in the UI, don't drop
it.** There's no real sales/conversion/views data anywhere in this app
(that's a separate, unbuilt feature — see `Frontend_Feature_Brief.md`'s
nice-to-have list), so `monthlyProjectionMin/Max` is currently just
`potentialEarningsMin/Max` under a "sells once" assumption — a clean,
honest illustrative number for the demo, not a real forecast. Don't
present it as one, to the artisan or to judges.

Optional second argument to tune that assumption:
```js
computeArtisanStats(artisanListings, { expectedSalesPerListing: 2 }); // "sells twice this month"
```

Try it with realistic mock data (no Firestore needed):
```bash
node test-artisan-stats.js
```

## 2.7. B2B / Government e-Marketplace fields + `generateMockMarketplaceSync`

For the "B2B / Govt Marketplace" screen (PRD FR8). These new fields are
already included in `runFullPipeline`'s normal return value (section
2 above) — no extra function call needed to get them.

**Where each field actually comes from** (this matters — read it before
assuming any of these are live/real):
- `b2bDescription` — genuinely written by Gemini, in the same single
  API call as everything else (zero extra cost/latency). It's just a
  tone/style rewrite of facts Gemini already generated, so it doesn't
  carry the same risk as a new factual claim.
- `wholesalePriceMin`/`wholesalePriceMax` — **NOT from Gemini.**
  Computed as a fixed discount (55%/70%) off the already-model-priced
  `suggestedPriceMin`/`Max`. Same reasoning as retail pricing itself
  (section 5.5): asking an LLM to guess a second number here would
  reintroduce the exact inconsistency problem that pricing already had
  once. See `lib/b2bPricing.js`.
- `minOrderQuantity` — **NOT from Gemini either.** A hand-picked
  category+size reference table (same pattern as the pricing reference
  table), also in `lib/b2bPricing.js`. Calibrated against realistic
  examples (e.g. handloom textile → 15, small pottery → up to 70) —
  verified these numbers by direct testing, not just eyeballing.
- `schemeMatches` — **the exact same data as `suggestedSchemes`**
  (section 2's return shape), just reduced to plain scheme-name strings.
  This was a deliberate choice: the original spec for this feature asked
  for a second, separate list of scheme names from Gemini, which would
  have reintroduced the hallucinated-scheme-name risk that
  `suggestedSchemes`'s strict allowlist validation (section 5.7) was
  specifically built to prevent. So `schemeMatches` is derived from the
  already-verified list instead — same accuracy guarantee, no second
  Gemini field to hallucinate.

### `generateMockMarketplaceSync(listing)`

```js
const { generateMockMarketplaceSync } = require('./index');

const syncResult = generateMockMarketplaceSync(listing); // pass the full listing object
```

**This makes NO real network call and talks to no real government
system — it's a local, instant function that just formats a
plausible-looking response.** Matches the PRD's own stated scope ("Real
ONDC/GeM API integration" is explicitly out of scope — mock only). Every
returned object's `marketplace` field says `"ONDC/GeM (mocked — no real
integration)"` so this is never mistaken for a live sync in code or logs.

**Returns instantly:**
```js
{
  marketplace: 'ONDC/GeM (mocked — no real integration)',
  productId: 'MOCK-pottery-A1B2C3',   // fake, randomly generated — not a real catalog ID
  sellerId: 'MOCK-SELLER-0001',        // fake placeholder — a real build would use the artisan's actual account ID
  category: 'pottery',
  description: '...',                  // = the listing's b2bDescription
  currency: 'INR',
  wholesalePriceMin: 46,
  wholesalePriceMax: 106,
  minOrderQuantity: 50,
  status: 'synced',
  syncedAt: '2026-...T...Z',           // real timestamp, ISO string
}
```

Try it (no API key needed for this specific function, though you do
need one to generate a listing to feed it first):
```bash
node test-pipeline.js ./samples/pot.jpg "Mitti ka bartan hai" pottery
```
(prints the mock sync result at the end, alongside the other B2B fields)

## 3. React usage snippet

```jsx
import { useState } from 'react';

function ProductUploadForm() {
  const [listing, setListing] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Separate state for the on-demand "Listen" button — audio is NOT
  // part of the main listing result anymore (see section 2.5/5.6).
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState(null);

  async function handleSubmit(imagePath, audioPath) {
    setLoading(true);
    setError(null);
    setAudioUrl(null); // reset any previous listing's audio

    try {
      // Replace with however your backend exposes this —
      // e.g. a fetch() call to an API route that internally calls
      // runFullPipeline({ imagePath, audioPath }).
      const res = await fetch('/api/generate-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePath, audioPath }),
      });
      const result = await res.json();

      if (!result.success) {
        // This is the { success: false, error } case from runFullPipeline.
        setError(result.error || 'Something went wrong. Please try again.');
        return;
      }

      setListing(result); // full listing object, ready to render / save to Firestore
    } catch (err) {
      // Network-level failure (e.g. backend unreachable) — separate from
      // the { success: false } case, which means the backend responded
      // but the AI pipeline itself failed.
      setError('Could not reach the server. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  // Called ONLY when the artisan taps "Listen" — see section 2.5.
  // Sends the descriptionLocal/detectedLanguage/price fields so the
  // backend can call speakListing(listing) in the artisan's own language.
  async function handleListenClick() {
    setAudioLoading(true);
    setAudioError(null);
    try {
      const res = await fetch('/api/speak-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing }),
      });
      if (!res.ok) throw new Error('speak-listing request failed');
      const { url } = await res.json();
      setAudioUrl(url);
    } catch (err) {
      setAudioError("Couldn't generate audio right now — try again in a bit.");
    } finally {
      setAudioLoading(false);
    }
  }

  return (
    <div>
      {loading && <p>Generating your listing...</p>}
      {error && <p className="error">{error} <button onClick={() => handleSubmit(/* retry with same inputs */)}>Try again</button></p>}
      {listing && (
        <div>
          <img src={listing.enhancedImageUrl} alt={listing.category} />
          <h3>{listing.category}</h3>
          <p>{listing.descriptionEn}</p>
          <p>{listing.descriptionHi}</p>
          <p><em>{listing.craftStory}</em></p>
          <p>₹{listing.suggestedPriceMin} – ₹{listing.suggestedPriceMax}</p>
          <small>{listing.priceReasoning}</small>

          {/* suggestedSchemes: can be an empty array, hide the section then.
              IMPORTANT: keep the "may be eligible" framing visible — see
              HANDOFF.md section 5.7 for why this isn't optional. */}
          {listing.suggestedSchemes?.length > 0 && (
            <div className="schemes">
              <h4>Schemes you may want to look into</h4>
              <small>Eligibility isn't guaranteed — confirm with the scheme's official office/portal.</small>
              <ul>
                {listing.suggestedSchemes.map((scheme) => (
                  <li key={scheme.name}>
                    <strong>{scheme.name}</strong>: {scheme.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* On-demand audio — not generated automatically. */}
          {!audioUrl && (
            <button onClick={handleListenClick} disabled={audioLoading}>
              {audioLoading ? 'Preparing audio... (~20-25s)' : `🔊 Listen (${listing.detectedLanguage})`}
            </button>
          )}
          {audioError && <p className="error">{audioError}</p>}
          {audioUrl && (
            <audio controls src={audioUrl}>
              Your browser doesn't support audio playback.
            </audio>
          )}
        </div>
      )}
    </div>
  );
}
```

**Impact/Earnings screen** (section 2.6) — much simpler, no
loading/error state needed since there's no API call:

```jsx
import { computeArtisanStats } from './index'; // or wherever it's exposed to the frontend

function ImpactScreen({ artisanListings }) {
  const stats = computeArtisanStats(artisanListings);

  return (
    <div>
      <h2>{stats.publishedListings} listings published</h2>
      {stats.draftListings > 0 && <p>{stats.draftListings} more waiting in drafts</p>}

      <h3>₹{stats.potentialEarningsMin} – ₹{stats.potentialEarningsMax}</h3>
      <p>Estimated potential earnings from your published listings</p>

      <h3>Your listings could earn ₹{stats.monthlyProjectionMin} – ₹{stats.monthlyProjectionMax} this month</h3>
      {/* Don't drop this — it's the honesty disclaimer for the number above */}
      <small>{stats.projectionAssumption}</small>
    </div>
  );
}
```

## 4. Mock data (real outputs — safe to build UI against right now)

Both of these are **actual, unedited outputs** from running this
module's `generateListing()` against two of the fixed cases in
`test-suite.js` (transcripts are copied verbatim from that file). Use
these to build/style the listing UI without burning API quota.

> Note: both were generated against the one real sample photo currently
> in `samples/` (a plain product shot), not an actual saree/diya photo —
> so the visual grounding is generic, but the JSON shape and text
> quality are exactly what the real API returns. Swap in real photos and
> re-run `test-suite.js` once you have them.

**Mock 1 — high-value item (silk saree test case):**

```json
{
  "descriptionEn": "Experience the timeless elegance of this handcrafted Banarasi silk saree, intricately woven with traditional zari work. This exquisite piece reflects the rich heritage of Indian textile craftsmanship, offering a luxurious drape for any special occasion. Add a touch of classic sophistication to your ethnic wardrobe with this stunning handloom masterpiece.",
  "descriptionHi": "हाथ से बुनी हुई इस बनारसी सिल्क साड़ी की शाश्वत सुंदरता का अनुभव करें, जिसमें पारंपरिक ज़री का जटिल काम किया गया है। यह उत्कृष्ट कृति भारतीय वस्त्र शिल्प की समृद्ध विरासत को दर्शाती है, जो किसी भी विशेष अवसर के लिए एक शानदार रूप प्रदान करती है। इस अद्भुत हथकरघा कलाकृति के साथ अपनी पारंपरिक वॉर्डरोब में क्लासिक परिष्कृत स्पर्श जोड़ें।",
  "detectedLanguage": "Hindi",
  "descriptionLocal": "हाथ से बुनी हुई इस बनारसी सिल्क साड़ी की शाश्वत सुंदरता का अनुभव करें, जिसमें पारंपरिक ज़री का जटिल काम किया गया है। यह उत्कृष्ट कृति भारतीय वस्त्र शिल्प की समृद्ध विरासत को दर्शाती है, जो किसी भी विशेष अवसर के लिए एक शानदार रूप प्रदान करती है। इस अद्भुत हथकरघा कलाकृति के साथ अपनी पारंपरिक वॉर्डरोब में क्लासिक परिष्कृत स्पर्श जोड़ें।",
  "craftStory": "The art of Banarasi silk weaving has been passed down through generations of master artisans, preserving ancient techniques of handloom creation. Each thread is carefully woven with dedication, carrying forward a legacy of royal elegance and cultural pride. By embracing this craft, you support local artisans who pour their heart and heritage into every exquisite fold.",
  "category": "handloom textile",
  "suggestedSchemes": [
    {
      "name": "PM Vishwakarma Yojana",
      "reason": "As a traditional weaver, you may be eligible to verify benefits like skill training and financial support through this scheme."
    },
    {
      "name": "Comprehensive Handloom Cluster Development Scheme (CHCDS)",
      "reason": "Worth checking with your local authorities if this handloom-focused scheme can support your weaving craft and market access."
    }
  ],
  "suggestedPriceMin": 5078,
  "suggestedPriceMax": 9140,
  "priceReasoning": "Priced using a regression model trained on 243 category-price examples, based on \"handloom textile\" pricing patterns adjusted for premium materials and medium size.",
  "b2bDescription": "Handwoven Banarasi silk saree featuring intricate zari work. Produced using traditional handloom techniques, ensuring standard durability and fine textile quality for wholesale procurement.",
  "wholesalePriceMin": 2793,
  "wholesalePriceMax": 6398,
  "minOrderQuantity": 15,
  "schemeMatches": ["PM Vishwakarma Yojana", "Comprehensive Handloom Cluster Development Scheme (CHCDS)"],
  "status": "draft"
}
```

**Mock 2 — low-value item (clay diya test case):**

```json
{
  "descriptionEn": "Illuminate your festive celebrations with this traditional handmade clay diya, crafted specially for Diwali. Perfect for bringing a warm, auspicious glow to your home during pujas and seasonal festivities.",
  "descriptionHi": "दीपावली के लिए विशेष रूप से बनाए गए इस पारंपरिक हस्तनिर्मित मिट्टी के दीये से अपने उत्सव को रोशन करें। पूजा और त्योहारों के दौरान आपके घर में एक गर्म और शुभ चमक लाने के लिए यह बिल्कुल सही है।",
  "detectedLanguage": "Hindi",
  "descriptionLocal": "दीपावली के लिए विशेष रूप से बनाए गए इस पारंपरिक हस्तनिर्मित मिट्टी के दीये से अपने उत्सव को रोशन करें। पूजा और त्योहारों के दौरान आपके घर में एक गर्म और शुभ चमक लाने के लिए यह बिल्कुल सही है।",
  "craftStory": "Rooted in centuries-old traditions, pottery-making is a cherished craft passed down through generations of skilled artisans. Each clay piece is shaped by hand with care, keeping India's rich cultural heritage alive in every home.",
  "category": "pottery",
  "suggestedSchemes": [
    {
      "name": "PM Vishwakarma Yojana",
      "reason": "As a traditional potter, you may want to check if you are eligible for the toolkit grant and low-interest loans."
    },
    {
      "name": "National Handicrafts Development Programme (NHDP)",
      "reason": "Worth checking with your local MSME or handicrafts office to see if you can benefit from marketing support and artisan card programs."
    }
  ],
  "suggestedPriceMin": 49,
  "suggestedPriceMax": 88,
  "priceReasoning": "Priced using a regression model trained on 243 category-price examples, based on \"pottery\" pricing patterns adjusted for basic materials and small size.",
  "b2bDescription": "Traditional handmade earthen diya constructed from natural clay, designed for seasonal festival use. Manufactured using standard hand-pottery methods, suitable for bulk procurement and festive retail distribution.",
  "wholesalePriceMin": 27,
  "wholesalePriceMax": 62,
  "minOrderQuantity": 70,
  "schemeMatches": ["PM Vishwakarma Yojana", "National Handicrafts Development Programme (NHDP)"],
  "status": "draft"
}
```

Note how `priceReasoning` now names the actual trained model and the
factors it used (materials tier, size tier) — that's new (see section
5.5 below) and is a good visual/text cue you can surface in the UI to
build seller trust in the number. `category` is now always one of 9
fixed values (see the list in section 5.5) instead of free text. Both
transcripts here happened to be Hindi/Hinglish, so `descriptionLocal`
equals `descriptionHi` in these two examples — for a Tamil/Telugu/etc.
transcript, `descriptionLocal` would differ from both `descriptionEn`
and `descriptionHi` (see section 5.6 for a verified Tamil example).
`suggestedSchemes` is new — **read section 5.7 before displaying it to
users**, the framing/disclaimer matters here more than for any other
field. `b2bDescription`/`wholesalePriceMin`/`wholesalePriceMax`/
`minOrderQuantity`/`schemeMatches` are also new — see section 2.7 for
what's genuinely Gemini vs. computed.

(Note: these came straight from `generateListing()`, so they're missing
`imageUrl`/`enhancedImageUrl`/`transcriptText`/`success` — those get
added by `runFullPipeline`. `generateListing()`'s raw output also
includes `materialQualityTier`/`sizeTier` — internal fields used only to
compute price, intentionally dropped from `runFullPipeline`'s public
return shape.)

## 5. Known limitations

- **`speakListing`'s free tier is capped at 10 REQUESTS PER DAY, TOTAL.**
  Not per-minute, not per-user — 10 for the whole project, per day. This
  isn't a guess from docs, it's a real `429` we hit during testing:
  `"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"`,
  `"quotaValue":"10"`, model `gemini-2.5-flash-tts`. This is WHY
  `speakListing` was pulled out of the automatic pipeline (section 5.6
  has the full story) — do not wire it back into every listing
  generation, it will exhaust the day's quota in ~5 pipeline runs
  (`transcribeVoice`/`generateListing` don't share this tighter cap, only
  the TTS model does). Test it sparingly. Consider a paid tier before
  the actual demo if audio playback is important to show off live.
- **Other free Gemini tier rate limits:** `gemini-3.5-flash-lite` (used
  by `transcribeVoice` and `generateListing`) has its own, more generous
  per-minute/per-day caps — check current numbers at
  https://ai.google.dev/gemini-api/docs/rate-limits, they change. Each
  `runFullPipeline` call makes 2 requests against that model (transcribe
  + generate), so quota still disappears faster than "1 listing = 1
  call" — just not as fast as the TTS model's 10/day cap.
- **Expected latency** (measured locally, will vary with photo size,
  audio length, and network):
  - `enhanceImage`: ~1.5s (first call is slower — the background-removal
    model downloads once on first use)
  - `transcribeVoice`: ~2s for a short (~5s) audio clip; longer
    recordings take proportionally longer
  - `generateListing`: ~2-6s — this got a bit slower/flakier after
    adding `descriptionLocal`/`detectedLanguage`/`materialQualityTier`/
    `sizeTier` to the schema (more fields = more chances Gemini drops
    one in a single response); the existing one-retry logic absorbs
    this, just costs an extra ~2-8s when it happens.
  - **Total for `runFullPipeline`: ~5-10s** typically.
  - `speakListing` (separate, on-demand, NOT part of the above total):
    **~20-25s**, plus it makes a small extra ~1-2s text-only Gemini call
    first to phrase the price in the right language (see section 5.6).
    Show a loading state on the "Listen" button itself, not a full-page
    blocker, and don't let the user tap it repeatedly (see the 10/day
    limit above).
- **Fallback behavior if `enhanceImage` fails:** the pipeline does NOT
  fail — it logs a warning and uses the original, unenhanced photo as
  `enhancedImageUrl` instead. The frontend won't see any difference in
  the response shape; the photo shown just won't have its background
  removed.
- **Fallback behavior if Gemini fails** (`transcribeVoice` or
  `generateListing`): one automatic retry after a 2-second delay. If it
  fails again, `runFullPipeline` resolves with `{ success: false, error }`
  — it does not throw. There is no fallback listing content generated;
  the UI needs a genuine "try again" state for this case.
- **`speakListing` failure behavior is different — it just throws.**
  Since it's called on-demand from a single button (not as a pipeline
  stage with a fallback to degrade to), a plain try/catch around the
  button handler is the right pattern — see section 2.5.

### 5.5 How pricing actually works (and its real limits)

`suggestedPriceMin`/`suggestedPriceMax` come from an **actual trained
linear regression model** — Gemini no longer guesses the price at all.
Be precise about what "trained" means here when describing this to
judges: it's a real fitted model with real evaluation metrics, but it
was trained on a **synthetic, domain-informed dataset**, not scraped
real sale prices (none exist in this project). Say that plainly if
asked — don't imply it learned from real market transactions.

**The pipeline (all in `lib/`):**
1. `scripts/generatePricingDataset.js` generated 243 synthetic training
   rows (`data/pricingTrainingData.json`) — `price = basePrice[category]
   * qualityMultiplier[tier] * sizeMultiplier[tier] * randomNoise`,
   using hand-set base prices/multipliers from general Indian handicraft
   market knowledge, with ~15% random log-normal noise added so the
   model has to genuinely learn the pattern, not memorize a table.
2. `scripts/trainPricingModel.js` fits a multivariate linear regression
   (`ml-regression-multivariate-linear`) on `log(price) ~ category +
   qualityTier + sizeTier`, with an 80/20 train/test split. Current
   result: **test R² = 0.95, test MAPE ≈ 20%**. Trained weights are
   saved to `lib/pricingModel.weights.json`.
3. At request time: Gemini itself classifies `materialQualityTier`
   (basic/mid/premium) and `sizeTier` (small/medium/large) as part of
   its normal JSON response — it's the SAME single Gemini call that
   already produces the descriptions, so this costs zero extra API
   calls. (An earlier version of this used English/Hindi-only keyword
   matching on the transcript instead — that silently failed for every
   other language: e.g. Tamil "பட்டு"/"தங்க" (silk/gold) matched nothing,
   so a premium Tamil-described item got priced as "basic." Verified
   this bug for real during testing, then fixed it by having Gemini
   classify tier directly instead — Gemini already reads the transcript
   in whatever language it's in, so this works correctly across
   languages, not just English/Hindi.) `lib/generateListing.js` maps
   those strings to the model's 0/1/2 numeric encoding and
   `lib/pricingModel.js` runs them through the trained weights.
4. Gemini's job is now only descriptions/craft story/**category** — and
   the prompt constrains category to the model's exact 9 trained values
   (+ `"other"`), so it can't return a category (e.g. "home decor") that
   the pricing model doesn't recognize.
5. `lib/pricingReference.js`'s `clampPriceToSaneRange()` still runs as a
   final safety net on the model's output, in case of an edge-case
   feature combination — same as before, just now guarding the model
   instead of guarding Gemini.

**To retrain** (e.g. after tuning `CATEGORY_BASE_PRICES` in
`scripts/generatePricingDataset.js`, or swapping in real data):
```bash
node scripts/generatePricingDataset.js
node scripts/trainPricingModel.js
```

**If real sale-price data becomes available**, replace the contents of
`data/pricingTrainingData.json` with real rows in the same shape
(`{category, qualityTier, sizeTier, priceInr}` — you'd need real
listings tagged with quality/size tier, or re-engineer richer features)
and rerun `trainPricingModel.js`. Nothing else in the pipeline needs to
change — `pricingModel.js` just loads whatever weights file exists.

### 5.6 How the spoken audio confirmation works (and its real limits)

`speakListing` (`lib/speakListing.js` + `lib/textToSpeech.js`) uses
**Gemini's own native text-to-speech model**
(`gemini-2.5-flash-preview-tts`) — same API key, same SDK, no separate
TTS account/billing needed. It reads back whatever script the input
text is written in, so no language config is required.

**This now speaks in the artisan's OWN detected language, not
Hindi-only** — an earlier version of this only ever spoke back
`descriptionHi`, which was wrong for anyone who didn't speak Hindi. This
was fixed and **verified working end-to-end with real audio output** for
Tamil, Telugu, and Bengali during testing (not just assumed to work off
Gemini's documented language list). Concretely: `generateListing`'s
`descriptionLocal` + `detectedLanguage` fields (section 2) carry the
artisan's own language through; `speakListing` reads `descriptionLocal`,
then makes one small extra text-only Gemini call to phrase the price
range correctly in `detectedLanguage` (can't be included in
`descriptionLocal` itself — pricing runs AFTER Gemini responds, via the
trained model, so Gemini doesn't know the price yet when it writes the
description), concatenates both, and sends that to the TTS model.

Gemini's TTS returns raw PCM audio with no file header;
`textToSpeech.js` wraps that into a standard `.wav` file (verified with
`file`/`afinfo` — real, valid, playable audio with correct durations,
not just a file that exists) and saves it to `output/`.

**The real limitation now isn't language coverage — it's quota.**
`gemini-2.5-flash-preview-tts`'s free tier caps out at **10 requests per
day, for the whole project** (hit this live during testing — see
section 5). That's why `speakListing` is a separate, on-demand function
instead of an automatic pipeline stage: calling it on every listing
generated would exhaust the day's entire quota in about 5 test runs.
Only call it when the artisan explicitly taps "Listen." If you need
heavier usage (e.g. for the actual demo), you'll need to check Google's
paid tier pricing for this model before relying on it live.

**Also worth knowing:** it's a "preview" model, meaning Google is
especially likely to change/retire it without much notice (the same
thing already happened once to `gemini-2.5-flash-lite` in this project
— see `lib/generateListing.js`'s comment on `MODEL_NAME`). Check
https://ai.google.dev/gemini-api/docs/models if `speakListing` starts
returning 404s.

### 5.7 `suggestedSchemes` — read this before showing it to a user

This is a real government-benefits suggestion shown to a real person,
so it's held to a stricter accuracy bar than any other field in this
pipeline. **Please read all of this before wiring it into the UI.**

**How it's grounded (same principle as pricing, applied more strictly):**
`lib/governmentSchemesReference.js` holds a small, hand-verified list of
4 REAL Indian government schemes relevant to artisans — verified via web
search while building this (not pulled from Gemini's training-data
memory, which can be stale/wrong for scheme details). Gemini is told to
pick 1-2 of these EXACT names for the product's category and write a
one-line reason — it is explicitly instructed not to invent scheme
names. On top of that, `generateListing.js`'s
`validateAndFilterSchemes()` checks every returned name against the
verified list programmatically and **silently drops anything that
doesn't match exactly** — verified this actually works by testing it
against a fabricated scheme name. So even if Gemini hallucinates
something, it won't reach the user.

**The 4 verified schemes** (current as of this project's build —
government schemes get renamed/merged/discontinued, so re-verify against
official sources before relying on this beyond the hackathon demo):
- **PM Vishwakarma Yojana** (Ministry of MSME) — 18 traditional trades,
  ₹15,000 toolkit grant + skill training stipend + up to ₹3L
  collateral-free loan at 5%.
- **National Handicrafts Development Programme (NHDP)** (Ministry of
  Textiles) — training/marketing support, needs a "Pahchan" artisan ID.
- **Comprehensive Handloom Cluster Development Scheme (CHCDS)** (Ministry
  of Textiles) — handloom weavers specifically.
- **SFURTI** (Ministry of MSME) — cluster-level support, usually applied
  for by an NGO/cooperative on behalf of a group, not one individual.

**How the frontend MUST frame this — not optional:** every `reason`
Gemini writes is deliberately phrased as something to *verify* ("may be
eligible," "worth checking"), never a guarantee — the app doesn't know
the artisan's age, documents, or family history, all of which affect
real eligibility. Carry that framing into the UI: label this section
something like "Schemes you may want to look into" with a visible note
that eligibility isn't guaranteed and must be confirmed with the actual
scheme's office/portal — don't present it as "you qualify for X." This
matters more here than anywhere else in the app: getting a buyer-facing
description slightly wrong is a UX nitpick, getting this wrong could
send a low-literacy artisan somewhere with false expectations about
money or benefits.

**Can be an empty array** (`suggestedSchemes: []`) if Gemini genuinely
found nothing relevant, or if every suggested name got filtered out as
unverified — the UI should just hide this section in that case, not
show an error.

## 6. The HTTP server (`server.js`) and deploying it to Render

Everything above describes the Node *library* (`index.js`). None of
that runs inside your Expo app directly (see the architecture note at
the top of this doc) — `server.js` is the thin HTTP layer your Expo app
actually calls. It didn't exist until this was built for deployment; it
just wraps the library functions in routes, it contains no pipeline
logic of its own.

**Routes** (all tested directly against a running local server, not just
written and assumed to work):

| Route | Method | Body | Wraps |
|---|---|---|---|
| `/health` | GET | — | health check, for Render + uptime pings |
| `/api/generate-listing` | POST | `multipart/form-data`: `image` file, `audio` file, optional `language`/`category` text fields | `runFullPipeline` |
| `/api/speak-listing` | POST | JSON `{ listing }` | `speakListing` |
| `/api/artisan-stats` | POST | JSON `{ listings, expectedSalesPerListing? }` | `computeArtisanStats` |
| `/api/marketplace-sync` | POST | JSON `{ listing }` | `generateMockMarketplaceSync` |

`/api/generate-listing`'s response is `runFullPipeline`'s JSON unchanged,
except `enhancedImageUrl` gets rewritten from a local disk path to an
actual fetchable URL (`https://<your-render-url>/output/<file>.png`) —
same for `/api/speak-listing`'s returned `url`. That's the only thing
`server.js` changes about the data; everything else matches the shapes
documented above exactly.

### Running it locally

```bash
npm install
node server.js   # or: npm start
```
Defaults to `http://localhost:3000`. Test it with:
```bash
curl http://localhost:3000/health
```

### Deploying to Render (free tier)

1. Push this repo to GitHub (if it isn't already).
2. On https://dashboard.render.com, click **New > Blueprint**, and
   connect your GitHub repo. Render reads `render.yaml` automatically —
   build command, start command, and the free plan are already
   configured there, you don't need to fill those in manually.
3. Render will prompt you for the environment variable marked
   `sync: false` in `render.yaml` — that's `GEMINI_API_KEY`. Paste your
   real key there (same one from your local `.env`). This is the ONLY
   secret this server currently needs.
4. Click **Deploy**. First deploy takes a few minutes (installs
   dependencies, including native ones like `sharp`).

### Finding your public URL

Once deployed, Render shows it at the top of your service's dashboard
page — looks like `https://artisan-ai-listing-server.onrender.com` (or
whatever Render assigns; you can rename the service). **This is the
`baseUrl` your Expo app should use for every `fetch()`/`axios` call**
(e.g. `${baseUrl}/api/generate-listing`) — replace any local IP address
(`http://192.168.x.x:3000`) you were using for on-device testing with
this.

### Known limitations of Render's free tier — read before your demo

- **Cold starts:** a free-tier service spins down after ~15 minutes of
  no traffic, and takes 30-60s to wake back up on the next request.
  If you're demoing after a gap, hit `/health` a minute beforehand to
  wake it up, or the judges' first request will look like it's hanging.
- **Ephemeral disk:** every redeploy/restart wipes `uploads/` and
  `output/` — expected and fine, since both are meant to hold only
  transient per-request files, not permanent storage. Don't rely on a
  previously-generated `enhancedImageUrl` staying valid forever; treat
  it as valid only until the next deploy/restart.
- **No persistent storage for real production use** — if this needs to
  survive restarts (e.g. serving old images weeks later), that needs
  real storage (Firebase Storage, S3, etc.), not this server's local
  disk. Out of scope for the hackathon demo, worth knowing before
  treating this as more permanent than it is.
