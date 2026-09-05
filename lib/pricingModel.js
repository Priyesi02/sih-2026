// lib/pricingModel.js
//
// Runtime inference for the trained pricing model. Loads the weights
// saved by scripts/trainPricingModel.js (a real fitted linear regression
// — see that script and data/pricingTrainingData.json for how it was
// trained) and predicts a price from category + qualityTier + sizeTier.
//
// No ML library is needed at runtime — inference is just a dot product
// against the saved weights, which keeps this fast and dependency-free.
//
// See HANDOFF.md section 5.5 for the full, honest explanation of what
// this model is (and isn't): a linear regression trained on a
// synthetic, domain-informed dataset — not real scraped sale prices.

const fs = require('fs');
const path = require('path');

const WEIGHTS_PATH = path.join(__dirname, 'pricingModel.weights.json');

let cachedModel = null;
function loadModel() {
  if (cachedModel) return cachedModel;
  if (!fs.existsSync(WEIGHTS_PATH)) {
    throw new Error(
      'pricingModel: trained weights not found. Run: node scripts/generatePricingDataset.js && node scripts/trainPricingModel.js'
    );
  }
  cachedModel = JSON.parse(fs.readFileSync(WEIGHTS_PATH, 'utf8'));
  return cachedModel;
}

/**
 * Looks up the trained log-price baseline for a category. If Gemini's
 * category guess doesn't match any of the 9 trained categories exactly,
 * falls back to the AVERAGE of all trained category baselines — NOT
 * zero. (An unmatched all-zero one-hot would contribute nothing to the
 * dot product, which would silently produce a massively under-priced
 * result — e.g. treating an unrecognized category as worth a few rupees
 * instead of a reasonable market-average price.)
 */
function getCategoryBaseline(model, category) {
  const normalizedCategory = (category || '').toLowerCase().trim();
  const numCategories = model.categories.length;
  const categoryWeights = model.weights.slice(0, numCategories);

  const matchedIndex = model.categories.indexOf(normalizedCategory);
  if (matchedIndex !== -1) {
    return { baseline: categoryWeights[matchedIndex], matched: true };
  }

  const average = categoryWeights.reduce((a, b) => a + b, 0) / numCategories;
  return { baseline: average, matched: false };
}

/**
 * Predicts a suggested price range using the trained regression model.
 *
 * @param {Object} params
 * @param {string} params.category - e.g. "pottery", "handloom textile" (matched case-insensitively).
 * @param {number} params.qualityTier - 0 (basic), 1 (mid), 2 (premium) — from Gemini's materialQualityTier classification, see generateListing.js.
 * @param {number} params.sizeTier - 0 (small), 1 (medium), 2 (large) — from Gemini's sizeTier classification, see generateListing.js.
 * @returns {{ priceMin: number, priceMax: number, midPrice: number, reasoning: string, modelMatched: boolean }}
 */
function predictPrice({ category, qualityTier, sizeTier }) {
  const model = loadModel();
  const numCategories = model.categories.length;
  const [qualityWeight, sizeWeight] = model.weights.slice(numCategories);

  const { baseline, matched: modelMatched } = getCategoryBaseline(model, category);
  const predictedLogPrice = baseline + qualityTier * qualityWeight + sizeTier * sizeWeight;
  const midPrice = Math.exp(predictedLogPrice);

  // Present a range around the point estimate rather than a single
  // number — sellers respond better to a range, and it hedges against
  // the model's ~15-20% typical error (see metrics in pricingModel.weights.json).
  const priceMin = Math.round(midPrice * 0.75);
  const priceMax = Math.round(midPrice * 1.35);

  const qualityLabel = ['basic', 'standard', 'premium'][qualityTier] || 'standard';
  const sizeLabel = ['small', 'medium', 'large'][sizeTier] || 'medium';
  const reasoning = modelMatched
    ? `Priced using a regression model trained on ${model.trainingRowCount} category-price examples, based on "${category}" pricing patterns adjusted for ${qualityLabel} materials and ${sizeLabel} size.`
    : `Priced using a regression model trained on ${model.trainingRowCount} category-price examples; "${category}" wasn't in the training categories, so this used the overall market baseline adjusted for ${qualityLabel} materials and ${sizeLabel} size.`;

  return { priceMin, priceMax, midPrice: Math.round(midPrice), reasoning, modelMatched };
}

/**
 * The exact list of categories the model was trained on. Used by
 * generateListing.js to constrain Gemini's category guess to values the
 * pricing model actually recognizes, instead of letting it invent
 * free-text categories (e.g. "home decor") that always miss and fall
 * back to the generic average baseline.
 */
function getTrainedCategories() {
  return loadModel().categories;
}

module.exports = { predictPrice, getTrainedCategories };
