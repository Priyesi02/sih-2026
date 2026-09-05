# Kriya — Expo Frontend

Built to match the KRIYA design screenshots you shared (home screen,
listings, impact dashboard, "list your craft" flow), wired to the real
backend in the parent `sih_2026/` folder — not mocked API calls, the
actual tested Express routes.

## What's real vs. what's approximated

- **Colors, layout, copy, icons** on Home, Listings, and Impact screens
  are read directly from your screenshots.
- **The KRIYA logo mark and background pattern** aren't image assets I
  have — the header currently shows a text-based approximation. Drop
  the real logo PNG into `assets/` and swap it into `HomeScreen.tsx`
  when you have it.
- **The "List your craft" screen** matches your screenshot for steps 1
  (photo) and 2 (voice) — the "Generate Listing" button and everything
  after it (the review screen) aren't in your screenshots, since the
  design only showed the first two steps. I built a review screen in
  the same visual style so the flow has somewhere to go; swap it for
  the real design once it exists.
- **Listing/marketplace data is mock** (`src/data/mockListings.ts`) —
  there's no live database wired up yet (Firestore is separate,
  not-yet-built backend work). The Impact screen's numbers ARE real
  though — it calls the actual `/api/artisan-stats` endpoint with that
  mock data as input.

## Setup

```bash
cd frontend
npm install
```

**Before running, point it at your backend** — edit `src/api/client.ts`:
```ts
export const BASE_URL = 'http://localhost:3000';
```
- Simulator on the same Mac as the backend: `localhost` works as-is.
- Physical phone via Expo Go: use your computer's LAN IP instead (e.g.
  `http://192.168.1.23:3000`) — a phone can't reach `localhost` meaning
  itself.
- Once deployed: your Render URL (see `../HANDOFF.md` section 6).

Also make sure the backend is actually running:
```bash
cd .. && node server.js
```

## Run

```bash
npx expo start
```
Scan the QR code with Expo Go (physical phone) or press `i`/`a` for a
simulator.

## Verified before handing this off

- `npx tsc --noEmit` — zero type errors
- `npx expo-doctor` — 21/21 checks pass
- `npx expo export` — the whole app actually bundles successfully (2843
  modules, no errors)
- iOS permission strings (camera/microphone/photo library) are
  configured in `app.json` — missing these causes real crashes on a
  physical device, not just simulators

**Not verified:** actually running on a device/simulator and confirming
it looks/behaves right — there's no simulator or Expo Go available in
the environment this was built in. Please run it and tell me what's
wrong once you do; static checks catch a lot but not everything.

## Project structure

```
App.tsx                        navigation root (tabs + review screen)
src/theme/                     colors, spacing, fonts — one source of truth
src/api/client.ts               calls the real backend (matches HANDOFF.md exactly)
src/data/mockListings.ts       sample listing data (no live DB yet)
src/components/
  Card.tsx                     the white rounded card used everywhere
  TabBar.tsx                   custom bottom tab bar with raised center FAB
  MarketplaceBadge.tsx         GeM/ONDC/Craftmark pills + sync-status dots
src/screens/
  HomeScreen.tsx                matches design screenshot
  ListingsScreen.tsx             matches design screenshot
  ListCraftScreen.tsx            matches design screenshot; wired to real photo/audio capture + /api/generate-listing
  ListingReviewScreen.tsx        NOT in your screenshots — built to complete the flow, see note above
  ImpactScreen.tsx               matches design screenshot; wired to real /api/artisan-stats
```
