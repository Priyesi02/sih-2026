// src/components/MarketplaceBadge.tsx
//
// The small "GeM" / "ONDC" / "Craftmark" pill badges used on the Home
// screen's "Connected marketplaces" list and on each listing card.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radii, fonts } from '../theme';
import type { SyncStatus } from '../data/mockListings';

type Network = 'gem' | 'ondc' | 'craftmark';

const NETWORK_LABEL: Record<Network, string> = {
  gem: 'GeM',
  ondc: 'ONDC',
  craftmark: 'Craftmark',
};

const STATUS_COLOR: Record<SyncStatus, string> = {
  live: colors.statusLive,
  review: colors.statusReview,
  draft: colors.statusDraft,
  rejected: colors.statusRejected,
};

/** Full pill badge (colored background + name) — used in the "Connected marketplaces" list. */
export function MarketplacePill({ network }: { network: Network }) {
  const palette = colors[network];
  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]}>
      <Text style={[styles.pillText, { color: palette.text }]}>{NETWORK_LABEL[network]}</Text>
    </View>
  );
}

/** Small label + colored status dot — used on listing cards to show per-network sync state. */
export function MarketplaceSyncDot({ network, status }: { network: Network; status: SyncStatus }) {
  return (
    <View style={styles.dotRow}>
      <View style={[styles.dot, { backgroundColor: STATUS_COLOR[status] }]} />
      <Text style={styles.dotLabel}>{NETWORK_LABEL[network]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.sm,
    alignSelf: 'flex-start',
  },
  pillText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  dotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textBody,
  },
});
