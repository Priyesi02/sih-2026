// server.js
//
// HTTP layer over the AI module (index.js) with Firebase Firestore integrated
// for persistent storage of artisan listings and records.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const admin = require('firebase-admin');
// ---- Firebase Initialization -----------------------------------------
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');

// BUG FIX (found by actually starting the server without this file
// present — it crashed the ENTIRE process, not just Firestore routes):
// getFirestore() was called unconditionally even when initializeApp()
// was never run, throwing an uncaught FirebaseAppError at require-time
// and taking down image/video generation and every other route with
// it, none of which have anything to do with Firestore. `db` is now
// `null` when the credential file is missing, and every Firestore route
// below checks for that and returns a clear error instead of the whole
// server refusing to start.
let db = null;

if (!fs.existsSync(serviceAccountPath)) {
  console.warn(
    '[firebase] serviceAccountKey.json not found — Firestore-backed routes ' +
      '(/api/save-listing, /api/listings, and /api/artisan-stats with a "uid") ' +
      'will return an error. Everything else (image/video generation, TTS, ' +
      'pricing, etc.) still works normally.'
  );
} else {
  const serviceAccount = require(serviceAccountPath);
  initializeApp({
    credential: cert(serviceAccount),
  });
  db = getFirestore();
  console.log('[firebase] initialized successfully');
}
// ----------------------------------------------------------------------
// ----------------------------------------------------------------------

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

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/output', express.static(OUTPUT_DIR));

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

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

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

/**
 * POST /api/generate-listing
 * Runs the AI pipeline (photo + audio -> listing)
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
    console.error('[server] /api/generate-listing threw:', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    cleanupUpload(imageFile?.path);
    cleanupUpload(audioFile?.path);
  }
});

/**
 * POST /api/save-listing
 * Saves a draft or published listing directly to Firestore
 */
app.post('/api/save-listing', async (req, res) => {
  if (!db) {
    return res.status(503).json({ success: false, error: 'Firestore is not configured on this server (missing serviceAccountKey.json).' });
  }
  try {
    const listing = req.body;

    if (!listing) {
      return res.status(400).json({ success: false, error: 'Listing payload is required.' });
    }

    const payload = {
      ...listing,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const docRef = await db.collection('listings').add(payload);
    res.json({ success: true, id: docRef.id, message: 'Listing saved successfully.' });
  } catch (err) {
    console.error('[server] /api/save-listing failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/listings
 * Fetches all published listings for the buyer marketplace view
 */
app.get('/api/listings', async (req, res) => {
  if (!db) {
    return res.status(503).json({ success: false, error: 'Firestore is not configured on this server (missing serviceAccountKey.json).' });
  }
  try {
    const snapshot = await db.collection('listings').where('status', '==', 'published').get();
    const listings = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json({ success: true, listings });
  } catch (err) {
    console.error('[server] /api/listings failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/speak-listing
 * On-demand TTS generation (max 10/day on free tier)
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
 * Supports either:
 *  1) Direct array: { listings: [...] }
 *  2) Database lookup by UID: { uid: "artisan_123" }
 */
app.post('/api/artisan-stats', async (req, res) => {
  const { listings, uid, expectedSalesPerListing } = req.body || {};

  try {
    let itemsToCompute = listings;

    // If frontend sends an artisan UID instead of array, pull directly from Firestore
    if (!itemsToCompute && uid) {
      if (!db) {
        return res.status(503).json({ error: 'Firestore is not configured on this server (missing serviceAccountKey.json) — pass "listings" directly instead of "uid".' });
      }
      const snapshot = await db.collection('listings').where('artisanId', '==', uid).get();
      itemsToCompute = snapshot.docs.map((doc) => doc.data());
    }

    if (!itemsToCompute) {
      return res.status(400).json({ error: 'Provide either "listings" array or "uid" string in the body.' });
    }

    const stats = computeArtisanStats(itemsToCompute, { expectedSalesPerListing });
    res.json(stats);
  } catch (err) {
    console.error('[server] /api/artisan-stats failed:', err.message);
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/marketplace-sync
 * Mock ONDC/GeM catalog synchronization
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