// src/screens/HomeScreen.tsx
//
// Matches the "KRIYA" home screen from the design: mission statement,
// stats row, connected marketplaces, "how it works" steps, testimonial,
// and two CTA buttons.
//
// NOTE: the exact mandala/pattern background art and the KRIYA logo
// mark from the design aren't image assets I have access to — this
// approximates the header with the gold color + wordmark. Drop the real
// logo/pattern PNG into src/assets/ and swap it in when available.

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import { Heart, Users, Globe, Package, Mic, RefreshCw, Star } from 'lucide-react-native';
import { colors, spacing, radii, fonts } from '../theme';
import { Card } from '../components/Card';
import { MarketplacePill } from '../components/MarketplaceBadge';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

const STATS = [
  { icon: Users, value: '240+', label: 'Artisans' },
  { icon: Globe, value: '3', label: 'Marketplaces' },
  { icon: Package, value: '4.8K', label: 'Items synced' },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    icon: Mic,
    title: 'Speak your listing',
    body: 'Record a voice description. AI refines it — no typing needed.',
  },
  {
    step: '02',
    icon: RefreshCw,
    title: 'Auto-sync',
    body: 'Your listing is pushed to GeM, ONDC, and Craftmark automatically.',
  },
  {
    step: '03',
    icon: Package,
    title: 'Receive orders',
    body: 'Government buyers find and order directly. You fulfill and earn.',
  },
];

export function HomeScreen({ navigation }: { navigation: NativeStackNavigationProp<any> }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: spacing.xl }}>
      {/* Header / brand banner */}
      <View style={styles.header}>
        <Text style={styles.logoMark}>K</Text>
        <Text style={styles.wordmark}>KRIYA</Text>
      </View>

      <View style={styles.content}>
        {/* Mission card */}
        <Card style={{ marginTop: -spacing.lg }}>
          <View style={styles.rowCenter}>
            <Heart size={16} color={colors.gold} fill={colors.gold} />
            <Text style={styles.eyebrow}>OUR MISSION</Text>
          </View>
          <Text style={styles.heading}>Putting artisan crafts on government procurement platforms</Text>
          <Text style={styles.body}>
            Marginalized artisans lose out on bulk government procurement because registration is complex and
            digital. We handle it — artisans speak their listing, we sync it to GeM, ONDC and Craftmark
            automatically.
          </Text>
        </Card>

        {/* Stats row */}
        <View style={[styles.rowBetween, { marginTop: spacing.md }]}>
          {STATS.map((s) => (
            <Card key={s.label} style={styles.statCard}>
              <s.icon size={20} color={colors.gold} />
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </Card>
          ))}
        </View>

        {/* Connected marketplaces */}
        <Text style={styles.sectionHeading}>Connected marketplaces</Text>
        {[
          { network: 'gem' as const, name: 'Government e-Marketplace', subtitle: 'Central govt. procurement' },
          { network: 'ondc' as const, name: 'Open Network for Digital Commerce', subtitle: 'National digital commerce' },
          { network: 'craftmark' as const, name: 'Craftmark India', subtitle: 'Handloom & handicraft board' },
        ].map((m) => (
          <Card key={m.network} style={[styles.marketplaceRow, { marginTop: spacing.sm }]}>
            <MarketplacePill network={m.network} />
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={styles.marketplaceName}>{m.name}</Text>
              <Text style={styles.marketplaceSubtitle}>{m.subtitle}</Text>
            </View>
            <View style={styles.liveDot} />
          </Card>
        ))}

        {/* How it works */}
        <Text style={styles.sectionHeading}>How it works</Text>
        {HOW_IT_WORKS.map((s) => (
          <Card key={s.step} style={[styles.howItWorksRow, { marginTop: spacing.sm }]}>
            <View style={styles.iconCircle}>
              <s.icon size={18} color={colors.gold} />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={styles.howItWorksTitle}>
                {s.step} · {s.title}
              </Text>
              <Text style={styles.marketplaceSubtitle}>{s.body}</Text>
            </View>
          </Card>
        ))}

        {/* Testimonial */}
        <View style={styles.testimonialCard}>
          <Image
            source={{ uri: 'https://images.unsplash.com/photo-1595278069441-2cf29f8005a4?w=600' }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.testimonialOverlay}>
            <View style={styles.rowCenter}>
              {[...Array(5)].map((_, i) => (
                <Star key={i} size={14} color={colors.gold} fill={colors.gold} />
              ))}
            </View>
            <Text style={styles.testimonialQuote}>
              "I had no idea government buyers could find me. Now I get bulk orders every month."
            </Text>
            <Text style={styles.testimonialAuthor}>— Abena M., Volta Region</Text>
          </View>
        </View>

        {/* CTAs */}
        <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('ListCraft')}>
          <Mic size={18} color={colors.textOnDark} />
          <Text style={styles.primaryButtonText}>List a craft now</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('Listings')}>
          <Text style={styles.secondaryButtonText}>Browse all crafts →</Text>
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
  logoMark: {
    fontFamily: fonts.heading,
    fontSize: 40,
    color: colors.goldDark,
  },
  wordmark: {
    fontFamily: fonts.heading,
    fontSize: 24,
    letterSpacing: 4,
    color: colors.textHeading,
    marginTop: spacing.xs,
  },
  content: { paddingHorizontal: spacing.md },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowBetween: { flexDirection: 'row', gap: spacing.sm },
  eyebrow: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.gold,
    letterSpacing: 1,
  },
  heading: {
    fontFamily: fonts.heading,
    fontSize: 24,
    color: colors.textHeading,
    marginTop: spacing.sm,
    lineHeight: 32,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textBody,
    marginTop: spacing.sm,
    lineHeight: 21,
  },
  statCard: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: spacing.md },
  statValue: { fontFamily: fonts.heading, fontSize: 20, color: colors.textHeading },
  statLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.textBody },
  sectionHeading: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: colors.textHeading,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  marketplaceRow: { flexDirection: 'row', alignItems: 'center' },
  marketplaceName: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.textHeading },
  marketplaceSubtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.textBody, marginTop: 2 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.statusLive },
  howItWorksRow: { flexDirection: 'row', alignItems: 'center' },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.goldLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  howItWorksTitle: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.textHeading },
  testimonialCard: {
    height: 160,
    borderRadius: radii.md,
    overflow: 'hidden',
    marginTop: spacing.lg,
  },
  testimonialOverlay: {
    flex: 1,
    backgroundColor: colors.overlayDark,
    padding: spacing.md,
    justifyContent: 'flex-end',
    gap: 6,
  },
  testimonialQuote: {
    fontFamily: fonts.body,
    fontStyle: 'italic',
    fontSize: 14,
    color: colors.textOnDark,
  },
  testimonialAuthor: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textOnDark },
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
