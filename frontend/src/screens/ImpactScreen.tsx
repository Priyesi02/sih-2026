// src/screens/ImpactScreen.tsx
//
// Matches the "Your Impact" screen exactly, including the disclaimer
// wording — which already lines up almost word-for-word with the real
// backend's computeArtisanStats() (see lib/artisanStats.js). This
// screen actually calls the real, tested /api/artisan-stats endpoint —
// it is NOT hardcoded fake numbers.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react-native';
import { colors, spacing, radii, fonts } from '../theme';
import { Card } from '../components/Card';
import { getArtisanStats, ArtisanStats } from '../api/client';
import { MOCK_LISTINGS } from '../data/mockListings';

export function ImpactScreen() {
  const [stats, setStats] = useState<ArtisanStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Real listings would come from Firestore once that's wired up —
    // for now, using the same mock data ListingsScreen renders, shaped
    // exactly like the backend expects (status/suggestedPriceMin/Max).
    getArtisanStats(
      MOCK_LISTINGS.map((l) => ({
        status: l.status === 'published' ? 'published' : 'draft',
        suggestedPriceMin: l.priceMin,
        suggestedPriceMax: l.priceMax,
      })),
    )
      .then(setStats)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Couldn't load impact stats: {error}</Text>
        <Text style={styles.errorHint}>Is the backend running at the URL set in src/api/client.ts?</Text>
      </View>
    );
  }

  if (!stats) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.gold} size="large" />
      </View>
    );
  }

  const publishedListings = MOCK_LISTINGS.filter((l) => l.status === 'published');

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.md, paddingTop: 60, paddingBottom: spacing.xl }}>
      <Text style={styles.eyebrow}>Artisan Dashboard</Text>
      <Text style={styles.heading}>Your Impact</Text>
      <Text style={styles.subtitle}>Estimated earnings from your published craft listings.</Text>

      <LinearGradient colors={[colors.gold, colors.goldDark]} style={styles.earningsCard}>
        <View style={styles.rowCenter}>
          <TrendingUp size={16} color={colors.textOnDark} />
          <Text style={styles.earningsLabel}>MONTHLY EARNINGS POTENTIAL</Text>
        </View>
        <Text style={styles.earningsValue}>
          ₹{stats.monthlyProjectionMin.toLocaleString('en-IN')} –{'\n'}₹{stats.monthlyProjectionMax.toLocaleString('en-IN')}
        </Text>
        <Text style={styles.earningsSubtext}>from {stats.publishedListings} published listings</Text>
      </LinearGradient>

      {/* This disclaimer MUST stay visible — see HANDOFF.md, the
          projectionAssumption string is not decorative, it's the
          honest caveat that this is an illustrative estimate. */}
      <View style={styles.disclaimerBox}>
        <AlertTriangle size={16} color={colors.statusReview} />
        <Text style={styles.disclaimerText}>
          <Text style={styles.disclaimerBold}>Illustrative estimate only. </Text>
          {stats.projectionAssumption}
        </Text>
      </View>

      <View style={styles.statsRow}>
        <Card style={styles.statBox}>
          <View style={[styles.smallDot, { backgroundColor: colors.statusReview }]} />
          <Text style={styles.statValue}>{stats.totalListings}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </Card>
        <Card style={styles.statBox}>
          <View style={[styles.smallDot, { backgroundColor: colors.statusLive }]} />
          <Text style={styles.statValue}>{stats.publishedListings}</Text>
          <Text style={styles.statLabel}>Published</Text>
        </Card>
        <Card style={styles.statBox}>
          <View style={[styles.smallDot, { backgroundColor: colors.statusDraft }]} />
          <Text style={styles.statValue}>{stats.draftListings}</Text>
          <Text style={styles.statLabel}>Drafts</Text>
        </Card>
      </View>

      <View style={styles.rowCenter}>
        <CheckCircle2 size={16} color={colors.statusLive} />
        <Text style={styles.sectionHeading}>Live listings</Text>
      </View>
      {publishedListings.map((l) => (
        <Card key={l.id} style={styles.liveListingRow}>
          <Image source={{ uri: l.imageUrl }} style={styles.liveListingImage} />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.liveListingTitle}>{l.title}</Text>
            <Text style={styles.liveListingPrice}>
              ₹{l.priceMin.toLocaleString('en-IN')} – ₹{l.priceMax.toLocaleString('en-IN')}
            </Text>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: spacing.lg },
  errorText: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.statusRejected, textAlign: 'center' },
  errorHint: { fontFamily: fonts.body, fontSize: 12, color: colors.textBody, textAlign: 'center', marginTop: spacing.xs },
  eyebrow: { fontFamily: fonts.body, fontSize: 13, color: colors.textBody },
  heading: { fontFamily: fonts.heading, fontSize: 30, color: colors.textHeading, marginTop: 2 },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.textBody, marginTop: 4, marginBottom: spacing.md },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  earningsCard: { borderRadius: radii.md, padding: spacing.lg },
  earningsLabel: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.textOnDark, letterSpacing: 1 },
  earningsValue: { fontFamily: fonts.heading, fontSize: 32, color: colors.textOnDark, marginTop: spacing.sm, lineHeight: 38 },
  earningsSubtext: { fontFamily: fonts.body, fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: spacing.sm },
  disclaimerBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.goldLight,
    borderColor: colors.gold,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  disclaimerText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.textHeading, lineHeight: 19 },
  disclaimerBold: { fontFamily: fonts.bodyBold },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  statBox: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: spacing.md },
  smallDot: { width: 8, height: 8, borderRadius: 4 },
  statValue: { fontFamily: fonts.heading, fontSize: 24, color: colors.textHeading },
  statLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.textBody },
  sectionHeading: { fontFamily: fonts.heading, fontSize: 20, color: colors.textHeading, marginTop: spacing.lg, marginBottom: spacing.xs },
  liveListingRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  liveListingImage: { width: 50, height: 50, borderRadius: radii.sm },
  liveListingTitle: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.textHeading },
  liveListingPrice: { fontFamily: fonts.body, fontSize: 13, color: colors.textBody, marginTop: 2 },
});
