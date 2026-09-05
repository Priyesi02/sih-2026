#!/usr/bin/env node
// scripts/generatePricingDataset.js
//
// Generates the training dataset for the pricing model.
//
// HONESTY NOTE (read this before presenting the pricing feature to
// judges/teammates): this dataset is NOT scraped from real marketplace
// sales. There is no such dataset available in this project. Instead,
// each row is synthesized from a domain-informed formula:
//
//   price = basePrice[category] * qualityMultiplier[qualityTier]
//                                * sizeMultiplier[sizeTier]
//                                * randomNoise
//
// where basePrice/qualityMultiplier/sizeMultiplier were set by hand
// using general knowledge of typical Indian handicraft market pricing
// (the same domain knowledge that was in the old hardcoded reference
// table in lib/pricingReference.js — this generalizes it into many more
// data points so a real regression model can be *fit* to it, instead of
// just hardcoding 9 rows).
//
// The random noise (±~15%, log-normal) means the model trained on this
// data still has to genuinely learn the pattern rather than memorize a
// lookup table — but the ceiling on how "real" this pricing logic can
// be is bounded by how good these hand-set base prices/multipliers are.
// If real sale-price data becomes available later, replace this
// generator's output with real rows (same column format) and rerun
// scripts/trainPricingModel.js — nothing else needs to change.
//
// Usage: node scripts/generatePricingDataset.js
// Writes: data/pricingTrainingData.json

const fs = require('fs');
const path = require('path');

// Same 9 categories used elsewhere in the pipeline (lib/pricingReference.js).
// basePrice = typical price (INR) for a MID-quality, MEDIUM-size item.
const CATEGORY_BASE_PRICES = {
  pottery: 220,
  'handloom textile': 2200,
  jewelry: 700,
  wood: 900,
  bamboo: 350,
  metal: 800,
  embroidery: 1000,
  leather: 1100,
  painting: 1600,
};

// qualityTier: 0 = basic, 1 = mid, 2 = premium (e.g. pure silk, real
// silver, intricate hand-detailing)
const QUALITY_MULTIPLIER = { 0: 0.55, 1: 1.0, 2: 3.4 };

// sizeTier: 0 = small, 1 = medium, 2 = large
const SIZE_MULTIPLIER = { 0: 0.6, 1: 1.0, 2: 1.85 };

const NOISE_STDDEV = 0.15; // ~15% log-normal jitter, simulates real-world variance
const SAMPLES_PER_COMBINATION = 3; // 9 categories * 3 quality * 3 size * 3 samples = 243 rows

// --- deterministic PRNG so the dataset is reproducible (mulberry32) ---
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussianNoise(rand) {
  // Box-Muller transform: turns two uniform randoms into one normal(0,1) sample.
  const u1 = Math.max(rand(), 1e-9);
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function generateDataset() {
  const rand = mulberry32(42); // fixed seed for reproducibility
  const rows = [];

  for (const [category, basePrice] of Object.entries(CATEGORY_BASE_PRICES)) {
    for (const qualityTier of [0, 1, 2]) {
      for (const sizeTier of [0, 1, 2]) {
        for (let i = 0; i < SAMPLES_PER_COMBINATION; i++) {
          const noiseFactor = Math.exp(gaussianNoise(rand) * NOISE_STDDEV);
          const price = Math.round(
            basePrice * QUALITY_MULTIPLIER[qualityTier] * SIZE_MULTIPLIER[sizeTier] * noiseFactor
          );
          rows.push({ category, qualityTier, sizeTier, priceInr: Math.max(10, price) });
        }
      }
    }
  }

  return rows;
}

function main() {
  const rows = generateDataset();
  const outputPath = path.join(__dirname, '..', 'data', 'pricingTrainingData.json');
  fs.writeFileSync(outputPath, JSON.stringify(rows, null, 2));
  console.log(`Generated ${rows.length} training rows -> ${outputPath}`);
}

main();
