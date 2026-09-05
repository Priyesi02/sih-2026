#!/usr/bin/env node
// test.js
//
// Standalone CLI for testing the whole pipeline without any frontend.
//
// Usage:
//   node test.js <path-to-image> <path-to-audio> [language] [category]
//
// Example:
//   node test.js ./samples/pot.jpg ./samples/pot-description.wav Hindi pottery
//
// Audio input is mandatory — this mirrors the real flow where the
// artisan speaks their description instead of typing it.

require('dotenv').config();
const path = require('path');
const { runFullPipeline } = require('./index');

async function main() {
  const [, , imagePath, audioPath, language, category] = process.argv;

  if (!imagePath || !audioPath) {
    console.error('Usage: node test.js <path-to-image> <path-to-audio> [language] [category]');
    console.error('Example: node test.js ./photo.jpg ./description.wav Hindi pottery');
    process.exit(1);
  }

  console.log('Running pipeline...');
  console.log('  Image:', path.resolve(imagePath));
  console.log('  Audio:', path.resolve(audioPath));
  if (language) console.log('  Language hint:', language);
  if (category) console.log('  Category hint:', category);
  console.log('');

  // runFullPipeline no longer throws for API-level failures — it returns
  // { success: false, error } so a frontend can show a friendly message
  // instead of crashing. Only missing required args still throw (those
  // are programmer errors, not runtime failures), so we still wrap this
  // in try/catch for that case.
  try {
    const result = await runFullPipeline({ imagePath, audioPath, language, category });

    if (!result.success) {
      console.error('\nPipeline reported failure:');
      console.error(result.error);
      process.exit(1);
    }

    console.log('\n--- FINAL LISTING (Firestore-ready) ---\n');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('\nPipeline threw an unexpected error:');
    console.error(err.message);
    process.exit(1);
  }
}

main();
