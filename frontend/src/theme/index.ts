// src/theme/index.ts
//
// Colors/spacing/typography pulled directly from the KRIYA design
// screenshots (cream background, warm gold accent, serif headings).
// Centralized here so every screen stays visually consistent — change
// a value once, it updates everywhere.

export const colors = {
  background: '#FBF3E0', // warm cream page background
  card: '#FFFFFF',
  cardBorder: '#EADFC0', // thin tan border seen on all white cards

  textHeading: '#211A12', // near-black brown, serif headings
  textBody: '#7A6E5B', // warm gray-brown body/subtitle text
  textOnDark: '#FFFFFF',

  gold: '#C08A2E', // primary accent — buttons, active tab, price highlights
  goldDark: '#96691E', // pressed/darker state, and the "List" FAB's dark variant
  goldLight: '#F3E4C0', // light gold fills (icon circles, pills)

  // Sync status dots (Live / Review / Draft / Rejected)
  statusLive: '#1FA25A',
  statusReview: '#DC9A2E',
  statusDraft: '#A69C89',
  statusRejected: '#D14B3F',

  // Marketplace badge colors (background + text), matching the 3
  // connected marketplaces in the design.
  gem: { bg: '#E3ECFB', text: '#2C5FC1' },
  ondc: { bg: '#EFE6FB', text: '#7B3FE4' },
  craftmark: { bg: '#E1F5E9', text: '#1F8A4C' },

  overlayDark: 'rgba(0,0,0,0.45)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radii = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
} as const;

// Font family keys — registered via useFonts() in App.tsx (see
// @expo-google-fonts/playfair-display + @expo-google-fonts/inter).
// Playfair Display matches the serif headings in the design; Inter
// covers all body/label text.
export const fonts = {
  heading: 'PlayfairDisplay_700Bold',
  headingSemibold: 'PlayfairDisplay_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemibold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
} as const;
