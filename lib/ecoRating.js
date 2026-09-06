// lib/ecoRating.js
//
// Turns the "ecoRating" field Gemini already classifies per-listing
// (low/mid/high — see lib/generateListing.js's prompt) into a small,
// consistent numeric scale + display label, and aggregates it up to a
// seller-level "green rating" across all of an artisan's listings.
//
// HONESTY NOTE: this is a semantic judgment from a photo + transcript,
// not a certified sustainability audit — there's no real lifecycle
// analysis, material sourcing verification, or third-party certification
// behind it. Treat it as an illustrative badge, same spirit as the
// "impact" earnings projection in lib/artisanStats.js.

const ECO_SCORE_MAP = { low: 0, mid: 1, high: 2 };
const ECO_LABELS = ['Needs improvement', 'Moderately eco-friendly', 'Highly eco-friendly'];
const ECO_EMOJI = ['🔴', '🟡', '🟢']; // worst -> best: red -> yellow -> green

/**
 * Converts Gemini's raw "low"/"mid"/"high" string into a numeric score
 * (0-2) + a friendly label + a leaf-badge emoji for quick UI display.
 * Defaults to the middle tier for anything unrecognized, consistent with
 * how materialQualityTier/sizeTier are defaulted elsewhere in this app.
 */
function computeEcoRatingLabel(rawEcoRating) {
  const normalized = (rawEcoRating || '').toLowerCase().trim();
  const score = normalized in ECO_SCORE_MAP ? ECO_SCORE_MAP[normalized] : 1;
  return { ecoScore: score, ecoLabel: ECO_LABELS[score], ecoBadge: ECO_EMOJI[score] };
}

/**
 * Aggregates a seller's own "green rating" across all their listings —
 * a simple average of each listing's ecoScore, rounded to the nearest
 * whole tier for display. Listings missing an ecoRating (older records
 * from before this field existed) are just skipped, not counted as 0.
 *
 * @param {Array<{ecoRating?: string}>} listings
 * @returns {{ sellerEcoScore: number, sellerEcoLabel: string, sellerEcoBadge: string, ratedListingCount: number }}
 */
function computeSellerEcoRating(listings) {
  const scored = (Array.isArray(listings) ? listings : [])
    .filter((l) => l && typeof l.ecoRating === 'string')
    .map((l) => ECO_SCORE_MAP[l.ecoRating.toLowerCase().trim()])
    .filter((score) => score !== undefined);

  if (scored.length === 0) {
    return { sellerEcoScore: null, sellerEcoLabel: 'Not enough data yet', sellerEcoBadge: '⚪', ratedListingCount: 0 };
  }

  const avg = scored.reduce((sum, s) => sum + s, 0) / scored.length;
  const rounded = Math.round(avg);
  return {
    sellerEcoScore: Math.round(avg * 10) / 10,
    sellerEcoLabel: ECO_LABELS[rounded],
    sellerEcoBadge: ECO_EMOJI[rounded],
    ratedListingCount: scored.length,
  };
}

module.exports = { computeEcoRatingLabel, computeSellerEcoRating };
