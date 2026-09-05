// src/screens/ListingsScreen.tsx
// Matches the "My Listings" screen: filter pills, sync-status legend,
// and listing cards with photo + per-marketplace sync dots.

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity } from 'react-native';
import { Plus } from 'lucide-react-native';
import { colors, spacing, radii, fonts } from '../theme';
import { Card } from '../components/Card';
import { MarketplaceSyncDot } from '../components/MarketplaceBadge';
import { MOCK_LISTINGS, MockListing } from '../data/mockListings';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type Filter = 'all' | 'live' | 'draft';

const STATUS_LEGEND: { label: string; color: string }[] = [
  { label: 'Live', color: colors.statusLive },
  { label: 'Review', color: colors.statusReview },
  { label: 'Draft', color: colors.statusDraft },
  { label: 'Rejected', color: colors.statusRejected },
];

export function ListingsScreen({ navigation }: { navigation: NativeStackNavigationProp<any> }) {
  const [filter, setFilter] = useState<Filter>('all');

  const liveCount = MOCK_LISTINGS.filter((l) => l.status === 'published').length;
  const draftCount = MOCK_LISTINGS.filter((l) => l.status === 'draft').length;

  const filtered = useMemo(() => {
    if (filter === 'live') return MOCK_LISTINGS.filter((l) => l.status === 'published');
    if (filter === 'draft') return MOCK_LISTINGS.filter((l) => l.status === 'draft');
    return MOCK_LISTINGS;
  }, [filter]);

  return (
    <View style={styles.screen}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>Your crafts</Text>
          <Text style={styles.heading}>My Listings</Text>
          <Text style={styles.subtitle}>
            {liveCount} live · {draftCount} draft
          </Text>
        </View>
        <TouchableOpacity style={styles.newButton} onPress={() => navigation.navigate('ListCraft')}>
          <Plus size={16} color={colors.textOnDark} />
          <Text style={styles.newButtonText}>New listing</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {(
          [
            ['all', `All (${MOCK_LISTINGS.length})`],
            ['live', `Live (${liveCount})`],
            ['draft', `Draft (${draftCount})`],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            onPress={() => setFilter(key)}
            style={[styles.filterPill, filter === key && styles.filterPillActive]}
          >
            <Text style={[styles.filterPillText, filter === key && styles.filterPillTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.legendRow}>
        <Text style={styles.legendLabel}>Sync status:</Text>
        {STATUS_LEGEND.map((s) => (
          <View key={s.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: s.color }]} />
            <Text style={styles.legendText}>{s.label}</Text>
          </View>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
        renderItem={({ item }) => <ListingCard listing={item} />}
      />
    </View>
  );
}

function ListingCard({ listing }: { listing: MockListing }) {
  return (
    <Card style={styles.listingCard}>
      <View>
        <Image source={{ uri: listing.imageUrl }} style={styles.listingImage} />
        <View style={[styles.statusBadge, { backgroundColor: listing.status === 'published' ? colors.statusLive : colors.statusDraft }]}>
          <Text style={styles.statusBadgeText}>{listing.status === 'published' ? 'Live' : 'Draft'}</Text>
        </View>
      </View>
      <View style={styles.listingInfo}>
        <View style={styles.rowBetween}>
          <Text style={styles.listingTitle}>{listing.title}</Text>
          <View style={styles.categoryTag}>
            <Text style={styles.categoryTagText}>{listing.category}</Text>
          </View>
        </View>
        <Text style={styles.listingPrice}>
          ₹{listing.priceMin.toLocaleString('en-IN')} – ₹{listing.priceMax.toLocaleString('en-IN')}
        </Text>
        <View style={styles.syncRow}>
          <MarketplaceSyncDot network="gem" status={listing.marketplaceSync.gem} />
          <MarketplaceSyncDot network="ondc" status={listing.marketplaceSync.ondc} />
          <MarketplaceSyncDot network="craftmark" status={listing.marketplaceSync.craftmark} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: spacing.md,
    paddingTop: 60,
  },
  eyebrow: { fontFamily: fonts.body, fontSize: 13, color: colors.textBody },
  heading: { fontFamily: fonts.heading, fontSize: 28, color: colors.textHeading, marginTop: 2 },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.textBody, marginTop: 2 },
  newButton: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: colors.gold,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  newButtonText: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.textOnDark },
  filterRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md },
  filterPill: {
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filterPillActive: { backgroundColor: colors.gold },
  filterPillText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.gold },
  filterPillTextActive: { color: colors.textOnDark },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  legendLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.textBody },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontFamily: fonts.body, fontSize: 12, color: colors.textBody },
  listingCard: { flexDirection: 'row', padding: spacing.sm, gap: spacing.sm },
  listingImage: { width: 90, height: 90, borderRadius: radii.sm },
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
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  listingTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.textHeading, flex: 1, flexWrap: 'wrap' },
  categoryTag: { backgroundColor: colors.goldLight, borderRadius: radii.sm, paddingHorizontal: 8, paddingVertical: 3 },
  categoryTagText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.goldDark },
  listingPrice: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.textHeading, marginTop: 4 },
  syncRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 6 },
});
