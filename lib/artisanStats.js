// lib/artisanStats.js
//
// Pure data aggregation, no AI/Gemini calls — computes the numbers for
// the Home screen's impact section: how many listings an artisan has,
// and their aggregate green/eco rating.
//
// REMOVED ON REQUEST: this used to also compute an "earnings" figure —
// first a projected estimate ("if each listing sells once this month"),
// later a mock "actual earnings" driven by a simulated units-sold count
// from lib/mockMarketplaceSync.js. Both were removed outright: there is
// no real payment/order system anywhere in this app, so any earnings
// number here — projected OR "actual" — would be fabricated. Rather
// than keep inventing a number and re-labeling it, this now only
// reports things that are genuinely real: listing counts and the
// eco-rating aggregate (itself an AI estimate, but an honestly-labeled
// one — see lib/ecoRating.js — not a fake sales/money figure).

const { computeSellerEcoRating } = require('./ecoRating');

/**
 * @typedef {Object} ListingLike
 * @property {'draft'|'published'} status
 * @property {string} [ecoRating] - "low"|"mid"|"high", from generateListing()'s Gemini classification.
 */

/**
 * Computes impact-screen stats from an artisan's listings.
 *
 * @param {ListingLike[]} listings - the artisan's listing objects (as
 *   returned by runFullPipeline, or fetched from Firestore).
 * @returns {{
 *   totalListings: number,
 *   publishedListings: number,
 *   draftListings: number,
 *   sellerEcoScore: number|null,
 *   sellerEcoLabel: string,
 *   sellerEcoBadge: string,
 *   ratedListingCount: number,
 * }}
 */
function computeArtisanStats(listings) {
  const safeListings = Array.isArray(listings) ? listings : [];
  const published = safeListings.filter((l) => l && l.status === 'published');

  const sellerEcoRating = computeSellerEcoRating(published);

  return {
    totalListings: safeListings.length,
    publishedListings: published.length,
    draftListings: safeListings.length - published.length,
    ...sellerEcoRating,
  };
}

module.exports = { computeArtisanStats };
