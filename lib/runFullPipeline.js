// lib/runFullPipeline.js
//
// Glues the steps together into one call:
//   photo + audio recording  ->  enhanced photo + AI-written listing
//
// NOTE: this does NOT generate spoken audio automatically. speakListing()
// exists as a separate, standalone function (import it directly) meant
// to be called ON DEMAND — e.g. when the artisan taps a "Listen" button
// — not on every listing generated. Why: Gemini's TTS model
// (gemini-2.5-flash-preview-tts) has a free-tier cap of just 10
// requests PER DAY (discovered by hitting it during testing — see
// HANDOFF.md section 5.6). Calling it automatically here would burn
// through that in a handful of listings, well before an actual demo.
//
// Reliability rules used here (important during a live demo!):
//   - If enhanceImage() fails, we DON'T crash the whole pipeline — we log
//     a warning and fall back to the original, unenhanced photo.
//   - transcribeVoice() and generateListing() both call Gemini, so each
//     gets one automatic retry (via withRetry) before we give up on it.
//   - If transcription or listing generation still fails after the
//     retry, we return { success: false, error: "..." } instead of
//     throwing, so the calling frontend can show a friendly "try again"
//     message instead of crashing.
//   - On success, we return { success: true, ...listing }.
//
// Every stage logs its input, output, and timing so it's obvious from
// the terminal exactly what happened and how long each step took.

const { enhanceImage } = require('./enhanceImage');
const { transcribeVoice } = require('./transcribeVoice');
const { generateListing } = require('./generateListing');
const { withRetry } = require('./withRetry');

/**
 * @param {Object} params
 * @param {string} params.imagePath - path to the raw product photo.
 * @param {string} params.audioPath - path to the artisan's audio recording.
 * @param {string} [params.language] - optional language hint for transcription (e.g. "Hindi").
 * @param {string} [params.category] - optional category hint.
 * @returns {Promise<Object>} - either { success: true, ...listing } or { success: false, error }.
 */
async function runFullPipeline({ imagePath, audioPath, language, category }) {
  // These two are programmer errors (caller forgot a required arg), not
  // runtime API failures, so we throw immediately rather than returning
  // a soft error object for them.
  if (!imagePath) throw new Error('runFullPipeline: imagePath is required');
  if (!audioPath) throw new Error('runFullPipeline: audioPath is required (audio input is mandatory)');

  console.log('\n[runFullPipeline] Starting pipeline...');
  console.time('[runFullPipeline] TOTAL TIME');

  // ---- Stage 1: enhance the photo (with fallback) ----------------------
  console.log('\n[Stage 1/3] enhanceImage — input:', imagePath);
  console.time('[Stage 1/3] enhanceImage');
  let enhancedImageUrl;
  try {
    enhancedImageUrl = await enhanceImage(imagePath);
    console.log('[Stage 1/3] enhanceImage succeeded — output:', enhancedImageUrl);
  } catch (err) {
    console.warn(`[Stage 1/3] enhanceImage FAILED ("${err.message}") — falling back to the original photo`);
    enhancedImageUrl = imagePath;
  }
  console.timeEnd('[Stage 1/3] enhanceImage');

  // ---- Stage 2: transcribe the audio (retry once, no fallback) --------
  console.log('\n[Stage 2/3] transcribeVoice — input:', audioPath);
  console.time('[Stage 2/3] transcribeVoice');
  let transcriptText;
  try {
    transcriptText = await withRetry(() => transcribeVoice(audioPath, language), 'transcribeVoice');
    console.log('[Stage 2/3] transcribeVoice succeeded — output:', transcriptText);
  } catch (err) {
    console.timeEnd('[Stage 2/3] transcribeVoice');
    console.error(`[Stage 2/3] transcribeVoice FAILED after retry: ${err.message}`);
    console.timeEnd('[runFullPipeline] TOTAL TIME');
    return { success: false, error: `Voice transcription failed: ${err.message}` };
  }
  console.timeEnd('[Stage 2/3] transcribeVoice');

  // ---- Stage 3: generate the listing (retry once, no fallback) --------
  console.log('\n[Stage 3/3] generateListing — input transcript:', transcriptText);
  console.time('[Stage 3/3] generateListing');
  let listing;
  try {
    listing = await withRetry(
      () => generateListing({ transcriptText, imagePath: enhancedImageUrl, category }),
      'generateListing'
    );
    console.log('[Stage 3/3] generateListing succeeded — output:', listing);
  } catch (err) {
    console.timeEnd('[Stage 3/3] generateListing');
    console.error(`[Stage 3/3] generateListing FAILED after retry: ${err.message}`);
    console.timeEnd('[runFullPipeline] TOTAL TIME');
    return { success: false, error: `Listing generation failed: ${err.message}` };
  }
  console.timeEnd('[Stage 3/3] generateListing');

  console.timeEnd('[runFullPipeline] TOTAL TIME');

  // ---- Assemble the final Firestore-shaped draft document --------------
  // Spread `...listing` FIRST so every field generateListing() produces
  // survives (including ones added later, e.g. ecoRating, priceSource,
  // trainedModelPriceMin/Max — this used to be a hand-picked field list
  // that silently dropped anything new added to generateListing.js's
  // output without a matching edit here) — then the fields below
  // explicitly override/add the ones that come from THIS stage, not from
  // generateListing() itself.
  return {
    ...listing,
    success: true,
    imageUrl: imagePath,
    enhancedImageUrl,
    transcriptText,
    status: 'draft',
  };
}

module.exports = { runFullPipeline };
