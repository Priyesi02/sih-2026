// src/screens/HomeScreen.tsx
//
// Merged Home + Impact (per explicit request — the original 4-tab
// layout became Home / List / Listings, with Impact folded into Home).
// Trimmed way down from the original design screenshot: kept only the
// brand header, the artisan's own impact numbers (earnings, green
// rating, live listings), "How it works", and the 2 CTA buttons at the
// bottom. Removed: the "Our Mission" card, the 3 stat boxes
// (Artisans/Marketplaces/Items synced — vanity numbers with no real
// backing data), the "Connected marketplaces" list, and the testimonial/
// review card — all per explicit request to cut down the amount of text
// on this screen.
//
// Impact numbers are REAL, fetched from GET /api/listings?uid=<uid> +
// POST /api/artisan-stats, scoped to the logged-in artisan (see
// AuthContext) — not mock/vanity numbers.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, ImageBackground, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Mic, RefreshCw, Package, LogOut, Info } from 'lucide-react-native';
import { colors, spacing, radii, fonts } from '../theme';
import { Card } from '../components/Card';
import { getArtisanStats, getListings, ArtisanStats, Listing } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

const HOW_IT_WORKS = [
  { step: '01', icon: Mic, titleKey: 'howItWorksStep1Title', bodyKey: 'howItWorksStep1Body' },
  { step: '02', icon: RefreshCw, titleKey: 'howItWorksStep2Title', bodyKey: 'howItWorksStep2Body' },
  { step: '03', icon: Package, titleKey: 'howItWorksStep3Title', bodyKey: 'howItWorksStep3Body' },
] as const;

export function HomeScreen({ navigation }: { navigation: NativeStackNavigationProp<any> }) {
  const { uid, phoneNumber, logout } = useAuth();
  const { t } = useLanguage();
  const [stats, setStats] = useState<ArtisanStats | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!uid) return;
      if (isRefresh) setRefreshing(true);
      setError(null);
      try {
        const listingsResult = await getListings(uid);
        if (!listingsResult.success) {
          setError(listingsResult.error || 'Could not load listings.');
          return;
        }
        setListings(listingsResult.listings);

        const statsResult = await getArtisanStats(listingsResult.listings as any);
        setStats(statsResult);
      } catch (err: any) {
        setError(err.message);
      } finally {
        if (isRefresh) setRefreshing(false);
      }
    },
    [uid]
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => load());
    return unsubscribe;
  }, [navigation, load]);

  function handleLogout() {
    Alert.alert(t('logout'), phoneNumber ? `${t('logout')} — ${phoneNumber}?` : `${t('logout')}?`, [
      { text: t('cancel'), style: 'cancel' },
      { text: t('logout'), style: 'destructive', onPress: logout },
    ]);
  }

  function handleGreenRatingInfo() {
    Alert.alert(t('greenRating'), t('greenRatingInfo'));
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: spacing.xl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.gold} />}
    >
      {/* Header / brand banner — the patterned image fills from the very
          top of the page down through the header, fading via the
          gradient overlay into the plain page background by just below
          the logo (per reference), rather than a solid color block. */}
      <ImageBackground
        source={require('../../assets/brand/home-header-pattern.jpg')}
        style={styles.header}
        resizeMode="cover"
      >
        <LinearGradient colors={['transparent', colors.background]} locations={[0.35, 1]} style={StyleSheet.absoluteFill} />
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <LogOut size={18} color={colors.goldDark} />
        </TouchableOpacity>
        <Image source={require('../../assets/brand/logo.png')} style={styles.logoImage} resizeMode="contain" />
      </ImageBackground>

      <View style={styles.content}>
        {!stats || error ? (
          <View style={styles.loadingBox}>
            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : (
              <ActivityIndicator color={colors.gold} size="large" style={{ marginTop: -spacing.lg }} />
            )}
          </View>
        ) : (
          <>
            {/* Stat boxes now come FIRST, Earnings card below them. */}
            <View style={[styles.statsRow, { marginTop: -spacing.lg }]}>
              <Card style={styles.statBox}>
                <Text style={styles.statValue}>{stats.totalListings}</Text>
                <Text style={styles.statLabel}>{t('statTotal')}</Text>
              </Card>
              <Card style={styles.statBox}>
                <Text style={styles.statValue}>{stats.publishedListings}</Text>
                <Text style={styles.statLabel}>{t('statPublished')}</Text>
              </Card>
              <Card style={styles.statBox}>
                <View style={styles.greenRatingHeader}>
                  <Text style={styles.statLabel}>{t('greenRating')}</Text>
                  <TouchableOpacity onPress={handleGreenRatingInfo} hitSlop={8}>
                    <Info size={12} color={colors.textBody} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.ecoStatValue}>{stats.sellerEcoBadge}</Text>
              </Card>
            </View>
            {stats.sellerEcoScore !== null && (
              <Text style={styles.ecoCaption}>{stats.sellerEcoLabel} ({stats.ratedListingCount} {t('listingsRated')})</Text>
            )}

            {/* No earnings/"sold" card here anymore — removed entirely
                on request. There's no real payment/order system in this
                app, so any earnings figure (projected OR a mock
                "actual" one driven by a simulated units-sold count)
                would be a fabricated number, not real data. */}

            {listings.length > 0 && (
              <>
                <Text style={styles.sectionHeading}>{t('myListings')}</Text>
                {listings.slice(0, 3).map((l, i) => (
                  <Card key={l.id || i} style={styles.liveListingRow}>
                    {l.enhancedImageUrl ? (
                      <Image source={{ uri: l.enhancedImageUrl }} style={styles.liveListingImage} />
                    ) : (
                      <View style={[styles.liveListingImage, { backgroundColor: colors.cardBorder }]} />
                    )}
                    <View style={{ flex: 1, marginLeft: spacing.sm }}>
                      <Text style={styles.liveListingTitle} numberOfLines={1}>{l.title || l.category}</Text>
                      <Text style={styles.liveListingPrice}>
                        ₹{l.suggestedPriceMin?.toLocaleString('en-IN')} – ₹{l.suggestedPriceMax?.toLocaleString('en-IN')}
                      </Text>
                    </View>
                    {l.ecoBadge && <Text style={styles.cardEcoBadge}>{l.ecoBadge}</Text>}
                  </Card>
                ))}
              </>
            )}
          </>
        )}

        {/* How it works */}
        <Text style={styles.sectionHeading}>{t('howItWorks')}</Text>
        {HOW_IT_WORKS.map((s) => (
          <Card key={s.step} style={[styles.howItWorksRow, { marginTop: spacing.sm }]}>
            <View style={styles.iconCircle}>
              <s.icon size={18} color={colors.gold} />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={styles.howItWorksTitle}>
                {s.step} · {t(s.titleKey)}
              </Text>
              <Text style={styles.howItWorksBody}>{t(s.bodyKey)}</Text>
            </View>
          </Card>
        ))}

        {/* CTAs */}
        <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('ListCraft')}>
          <Mic size={18} color={colors.textOnDark} />
          <Text style={styles.primaryButtonText}>{t('listCraftButton')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('Listings')}>
          <Text style={styles.secondaryButtonText}>{t('browseCraftsButton')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    backgroundColor: colors.goldLight,
    paddingTop: 60,
    paddingBottom: 70,
    alignItems: 'center',
  },
  logoutButton: {
    position: 'absolute',
    top: 60,
    right: spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: { width: 110, height: 110 },
  content: { paddingHorizontal: spacing.md },
  loadingBox: { marginTop: -spacing.lg, height: 160, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.statusRejected, textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  statBox: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: spacing.md },
  statValue: { fontFamily: fonts.heading, fontSize: 22, color: colors.textHeading },
  ecoStatValue: { fontSize: 22 },
  statLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.textBody },
  greenRatingHeader: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ecoCaption: { fontFamily: fonts.body, fontSize: 12, color: colors.textBody, textAlign: 'center', marginTop: spacing.xs },
  sectionHeading: { fontFamily: fonts.heading, fontSize: 20, color: colors.textHeading, marginTop: spacing.lg, marginBottom: spacing.xs },
  liveListingRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  liveListingImage: { width: 50, height: 50, borderRadius: radii.sm },
  liveListingTitle: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.textHeading },
  liveListingPrice: { fontFamily: fonts.body, fontSize: 13, color: colors.textBody, marginTop: 2 },
  cardEcoBadge: { fontSize: 20 },
  howItWorksRow: { flexDirection: 'row', alignItems: 'center' },
  iconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.goldLight, alignItems: 'center', justifyContent: 'center' },
  howItWorksTitle: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.textHeading },
  howItWorksBody: { fontFamily: fonts.body, fontSize: 13, color: colors.textBody, marginTop: 2 },
  primaryButton: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.gold,
    borderRadius: radii.lg,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  primaryButtonText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.textOnDark },
  secondaryButton: {
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.gold,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  secondaryButtonText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.gold },
});
