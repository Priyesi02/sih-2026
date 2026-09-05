#!/usr/bin/env node
// scripts/trainPricingModel.js
//
// Trains a real multivariate linear regression model on
// data/pricingTrainingData.json and saves the learned weights to
// lib/pricingModel.weights.json for runtime use by lib/pricingModel.js.
//
// Model: predicts log(price) from:
//   - category, one-hot encoded (9 binary columns, no separate
//     intercept — each category's own coefficient acts as its baseline)
//   - qualityTier (0/1/2 — basic/mid/premium materials)
//   - sizeTier (0/1/2 — small/medium/large)
// We regress on log(price) rather than price directly because price
// effects here are multiplicative (e.g. "premium" roughly TRIPLES the
// price regardless of category), which log-linear regression captures
// far better than a plain linear fit would.
//
// Usage: node scripts/trainPricingModel.js
// Requires: data/pricingTrainingData.json (run generatePricingDataset.js first)

const fs = require('fs');
const path = require('path');
const MLR = require('ml-regression-multivariate-linear');

const DATA_PATH = path.join(__dirname, '..', 'data', 'pricingTrainingData.json');
const WEIGHTS_OUTPUT_PATH = path.join(__dirname, '..', 'lib', 'pricingModel.weights.json');

function loadDataset() {
  if (!fs.existsSync(DATA_PATH)) {
    throw new Error(`Training data not found at ${DATA_PATH}. Run: node scripts/generatePricingDataset.js`);
  }
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}

// Builds the feature vector for one row. CATEGORIES order must stay
// consistent between training and inference (lib/pricingModel.js uses
// the same list, read from the saved weights file).
function buildFeatureRow(row, categories) {
  const oneHot = categories.map((c) => (c === row.category ? 1 : 0));
  return [...oneHot, row.qualityTier, row.sizeTier];
}

// Simple deterministic shuffle + split so we get a repeatable holdout
// set to sanity-check the model against data it wasn't trained on.
function trainTestSplit(rows, testFraction, seed) {
  const shuffled = [...rows];
  let s = seed;
  for (let i = shuffled.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const testSize = Math.round(shuffled.length * testFraction);
  return { train: shuffled.slice(testSize), test: shuffled.slice(0, testSize) };
}

function evaluate(mlr, categories, rows) {
  let sumAbsPctError = 0;
  let sumSquaredError = 0;
  let sumSquaredTotal = 0;
  const actualLogPrices = rows.map((r) => Math.log(r.priceInr));
  const meanActualLogPrice = actualLogPrices.reduce((a, b) => a + b, 0) / actualLogPrices.length;

  rows.forEach((row, i) => {
    const x = buildFeatureRow(row, categories);
    const predictedLogPrice = mlr.predict(x)[0];
    const predictedPrice = Math.exp(predictedLogPrice);

    sumAbsPctError += Math.abs(predictedPrice - row.priceInr) / row.priceInr;
    sumSquaredError += (actualLogPrices[i] - predictedLogPrice) ** 2;
    sumSquaredTotal += (actualLogPrices[i] - meanActualLogPrice) ** 2;
  });

  const mape = (sumAbsPctError / rows.length) * 100;
  const r2 = 1 - sumSquaredError / sumSquaredTotal;
  return { mape, r2 };
}

function main() {
  const rows = loadDataset();
  const categories = [...new Set(rows.map((r) => r.category))].sort();

  const { train, test } = trainTestSplit(rows, 0.2, 1234);
  console.log(`Training on ${train.length} rows, holding out ${test.length} for evaluation...`);

  const x = train.map((row) => buildFeatureRow(row, categories));
  const y = train.map((row) => [Math.log(row.priceInr)]);

  // intercept:false because the 9 one-hot category columns already sum
  // to 1 on every row — adding a separate intercept on top of that
  // would make the feature matrix singular (perfectly collinear).
  const mlr = new MLR(x, y, { intercept: false });

  const trainMetrics = evaluate(mlr, categories, train);
  const testMetrics = evaluate(mlr, categories, test);
  console.log(`Train: R²=${trainMetrics.r2.toFixed(3)}, MAPE=${trainMetrics.mape.toFixed(1)}%`);
  console.log(`Test:  R²=${testMetrics.r2.toFixed(3)}, MAPE=${testMetrics.mape.toFixed(1)}%`);

  // mlr.weights is a (numFeatures x 1) matrix-like array of arrays.
  const weights = mlr.weights.map((row) => row[0]);
  const featureOrder = [...categories, 'qualityTier', 'sizeTier'];

  const output = {
    trainedAt: new Date().toISOString(),
    featureOrder,
    categories,
    weights,
    // target = log(price); predict with exp(dot(features, weights))
    targetTransform: 'log',
    metrics: { train: trainMetrics, test: testMetrics },
    trainingRowCount: rows.length,
  };

  fs.writeFileSync(WEIGHTS_OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nSaved trained model -> ${WEIGHTS_OUTPUT_PATH}`);
}

main();
