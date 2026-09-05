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
  imageUrl?: string;
  enhancedImageUrl?: string;
  transcriptText?: string;
  descriptionEn: string;
  descriptionHi: string;
  descriptionLocal: string;
  detectedLanguage: string;
  craftStory: string;
  suggestedPriceMin: number;
  suggestedPriceMax: number;
  priceReasoning: string;
  category: string;
  suggestedSchemes: { name: string; reason: string }[];
  b2bDescription: string;
  wholesalePriceMin: number;
  wholesalePriceMax: number;
  minOrderQuantity: number;
  schemeMatches: string[];
  status: 'draft' | 'published';
  error?: string;
};

export type ArtisanStats = {
  totalListings: number;
  publishedListings: number;
  draftListings: number;
  potentialEarningsMin: number;
  potentialEarningsMax: number;
  monthlyProjectionMin: number;
  monthlyProjectionMax: number;
  projectionAssumption: string;
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
  listings: Pick<Listing, 'status' | 'suggestedPriceMin' | 'suggestedPriceMax'>[],
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

/** Generates a shareable product video. audioUrl is optional (from a prior speakListing call). */
export async function generateVideo(listing: Listing, audioUrl?: string): Promise<{ url: string }> {
  const res = await fetch(`${BASE_URL}/api/generate-video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listing, audioUrl }),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'generate-video failed');
  return res.json();
}
