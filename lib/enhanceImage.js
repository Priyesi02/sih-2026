// lib/enhanceImage.js
//
// Takes a raw product photo and produces a "shop ready" version:
//   1. Remove the background (so the product looks like it's on a clean
//      white/transparent backdrop instead of a cluttered home/workshop).
//   2. Auto-correct lighting/contrast (a lot of artisan photos are taken
//      on phones in dim rooms, so this just brightens/evens things out).
//
// NOTE: @imgly/background-removal-node ships as an ES Module. Since this
// project uses plain CommonJS (require/module.exports) for simplicity,
// we load it with a dynamic import() instead of require(). This is a
// normal, supported pattern for using ESM-only packages from CJS code.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Where enhanced images get written. Created on first use.
const OUTPUT_DIR = path.join(__dirname, '..', 'output');

/**
 * Removes the background from a product photo and applies basic
 * lighting/contrast correction.
 *
 * @param {string} imagePath - path to the original product photo (jpg/png).
 * @returns {Promise<string>} - path to the saved, enhanced PNG image.
 */
async function enhanceImage(imagePath) {
  if (!fs.existsSync(imagePath)) {
    throw new Error(`enhanceImage: file not found at "${imagePath}"`);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 1. Background removal.
  // dynamic import() because the package is ESM-only.
  const { removeBackground } = await import('@imgly/background-removal-node');
  const resultBlob = await removeBackground(imagePath);
  const noBgBuffer = Buffer.from(await resultBlob.arrayBuffer());

  // 2. Lighting/contrast correction with sharp.
  //    - normalize(): stretches contrast so the image isn't washed out/flat.
  //    - modulate(): nudges brightness/saturation up slightly, since most
  //      artisan photos are under-lit indoor shots.
  const enhancedBuffer = await sharp(noBgBuffer)
    .normalize()
    .modulate({ brightness: 1.08, saturation: 1.05 })
    .png()
    .toBuffer();

  // 3. Save the result next to a predictable name so callers can find it.
  const baseName = path.basename(imagePath, path.extname(imagePath));
  const outputPath = path.join(OUTPUT_DIR, `${baseName}-enhanced.png`);
  fs.writeFileSync(outputPath, enhancedBuffer);

  return outputPath;
}

module.exports = { enhanceImage };
