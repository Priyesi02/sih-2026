// index.js
//
// Single entry point for the module. When this gets imported into the
// React app / backend later, import from here:
//
//   const { runFullPipeline } = require('./ai-module');
//
// (or import the individual steps if you only need one of them.)

const { enhanceImage } = require('./lib/enhanceImage');
const { transcribeVoice } = require('./lib/transcribeVoice');
const { generateListing } = require('./lib/generateListing');
const { speakListing } = require('./lib/speakListing');
const { runFullPipeline } = require('./lib/runFullPipeline');
const { computeArtisanStats } = require('./lib/artisanStats');
const { generateMockMarketplaceSync } = require('./lib/mockMarketplaceSync');
const { generateProductPoster } = require('./lib/generatePoster');
const { applyAdaptivePricing } = require('./lib/adaptivePricing');
const { computeEcoRatingLabel, computeSellerEcoRating } = require('./lib/ecoRating');
const { sendOtp, verifyOtp } = require('./lib/auth');

module.exports = {
  enhanceImage,
  transcribeVoice,
  generateListing,
  speakListing,
  runFullPipeline,
  computeArtisanStats,
  generateMockMarketplaceSync,
  generateProductPoster,
  applyAdaptivePricing,
  computeEcoRatingLabel,
  computeSellerEcoRating,
  sendOtp,
  verifyOtp,
};
