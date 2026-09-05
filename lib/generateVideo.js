// lib/generateVideo.js
//
// Generates a short, shareable product video from the enhanced photo +
// the listing's own details (category, price, description) — no new AI
// call, this just composites data the pipeline already produced.
//
// How it works:
//   1. sharp draws a caption overlay (category, price range, a short
//      description line) onto the product photo as a dark bottom bar —
//      text is rendered as SVG + composited, NOT via ffmpeg's drawtext
//      filter, because drawtext depends on system fonts being present,
//      which is unreliable on a minimal Linux container (e.g. Render).
//      sharp is already a proven dependency in this project.
//   2. ffmpeg (via @ffmpeg-installer/ffmpeg + fluent-ffmpeg) turns that
//      single captioned image into an MP4 with a slow zoom-in ("Ken
//      Burns") effect so it reads as a video, not a frozen photo.
//   3. If a narration audio file is provided (e.g. from speakListing),
//      it's attached as the soundtrack and the video's length matches
//      the audio. If not, the video defaults to a fixed short length
//      with no audio track.
//
// NOTE on audioPath: this function does NOT call speakListing() itself.
// speakListing's free tier is capped at 10 requests/day (see
// HANDOFF.md 5.6/2.5) — silently calling it here on every video would
// burn that quota without the caller choosing to. Pass in a path from
// an existing on-demand speakListing() call if you want narration.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const OUTPUT_DIR = path.join(__dirname, '..', 'output');

// Square output — reads reasonably on WhatsApp/Instagram/Facebook
// without letterboxing surprises, whatever the source photo's aspect ratio.
const VIDEO_SIZE = 1080;
const DEFAULT_DURATION_SECONDS = 6; // used only when no narration audio is provided
const ZOOM_DURATION_FRAMES = 125; // at 25fps, the zoom completes over 5s, then holds — safe even if the video runs longer (via narration audio)
const FPS = 25;

/**
 * Truncates text to a maximum length for on-screen captions, cutting at
 * a word boundary rather than mid-word.
 */
function truncateCaption(text, maxLength) {
  if (!text || text.length <= maxLength) return text || '';
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxLength)}...`;
}

/** Escapes text for safe embedding inside an SVG <text> element. */
function escapeSvgText(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Builds the SVG caption overlay: a dark gradient bar across the bottom
 * third of the frame, with category, price, and a short description.
 */
function buildCaptionSvg({ category, priceLine, caption }) {
  const barHeight = 320;
  const barY = VIDEO_SIZE - barHeight;

  return `
<svg width="${VIDEO_SIZE}" height="${VIDEO_SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="black" stop-opacity="0" />
      <stop offset="100%" stop-color="black" stop-opacity="0.85" />
    </linearGradient>
  </defs>
  <rect x="0" y="${barY}" width="${VIDEO_SIZE}" height="${barHeight}" fill="url(#fade)" />
  <text x="48" y="${barY + 90}" font-family="sans-serif" font-size="34" font-weight="bold" fill="#ffffff" text-transform="uppercase">
    ${escapeSvgText(category)}
  </text>
  <text x="48" y="${barY + 150}" font-family="sans-serif" font-size="44" font-weight="bold" fill="#ffe27a">
    ${escapeSvgText(priceLine)}
  </text>
  <text x="48" y="${barY + 210}" font-family="sans-serif" font-size="28" fill="#f0f0f0">
    ${escapeSvgText(caption)}
  </text>
</svg>`.trim();
}

/**
 * Composites the caption overlay onto the (resized/cropped-to-square)
 * product photo. Returns a Buffer — the frame ffmpeg will turn into video.
 */
async function buildCaptionedFrame(imagePath, listingDetails) {
  const priceLine =
    typeof listingDetails.suggestedPriceMin === 'number' && typeof listingDetails.suggestedPriceMax === 'number'
      ? `₹${listingDetails.suggestedPriceMin} - ₹${listingDetails.suggestedPriceMax}`
      : '';

  const svg = buildCaptionSvg({
    category: listingDetails.category || '',
    priceLine,
    caption: truncateCaption(listingDetails.descriptionEn, 90),
  });

  return sharp(imagePath)
    .resize(VIDEO_SIZE, VIDEO_SIZE, { fit: 'cover' })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

/**
 * Generates a short product video (MP4) from a product photo + listing
 * details, with an optional narration audio track.
 *
 * @param {Object} params
 * @param {string} params.imagePath - path to the product photo (ideally the enhanced one).
 * @param {Object} params.listing - listing details; uses category, suggestedPriceMin,
 *   suggestedPriceMax, descriptionEn for the on-screen caption.
 * @param {string} [params.audioPath] - path to a pre-generated narration audio file
 *   (e.g. from speakListing()). If provided, becomes the video's soundtrack and the
 *   video's length matches the audio. If omitted, the video is a fixed
 *   ${DEFAULT_DURATION_SECONDS}s with no audio track.
 * @returns {Promise<string>} - path to the saved .mp4 file.
 */
/**
 * Reads an audio file's exact duration (seconds) via ffprobe.
 *
 * Why this exists instead of just using ffmpeg's `-shortest` flag:
 * tested directly and found that `-shortest` does NOT reliably bound
 * a `zoompan`-filtered looped-image video against a shorter audio
 * track — the output ran ~2.4s longer than the audio in a real test.
 * Measuring the exact duration up front and passing it as an explicit
 * `-t` is deterministic and was verified to produce the correct length.
 */
function getAudioDuration(audioPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) return reject(new Error(`generateProductVideo: could not read audio duration - ${err.message}`));
      resolve(metadata.format.duration);
    });
  });
}

async function generateProductVideo({ imagePath, listing, audioPath }) {
  if (!imagePath || !fs.existsSync(imagePath)) {
    throw new Error(`generateProductVideo: image not found at "${imagePath}"`);
  }
  if (!listing) {
    throw new Error('generateProductVideo: listing details are required');
  }
  if (audioPath && !fs.existsSync(audioPath)) {
    throw new Error(`generateProductVideo: audio file not found at "${audioPath}"`);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Step 1: build the single captioned frame that the whole video is based on.
  const frameBuffer = await buildCaptionedFrame(imagePath, listing);
  const framePath = path.join(OUTPUT_DIR, `video-frame-${Date.now()}.png`);
  fs.writeFileSync(framePath, frameBuffer);

  const outputPath = path.join(OUTPUT_DIR, `product-video-${Date.now()}.mp4`);

  // Step 2: figure out the exact target duration up front (see
  // getAudioDuration's comment for why this is measured explicitly
  // rather than relying on ffmpeg to infer it).
  const durationSeconds = audioPath ? await getAudioDuration(audioPath) : DEFAULT_DURATION_SECONDS;

  // Step 3: turn that frame into an MP4 with a slow zoom-in effect,
  // trimmed to exactly durationSeconds.
  const zoompanFilter =
    `scale=${VIDEO_SIZE}:${VIDEO_SIZE},` +
    `zoompan=z='min(zoom+0.0009,1.15)':d=${ZOOM_DURATION_FRAMES}:s=${VIDEO_SIZE}x${VIDEO_SIZE}:fps=${FPS}`;

  await new Promise((resolve, reject) => {
    const command = ffmpeg()
      .input(framePath)
      .inputOptions(['-loop 1'])
      .videoFilters(zoompanFilter)
      .fps(FPS)
      .duration(durationSeconds);

    if (audioPath) {
      command.input(audioPath).outputOptions(['-c:v libx264', '-pix_fmt yuv420p', '-c:a aac', '-b:a 192k']);
    } else {
      command.outputOptions(['-c:v libx264', '-pix_fmt yuv420p']);
    }

    command
      .on('error', (err) => reject(new Error(`generateProductVideo: ffmpeg failed - ${err.message}`)))
      .on('end', resolve)
      .save(outputPath);
  });

  // Clean up the intermediate frame — only the final video is needed.
  fs.unlink(framePath, () => {});

  return outputPath;
}

module.exports = { generateProductVideo };
