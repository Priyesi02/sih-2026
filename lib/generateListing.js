// lib/generateListing.js
//
// This is the "brain" of the pipeline. It sends the product photo AND the
// artisan's transcript to Gemini in a single request, and asks Gemini to
// come back with an English description, a Hindi description, a
// description in the artisan's OWN detected language (for reading back
// to them — see descriptionLocal below), a short heritage/craft story,
// a category guess, and a formal B2B/procurement-style description
// (b2bDescription). PRICING (retail AND wholesale) IS NOT FROM GEMINI —
// see the pricing sections below for why.

const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { clampPriceToSaneRange } = require('./pricingReference');
const { predictPrice, getTrainedCategories } = require('./pricingModel');
const { formatSchemesForPrompt, getSchemeNames } = require('./governmentSchemesReference');
const { computeWholesalePrice, computeMinOrderQuantity } = require('./b2bPricing');

// gemini-2.5-flash-lite was retired for new users; Google's API points to
// gemini-3.5-flash-lite as the replacement.
const MODEL_NAME = 'gemini-3.5-flash-lite';

// Maps common image extensions to the MIME type Gemini expects.
// (Gemini needs to be told the mime type of the base64 data we send it.)
const MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

// What we require Gemini itself to return. Pricing fields are
// deliberately NOT here — Gemini isn't a trained pricing model, and
// asking an LLM to "guess a number" is exactly the inconsistency this
// pipeline used to have. Price is computed separately below by an
// actual trained regression model (lib/pricingModel.js) and merged in
// before the final validation against FULL_LISTING_SCHEMA.
//
// descriptionLocal/detectedLanguage exist because descriptionEn/Hi alone
// don't actually match the artisan's own spoken language (e.g. a Tamil
// speaker's transcript is Tamil, but the listing used to only ever offer
// English/Hindi back). descriptionLocal is used specifically for reading
// the listing back to the ARTISAN (see lib/speakListing.js) — it's not a
// buyer-facing field, that's still descriptionEn/descriptionHi for broad
// marketplace reach.
// materialQualityTier/sizeTier feed the pricing model (lib/pricingModel.js).
// These used to be guessed by keyword-matching the transcript in English/
// Hindi only (lib/priceFeatureExtractor.js, now removed) — which silently
// missed the same signal in every other language (e.g. "பட்டு"/"தங்க",
// Tamil for silk/gold, matched nothing). Gemini already reads the
// transcript in whatever language it's in, so asking IT to classify
// these two tiers is both more accurate AND costs zero extra API calls
// — it's the same request that already produces the descriptions.
// suggestedSchemes: government scheme suggestions. Validated separately
// (see validateAndFilterSchemes below) rather than by the generic
// typeof check here, because it's an array of objects, not a
// primitive — and because unlike the other fields, a hallucinated
// scheme NAME here isn't just a formatting nuisance, it's potentially
// misleading information for a real person about real government
// benefits. Every name Gemini returns gets checked against the actual
// verified list in lib/governmentSchemesReference.js and dropped if it
// doesn't match exactly (see that file's comment for why this matters
// more than the other grounded fields).
// b2bDescription: a formal, factual rewrite of the description for
// bulk/wholesale/govt-procurement buyers (see B2B section below). This
// IS safe to ask Gemini for directly — it's a style/tone rewrite of
// facts Gemini already generated (descriptionEn), not a new factual
// claim, so it doesn't carry the same hallucination risk as pricing or
// scheme names.
// geminiPriceMin/geminiPriceMax: UPDATE — pricing now starts as Gemini's
// OWN initial guess (previous versions of this file deliberately never
// asked Gemini for a price, to avoid LLM hallucination on numbers — see
// git history / HANDOFF.md 5.5 for that reasoning). That's been
// reversed on purpose: Gemini's guess is now used as the COLD-START
// price when the platform doesn't have enough real listings yet in a
// category, and lib/adaptivePricing.js gradually shifts toward
// real accumulated Firestore data as it grows (see that file). The
// trained synthetic regression model (lib/pricingModel.js) still runs
// too and acts as a safety-net anchor/clamp, not as the primary source
// anymore — see the assembly code below.
// ecoRating: a coarse, semantic sustainability judgment (natural/
// biodegradable materials = high, synthetic/plastic-heavy = low) — this
// is an interpretive judgment call, not a factual claim like a scheme
// name or a price, so it carries a similar (low) risk profile to
// materialQualityTier, which is already asked from Gemini the same way.
// title: a SHORT product name (2-5 words, e.g. "Purple Thread Scrunchie",
// "Blue Terracotta Diya Set") — added because descriptionEn is a full
// marketing sentence, which looked wrong truncated as a card "title" in
// the Listings screen. This is what UI list/card titles actually use now.
const GEMINI_RESPONSE_SCHEMA = {
  title: 'string',
  descriptionEn: 'string',
  descriptionHi: 'string',
  descriptionLocal: 'string',
  detectedLanguage: 'string',
  craftStory: 'string',
  category: 'string',
  materialQualityTier: 'string',
  sizeTier: 'string',
  ecoRating: 'string',
  useCase: 'string', // short marketing phrase, e.g. "Great for home décor, festive gifting, or everyday wear" — used in the shareable video/poster (see lib/generateVideo.js, lib/generatePoster.js) so they can say something persuasive beyond just showing the photo
  suggestedSchemes: 'object', // arrays are typeof 'object' in JS; see validateAndFilterSchemes for the real check
  b2bDescription: 'string',
  geminiPriceMin: 'number',
  geminiPriceMax: 'number',
};

// materialQualityTier/sizeTier string values -> the 0/1/2 numeric
// encoding lib/pricingModel.js was trained on (see scripts/trainPricingModel.js).
const QUALITY_TIER_MAP = { basic: 0, mid: 1, premium: 2 };
const SIZE_TIER_MAP = { small: 0, medium: 1, large: 2 };

// The full shape callers of generateListing() actually get back.
// suggestedPriceMin/Max/priceReasoning/wholesalePriceMin/Max/
// minOrderQuantity/schemeMatches are all added programmatically after
// Gemini responds — none of them are Gemini's own guess (see the B2B
// section further down for why wholesale price/MOQ/schemeMatches are
// computed, not asked from Gemini, same reasoning as retail pricing).
const FULL_LISTING_SCHEMA = {
  ...GEMINI_RESPONSE_SCHEMA,
  suggestedPriceMin: 'number',
  suggestedPriceMax: 'number',
  priceReasoning: 'string',
  priceSource: 'string', // 'gemini-coldstart' here; lib/adaptivePricing.js may later change this to 'active-learning'
  trainedModelPriceMin: 'number', // the synthetic-model's own prediction, kept around as an anchor for adaptivePricing.js's blending — not shown as the headline price
  trainedModelPriceMax: 'number',
  wholesalePriceMin: 'number',
  wholesalePriceMax: 'number',
  minOrderQuantity: 'number',
  schemeMatches: 'object', // array of strings; arrays are typeof 'object' in JS
};

/**
 * Reads an image file from disk and returns { mimeType, base64Data },
 * ready to be embedded in a Gemini request.
 */
function imageToBase64Part(imagePath) {
  if (!fs.existsSync(imagePath)) {
    throw new Error(`generateListing: image not found at "${imagePath}"`);
  }
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = MIME_TYPES[ext] || 'image/jpeg'; // reasonable fallback
  const base64Data = fs.readFileSync(imagePath).toString('base64');
  return { mimeType, base64Data };
}

/**
 * Gemini is asked to return raw JSON, but models often wrap it in a
 * ```json ... ``` markdown fence anyway (or add stray whitespace). This
 * strips any fence and returns just the JSON text.
 */
function stripMarkdownFence(text) {
  const trimmed = text.trim();
  // Matches ```json ... ``` or plain ``` ... ```
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  return trimmed;
}

/**
 * Checks that an object has every field in `schema`, with the right
 * type. Throws a clear error naming exactly what's wrong, so it's easy
 * to debug flaky model output during the hackathon. Used twice: once
 * right after parsing Gemini's response (against GEMINI_RESPONSE_SCHEMA),
 * and once on the final assembled object (against FULL_LISTING_SCHEMA).
 */
function validateShape(obj, schema, sourceLabel) {
  for (const [field, expectedType] of Object.entries(schema)) {
    if (!(field in obj)) {
      throw new Error(`generateListing: ${sourceLabel} missing field "${field}"`);
    }
    if (typeof obj[field] !== expectedType) {
      throw new Error(
        `generateListing: ${sourceLabel} field "${field}" should be ${expectedType}, got ${typeof obj[field]}`
      );
    }
  }
}

/**
 * Maps a tier string (e.g. "premium") to its trained numeric encoding
 * (e.g. 2). If Gemini returns something outside the expected enum, logs
 * a warning and falls back to the middle tier rather than crashing —
 * consistent with this pipeline's general "never let one weird field
 * break the whole request" approach.
 */
function mapTierToNumber(map, value, fieldName) {
  const normalized = (value || '').toLowerCase().trim();
  if (normalized in map) return map[normalized];
  console.warn(`[generateListing] unexpected ${fieldName} "${value}" from Gemini — defaulting to the middle tier`);
  return 1;
}

/**
 * Validates Gemini's suggestedSchemes array and drops anything that
 * isn't an exact match to a real, verified scheme name (see
 * lib/governmentSchemesReference.js). This is stricter than the other
 * validation in this file on purpose — a hallucinated scheme name here
 * isn't a cosmetic bug, it's potentially wrong information about real
 * government benefits told to a real person. When in doubt, drop it.
 */
function validateAndFilterSchemes(rawSchemes) {
  const knownNames = getSchemeNames();

  if (!Array.isArray(rawSchemes)) {
    console.warn('[generateListing] suggestedSchemes was not an array from Gemini — returning no scheme suggestions');
    return [];
  }

  const filtered = rawSchemes.filter((item) => {
    const isValidShape = item && typeof item.name === 'string' && typeof item.reason === 'string';
    if (!isValidShape) {
      console.warn('[generateListing] dropped a malformed suggestedSchemes entry:', item);
      return false;
    }
    const isKnownScheme = knownNames.includes(item.name);
    if (!isKnownScheme) {
      console.warn(
        `[generateListing] dropped hallucinated scheme name "${item.name}" — not in the verified list (${knownNames.join(', ')})`
      );
      return false;
    }
    return true;
  });

  // Cap at 2, as instructed in the prompt — a defensive limit in case
  // Gemini ever returns more.
  return filtered.slice(0, 2);
}

/**
 * Builds the prompt sent alongside the image. Keeping it in one place
 * makes it easy to tweak wording during the hackathon without touching
 * the request/parsing logic.
 */
function buildPrompt({ transcriptText, category }) {
  return `
You are helping a marginalized artisan in India create a professional online
product listing from a photo of their product and a spoken description they
gave (transcribed below, possibly in a regional language, possibly mixed
with English).

Artisan's spoken description (transcript):
"""
${transcriptText}
"""

${category ? `The artisan/seller suggests the category is: "${category}".` : ''}

Look at the attached product photo and the transcript together, then return
a listing as JSON. Respond with ONLY valid JSON — no markdown code fences,
no explanations, no extra text before or after. The JSON must have EXACTLY
these fields:

{
  "title": string,              // SHORT product name/title, 2-5 words, e.g. "Purple Thread Scrunchie" or "Blue Terracotta Diya Set" — NOT a sentence, no marketing adjectives beyond a material/color descriptor, just what it plainly IS. This is shown as the card title in listings, so keep it simple and scannable.
  "descriptionEn": string,      // SEO-friendly, professional product description in English, 2-3 sentences
  "descriptionHi": string,      // the SAME description translated into Hindi
  "detectedLanguage": string,   // the language the artisan's transcript above is actually written in (e.g. "Tamil", "Hindi", "Telugu", "English", "Marathi") — identify this from the transcript text itself, not from any hint given
  "descriptionLocal": string,   // the SAME description in "detectedLanguage", in that language's native script. If detectedLanguage is English, this can equal descriptionEn. If it's Hindi, this can equal descriptionHi.
  "craftStory": string,         // short 2-3 sentence emotional heritage/story about this craft tradition, written warmly as if about the artisan's own tradition
  "category": string,           // MUST be exactly one of: ${getTrainedCategories().join(', ')}, other
  "materialQualityTier": string, // MUST be exactly one of: basic, mid, premium — judge from the ACTUAL MEANING of the materials/craftsmanship described (in whatever language the transcript is in) and the photo. Pure silk/real gold/real silver/fine zari or embroidery/intricate hand-detailing = premium. Everyday/simple/plain materials = basic. Anything else = mid.
  "sizeTier": string,           // MUST be exactly one of: small, medium, large — judge from size/quantity mentioned or visible in the photo. Default to medium if unclear.
  "ecoRating": string,          // MUST be exactly one of: low, mid, high — how eco-friendly/sustainable the materials appear. Natural, biodegradable, locally-sourced, hand-processed materials (clay, bamboo, cane, cotton, jute, wood, natural dyes) = high. Synthetic, plastic, chemically-processed, or heavily machine-manufactured-looking materials = low. Anything mixed or unclear = mid.
  "useCase": string,            // ONE short, concrete phrase (5-10 words) suggesting who would buy this or how it's used/given — e.g. "Perfect for festive gifting or home décor" or "Everyday wear for college or office". Ground this in the ACTUAL product, not generic filler.
  "suggestedSchemes": [ { "name": string, "reason": string } ], // 1-2 relevant Indian government schemes for this artisan, see rules below. Can be an empty array [] if none genuinely fit.
  "b2bDescription": string,     // a SHORT, FORMAL rewrite of the product for a bulk/wholesale buyer or government procurement listing — different tone than descriptionEn: factual and businesslike, not emotional. Mention material, craftsmanship method, and durability/quality. No marketing language ("exquisite", "timeless elegance", etc.) — write it like a procurement catalog entry, not an ad.
  "geminiPriceMin": number,     // your OWN best-guess realistic retail price in INR (rupees, integer, no symbol) for a product LIKE THIS on an Indian handicraft marketplace — the low end of a fair range, based on the materials, craftsmanship, size, and quality tier you judged above
  "geminiPriceMax": number      // the high end of that same fair INR price range
}

For "category", pick whichever of those exact values is the closest match
to the product — only use "other" if genuinely none of them fit. This
exact value is used downstream by a separate pricing system, so it must
match one of the listed options precisely (same spelling/casing).

IMPORTANT for "materialQualityTier": judge this from what the transcript
actually MEANS, not from English/Hindi keyword matching — the transcript
may be in Tamil, Telugu, Bengali, or any other language, and a mention of
silk or gold in that language counts just as much as it would in English.

For "suggestedSchemes": choose 1-2 schemes ONLY from this exact list —
do NOT invent, rename, or use any scheme not listed here, and use each
"name" EXACTLY as written below (this is checked programmatically
afterward, and anything not matching exactly will be discarded):

${formatSchemesForPrompt()}

Pick whichever scheme(s) best match this product's category. For each,
write "reason" as ONE short, encouraging sentence in plain language,
explicitly framed as something to VERIFY, not a guarantee — e.g. "As a
potter, you may be eligible for..." or "Worth checking with your local
MSME office about...". Do NOT claim the artisan definitely qualifies —
you don't know their age, documents, or family history, all of which
affect real eligibility. If genuinely nothing in the list fits this
product, return an empty array for "suggestedSchemes".

For "b2bDescription": write it for a procurement officer or wholesale
buyer, not a consumer — lead with material and construction method,
mention durability/quality/quantity capability if implied by the
transcript, and skip emotional/marketing phrasing entirely.

For "geminiPriceMin"/"geminiPriceMax": give a genuine, realistic estimate
based on typical Indian handicraft marketplace prices (Amazon Karigar,
GeM, Etsy India-type listings) for this category/quality/size — this is
used as an initial estimate that will be refined over time using real
listings on this platform, so a reasonable ballpark is what's needed,
not perfect precision. Do NOT include wholesale price or MOQ (minimum
order quantity) — those are handled separately. Return ONLY the JSON
object above.
`.trim();
}

/**
 * Sends the image + transcript to Gemini for the descriptive fields,
 * then computes pricing separately with the trained regression model
 * (lib/pricingModel.js) instead of asking Gemini to guess a number.
 * Returns a validated object matching FULL_LISTING_SCHEMA.
 *
 * @param {Object} params
 * @param {string} params.transcriptText - artisan's description (any language).
 * @param {string} params.imagePath - path to the product photo (original or enhanced).
 * @param {string} [params.category] - optional hint if the artisan already picked a category.
 * @returns {Promise<Object>} - validated listing object.
 */
async function generateListing({ transcriptText, imagePath, category }) {
  if (!transcriptText) throw new Error('generateListing: transcriptText is required');
  if (!imagePath) throw new Error('generateListing: imagePath is required');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'generateListing: GEMINI_API_KEY is not set. Copy .env.example to .env and add your key.'
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const { mimeType, base64Data } = imageToBase64Part(imagePath);
  const prompt = buildPrompt({ transcriptText, category });

  // Send the text prompt and the image together in one request so Gemini
  // can use both to write the description/story/category.
  const result = await model.generateContent([
    { text: prompt },
    { inlineData: { mimeType, data: base64Data } },
  ]);

  const rawText = result.response.text();
  const jsonText = stripMarkdownFence(rawText);

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    // Log the raw response so it's visible in the terminal even though
    // we're about to throw — otherwise the raw text is lost the moment
    // the error propagates up.
    console.error('[generateListing] Raw Gemini response (failed to parse as JSON):');
    console.error(rawText);
    throw new Error(`Gemini returned invalid JSON: ${rawText}`);
  }

  // Gemini sometimes returns numeric fields as strings (e.g. "450"
  // instead of 450) despite the prompt asking for a number — coerce
  // before the strict typeof check below rather than failing the whole
  // request over a formatting quirk.
  if (typeof parsed.geminiPriceMin === 'string') parsed.geminiPriceMin = parseFloat(parsed.geminiPriceMin);
  if (typeof parsed.geminiPriceMax === 'string') parsed.geminiPriceMax = parseFloat(parsed.geminiPriceMax);

  validateShape(parsed, GEMINI_RESPONSE_SCHEMA, 'Gemini response');

  // ---- Government schemes: strict allowlist filtering ------------------
  // See lib/governmentSchemesReference.js and validateAndFilterSchemes's
  // own comment for why this is stricter than the other fields here —
  // any scheme name Gemini invents that isn't on the verified list gets
  // silently dropped rather than shown to the artisan.
  parsed.suggestedSchemes = validateAndFilterSchemes(parsed.suggestedSchemes);

  // ---- Pricing: Gemini's own initial guess, anchored by the trained model --
  // qualityTier/sizeTier come from Gemini's OWN classification above
  // (materialQualityTier/sizeTier in its JSON response) — Gemini already
  // read the transcript in whatever language it's in, so this is far
  // more accurate across languages than English/Hindi keyword matching
  // would be. The trained regression model (scripts/trainPricingModel.js)
  // still runs here too, but now purely as a stable ANCHOR — its own
  // prediction is kept on the listing (trainedModelPriceMin/Max) for
  // lib/adaptivePricing.js to blend toward once enough real listings
  // accumulate in a category, and Gemini's own guess is used directly as
  // the COLD-START price up front.
  const qualityTier = mapTierToNumber(QUALITY_TIER_MAP, parsed.materialQualityTier, 'materialQualityTier');
  const sizeTier = mapTierToNumber(SIZE_TIER_MAP, parsed.sizeTier, 'sizeTier');
  const pricePrediction = predictPrice({ category: parsed.category, qualityTier, sizeTier });
  const trainedModelPriceMin = pricePrediction.priceMin;
  const trainedModelPriceMax = pricePrediction.priceMax;

  let suggestedPriceMin = parsed.geminiPriceMin;
  let suggestedPriceMax = parsed.geminiPriceMax;
  let priceReasoning =
    `Initial AI estimate based on this product's materials, craftsmanship, and typical Indian handicraft ` +
    `marketplace prices — this refines automatically as more real listings are published in this category.`;

  // If Gemini's guess is missing/malformed (non-finite, zero/negative, or
  // reversed), fall back to the trained model's own prediction entirely
  // rather than shipping garbage numbers.
  const isValidGeminiGuess =
    Number.isFinite(suggestedPriceMin) && Number.isFinite(suggestedPriceMax) &&
    suggestedPriceMin > 0 && suggestedPriceMax > 0 && suggestedPriceMin <= suggestedPriceMax;
  if (!isValidGeminiGuess) {
    console.warn(
      `[generateListing] Gemini's price guess was invalid (min=${parsed.geminiPriceMin}, max=${parsed.geminiPriceMax}) — falling back to the trained model's prediction`
    );
    suggestedPriceMin = trainedModelPriceMin;
    suggestedPriceMax = trainedModelPriceMax;
    priceReasoning = pricePrediction.reasoning;
  }

  // Safety net either way: pull back into a sane band for the stated
  // category (this is what catches an LLM hallucinating ₹50,000 for a
  // basic clay diya, or ₹20 for a premium silk saree).
  const clamp = clampPriceToSaneRange(parsed.category, suggestedPriceMin, suggestedPriceMax);
  if (clamp.wasClamped) {
    console.warn(
      `[generateListing] price clamped for category "${parsed.category}": ` +
        `suggested ₹${suggestedPriceMin}-₹${suggestedPriceMax}, adjusted to ₹${clamp.min}-₹${clamp.max}`
    );
    suggestedPriceMin = clamp.min;
    suggestedPriceMax = clamp.max;
  }
  // Surfaced so the mock marketplace-approval logic (see
  // lib/mockMarketplaceSync.js) can flag suspiciously-priced listings
  // for "review" the same way a real marketplace's fraud/QA check might.
  const priceWasClamped = clamp.wasClamped;

  // ---- B2B/wholesale fields: computed, not Gemini's own guess -----------
  // Same rationale as retail pricing above — see lib/b2bPricing.js's
  // top comment. wholesalePrice is a fixed discount off the retail price
  // just computed; minOrderQuantity comes from a category+size reference
  // table (same pattern as lib/pricingReference.js).
  const { wholesalePriceMin, wholesalePriceMax } = computeWholesalePrice(suggestedPriceMin, suggestedPriceMax);
  const minOrderQuantity = computeMinOrderQuantity(parsed.category, sizeTier);

  // schemeMatches: the request for this feature asked for a plain array
  // of scheme-name strings. Rather than asking Gemini for a SECOND,
  // separate list of scheme names (reintroducing the exact hallucination
  // risk suggestedSchemes was built to prevent), this just re-uses the
  // already-verified suggestedSchemes computed above.
  const schemeMatches = parsed.suggestedSchemes.map((scheme) => scheme.name);

  const finalListing = {
    ...parsed,
    suggestedPriceMin,
    suggestedPriceMax,
    priceReasoning,
    priceSource: 'gemini-coldstart', // lib/adaptivePricing.js overwrites this to 'active-learning' once enough real data exists — see server.js
    priceWasClamped,
    trainedModelPriceMin,
    trainedModelPriceMax,
    wholesalePriceMin,
    wholesalePriceMax,
    minOrderQuantity,
    schemeMatches,
  };

  validateShape(finalListing, FULL_LISTING_SCHEMA, 'assembled listing');

  return finalListing;
}

module.exports = { generateListing };
