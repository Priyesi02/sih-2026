// lib/speakListing.js
//
// Builds a short spoken confirmation ("here's your description and
// price") from a generated listing and synthesizes it as audio, so the
// artisan can hear their listing read back instead of having to read it
// themselves — important for a low-literacy user, which is exactly who
// this app is for.
//
// This speaks back in the ARTISAN'S OWN detected language (via
// descriptionLocal/detectedLanguage from generateListing.js), not a
// fixed Hindi-only confirmation — verified working for Tamil, Telugu,
// and Bengali during testing, not just assumed to work.
//
// Why there's a second small Gemini call here: generateListing.js
// writes descriptionLocal BEFORE the price is known (pricing runs after
// Gemini responds, via the trained regression model — see
// lib/pricingModel.js), so it can't include the price in that
// description. Hardcoding a price sentence in one language (e.g. Hindi)
// would break for every other language, so instead we ask Gemini for a
// short, correctly-phrased price sentence in whatever language was
// detected. This is a fast text-only call (~1-2s), not another slow TTS
// call — small cost for actually getting the language right.

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { synthesizeSpeech } = require('./textToSpeech');

// Same lightweight text model used elsewhere — this call is just a
// couple of words of output, so latency here is small regardless.
const TEXT_MODEL_NAME = 'gemini-3.5-flash-lite';

/**
 * Asks Gemini for a short, natural spoken sentence stating the price
 * range, in the artisan's own detected language.
 */
async function buildPriceSentence({ detectedLanguage, suggestedPriceMin, suggestedPriceMax }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('speakListing: GEMINI_API_KEY is not set. Copy .env.example to .env and add your key.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: TEXT_MODEL_NAME });

  const prompt = `Write ONE short, natural spoken sentence in ${detectedLanguage} (native script, not transliterated) telling someone that a product's estimated selling price is between ₹${suggestedPriceMin} and ₹${suggestedPriceMax}. Return ONLY that sentence — no quotes, no extra text.`;

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

/**
 * Speaks a generated listing's description + price back as audio, in
 * the artisan's own detected language.
 *
 * @param {Object} listing - must include descriptionLocal, detectedLanguage,
 *   suggestedPriceMin, suggestedPriceMax (i.e. the object returned by
 *   generateListing()/runFullPipeline()).
 * @returns {Promise<string>} - path to the saved .wav file.
 */
async function speakListing({ descriptionLocal, detectedLanguage, suggestedPriceMin, suggestedPriceMax }) {
  if (!descriptionLocal) throw new Error('speakListing: descriptionLocal is required');
  if (!detectedLanguage) throw new Error('speakListing: detectedLanguage is required');
  if (typeof suggestedPriceMin !== 'number' || typeof suggestedPriceMax !== 'number') {
    throw new Error('speakListing: suggestedPriceMin/suggestedPriceMax must be numbers');
  }

  const priceSentence = await buildPriceSentence({ detectedLanguage, suggestedPriceMin, suggestedPriceMax });
  const spokenText = `${descriptionLocal} ${priceSentence}`;

  return synthesizeSpeech(spokenText, `listing-audio-${Date.now()}`);
}

module.exports = { speakListing };
