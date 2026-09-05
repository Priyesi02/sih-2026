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

if (!fs.existsSync(serviceAccountPath)) {
  console.error('[firebase] ERROR: serviceAccountKey.json not found in root directory!');
} else {
  const serviceAccount = require(serviceAccountPath);
  initializeApp({
    credential: cert(serviceAccount),
  });
  console.log('[firebase] initialized successfully');
}

const db = getFirestore();
// ----------------------------------------------------------------------
// ----------------------------------------------------------------------

const {
  runFullPipeline,
  speakListing,
  computeArtisanStats,
  generateMockMarketplaceSync,
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
      result.enhancedImageUrl = toPublicUrl(req, result.enhancedImageUrl);
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

app.listen(PORT, () => {
  console.log(`[server] listening on port ${PORT}`);
});