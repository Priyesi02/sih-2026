// src/api/client.ts
//
// Talks to the backend built in ../../server.js (this repo's Express
// server). Every route/shape here matches HANDOFF.md exactly — see that
// file (section 6) for the full contract if you need to extend this.

import { File } from 'expo-file-system';

// Set to this Mac's current LAN IP (found via `ipconfig getifaddr en0`)
// so a physical phone running Expo Go can reach the backend — a phone
// can't use "localhost", that would mean the phone itself, not this
// computer. Requirements for this to work:
//   1. node server.js is running on THIS Mac
//   2. the phone is on the SAME WiFi network as this Mac
//   3. this IP is still current — it can change (different network,
//      router reassigns it, etc.); if requests suddenly fail, re-run
//      `ipconfig getifaddr en0` and update this.
// Using an iOS Simulator on this same Mac instead? 'http://localhost:3000'
// works there. Deployed to Render? Use that URL instead (see HANDOFF.md 6).
export const BASE_URL = 'http://10.79.49.221:3000';

export type Listing = {
  success: boolean;
  id?: string; // present once saved — this is the Firestore document ID, added by GET /api/listings and POST /api/save-listing's response (not by the AI pipeline itself)
  imageUrl?: string;
  enhancedImageUrl?: string;
  transcriptText?: string;
  title: string; // short 2-5 word product name, e.g. "Purple Thread Scrunchie" — use this for card/list titles, NOT descriptionEn (a full sentence)
  descriptionEn: string;
  descriptionHi: string;
  descriptionLocal: string;
  detectedLanguage: string;
  craftStory: string;
  suggestedPriceMin: number;
  suggestedPriceMax: number;
  priceReasoning: string;
  priceSource?: 'gemini-coldstart' | 'active-learning'; // see lib/adaptivePricing.js — flips once enough real listings exist in this category
  pricingDataPoints?: number; // how many real published listings the price above was learned from (0 = still Gemini's cold-start guess)
  category: string;
  materialQualityTier?: string;
  ecoRating?: 'low' | 'mid' | 'high'; // raw Gemini classification
  ecoScore?: number; // 0-2, derived from ecoRating
  ecoLabel?: string; // e.g. "Highly eco-friendly"
  ecoBadge?: string; // emoji badge, e.g. "🟢"
  useCase?: string; // short marketing phrase, e.g. "Perfect for festive gifting or home décor" — used in video/poster
  suggestedSchemes: { name: string; reason: string }[];
  b2bDescription: string;
  wholesalePriceMin: number;
  wholesalePriceMax: number;
  minOrderQuantity: number;
  schemeMatches: string[];
  status: 'draft' | 'published';
  artisanId?: string; // the logged-in artisan's uid — set on publish, used to scope "My Listings"/Impact by GET /api/listings?uid=
  marketplaceStatus?: 'approved' | 'waitlisted'; // set by POST /api/marketplace-sync — MOCK, see lib/mockMarketplaceSync.js. Never "rejected" (removed on request — materials/eco issues waitlist at most, never reject).
  marketplaceStatusReasonCode?: 'approved' | 'quality_review' | 'category_review'; // translate this via t() — see i18n's marketplaceReason* keys. marketplaceStatusReason (below) is English-only, for logs/fallback.
  marketplaceStatusReason?: string;
  error?: string;
};

// No earnings/units-sold fields here on purpose — removed entirely on
// request (there's no real payment/order system in this app, so any
// "earnings" or "sold" number would be fabricated). Only genuinely real
// data: listing counts and the AI eco-rating aggregate.
export type ArtisanStats = {
  totalListings: number;
  publishedListings: number;
  draftListings: number;
  sellerEcoScore: number | null; // 0-2 average across published listings, null if none rated yet
  sellerEcoLabel: string;
  sellerEcoBadge: string;
  ratedListingCount: number;
};

/**
 * Uploads a photo + audio recording and gets back the full AI-generated
 * listing. Matches POST /api/generate-listing exactly.
 */
export async function generateListing(params: {
  imageUri: string;
  audioUri: string;
  category?: string;
  language?: string;
}): Promise<Listing> {
  // BUG FIX (found by actually testing on-device — "Unsupported
  // FormDataPart implementation"): the classic RN pattern of appending
  // a plain { uri, name, type } object as a pseudo-file no longer works
  // reliably on React Native 0.86's FormData implementation. The fix is
  // expo-file-system's File class, which properly implements the Blob
  // interface FormData actually expects. The 3rd argument to append()
  // sets the filename the backend sees (so multer's extension-based
  // MIME detection in enhanceImage.js/transcribeVoice.js still works).
  const formData = new FormData();
  formData.append('image', new File(params.imageUri) as any, 'photo.jpg');
  formData.append('audio', new File(params.audioUri) as any, 'voice.m4a');
  if (params.category) formData.append('category', params.category);
  if (params.language) formData.append('language', params.language);

  const res = await fetch(`${BASE_URL}/api/generate-listing`, {
    method: 'POST',
    // BUG FIX: do NOT set Content-Type manually for FormData — fetch
    // needs to generate it itself with a `boundary=...` parameter, or
    // the server can't parse the multipart body at all. Setting it
    // manually here was silently breaking every upload.
    body: formData,
  });
  return res.json();
}

/**
 * On-demand narration — only call this from an explicit "Listen" tap,
 * never automatically. Free tier is capped at 10 requests/day TOTAL
 * (see HANDOFF.md 5.6) — this is shared across every user of the app,
 * not per-device, so don't call it speculatively.
 */
export async function speakListing(listing: Listing): Promise<{ url: string }> {
  const res = await fetch(`${BASE_URL}/api/speak-listing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listing }),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'speak-listing failed');
  return res.json();
}

/** No AI, instant — see lib/artisanStats.js in the backend. */
export async function getArtisanStats(
  listings: Pick<Listing, 'status' | 'ecoRating'>[],
): Promise<ArtisanStats> {
  const res = await fetch(`${BASE_URL}/api/artisan-stats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listings }),
  });
  return res.json();
}

/** MOCK ONLY — no real ONDC/GeM/Craftmark submission ever happens. */
export async function syncToMarketplace(listing: Listing) {
  const res = await fetch(`${BASE_URL}/api/marketplace-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listing }),
  });
  return res.json();
}

/**
 * Persists a listing to Firestore (POST /api/save-listing). Body is the
 * RAW listing object — NOT wrapped in { listing: ... }, unlike most
 * other routes here. Returns 503 if the backend's serviceAccountKey.json
 * isn't configured — check `success` before assuming this worked.
 */
export async function saveListing(listing: Listing): Promise<{ success: boolean; id?: string; message?: string; error?: string }> {
  const res = await fetch(`${BASE_URL}/api/save-listing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(listing),
  });
  return res.json();
}

/**
 * Fetches listings from Firestore (GET /api/listings).
 *  - No uid: every PUBLISHED listing from every artisan (the buyer/
 *    marketplace feed).
 *  - With uid: that artisan's own listings, ANY status (draft or
 *    published) — used for "My Listings" and the Impact dashboard,
 *    now that login provides a real uid to scope by.
 */
export async function getListings(uid?: string): Promise<{ success: boolean; listings: Listing[]; error?: string }> {
  const url = uid ? `${BASE_URL}/api/listings?uid=${encodeURIComponent(uid)}` : `${BASE_URL}/api/listings`;
  const res = await fetch(url);
  return res.json();
}

/**
 * Requests an SMS OTP for the given phone number (E.164 format, e.g.
 * "+919876543210" — must include the country code with a leading "+").
 * Matches POST /api/auth/send-otp. Returns 503-shaped { success: false }
 * if the backend's Twilio env vars aren't configured — check `success`.
 */
export async function sendOtp(phoneNumber: string): Promise<{ success: boolean; status?: string; error?: string }> {
  const res = await fetch(`${BASE_URL}/api/auth/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber }),
  });
  return res.json();
}

/**
 * Checks the OTP code the user typed against what Twilio sent. On
 * success, returns a `uid` that should be persisted (see AuthContext)
 * and attached to every listing/stats call from then on.
 * Matches POST /api/auth/verify-otp.
 */
export async function verifyOtp(
  phoneNumber: string,
  code: string,
): Promise<{ success: boolean; uid?: string; phoneNumber?: string; isNewUser?: boolean; error?: string }> {
  const res = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber, code }),
  });
  return res.json();
}

/**
 * *** MOCK — no real UIDAI/Aadhaar API is ever called. *** Stores the
 * given 12-digit number against the user's record and marks
 * aadhaarLinked: true to simulate a "linked" state, for first-time
 * signups only (see LoginScreen's post-verify flow). Matches
 * POST /api/auth/link-aadhaar.
 */
export async function linkAadhaar(uid: string, aadhaarNumber: string): Promise<{ success: boolean; aadhaarLinked?: boolean; error?: string }> {
  const res = await fetch(`${BASE_URL}/api/auth/link-aadhaar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, aadhaarNumber }),
  });
  return res.json();
}

/**
 * Generates a shareable 9:16 story-shaped poster PNG (for WhatsApp
 * Status / Instagram Story) — instant composite of the product photo +
 * price + eco badge. The video-generation feature (an earlier version
 * of this "share" flow) was removed entirely on request; the poster is
 * now the only shareable asset.
 */
export async function generatePoster(listing: Listing): Promise<{ url: string }> {
  const res = await fetch(`${BASE_URL}/api/generate-poster`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listing }),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'generate-poster failed');
  return res.json();
}
