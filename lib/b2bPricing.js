// lib/b2bPricing.js
//
// Computes wholesale/bulk price and minimum order quantity (MOQ) for
// the B2B/government e-marketplace feature.
//
// DELIBERATELY NOT a Gemini call. This project already learned this
// lesson once: asking an LLM to "guess a number" for retail pricing
// (lib/generateListing.js used to do this) produced wildly inconsistent
// results — that's why suggestedPriceMin/Max now comes from a trained
// regression model instead (see lib/pricingModel.js). Wholesale price
// and MOQ are the exact same kind of numeric-guess problem, so they get
// the same treatment: deterministic computation, not an LLM guess.
//
//   - wholesalePriceMin/Max: a fixed discount off the already-computed
//     retail suggestedPriceMin/Max (bulk buyers pay per-unit less).
//   - minOrderQuantity: a hand-picked reference table by category
//     (same pattern as lib/pricingReference.js), adjusted by size tier
//     — small/cheap items support higher MOQs, large/expensive items
//     support lower ones. Matches the calibration example given when
//     this feature was requested: handloom sarees ~10-20, small pottery
//     ~50+.

// Retail -> wholesale discount. Bulk buyers pay meaningfully less per
// unit; wholesalePriceMin uses the steeper discount (assumes true bulk
// volume), wholesalePriceMax the shallower one (smaller bulk orders).
const WHOLESALE_DISCOUNT_MIN = 0.55;
const WHOLESALE_DISCOUNT_MAX = 0.7;

// Baseline MOQ per category, for a MEDIUM-size item. Same keyword-match
// approach as lib/pricingReference.js's getReferenceRange.
const MOQ_BY_CATEGORY = [
  { keywords: ['pottery', 'clay', 'terracotta', 'ceramic', 'diya'], baseline: 50 },
  { keywords: ['handloom', 'saree', 'sari', 'textile', 'weave', 'fabric', 'dupatta'], baseline: 15 },
  { keywords: ['jewelry', 'jewellery', 'ornament', 'necklace', 'earring', 'bangle'], baseline: 25 },
  { keywords: ['wood', 'carving', 'wooden'], baseline: 20 },
  { keywords: ['bamboo', 'cane', 'basket', 'wicker'], baseline: 40 },
  { keywords: ['metal', 'brass', 'copper', 'bronze', 'iron'], baseline: 30 },
  { keywords: ['embroidery', 'applique', 'zari', 'thread work'], baseline: 20 },
  { keywords: ['leather'], baseline: 25 },
  { keywords: ['painting', 'art', 'madhubani', 'warli', 'pattachitra'], baseline: 10 },
];
const DEFAULT_MOQ_BASELINE = 20;

// Size adjusts MOQ: larger/pricier items are ordered in smaller
// quantities per order, smaller/cheaper items in larger ones.
const SIZE_MOQ_MULTIPLIER = { 0: 1.4, 1: 1.0, 2: 0.6 }; // small, medium, large

/**
 * Computes a wholesale price range from the already-computed retail
 * price range. Always meaningfully lower than retail, as required.
 */
function computeWholesalePrice(suggestedPriceMin, suggestedPriceMax) {
  return {
    wholesalePriceMin: Math.round(suggestedPriceMin * WHOLESALE_DISCOUNT_MIN),
    wholesalePriceMax: Math.round(suggestedPriceMax * WHOLESALE_DISCOUNT_MAX),
  };
}

/**
 * Computes a suggested minimum order quantity from category + size tier.
 *
 * @param {string} category
 * @param {number} sizeTier - 0 (small), 1 (medium), 2 (large)
 */
function computeMinOrderQuantity(category, sizeTier) {
  const normalized = (category || '').toLowerCase();
  const match = MOQ_BY_CATEGORY.find((entry) => entry.keywords.some((kw) => normalized.includes(kw)));
  const baseline = match ? match.baseline : DEFAULT_MOQ_BASELINE;
  const multiplier = SIZE_MOQ_MULTIPLIER[sizeTier] ?? 1.0;

  // Round to the nearest 5 for a clean, realistic-looking MOQ number.
  const raw = baseline * multiplier;
  return Math.max(5, Math.round(raw / 5) * 5);
}

module.exports = { computeWholesalePrice, computeMinOrderQuantity };
