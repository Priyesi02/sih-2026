// src/screens/ListingsScreen.tsx
//
// "My Listings" — now that login provides a real uid (see AuthContext),
// this fetches GET /api/listings?uid=<uid>, which returns THIS
// artisan's own listings in ANY status (draft or published), not the
// global published-only feed every other artisan sees too. The Draft
// filter is restored here since the backend can now genuinely return
// drafts for this uid — BUT it will still show 0 in practice today,
// because nothing in the app currently WRITES a draft to Firestore
// (ListingReviewScreen only calls saveListing() from handlePublish, with
// status forced to 'published' — see that file). The filter is correct
// and ready for whenever a "Save as draft" action gets added; it's not
// faking data in the meantime, just correctly showing what exists.
//
// The per-network (GeM/ONDC/Craftmark) sync-status dots from the
// original design are still NOT restored — no backend anywhere tracks
// per-network sync status (lib/mockMarketplaceSync.js returns one
// combined mock result, not three independent ones), so showing that
// would still be fabricated. See MarketplaceBadge.tsx's file header.
//
// NOTE: the top-right "New listing" button was removed on request —
// the center "List" tab (the raised FAB in TabBar.tsx) is the only way
// to start a new listing now.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { CheckCircle2, Clock } from 'lucide-react-native';
import { colors, spacing, radii, fonts } from '../theme';
import { Card } from '../components/Card';
import { getListings, Listing } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type StatusFilter = 'all' | 'published' | 'draft';

export function ListingsScreen({ navigation }: { navigation: NativeStackNavigationProp<any> }) {
  const { uid } = useAuth();
  const { t } = useLanguage();
  const [listings, setListings] = useState<Listing[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!uid) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const result = await getListings(uid);
      if (!result.success) {
        setError(result.error || t('couldNotLoadListingsGeneric'));
        return;
      }
      setListings(result.listings);
    } catch (err: any) {
      setError(err.message);
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false);
    }
  }, [uid, t]);

  // Refetch every time this tab comes into focus — so a listing you
  // just published shows up without needing an app restart.
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => load());
    return unsubscribe;
  }, [navigation, load]);

  const visibleListings = filter === 'all' ? listings : listings.filter((l) => l.status === filter);
  const draftCount = listings.filter((l) => l.status === 'draft').length;
  const publishedCount = listings.filter((l) => l.status === 'published').length;

  return (
    <View style={styles.screen}>
      <View style={styles.headerRow}>
        <Text style={styles.eyebrow}>{t('myCraftsEyebrow')}</Text>
        <Text style={styles.heading}>{t('myListings')}</Text>
        <Text style={styles.subtitle}>{listings.length} {t('listingsCountSuffix')}</Text>
      </View>

      <View style={styles.filterRow}>
        <FilterPill label={`${t('filterAll')} (${listings.length})`} active={filter === 'all'} onPress={() => setFilter('all')} />
        <FilterPill label={`${t('filterPublished')} (${publishedCount})`} active={filter === 'published'} onPress={() => setFilter('published')} />
        <FilterPill label={`${t('filterDraft')} (${draftCount})`} active={filter === 'draft'} onPress={() => setFilter('draft')} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.gold} size="large" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{t('couldNotLoadListings')}: {error}</Text>
          <Text style={styles.errorHint}>{t('backendHint')}</Text>
        </View>
      ) : visibleListings.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{filter === 'all' ? t('noListingsYet') : t('noFilteredListings')}</Text>
          <Text style={styles.errorHint}>{t('createOneHint')}</Text>
        </View>
      ) : (
        <FlatList
          data={visibleListings}
          keyExtractor={(item, i) => item.id || String(i)}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.gold} />}
          renderItem={({ item }) => <ListingCard listing={item} onPress={() => navigation.navigate('ListingReview', { listing: item })} />}
        />
      )}
    </View>
  );
}

function FilterPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.filterPill, active && styles.filterPillActive]} onPress={onPress}>
      <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ListingCard({ listing, onPress }: { listing: Listing; onPress: () => void }) {
  const { t } = useLanguage();
  // listing.title is a real short product name from Gemini now (e.g.
  // "Purple Thread Scrunchie") — falls back to a truncated descriptionEn
  // only for older records saved before this field existed.
  const title = listing.title || (listing.descriptionEn?.length > 40 ? `${listing.descriptionEn.slice(0, 40)}...` : listing.descriptionEn);

  // Real (mock) marketplace outcome badge — see lib/mockMarketplaceSync.js.
  // Falls back to a plain "Draft" badge if the listing was never synced yet.
  // No "rejected" state anymore (removed on request — materials/eco
  // issues waitlist at most, never hard-reject).
  const marketplaceStatusStyle: Record<string, { bg: string; label: string; Icon: any }> = {
    approved: { bg: colors.statusLive, label: t('approvedLabel'), Icon: CheckCircle2 },
    waitlisted: { bg: colors.statusReview, label: t('waitlistedLabel'), Icon: Clock },
  };
  const marketplaceStyle = listing.marketplaceStatus ? marketplaceStatusStyle[listing.marketplaceStatus] : null;

  // The reason text is translated via its reasonCode (see
  // lib/mockMarketplaceSync.js) — marketplaceStatusReason itself is
  // English-only and only used as a last-resort fallback for older
  // records saved before reasonCode existed.
  const reasonKeyByCode: Record<string, 'marketplaceReasonApproved' | 'marketplaceReasonQualityReview' | 'marketplaceReasonCategoryReview'> = {
    approved: 'marketplaceReasonApproved',
    quality_review: 'marketplaceReasonQualityReview',
    category_review: 'marketplaceReasonCategoryReview',
  };
  const translatedReason = listing.marketplaceStatusReasonCode
    ? t(reasonKeyByCode[listing.marketplaceStatusReasonCode])
    : listing.marketplaceStatusReason;

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
    <Card style={styles.listingCard}>
      <View>
        {listing.enhancedImageUrl ? (
          <Image source={{ uri: listing.enhancedImageUrl }} style={styles.listingImage} />
        ) : (
          <View style={[styles.listingImage, styles.listingImagePlaceholder]} />
        )}
        <View style={[styles.statusBadge, { backgroundColor: marketplaceStyle ? marketplaceStyle.bg : colors.statusDraft }]}>
          <Text style={styles.statusBadgeText}>{marketplaceStyle ? marketplaceStyle.label : t('filterDraft')}</Text>
        </View>
      </View>
      <View style={styles.listingInfo}>
        <View style={styles.rowBetween}>
          <Text style={styles.listingTitle} numberOfLines={2}>{title}</Text>
          <View style={styles.categoryTag}>
            <Text style={styles.categoryTagText}>{listing.category}</Text>
          </View>
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.listingPrice}>
            ₹{listing.suggestedPriceMin?.toLocaleString('en-IN')} – ₹{listing.suggestedPriceMax?.toLocaleString('en-IN')}
          </Text>
          {listing.ecoBadge && <Text style={styles.ecoBadgeText}>{listing.ecoBadge}</Text>}
        </View>
        {/* Real (mock) marketplace outcome — not a fabricated per-network
            status, this is exactly what POST /api/marketplace-sync
            actually returned and persisted (see that route's comment). */}
        {marketplaceStyle && (
          <View style={styles.syncRow}>
            <marketplaceStyle.Icon size={13} color={marketplaceStyle.bg} />
            <Text style={styles.syncText}>{translatedReason || marketplaceStyle.label}</Text>
          </View>
        )}
      </View>
    </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  errorText: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.statusRejected, textAlign: 'center' },
  errorHint: { fontFamily: fonts.body, fontSize: 12, color: colors.textBody, textAlign: 'center', marginTop: spacing.xs },
  emptyText: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.textHeading, textAlign: 'center' },
  headerRow: {
    padding: spacing.md,
    paddingTop: 60,
  },
  eyebrow: { fontFamily: fonts.body, fontSize: 13, color: colors.textBody },
  heading: { fontFamily: fonts.heading, fontSize: 26, color: colors.textHeading, marginTop: 2 },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.textBody, marginTop: 2 },
  filterRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  filterPillActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  filterPillText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textBody },
  filterPillTextActive: { color: colors.textOnDark },
  listingCard: { flexDirection: 'row', padding: spacing.sm, gap: spacing.sm },
  listingImage: { width: 90, height: 90, borderRadius: radii.sm },
  listingImagePlaceholder: { backgroundColor: colors.cardBorder },
  statusBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusBadgeText: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.textOnDark },
  listingInfo: { flex: 1, justifyContent: 'space-between' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.xs },
  listingTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.textHeading, flex: 1, flexWrap: 'wrap' },
  categoryTag: { backgroundColor: colors.goldLight, borderRadius: radii.sm, paddingHorizontal: 8, paddingVertical: 3 },
  categoryTagText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.goldDark },
  listingPrice: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.textHeading, marginTop: 4 },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  syncText: { fontFamily: fonts.body, fontSize: 12, color: colors.textBody, flexShrink: 1 },
  ecoBadgeText: { fontSize: 16 },
});
