# Kriya — Expo Frontend

React Native (Expo SDK 53, TypeScript) mobile app, wired to the real
backend in the parent `sih_2026/` folder — no mocked API calls, the
actual tested Express routes. Ships as a real installable Android app
(see **Building a standalone app** below), not just an Expo Go preview.

## Features

- **Phone + OTP login** (Twilio Verify) with a language picker (8
  languages: English, Hindi, Tamil, Telugu, Kannada, Bengali, Marathi,
  Gujarati) and a one-time mock Aadhaar-linking step for new signups.
- **List a craft**: photo (camera/gallery) + voice recording in any
  language → full AI-generated listing in ~10s.
- **Review & edit**: every field (title, description, craft story,
  price, bulk price, MOQ, B2B description) is editable before
  publishing, with a "save as draft?" prompt if you leave without saving.
- **My Listings**: real Firestore-backed listings, tap to reopen/edit —
  editing and republishing re-runs the mock marketplace approval check.
- **Home**: real listing counts + an aggregate AI "green rating" — no
  fabricated earnings/sales numbers (see backend README).
- **Shareable poster** generation (price, features, bulk pricing) for
  WhatsApp/Instagram.
- Whole app UI (not just AI content) is translated via a custom i18n
  system — `src/i18n/`.

## Setup

```bash
cd frontend
npm install
```

**Point it at your backend** — edit `src/api/client.ts`'s `BASE_URL`:
- Simulator on the same Mac as the backend: `http://localhost:3000` works.
- Physical phone via Expo Go: use your Mac's LAN IP instead (`ipconfig
  getifaddr en0`) — a phone can't reach `localhost` meaning itself.

Make sure the backend is running: `cd .. && node server.js`

## Run (development, via Expo Go)

```bash
npx expo start
```
Scan the QR code with Expo Go (physical phone) or press `i`/`a` for a simulator.

## Building a standalone app (no Play Store needed)

This project is configured for **EAS Build** to produce a real,
directly-installable `.apk` — no Android Studio required locally, no
Play Store submission:

```bash
npx eas-cli login          # one-time, free Expo account
npx eas-cli build --platform android --profile preview
```

This uploads the project to Expo's cloud build service and returns a
download link/QR code — open it on an Android phone to install. The
app icon, name ("Kriya"), and package ID (`com.kriya.app`) are already
configured in `app.json`. See `eas.json` for the build profile (`apk`,
not the Play-Store-only `.aab` format).

**Note**: the installed app still points at whatever `BASE_URL` was set
in `client.ts` at build time — your backend needs to be running and
reachable at that address for the app to actually work after install.

## Verified

- `npx tsc --noEmit` — zero type errors
- `npx expo-doctor` — 21/21 checks pass
- `npx expo export` — bundles successfully, all custom assets (logo,
  backgrounds, icons) included
- Real on-device testing via Expo Go caught and fixed several bugs
  (FormData/Blob uploads, missing Content-Type boundary, server
  connectivity) — see git history / `HANDOFF.md` for details
- A real installable APK has been built and tested via EAS Build

## Project structure

```
App.tsx                          navigation root — auth gating (Login → Aadhaar → Tabs) + ListingReview modal
app.json / eas.json              app identity, icons, permissions, EAS build profile
assets/brand/                     real KRIYA logo + background images
src/theme/                       colors, spacing, fonts — one source of truth
src/api/client.ts                calls the real backend (types + fetch wrappers)
src/auth/AuthContext.tsx         phone/OTP login state, persisted via expo-secure-store
src/i18n/                        custom i18n — translations.ts (8 languages) + LanguageContext
src/components/
  Card.tsx                       the white rounded card used everywhere
  TabBar.tsx                     custom bottom tab bar (Home / List / Listings) with raised center FAB
  MarketplaceBadge.tsx           GeM/ONDC/Craftmark pill badges
  SaveShareConfirmation.tsx      save-to-gallery + share-sheet UI, used by the poster flow
src/screens/
  LoginScreen.tsx                 phone + OTP + language picker
  AadhaarScreen.tsx               one-time mock Aadhaar linking for new signups
  HomeScreen.tsx                   merged Home + Impact — real stats, eco rating, "how it works"
  ListCraftScreen.tsx             photo + voice capture → /api/generate-listing
  ListingReviewScreen.tsx         fully editable review/publish screen, re-triggers approval on edit
  ListingsScreen.tsx              "My Listings" — real Firestore data, tap to edit
src/utils/saveVideoAndCaption.ts  save poster to gallery + copy caption + share sheet
```

## Known gaps (honest, not hidden)

- Government marketplace sync and Aadhaar linking are **mocked** — real
  GeM/ONDC/UIDAI integration is out of scope for a hackathon build.
- No buyer-facing storefront/detail view — this is the artisan-facing
  side only.
