// src/data/mockListings.ts
//
// Sample data matching the design screenshots exactly, since there's no
// live database wired up yet (Firebase/Firestore is a separate,
// not-yet-built piece — see the PRD's "Person B: Backend" ownership).
// Once that exists, replace this with a real fetch from Firestore —
// everything downstream (ListingsScreen, ImpactScreen) just needs an
// array shaped like MockListing.
//
// NOTE on marketplaceSync: the backend's /api/marketplace-sync mocks a
// SINGLE combined sync result, not a separate status per marketplace.
// The per-network (GeM/ONDC/Craftmark) dots shown in the design are
// UI-only mock data here — there's no real per-marketplace tracking
// built anywhere yet.

export type SyncStatus = 'live' | 'review' | 'draft' | 'rejected';

export type MockListing = {
  id: string;
  title: string;
  category: string;
  imageUrl: string;
  priceMin: number;
  priceMax: number;
  status: 'published' | 'draft'; // matches the real backend's listing.status
  marketplaceSync: { gem: SyncStatus; ondc: SyncStatus; craftmark: SyncStatus };
};

export const MOCK_LISTINGS: MockListing[] = [
  {
    id: '1',
    title: 'Hand-Woven Market Basket',
    category: 'Baskets',
    imageUrl: 'https://images.unsplash.com/photo-1595278069441-2cf29f8005a4?w=400',
    priceMin: 2400,
    priceMax: 3200,
    status: 'published',
    marketplaceSync: { gem: 'live', ondc: 'review', craftmark: 'draft' },
  },
  {
    id: '2',
    title: 'Terracotta Serving Bowl',
    category: 'Pottery',
    imageUrl: 'https://images.unsplash.com/photo-1493106641515-6b5631de4bb9?w=400',
    priceMin: 2000,
    priceMax: 2650,
    status: 'published',
    marketplaceSync: { gem: 'live', ondc: 'live', craftmark: 'review' },
  },
  {
    id: '3',
    title: 'Beaded Heritage Necklace',
    category: 'Jewelry',
    imageUrl: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=400',
    priceMin: 3550,
    priceMax: 4850,
    status: 'draft',
    marketplaceSync: { gem: 'review', ondc: 'draft', craftmark: 'draft' },
  },
  {
    id: '4',
    title: 'Pochampally Ikat Table Runner',
    category: 'Textiles',
    imageUrl: 'https://images.unsplash.com/photo-1600166898405-da9535204843?w=400',
    priceMin: 3150,
    priceMax: 4250,
    status: 'published',
    marketplaceSync: { gem: 'live', ondc: 'live', craftmark: 'live' },
  },
  {
    id: '5',
    title: 'Hand-Painted Diya Set',
    category: 'Pottery',
    imageUrl: 'https://images.unsplash.com/photo-1604423043492-8709c937a2f8?w=400',
    priceMin: 300,
    priceMax: 650,
    status: 'published',
    marketplaceSync: { gem: 'live', ondc: 'review', craftmark: 'live' },
  },
];
