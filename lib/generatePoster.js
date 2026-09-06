// lib/generatePoster.js
//
// Generates a shareable, story-shaped (9:16, like a WhatsApp Status or
// Instagram/Facebook Story) poster image for a listing — no new AI
// call, purely compositing data the pipeline already produced onto the
// product photo, via sharp + an SVG overlay. This is now the ONLY
// shareable-asset generator in the app — an earlier video-generation
// feature (ffmpeg-based) was removed entirely on request.
//
// REDESIGNED (previously just one caption bar with category+price+a
// description snippet — feedback was that it didn't do enough to
// actually convince someone to buy). Now a genuine multi-section sales
// layout: title, feature snippet, a prominent price block, a distinct
// bulk/wholesale strip for B2B buyers, and a concrete "who's this for"
// use-case line (from Gemini's new `useCase` field) — the same
// information a real product ad would lead with, not just a photo with
// a caption.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { computeEcoRatingLabel } = require('./ecoRating');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');

// 1080x1920 — the standard WhatsApp Status / Instagram & Facebook Story
// canvas size, so it fills the screen edge-to-edge with no letterboxing
// when shared there.
const POSTER_WIDTH = 1080;
const POSTER_HEIGHT = 1920;

function truncateCaption(text, maxLength) {
  if (!text || text.length <= maxLength) return text || '';
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxLength)}...`;
}

function escapeSvgText(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Wraps a long line of text into multiple SVG <tspan> lines at maxCharsPerLine, up to maxLines. */
function wrapToTspans({ text, x, startY, lineHeight, maxCharsPerLine, maxLines, fontSize, fill, weight }) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    if (attempt.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = attempt;
    }
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);

  return lines
    .map(
      (line, i) =>
        `<tspan x="${x}" y="${startY + i * lineHeight}" font-size="${fontSize}" font-weight="${weight || 'normal'}" fill="${fill}">${escapeSvgText(line)}</tspan>`
    )
    .join('');
}

function buildPosterSvg({ title, priceLine, featureLine, useCaseLine, bulkLine, ecoBadgeText }) {
  // Bottom sales panel — tall enough now for title + features + price +
  // a distinct bulk-order strip + a use-case line, not just one caption.
  const panelHeight = 900;
  const panelY = POSTER_HEIGHT - panelHeight;
  // Deep warm brown, NOT black — complements the gold/cream KRIYA
  // palette instead of a stark black fade (previous version), while
  // still giving the white/gold text below enough contrast to read.
  const panelColor = '#2B1710';

  return `
<svg width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${panelColor}" stop-opacity="0" />
      <stop offset="18%" stop-color="${panelColor}" stop-opacity="0.65" />
      <stop offset="100%" stop-color="${panelColor}" stop-opacity="0.97" />
    </linearGradient>
  </defs>

  <!-- Top-left brand badge -->
  <rect x="40" y="60" width="220" height="76" rx="38" fill="#FBF3E0" fill-opacity="0.95" />
  <text x="150" y="108" font-family="Georgia, serif" font-size="32" font-weight="bold" fill="#96691E" text-anchor="middle" letter-spacing="2">KRIYA</text>

  <!-- Bottom sales panel (no category badge — removed on request) -->
  <rect x="0" y="${panelY}" width="${POSTER_WIDTH}" height="${panelHeight}" fill="url(#fade)" />

  ${ecoBadgeText ? `
  <rect x="48" y="${panelY + 50}" width="220" height="52" rx="26" fill="#1FA25A" fill-opacity="0.9" />
  <text x="158" y="${panelY + 85}" font-family="sans-serif" font-size="22" font-weight="bold" fill="#ffffff" text-anchor="middle">${escapeSvgText(ecoBadgeText)}</text>
  ` : ''}

  <!-- Title (the actual product name, large) -->
  <text>${wrapToTspans({
    text: title,
    x: 48,
    startY: panelY + 175,
    lineHeight: 56,
    maxCharsPerLine: 22,
    maxLines: 2,
    fontSize: 52,
    fill: '#ffffff',
    weight: 'bold',
  })}</text>

  <!-- Feature/description snippet -->
  <text>${wrapToTspans({
    text: featureLine,
    x: 48,
    startY: panelY + 300,
    lineHeight: 38,
    maxCharsPerLine: 42,
    maxLines: 3,
    fontSize: 28,
    fill: '#f5f0e6',
  })}</text>

  <!-- Retail price, prominent -->
  <text x="48" y="${panelY + 470}" font-family="Georgia, serif" font-size="64" font-weight="bold" fill="#ffe27a">${escapeSvgText(priceLine)}</text>

  <!-- Bulk/wholesale strip — distinct box so B2B buyers can't miss it -->
  <rect x="40" y="${panelY + 510}" width="${POSTER_WIDTH - 80}" height="90" rx="16" fill="#ffffff" fill-opacity="0.12" stroke="#ffe27a" stroke-width="1.5" />
  <text>${wrapToTspans({
    text: bulkLine,
    x: 64,
    startY: panelY + 565,
    lineHeight: 30,
    maxCharsPerLine: 46,
    maxLines: 2,
    fontSize: 26,
    fill: '#ffe27a',
    weight: 'bold',
  })}</text>

  <!-- Use case / who it's for -->
  <text>${wrapToTspans({
    text: useCaseLine,
    x: 48,
    startY: panelY + 660,
    lineHeight: 32,
    maxCharsPerLine: 44,
    maxLines: 2,
    fontSize: 26,
    fill: '#d8cdb4',
  })}</text>

  <text x="48" y="${panelY + panelHeight - 40}" font-family="sans-serif" font-size="24" fill="#a89a7c">Handcrafted in India · Listed on KRIYA</text>
</svg>`.trim();
}

/**
 * Generates a shareable story-shaped poster PNG for a listing.
 *
 * @param {Object} params
 * @param {string} params.imagePath - path to the product photo (ideally the enhanced one).
 * @param {Object} params.listing - uses title, category, suggestedPriceMin/Max, descriptionEn,
 *   ecoRating, useCase, wholesalePriceMin/Max, minOrderQuantity.
 * @returns {Promise<string>} - path to the saved .png file.
 */
async function generateProductPoster({ imagePath, listing }) {
  if (!imagePath || !fs.existsSync(imagePath)) {
    throw new Error(`generateProductPoster: image not found at "${imagePath}"`);
  }
  if (!listing) {
    throw new Error('generateProductPoster: listing details are required');
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const priceLine =
    typeof listing.suggestedPriceMin === 'number' && typeof listing.suggestedPriceMax === 'number'
      ? `₹${listing.suggestedPriceMin} - ₹${listing.suggestedPriceMax}`
      : '';

  const bulkLine =
    typeof listing.wholesalePriceMin === 'number' && typeof listing.wholesalePriceMax === 'number'
      ? `Bulk orders: ₹${listing.wholesalePriceMin}-₹${listing.wholesalePriceMax}/unit (min ${listing.minOrderQuantity || '—'} units)`
      : '';

  const { ecoScore, ecoBadge } = computeEcoRatingLabel(listing.ecoRating);
  const ecoBadgeText = ecoScore === 2 ? `${ecoBadge} Eco-friendly` : null; // only badge it on the poster if it's genuinely rated high

  const svg = buildPosterSvg({
    title: listing.title || listing.category || '',
    priceLine,
    featureLine: truncateCaption(listing.descriptionEn, 110), // stays within wrapToTspans's 3-line x 42-char budget below, so the "..." from truncateCaption survives instead of getting silently cut off again by the line-wrap limit
    useCaseLine: listing.useCase ? `» ${listing.useCase}` : '',
    bulkLine,
    ecoBadgeText,
  });

  const outputPath = path.join(OUTPUT_DIR, `poster-${Date.now()}.png`);

  await sharp(imagePath)
    .resize(POSTER_WIDTH, POSTER_HEIGHT, { fit: 'cover' })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toFile(outputPath);

  return outputPath;
}

module.exports = { generateProductPoster };
