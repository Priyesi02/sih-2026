// lib/pricingReference.js
//
// UPDATE: pricing is now computed by an actual trained regression model
// (lib/pricingModel.js, trained by scripts/trainPricingModel.js) instead
// of asking Gemini to guess a number. This file's role shrank to just
// one thing now: CLAMPING — a safety net that catches the (hopefully
// rare) case where the model's own prediction is wildly outside a sane
// range for its stated category, e.g. from an unusual feature
// combination. See lib/generateListing.js for where this is called.
//
// (formatReferenceTableForPrompt() is no longer used since Gemini no
// longer prices anything — kept exported in case it's useful elsewhere,
// e.g. for a debug/admin view of the reference ranges.)
//
// These ranges are hand-picked estimates based on typical Indian
// handicraft marketplace pricing (Amazon Karigar, GeM, Etsy India-type
// listings) — the same domain knowledge that seeded the synthetic
// training dataset in data/pricingTrainingData.json. See HANDOFF.md
// section 5.5 for the full picture of how pricing actually works now.

// Each entry: keywords used to match Gemini's free-text category guess,
// plus a realistic [min, max] INR range spanning basic-to-premium items
// in that category.
const CATEGORY_PRICE_RANGES = [
  { keywords: ['pottery', 'clay', 'terracotta', 'ceramic', 'diya'], min: 50, max: 3000 },
  { keywords: ['handloom', 'saree', 'sari', 'textile', 'weave', 'fabric', 'dupatta'], min: 800, max: 15000 },
  { keywords: ['jewelry', 'jewellery', 'ornament', 'necklace', 'earring', 'bangle'], min: 150, max: 8000 },
  { keywords: ['wood', 'carving', 'wooden'], min: 300, max: 10000 },
  { keywords: ['bamboo', 'cane', 'basket', 'wicker'], min: 100, max: 2500 },
  { keywords: ['metal', 'brass', 'copper', 'bronze', 'iron'], min: 200, max: 6000 },
  { keywords: ['embroidery', 'applique', 'zari', 'thread work'], min: 300, max: 8000 },
  { keywords: ['leather'], min: 400, max: 5000 },
  { keywords: ['painting', 'art', 'madhubani', 'warli', 'pattachitra'], min: 500, max: 20000 },
];

// Used when the category doesn't match any keyword list above.
const DEFAULT_RANGE = { min: 100, max: 5000 };

/**
 * Finds the reference [min, max] price range for a free-text category
 * string (e.g. Gemini's own category guess), by keyword matching.
 */
function getReferenceRange(category) {
  const normalized = (category || '').toLowerCase();
  const match = CATEGORY_PRICE_RANGES.find((entry) =>
    entry.keywords.some((kw) => normalized.includes(kw))
  );
  return match ? { min: match.min, max: match.max } : DEFAULT_RANGE;
}

/**
 * Renders the full reference table as plain text, to paste into the
 * Gemini prompt so it has real anchor points before it prices anything.
 */
function formatReferenceTableForPrompt() {
  return CATEGORY_PRICE_RANGES.map(
    (entry) => `- ${entry.keywords[0]}: roughly ₹${entry.min} - ₹${entry.max} for basic-to-premium quality`
  ).join('\n');
}

/**
 * Pulls a price back into a sane band if Gemini's guess is wildly off
 * for its own stated category. Deliberately generous (0.4x floor, 2.5x
 * ceiling) so genuinely premium or budget items aren't over-corrected —
 * this is a safety net against hallucinated outliers, not a hard cap on
 * normal variation.
 *
 * @returns {{ min: number, max: number, wasClamped: boolean }}
 */
function clampPriceToSaneRange(category, suggestedPriceMin, suggestedPriceMax) {
  const ref = getReferenceRange(category);
  const floor = Math.round(ref.min * 0.4);
  const ceiling = Math.round(ref.max * 2.5);

  let min = suggestedPriceMin;
  let max = suggestedPriceMax;
  let wasClamped = false;

  if (min > max) {
    [min, max] = [max, min];
    wasClamped = true;
  }
  if (min < floor) {
    min = floor;
    wasClamped = true;
  }
  if (max > ceiling) {
    max = ceiling;
    wasClamped = true;
  }
  if (min > max) {
    // Degenerate case: floor ended up above ceiling for some edge-case
    // category match. Fall back to the raw reference range outright.
    min = ref.min;
    max = ref.max;
    wasClamped = true;
  }

  return { min, max, wasClamped };
}

module.exports = { getReferenceRange, formatReferenceTableForPrompt, clampPriceToSaneRange };
