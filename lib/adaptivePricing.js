// lib/adaptivePricing.js
//
// "Active learning" layer for pricing, run AFTER generateListing() (see
// lib/generateListing.js) and ONLY when Firestore is configured (this
// needs `db`, which lives in server.js, not in the AI module itself).
//
// The idea: Gemini's own price guess (suggestedPriceMin/Max as returned
// by generateListing) is a fine COLD-START estimate for a brand-new
// category with no history — but once real artisans have published real
// listings in that same category, THEIR accumulated prices are a better
// signal than a fresh LLM guess every single time. So once a category
// crosses a minimum sample size, this recomputes suggestedPriceMin/Max
// as a blend of:
//   - the average of real published listings' own suggestedPriceMin/Max
//     in that category (the "learned" signal — grows/improves as more
//     artisans use the platform)
//   - the synthetic trained regression model's prediction (lib/pricingModel.js),
//     kept as a stability anchor so a handful of oddly-priced listings
//     early on can't swing the average wildly
// blended with a weight that shifts toward real data as more accumulates.
//
// HONESTY NOTE: this is NOT learning from actual sale prices or buyer
// behavior — there's no real transaction data anywhere in this app (see
// lib/artisanStats.js's own honesty note on the same point). It's
// learning from what OTHER artisans' listings were priced at, which is
// still useful market signal, but isn't the same as demand-based pricing.
// Say that plainly if asked what "active learning" means here.

const { clampPriceToSaneRange } = require('./pricingReference');

// Below this many real published listings in a category, stick with
// Gemini's cold-start guess untouched — too few data points to trust an
// average over a fresh per-product estimate.
const MIN_REAL_DATA_POINTS = 5;

// At MIN_REAL_DATA_POINTS, real data gets a modest 20% weight; weight
// grows toward this cap as more listings accumulate, so the trained
// model anchor always keeps some influence even at scale (avoids fully
// chasing a runaway average from a skewed sample).
const MAX_REAL_DATA_WEIGHT = 0.8;
const WEIGHT_SATURATION_POINT = 25; // real-data weight reaches MAX_REAL_DATA_WEIGHT at this many listings

function average(numbers) {
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

/**
 * Recomputes a listing's suggestedPriceMin/Max using real accumulated
 * Firestore data for its category, if there's enough of it yet.
 * Returns the listing UNCHANGED (just annotated with pricingDataPoints)
 * if there isn't enough data, or if `db` isn't configured.
 *
 * @param {Object} listing - a listing object from generateListing(),
 *   must include category, suggestedPriceMin/Max, trainedModelPriceMin/Max.
 * @param {FirebaseFirestore.Firestore|null} db
 * @returns {Promise<Object>} the (possibly re-priced) listing
 */
async function applyAdaptivePricing(listing, db) {
  if (!db) {
    return { ...listing, pricingDataPoints: 0 };
  }

  try {
    const snapshot = await db
      .collection('listings')
      .where('category', '==', listing.category)
      .where('status', '==', 'published')
      .get();

    const realListings = snapshot.docs
      .map((doc) => doc.data())
      .filter((l) => Number.isFinite(l.suggestedPriceMin) && Number.isFinite(l.suggestedPriceMax));

    if (realListings.length < MIN_REAL_DATA_POINTS) {
      return { ...listing, pricingDataPoints: realListings.length };
    }

    const realAvgMin = average(realListings.map((l) => l.suggestedPriceMin));
    const realAvgMax = average(realListings.map((l) => l.suggestedPriceMax));

    const realWeight = Math.min(MAX_REAL_DATA_WEIGHT, realListings.length / WEIGHT_SATURATION_POINT);
    const modelWeight = 1 - realWeight;

    const blendedMin = Math.round(realAvgMin * realWeight + listing.trainedModelPriceMin * modelWeight);
    const blendedMax = Math.round(realAvgMax * realWeight + listing.trainedModelPriceMax * modelWeight);

    // Still run through the same safety clamp — blended real-world data
    // could itself have drifted from accumulated clamped outliers.
    const clamp = clampPriceToSaneRange(listing.category, blendedMin, blendedMax);

    return {
      ...listing,
      suggestedPriceMin: clamp.min,
      suggestedPriceMax: clamp.max,
      priceReasoning:
        `Learned from ${realListings.length} real published "${listing.category}" listings on this ` +
        `platform (${Math.round(realWeight * 100)}% weighted toward real data, ${Math.round(modelWeight * 100)}% toward the baseline trained model for stability).`,
      priceSource: 'active-learning',
      pricingDataPoints: realListings.length,
    };
  } catch (err) {
    console.warn('[adaptivePricing] failed, keeping cold-start price:', err.message);
    return { ...listing, pricingDataPoints: 0 };
  }
}

module.exports = { applyAdaptivePricing, MIN_REAL_DATA_POINTS };
