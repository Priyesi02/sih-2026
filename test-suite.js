#!/usr/bin/env node
// test-suite.js
//
// Runs generateListing() against a fixed set of realistic test cases and
// prints a pass/fail summary table, so you can sanity-check output
// quality (price ranges, Hindi translation) across different kinds of
// inputs. This only exercises generateListing() — it does NOT touch
// enhanceImage or transcribeVoice — so it's fast to re-run while you're
// iterating on the prompt or the parsing/validation logic.
//
// Usage:
//   node test-suite.js
//
// Requires:
//   - GEMINI_API_KEY set in .env
//   - the sample images referenced below present under ./samples/
//     (swap in your own real product photos — the filenames just need
//     to match what's listed in TEST_CASES below, or edit the paths)

require('dotenv').config();
const { generateListing } = require('./lib/generateListing');
const { generateMockMarketplaceSync } = require('./lib/mockMarketplaceSync');

// A realistic ~30-second rambling voice transcript, the way an artisan
// might actually talk — no punctuation discipline, trailing off,
// switching topics mid-sentence. Good for stress-testing the prompt.
const LONG_JEWELRY_TRANSCRIPT = `
haan toh yeh... yeh jo hai na, yeh meri dadi ne banaya tha, matlab unhone sikhaya
mujhe, toh main abhi bhi wahi tarika use karti hoon, silver ka hai yeh, thoda sa
oxidised finish hai upar, dekhiye kaise design hai isme, yeh peacock ka design hai,
mor ka, hamare yahan mor bahut shubh mana jata hai shaadi ke liye, toh yeh necklace
set hai, isme ek jhumka bhi aata hai match karke, kaafi log lete hai shaadi ke
season mein, ek mahine lagta hai banane mein kyunki haath se karna padta hai sab
kaam, machine se nahi hota yeh, thoda mehenga padta hai lekin quality bahut acchi
hai, kabhi kharab nahi hota, mere paas jo customers hai wo bolte hai ki 10 saal se
pehen rahe hai wahi set
`.trim();

const TEST_CASES = [
  {
    name: 'High-value product (silk saree)',
    imagePath: 'samples/silk-saree.jpg',
    transcriptText: 'Yeh Banarasi silk saree hai, haath se bunaa gaya, zari ka kaam hai',
  },
  {
    name: 'Low-value product (clay diya)',
    imagePath: 'samples/clay-diya.jpg',
    transcriptText: 'Mitti ka diya, Diwali ke liye banaya',
  },
  {
    name: 'Very short transcript (pottery)',
    imagePath: 'samples/pottery.jpg',
    transcriptText: 'pottery',
  },
  {
    name: 'Long rambling transcript (jewelry)',
    imagePath: 'samples/jewelry.jpg',
    transcriptText: LONG_JEWELRY_TRANSCRIPT,
  },
  {
    name: 'English-only transcript (basket)',
    imagePath: 'samples/basket.jpg',
    transcriptText: 'This is a handwoven bamboo basket made by local artisans',
  },
];

/**
 * Runs one test case and returns a result describing what happened.
 * Deliberately never throws — every failure mode (missing image, bad
 * JSON, failed schema validation, network error) is captured so the
 * whole suite can finish and print a full summary even if some cases
 * fail.
 */
async function runTestCase(test) {
  const start = Date.now();
  const row = {
    Test: test.name,
    'JSON Parsed': 'N/A',
    'Schema Valid': 'N/A',
    'Price Range (INR)': 'N/A',
    'Wholesale (INR)': 'N/A',
    MOQ: 'N/A',
    'Time (ms)': 'N/A',
    Result: 'FAIL',
  };

  try {
    const listing = await generateListing({
      transcriptText: test.transcriptText,
      imagePath: test.imagePath,
    });

    row['JSON Parsed'] = 'PASS';
    row['Schema Valid'] = 'PASS';
    row['Price Range (INR)'] = `${listing.suggestedPriceMin} - ${listing.suggestedPriceMax}`;
    row['Wholesale (INR)'] = `${listing.wholesalePriceMin} - ${listing.wholesalePriceMax}`;
    row.MOQ = listing.minOrderQuantity;
    row['Time (ms)'] = Date.now() - start;
    row.Result = 'PASS';

    return {
      row,
      descriptionHi: listing.descriptionHi,
      b2bDescription: listing.b2bDescription,
      schemeMatches: listing.schemeMatches,
      mockSync: generateMockMarketplaceSync(listing),
      error: null,
    };
  } catch (err) {
    row['Time (ms)'] = Date.now() - start;

    // generateListing.js uses distinct wording for a JSON-parse failure
    // vs. a schema-validation failure, so we can tell which stage broke
    // just by reading the error message (see lib/generateListing.js).
    if (err.message.includes('invalid JSON')) {
      row['JSON Parsed'] = 'FAIL';
      row['Schema Valid'] = 'N/A';
    } else if (err.message.includes('should be') || err.message.includes('missing field')) {
      row['JSON Parsed'] = 'PASS';
      row['Schema Valid'] = 'FAIL';
    }
    // Any other error (missing image file, missing API key, network
    // issue) leaves both columns as 'N/A' — the Result/error still show
    // it failed, just not because of parsing/schema.

    return { row, descriptionHi: null, b2bDescription: null, schemeMatches: null, mockSync: null, error: err.message };
  }
}

async function main() {
  console.log(`Running ${TEST_CASES.length} test cases against generateListing()...\n`);

  const results = [];
  for (const test of TEST_CASES) {
    console.log(`Running: ${test.name}...`);
    results.push(await runTestCase(test));
  }

  console.log('\n=== SUMMARY ===\n');
  console.table(results.map((r) => r.row));

  console.log('\n=== HINDI DESCRIPTIONS (manual quality check) ===\n');
  results.forEach((r, i) => {
    console.log(`${i + 1}. ${TEST_CASES[i].name}`);
    if (r.descriptionHi) {
      console.log(`   ${r.descriptionHi}`);
    } else {
      console.log(`   (no output — failed: ${r.error})`);
    }
    console.log('');
  });

  console.log('\n=== B2B / GOVT MARKETPLACE FIELDS ===\n');
  results.forEach((r, i) => {
    console.log(`${i + 1}. ${TEST_CASES[i].name}`);
    if (r.b2bDescription) {
      console.log(`   b2bDescription: ${r.b2bDescription}`);
      console.log(`   schemeMatches: ${JSON.stringify(r.schemeMatches)}`);
      console.log(`   mockMarketplaceSync: ${JSON.stringify(r.mockSync)}`);
    } else {
      console.log(`   (no output — failed: ${r.error})`);
    }
    console.log('');
  });

  const passCount = results.filter((r) => r.row.Result === 'PASS').length;
  console.log(`${passCount}/${TEST_CASES.length} test cases passed.`);

  // Non-zero exit if anything failed, so this can be wired into CI later.
  process.exit(passCount === TEST_CASES.length ? 0 : 1);
}

main();
