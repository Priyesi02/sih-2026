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
//
// UPDATED with real market research (Sept 2026 — see WebSearch results
// used to set these; Amazon.in, Etsy India, IndiaMART, iTokri, and
// specialist artisan sites like Earthan/ExclusiveLane/Trove Craft):
//   - clay diyas run ₹5-250 basic, decorative ceramics into the thousands
//   - handloom cotton sarees start ~₹1,200-1,700; premium Banarasi silk
//     with real zari runs ₹8,000-25,000+
//   - handmade 925 silver earrings typically ₹700-2,500
//   - carved wooden decor ₹1,150-3,450 typical, elaborate panels up to
//     ₹30,000-42,000
//   - bamboo/cane baskets ₹300-1,500 typical, premium woven pieces
//     ₹4,000-33,000
//   - brass showpieces ₹700-2,500 typical, idol sets up to ₹19,000+
//   - hand-embroidered cushion covers run as low as ₹85-120/piece
//   - handcrafted leather wallets ₹1,850-3,400+, bags from ₹6,400+
//   - Madhubani/Warli paintings ₹200-1,000 typical, reputed-artist
//     pieces far higher
// The previous ranges here (and the synthetic training data in
// scripts/generatePricingDataset.js) were rougher estimates that turned
// out too high for small/basic items — this recalibration also adds a
// dedicated "accessories" category (see below) for small items like
// scrunchies/potli bags that used to get miscategorized into "handloom
// textile" and inflated toward saree-level pricing as a result.
const CATEGORY_PRICE_RANGES = [
  { keywords: ['pottery', 'clay', 'terracotta', 'ceramic', 'diya'], min: 40, max: 4000 },
  { keywords: ['handloom', 'saree', 'sari', 'textile', 'weave', 'fabric', 'dupatta'], min: 500, max: 25000 },
  { keywords: ['jewelry', 'jewellery', 'ornament', 'necklace', 'earring', 'bangle'], min: 200, max: 15000 },
  { keywords: ['wood', 'carving', 'wooden'], min: 300, max: 20000 },
  { keywords: ['bamboo', 'cane', 'basket', 'wicker'], min: 100, max: 5000 },
  { keywords: ['metal', 'brass', 'copper', 'bronze', 'iron'], min: 250, max: 15000 },
  { keywords: ['embroidery', 'applique', 'zari', 'thread work'], min: 80, max: 10000 },
  { keywords: ['leather'], min: 500, max: 12000 },
  { keywords: ['painting', 'art', 'madhubani', 'warli', 'pattachitra'], min: 150, max: 30000 },
  // NEW: small handmade accessories/notions — scrunchies, potli/pouch
  // bags, keychains, bookmarks — previously fell through to "handloom
  // textile" (a saree/garment-calibrated range) and got wildly
  // over-clamped; e.g. a real ₹50-150 scrunchie was being pulled up
  // toward ₹800+. This is the direct fix for that observed bug.
  { keywords: ['scrunchie', 'hair accessory', 'hair tie', 'hairband', 'potli', 'pouch', 'keychain', 'bookmark', 'trinket', 'accessory', 'accessories'], min: 30, max: 1200 },
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

  // Keep the pre-clamp values around so the degenerate-case fallback
  // below can tell WHICH direction the guess was off, instead of always
  // snapping to the full category width.
  const rawMin = min;
  const rawMax = max;

  if (min < floor) {
    min = floor;
    wasClamped = true;
  }
  if (max > ceiling) {
    max = ceiling;
    wasClamped = true;
  }
  if (min > max) {
    // Degenerate case: clamping min up to the floor pushed it past max
    // (the raw guess was entirely below the floor — e.g. a small,
    // genuinely cheap item like a scrunchie in a "handloom textile"
    // category calibrated for full garments/sarees), OR the mirror case
    // above the ceiling. Anchor a tight band at whichever bound was
    // actually crossed, rather than snapping all the way out to the
    // full (much wider) category reference range — that overcorrects a
    // cheap-but-valid item up to premium-item pricing.
    if (rawMax < floor) {
      min = floor;
      max = Math.round(floor * 1.8);
    } else if (rawMin > ceiling) {
      min = Math.round(ceiling / 1.8);
      max = ceiling;
    } else {
      // Genuinely ambiguous (shouldn't normally happen) — fall back to
      // the raw reference range outright.
      min = ref.min;
      max = ref.max;
    }
    wasClamped = true;
  }

  return { min, max, wasClamped };
}

module.exports = { getReferenceRange, formatReferenceTableForPrompt, clampPriceToSaneRange };
