// lib/mockMarketplaceSync.js
//
// *** THIS IS A MOCK. IT DOES NOT CALL ANY REAL EXTERNAL API. ***
//
// generateMockMarketplaceSync() simulates what submitting a listing to
// a government e-marketplace (ONDC/GeM-style) might look like, purely
// as a local, instant, offline function — no network request, no real
// account, no real government system involved anywhere. This matches
// the PRD's own stated scope: "Real ONDC/GeM API integration" is
// explicitly OUT of scope for this hackathon (mock only).
//
// UPDATE: outcomes are "approved" or "waitlisted" only now (never
// "rejected" — this used to have a rejected outcome for basic-tier
// materials + low eco-rating, but was changed on request: nothing here
// should ever hard-reject a listing over its materials, at most it
// waits for manual review), using simple, explainable rules based on
// the listing's own data (never random for its own sake — a demo
// should be able to explain WHY a given listing got a given outcome):
//   - WAITLISTED: EITHER basic-tier materials + low eco-rating together
//     (a minimum-quality-bar check — waitlisted for review, not
//     rejected), OR category is "other" (didn't match any recognized
//     catalog category, needs manual classification).
//   - APPROVED: everything else.
// Deliberately NOT based on price/priceWasClamped — by the time a
// listing reaches this function, suggestedPriceMin/Max has ALREADY been
// safety-clamped into a sane range for its category (see
// lib/generateListing.js), so rejecting/waitlisting a listing for a
// price WE already fixed would be nonsensical.
//
// statusReasonCode is a stable machine-readable code (NOT English text)
// so the frontend can translate the reason into the artisan's chosen
// language (see i18n/translations.ts's marketplaceReason* keys) — the
// human-readable `statusReason` string here is English-only and meant
// as a fallback/for logs, not for display in a non-English UI.
//
// REMOVED ON REQUEST: this used to also fabricate a "unitsSold" number
// for approved listings, feeding a mock "earnings" figure on the Home
// screen (lib/artisanStats.js). Removed outright — there's no real
// sales/order system in this app, so a simulated sold-count is exactly
// the kind of fake number that shouldn't be shown as if it were real.

/**
 * Generates a plausible-looking mock product ID, formatted the way a
 * real catalog ID might look (not from any real system).
 */
function generateMockProductId(category) {
  const categorySlug = (category || 'item').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const randomSuffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `MOCK-${categorySlug}-${randomSuffix}`;
}

/**
 * Decides a mock approval outcome from the listing's own fields — see
 * file header for the exact rules. Deterministic given the same input,
 * so it's demo-explainable rather than a coin flip.
 */
function decideMockOutcome(listingData) {
  const isBasicQuality = (listingData.materialQualityTier || '').toLowerCase() === 'basic';
  const isLowEco = (listingData.ecoRating || '').toLowerCase() === 'low';
  if (isBasicQuality && isLowEco) {
    return {
      status: 'waitlisted',
      statusReasonCode: 'quality_review',
      statusReason: 'Flagged for manual review over basic-tier materials combined with a low sustainability rating — consider highlighting better materials, or it may still be approved after review.',
    };
  }
  if (!listingData.category || listingData.category.toLowerCase() === 'other') {
    return {
      status: 'waitlisted',
      statusReasonCode: 'category_review',
      statusReason: "Category couldn't be automatically matched to a recognized catalog category — pending manual classification review.",
    };
  }
  return { status: 'approved', statusReasonCode: 'approved', statusReason: 'Passed automated pricing and category checks.' };
}

/**
 * Simulates a government e-marketplace catalog sync. Returns instantly
 * — no network call, no real API, no real seller/product IDs.
 *
 * @param {Object} listingData - a listing object (e.g. from generateListing()/runFullPipeline()) —
 *   expects category, b2bDescription, wholesalePriceMin, wholesalePriceMax, minOrderQuantity, materialQualityTier, ecoRating.
 * @returns {Object} a mock catalog-entry-shaped object with status approved/waitlisted.
 */
function generateMockMarketplaceSync(listingData) {
  if (!listingData || typeof listingData !== 'object') {
    throw new Error('generateMockMarketplaceSync: listingData object is required');
  }

  const { status, statusReasonCode, statusReason } = decideMockOutcome(listingData);

  return {
    // *** MOCKED — no real marketplace, no real network call ***
    marketplace: 'ONDC/GeM (mocked — no real integration)',
    productId: generateMockProductId(listingData.category),
    sellerId: 'MOCK-SELLER-0001', // placeholder — a real implementation would use the artisan's actual seller/account ID
    category: listingData.category,
    description: listingData.b2bDescription,
    currency: 'INR',
    wholesalePriceMin: listingData.wholesalePriceMin,
    wholesalePriceMax: listingData.wholesalePriceMax,
    minOrderQuantity: listingData.minOrderQuantity,
    status, // 'approved' | 'waitlisted'
    statusReasonCode, // 'approved' | 'quality_review' | 'category_review' — for frontend translation
    statusReason, // English fallback text, for logs/non-translated contexts
    syncedAt: new Date().toISOString(),
  };
}

module.exports = { generateMockMarketplaceSync };
