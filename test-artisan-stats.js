#!/usr/bin/env node
// test-artisan-stats.js
//
// Tests computeArtisanStats() with realistic mock listings (there's no
// real Firestore data yet, so this stands in for it). No AI/Gemini
// calls — pure, instant, free to re-run as many times as you want.
//
// Usage: node test-artisan-stats.js

const { computeArtisanStats } = require('./lib/artisanStats');

// A plausible artisan's listing history: some published, some still
// drafts, spanning a few categories/price points — same shape as what
// runFullPipeline() returns (status/suggestedPriceMin/suggestedPriceMax
// are the only fields this function actually reads).
const MOCK_LISTINGS = [
  { category: 'pottery', suggestedPriceMin: 205, suggestedPriceMax: 370, status: 'published' },
  { category: 'handloom textile', suggestedPriceMin: 5078, suggestedPriceMax: 9140, status: 'published' },
  { category: 'jewelry', suggestedPriceMin: 2892, suggestedPriceMax: 5206, status: 'published' },
  { category: 'bamboo', suggestedPriceMin: 336, suggestedPriceMax: 605, status: 'draft' }, // not published yet — excluded from earnings
  { category: 'pottery', suggestedPriceMin: 49, suggestedPriceMax: 88, status: 'published' },
];

function main() {
  console.log(`Computing stats for ${MOCK_LISTINGS.length} mock listings (4 published, 1 draft)...\n`);

  const stats = computeArtisanStats(MOCK_LISTINGS);
  console.log(JSON.stringify(stats, null, 2));

  console.log('\n--- Example UI copy ---\n');
  console.log(`${stats.publishedListings} listings published (${stats.draftListings} more in draft)`);
  console.log(`Estimated potential earnings: ₹${stats.potentialEarningsMin} - ₹${stats.potentialEarningsMax}`);
  console.log(`Your listings could earn ₹${stats.monthlyProjectionMin} - ₹${stats.monthlyProjectionMax} this month*`);
  console.log(`\n*${stats.projectionAssumption}`);

  // Also demonstrate the tunable assumption parameter.
  console.log('\n--- With a 2x expected-sales assumption ---\n');
  const optimistic = computeArtisanStats(MOCK_LISTINGS, { expectedSalesPerListing: 2 });
  console.log(`₹${optimistic.monthlyProjectionMin} - ₹${optimistic.monthlyProjectionMax}`);
}

main();
