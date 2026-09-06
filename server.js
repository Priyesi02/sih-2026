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
  generateProductPoster,
} = require('./index');
const { sendOtp, verifyOtp } = require('./lib/auth');
const { applyAdaptivePricing } = require('./lib/adaptivePricing');
const { computeEcoRatingLabel } = require('./lib/ecoRating');

// Twilio Verify is only usable once all 3 env vars are set (Account SID,
// Auth Token, and a Verify Service SID created in the Twilio Console).
// Same graceful-degradation pattern as `db` above: the routes still
// exist, they just return a clear 503 instead of crashing anything.
const TWILIO_CONFIGURED = Boolean(
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_VERIFY_SERVICE_SID
);
if (!TWILIO_CONFIGURED) {
  console.warn(
    '[auth] Twilio env vars not fully set — /api/auth/send-otp and /api/auth/verify-otp ' +
      'will return an error until TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and ' +
      'TWILIO_VERIFY_SERVICE_SID are all set in .env.'
  );
}

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

      // Active-learning re-pricing — shifts suggestedPriceMin/Max from
      // Gemini's cold-start guess toward real accumulated Firestore data
      // once there's enough of it for this category (see
      // lib/adaptivePricing.js). No-ops cleanly if Firestore isn't
      // configured or there's not enough data yet.
      Object.assign(result, await applyAdaptivePricing(result, db));

      // Attach the seller-facing eco-rating badge for this single listing
      // (see lib/ecoRating.js) — computed here, not by generateListing()
      // itself, since it's presentation-layer derived from the raw
      // ecoRating string Gemini already returned.
      Object.assign(result, computeEcoRatingLabel(result.ecoRating));
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
 * POST /api/auth/send-otp
 * Body: { phoneNumber: "+919876543210" } (E.164 format required)
 * Triggers an SMS OTP via Twilio Verify. Does not create any user
 * record itself — Firestore only gets an entry once verify-otp
 * succeeds (see below), keyed by phone number so re-logins resolve to
 * the same uid.
 */
app.post('/api/auth/send-otp', async (req, res) => {
  if (!TWILIO_CONFIGURED) {
    return res.status(503).json({ success: false, error: 'Twilio is not configured on this server (missing TWILIO_* env vars).' });
  }
  const { phoneNumber } = req.body || {};
  if (!phoneNumber) {
    return res.status(400).json({ success: false, error: '"phoneNumber" is required, in E.164 format e.g. +919876543210.' });
  }

  try {
    const result = await sendOtp(phoneNumber);
    res.json({ success: true, status: result.status });
  } catch (err) {
    console.error('[server] /api/auth/send-otp failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/auth/verify-otp
 * Body: { phoneNumber: "+919876543210", code: "123456" }
 * On success, finds-or-creates a Firestore user doc keyed by phone
 * number and returns its id as the app-wide "uid" the frontend stores
 * and attaches to every listing/stats call from then on.
 * If Firestore isn't configured, verification still works (Twilio-side)
 * but falls back to using the phone number itself as the uid, so login
 * still functions in a demo without Firestore — just without a
 * persistent user profile.
 */
app.post('/api/auth/verify-otp', async (req, res) => {
  if (!TWILIO_CONFIGURED) {
    return res.status(503).json({ success: false, error: 'Twilio is not configured on this server (missing TWILIO_* env vars).' });
  }
  const { phoneNumber, code } = req.body || {};
  if (!phoneNumber || !code) {
    return res.status(400).json({ success: false, error: '"phoneNumber" and "code" are both required.' });
  }

  try {
    const approved = await verifyOtp(phoneNumber, code);
    if (!approved) {
      return res.status(401).json({ success: false, error: 'Incorrect or expired code.' });
    }

    if (!db) {
      // No Firestore configured — login still "works" for demo purposes,
      // uid is just the phone number itself. No user record exists to
      // check, so there's no real way to know "new" vs "returning" here.
      return res.json({ success: true, uid: phoneNumber, phoneNumber, isNewUser: false });
    }

    const usersRef = db.collection('users');
    const existing = await usersRef.where('phoneNumber', '==', phoneNumber).limit(1).get();

    let uid;
    let isNewUser;
    if (!existing.empty) {
      uid = existing.docs[0].id;
      isNewUser = false;
    } else {
      const created = await usersRef.add({ phoneNumber, createdAt: new Date().toISOString(), aadhaarLinked: false });
      uid = created.id;
      isNewUser = true;
    }

    // isNewUser tells the frontend whether to show the one-time Aadhaar
    // step right after this (see POST /api/auth/link-aadhaar below) —
    // only first-time signups get asked, not every login.
    res.json({ success: true, uid, phoneNumber, isNewUser });
  } catch (err) {
    console.error('[server] /api/auth/verify-otp failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/auth/link-aadhaar
 * Body: { uid: "<Firestore user doc id>", aadhaarNumber: "123412341234" }
 *
 * *** THIS IS A MOCK. NO REAL UIDAI/AADHAAR API IS EVER CALLED. ***
 * There is no real e-KYC verification happening here — this simply
 * validates the number LOOKS like a 12-digit Aadhaar number, stores it
 * against the user's record, and marks aadhaarLinked: true to simulate
 * what a "linked" state would look like for demo purposes. A real
 * implementation would call UIDAI's actual (paid, licensed) e-KYC API,
 * which is well outside this hackathon's scope.
 */
app.post('/api/auth/link-aadhaar', async (req, res) => {
  if (!db) {
    return res.status(503).json({ success: false, error: 'Firestore is not configured on this server (missing serviceAccountKey.json).' });
  }
  const { uid, aadhaarNumber } = req.body || {};
  if (!uid || !aadhaarNumber) {
    return res.status(400).json({ success: false, error: '"uid" and "aadhaarNumber" are both required.' });
  }
  if (!/^\d{12}$/.test(String(aadhaarNumber).replace(/\s+/g, ''))) {
    return res.status(400).json({ success: false, error: 'Aadhaar number must be exactly 12 digits.' });
  }

  try {
    await db.collection('users').doc(uid).set(
      {
        aadhaarNumber: String(aadhaarNumber).replace(/\s+/g, ''),
        aadhaarLinked: true,
        aadhaarLinkedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    res.json({ success: true, aadhaarLinked: true });
  } catch (err) {
    console.error('[server] /api/auth/link-aadhaar failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/save-listing
 * Saves a draft or published listing directly to Firestore.
 *
 * BUG FIX: this used to ALWAYS create a new document via .add(), even
 * when the listing already had an `id` (e.g. re-saving after an edit —
 * see PUT /api/listings/:id below, which now handles edits properly;
 * this route still supports the same "if id present, update" behavior
 * for any caller still going through save-listing directly). Publishing
 * the same listing twice used to silently create duplicate Firestore
 * docs instead of updating the original.
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

    const { id, ...listingWithoutId } = listing;
    const now = new Date().toISOString();

    if (id) {
      await db.collection('listings').doc(id).set({ ...listingWithoutId, updatedAt: now }, { merge: true });
      return res.json({ success: true, id, message: 'Listing updated successfully.' });
    }

    const payload = { ...listingWithoutId, createdAt: now, updatedAt: now };
    const docRef = await db.collection('listings').add(payload);
    res.json({ success: true, id: docRef.id, message: 'Listing saved successfully.' });
  } catch (err) {
    console.error('[server] /api/save-listing failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/listings
 * - No query params: every published listing, for the buyer/marketplace view.
 * - ?uid=<artisanId>: that artisan's own listings, ANY status (draft or
 *   published) — this is what "My Listings" / the Impact dashboard use
 *   now that login provides a real uid, instead of everyone seeing the
 *   same published-only global feed.
 */
app.get('/api/listings', async (req, res) => {
  if (!db) {
    return res.status(503).json({ success: false, error: 'Firestore is not configured on this server (missing serviceAccountKey.json).' });
  }
  try {
    const { uid } = req.query;
    const query = uid
      ? db.collection('listings').where('artisanId', '==', uid)
      : db.collection('listings').where('status', '==', 'published');

    const snapshot = await query.get();
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
  const { listings, uid } = req.body || {};

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

    const stats = computeArtisanStats(itemsToCompute);
    res.json(stats);
  } catch (err) {
    console.error('[server] /api/artisan-stats failed:', err.message);
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/marketplace-sync
 * Mock ONDC/GeM catalog synchronization. If `listing.id` (the Firestore
 * doc id from save-listing) is present and Firestore is configured, the
 * mock outcome (status) is also persisted back onto that listing doc —
 * so it survives a refetch and feeds real numbers into GET /api/listings
 * afterward, instead of only existing in this one response.
 */
app.post('/api/marketplace-sync', async (req, res) => {
  const { listing } = req.body || {};
  try {
    const syncResult = generateMockMarketplaceSync(listing);

    if (listing?.id && db) {
      await db.collection('listings').doc(listing.id).set(
        {
          marketplaceStatus: syncResult.status,
          marketplaceStatusReasonCode: syncResult.statusReasonCode,
          marketplaceStatusReason: syncResult.statusReason,
          syncedAt: syncResult.syncedAt,
        },
        { merge: true }
      );
    }

    res.json(syncResult);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/generate-poster
 * JSON body: { listing: <listing object, must include enhancedImageUrl> }
 * Returns { url: "<public .png URL>" } — a 9:16 story-shaped shareable
 * poster (see lib/generatePoster.js), for saving to the gallery or
 * posting directly as a WhatsApp/Instagram Story. No ffmpeg, no audio —
 * a still image, generated instantly.
 */
app.post('/api/generate-poster', async (req, res) => {
  const { listing } = req.body || {};
  if (!listing || !listing.enhancedImageUrl) {
    return res.status(400).json({ error: '"listing" (including enhancedImageUrl) is required in the request body.' });
  }

  try {
    const posterPath = await generateProductPoster({
      imagePath: fromPublicUrl(listing.enhancedImageUrl),
      listing,
    });
    res.json({ url: toPublicUrl(req, posterPath) });
  } catch (err) {
    console.error('[server] /api/generate-poster failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[server] listening on port ${PORT}`);
});