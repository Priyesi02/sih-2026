// server.js
//
// Thin HTTP layer over the AI module (index.js) — this is the piece the
// Expo/React Native app actually talks to. None of the pipeline logic
// lives here; every route just parses the request, calls a function
// already exported from index.js, and serializes the result.
//
// See HANDOFF.md for the full request/response contract each route
// follows, and for how this is deployed to Render.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');

const {
  runFullPipeline,
  speakListing,
  computeArtisanStats,
  generateMockMarketplaceSync,
  generateProductVideo,
} = require('./index');

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const OUTPUT_DIR = path.join(__dirname, 'output');
for (const dir of [UPLOADS_DIR, OUTPUT_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ---- Middleware ------------------------------------------------------

// Permissive CORS: the Expo app runs on a phone, on a different network
// than this server, from an origin that isn't a fixed browser origin —
// there's no fixed list of origins to allow-list here, so allow all.
app.use(cors());

app.use(express.json({ limit: '2mb' })); // for JSON-body routes (speak-listing, stats, marketplace-sync)

// Serves generated files (enhanced images, spoken audio .wav) so the
// Expo app can actually fetch/play them — runFullPipeline/speakListing
// return local disk paths, which get rewritten to URLs under this route
// (see toPublicUrl below) before any JSON response goes out.
app.use('/output', express.static(OUTPUT_DIR));

// Multer saves uploaded files to disk with their original extension
// preserved — enhanceImage/transcribeVoice both validate by file
// extension, so this matters.
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB per file, generous for a phone photo/voice note
});

/**
 * Converts a local absolute file path (as returned by enhanceImage/
 * speakListing) into a publicly fetchable URL under /output/, using
 * this request's own host — works whether this is running locally or
 * on Render, without hardcoding a domain anywhere.
 */
function toPublicUrl(req, absoluteLocalPath) {
  if (!absoluteLocalPath) return null;
  const fileName = path.basename(absoluteLocalPath);
  return `${req.protocol}://${req.get('host')}/output/${fileName}`;
}

/**
 * Reverses toPublicUrl: given a URL this server itself issued under
 * /output/, resolves it back to the local file path — needed because
 * /api/generate-video receives a listing whose enhancedImageUrl (and
 * optionally an audioUrl) are URLs from earlier responses, not local
 * paths, but generateProductVideo needs to read the actual files.
 */
function fromPublicUrl(url) {
  if (!url) return null;
  const fileName = path.basename(new URL(url).pathname);
  return path.join(OUTPUT_DIR, fileName);
}

/**
 * If enhanceImage failed inside runFullPipeline, enhancedImageUrl falls
 * back to the ORIGINAL uploaded file — which lives in uploads/, isn't
 * served statically, and gets deleted by cleanupUpload right after this
 * request finishes. Copy it into output/ so the URL we hand back stays
 * valid exactly like a normal enhanced image would. No-op if the path
 * given is already in output/.
 */
function ensureServableFromOutput(localPath) {
  if (!localPath || path.dirname(localPath) === OUTPUT_DIR) return localPath;
  const destPath = path.join(OUTPUT_DIR, `fallback-${Date.now()}-${path.basename(localPath)}`);
  fs.copyFileSync(localPath, destPath);
  return destPath;
}

/** Deletes a temp uploaded file; failures here are non-fatal, just logged. */
function cleanupUpload(filePath) {
  if (!filePath) return;
  fs.unlink(filePath, (err) => {
    if (err) console.warn(`[server] failed to clean up temp upload ${filePath}:`, err.message);
  });
}

// ---- Routes ------------------------------------------------------------

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'artisan-ai-listing-module', message: 'See HANDOFF.md for API routes.' });
});

// Render (and uptime checks) hit this to confirm the service is alive.
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

/**
 * POST /api/generate-listing
 * multipart/form-data with fields:
 *   image (file, required), audio (file, required),
 *   language (text, optional), category (text, optional)
 * Returns runFullPipeline's result unchanged (still { success, ... } or
 * { success: false, error }), except enhancedImageUrl is rewritten from
 * a local path to a fetchable URL.
 */
app.post('/api/generate-listing', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'audio', maxCount: 1 }]), async (req, res) => {
  const imageFile = req.files?.image?.[0];
  const audioFile = req.files?.audio?.[0];

  if (!imageFile || !audioFile) {
    return res.status(400).json({ success: false, error: 'Both "image" and "audio" files are required.' });
  }

  try {
    const result = await runFullPipeline({
      imagePath: imageFile.path,
      audioPath: audioFile.path,
      language: req.body.language,
      category: req.body.category,
    });

    if (result.success) {
      // ensureServableFromOutput handles the case where enhanceImage
      // failed and fell back to the original uploaded file (which is
      // about to be deleted below, and was never served statically) —
      // see that function's comment.
      result.enhancedImageUrl = toPublicUrl(req, ensureServableFromOutput(result.enhancedImageUrl));
    }

    res.json(result);
  } catch (err) {
    // Only missing-argument bugs throw from runFullPipeline (see
    // lib/runFullPipeline.js) — genuine API/network failures already
    // come back as { success: false, error } above, not a throw.
    console.error('[server] /api/generate-listing threw:', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    cleanupUpload(imageFile?.path);
    cleanupUpload(audioFile?.path);
  }
});

/**
 * POST /api/speak-listing
 * JSON body: { listing: <the listing object from /api/generate-listing> }
 * Returns { url: "<public .wav URL>" } on success.
 * On failure, throws inside speakListing() propagate as a 500 — matches
 * this function's documented "throws on failure" behavior (HANDOFF.md
 * section 2.5), the frontend already expects to try/catch this call.
 */
app.post('/api/speak-listing', async (req, res) => {
  const { listing } = req.body || {};
  if (!listing) {
    return res.status(400).json({ error: '"listing" object is required in the request body.' });
  }

  try {
    const audioPath = await speakListing(listing);
    res.json({ url: toPublicUrl(req, audioPath) });
  } catch (err) {
    console.error('[server] /api/speak-listing failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/artisan-stats
 * JSON body: { listings: [...], expectedSalesPerListing?: number }
 * No AI, instant — see lib/artisanStats.js.
 */
app.post('/api/artisan-stats', (req, res) => {
  const { listings, expectedSalesPerListing } = req.body || {};
  try {
    const stats = computeArtisanStats(listings, { expectedSalesPerListing });
    res.json(stats);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/marketplace-sync
 * JSON body: { listing: <listing object> }
 * MOCK ONLY — see lib/mockMarketplaceSync.js. No real network call ever
 * happens here, regardless of environment.
 */
app.post('/api/marketplace-sync', (req, res) => {
  const { listing } = req.body || {};
  try {
    const syncResult = generateMockMarketplaceSync(listing);
    res.json(syncResult);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/generate-video
 * JSON body: { listing: <listing object from /api/generate-listing, must
 *   include enhancedImageUrl>, audioUrl?: <a .wav URL from a prior
 *   /api/speak-listing call, for narration> }
 * Returns { url: "<public .mp4 URL>" } on success.
 * NOTE: audioUrl is optional and NOT fetched automatically — narration
 * only happens if the frontend already called /api/speak-listing itself
 * and passes that URL in. This route never calls speakListing on its
 * own, since that would silently spend the 10-requests/day TTS quota
 * every time a video is generated (see HANDOFF.md 5.6/2.5).
 */
app.post('/api/generate-video', async (req, res) => {
  const { listing, audioUrl } = req.body || {};
  if (!listing || !listing.enhancedImageUrl) {
    return res.status(400).json({ error: '"listing" (including enhancedImageUrl) is required in the request body.' });
  }

  try {
    const videoPath = await generateProductVideo({
      imagePath: fromPublicUrl(listing.enhancedImageUrl),
      listing,
      audioPath: audioUrl ? fromPublicUrl(audioUrl) : undefined,
    });
    res.json({ url: toPublicUrl(req, videoPath) });
  } catch (err) {
    console.error('[server] /api/generate-video failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[server] listening on port ${PORT}`);
});
