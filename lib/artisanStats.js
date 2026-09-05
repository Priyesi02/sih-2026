// lib/artisanStats.js
//
// Pure data aggregation, no AI/Gemini calls — computes the numbers for
// an "impact" screen: how many listings an artisan has, and an
// estimated earnings figure built from the suggestedPriceMin/Max
// already generated for each listing.
//
// HONESTY NOTE on "monthly projection": there is no real sales or
// conversion data anywhere in this app yet (no purchases, no view
// counts) — so this can't be a data-driven forecast. It's a simple,
// clearly-labeled illustrative estimate: "if each published listing
// sells once this month, here's the range." Say that plainly in the UI
// (see the `projectionAssumption` string this returns) rather than
// presenting it as a real prediction — that's the honest framing, and
// it's still a strong demo number without overclaiming.

/**
 * @typedef {Object} ListingLike
 * @property {number} suggestedPriceMin
 * @property {number} suggestedPriceMax
 * @property {'draft'|'published'} status
 */

/**
 * Computes impact-screen stats from an artisan's listings.
 *
 * @param {ListingLike[]} listings - the artisan's listing objects (as
 *   returned by runFullPipeline, or fetched from Firestore — anything
 *   with suggestedPriceMin/suggestedPriceMax/status).
 * @param {Object} [options]
 * @param {number} [options.expectedSalesPerListing=1] - assumption used
 *   for the monthly projection: how many times each published listing
 *   is assumed to sell in a month. Defaults to 1 ("each listing sells
 *   once"). Tune this later if real sales data ever exists.
 * @returns {{
 *   totalListings: number,
 *   publishedListings: number,
 *   draftListings: number,
 *   potentialEarningsMin: number,
 *   potentialEarningsMax: number,
 *   monthlyProjectionMin: number,
 *   monthlyProjectionMax: number,
 *   projectionAssumption: string,
 * }}
 */
function computeArtisanStats(listings, { expectedSalesPerListing = 1 } = {}) {
  const safeListings = Array.isArray(listings) ? listings : [];
  const published = safeListings.filter((l) => l && l.status === 'published');

  const potentialEarningsMin = published.reduce((sum, l) => sum + (Number(l.suggestedPriceMin) || 0), 0);
  const potentialEarningsMax = published.reduce((sum, l) => sum + (Number(l.suggestedPriceMax) || 0), 0);

  return {
    totalListings: safeListings.length,
    publishedListings: published.length,
    draftListings: safeListings.length - published.length,
    potentialEarningsMin,
    potentialEarningsMax,
    monthlyProjectionMin: Math.round(potentialEarningsMin * expectedSalesPerListing),
    monthlyProjectionMax: Math.round(potentialEarningsMax * expectedSalesPerListing),
    projectionAssumption:
      expectedSalesPerListing === 1
        ? 'Assumes each published listing sells once this month — a simple illustrative estimate, not a data-driven sales forecast (there is no real sales/conversion data in this app yet).'
        : `Assumes each published listing sells ${expectedSalesPerListing}x this month — a simple illustrative estimate, not a data-driven sales forecast (there is no real sales/conversion data in this app yet).`,
  };
}

module.exports = { computeArtisanStats };
