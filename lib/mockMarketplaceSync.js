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
// Use this to build/demo a "B2B / Govt Marketplace" screen that shows a
// believable "synced" state, without needing (or pretending to have)
// a real integration.

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
 * Simulates a government e-marketplace catalog sync. Returns instantly
 * — no network call, no real API, no real seller/product IDs.
 *
 * @param {Object} listingData - a listing object (e.g. from generateListing()/runFullPipeline()) —
 *   expects category, b2bDescription, wholesalePriceMin, wholesalePriceMax, minOrderQuantity.
 * @returns {Object} a mock catalog-entry-shaped object, status "synced".
 */
function generateMockMarketplaceSync(listingData) {
  if (!listingData || typeof listingData !== 'object') {
    throw new Error('generateMockMarketplaceSync: listingData object is required');
  }

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
    status: 'synced',
    syncedAt: new Date().toISOString(),
  };
}

module.exports = { generateMockMarketplaceSync };
