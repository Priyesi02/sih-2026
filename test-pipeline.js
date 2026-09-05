#!/usr/bin/env node
// test-pipeline.js
//
// Manual end-to-end tester for image enhancement + listing generation,
// driven by a TYPED transcript instead of an audio file. Handy for
// quickly trying photo + description combos without recording audio
// every time.
//
// NOTE: runFullPipeline() (in lib/runFullPipeline.js) requires a real
// audio file, since audio input is mandatory in the real product flow —
// use test.js for that. This script instead calls enhanceImage() and
// generateListing() directly, so you can test with plain text.
//
// Spoken audio (speakListing) is OPT-IN via --speak, not automatic —
// Gemini's TTS free tier caps out at just 10 requests/day, so don't burn
// it on every quick test. See HANDOFF.md section 5.6.
//
// Usage:
//   node test-pipeline.js <path-to-image> "<transcript text>" [category] [--speak]
//
// Examples:
//   node test-pipeline.js ./samples/pot.jpg "Mitti ka bartan hai" pottery
//   node test-pipeline.js ./samples/pot.jpg "Mitti ka bartan hai" pottery --speak

require('dotenv').config();
const path = require('path');
const { enhanceImage } = require('./lib/enhanceImage');
const { generateListing } = require('./lib/generateListing');
const { speakListing } = require('./lib/speakListing');
const { generateMockMarketplaceSync } = require('./lib/mockMarketplaceSync');

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--speak');
  const shouldSpeak = process.argv.includes('--speak');
  const [imagePath, transcriptText, category] = args;

  if (!imagePath || !transcriptText) {
    console.error('Usage: node test-pipeline.js <path-to-image> "<transcript text>" [category] [--speak]');
    process.exit(1);
  }

  console.log('=== Manual pipeline test (image + typed transcript) ===');
  console.log('Image:', path.resolve(imagePath));
  console.log('Transcript:', transcriptText);
  if (category) console.log('Category hint:', category);
  if (!shouldSpeak) console.log('(pass --speak to also test text-to-speech — costs 1 of the 10/day TTS quota)');

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

  // ---- Stage 2: generate the listing ------------------------------------
  console.log('\n[Stage 2/3] generateListing — input transcript:', transcriptText);
  console.time('[Stage 2/3] generateListing');
  let listing;
  try {
    listing = await generateListing({ transcriptText, imagePath: enhancedImageUrl, category });
    console.timeEnd('[Stage 2/3] generateListing');
  } catch (err) {
    console.timeEnd('[Stage 2/3] generateListing');
    console.error('\ngenerateListing failed:', err.message);
    process.exit(1);
  }

  // ---- Stage 3 (optional, --speak only): speak the description + price back ----
  let spokenAudioUrl = null;
  if (shouldSpeak) {
    console.log('\n[Stage 3/3] speakListing — reading back description + price (this is slow, ~20-25s)');
    console.time('[Stage 3/3] speakListing');
    try {
      spokenAudioUrl = await speakListing(listing);
      console.log('[Stage 3/3] speakListing succeeded — output:', spokenAudioUrl);
    } catch (err) {
      console.warn(`[Stage 3/3] speakListing FAILED ("${err.message}") — continuing without spoken audio`);
    }
    console.timeEnd('[Stage 3/3] speakListing');
  }

  const finalOutput = {
    success: true,
    imageUrl: imagePath,
    enhancedImageUrl,
    ...listing,
    spokenAudioUrl,
    status: 'draft',
  };

  console.log('\n--- FINAL OUTPUT ---\n');
  console.log(JSON.stringify(finalOutput, null, 2));

  console.log('\n--- B2B / GOVT MARKETPLACE ---\n');
  console.log('b2bDescription:  ', listing.b2bDescription);
  console.log('wholesale price: ', `₹${listing.wholesalePriceMin} - ₹${listing.wholesalePriceMax}`);
  console.log('minOrderQuantity:', listing.minOrderQuantity);
  console.log('schemeMatches:   ', listing.schemeMatches);
  console.log('\nmock marketplace sync (no real API call):');
  console.log(JSON.stringify(generateMockMarketplaceSync(listing), null, 2));
}

main();
