// src/components/MarketplaceBadge.tsx
//
// The small "GeM" / "ONDC" / "Craftmark" pill badge used on the Home
// screen's "Connected marketplaces" list.
//
// NOTE: a per-listing, per-network sync-status version of this (colored
// dots showing GeM/ONDC/Craftmark each independently as live/review/
// draft) used to live here too, matching the original design
// screenshots. Removed — no backend anywhere tracks per-network sync
// status (lib/mockMarketplaceSync.js returns one combined mock result,
// not three independent ones), so showing that would have displayed
// fabricated per-network state as if it were real. See
// ListingsScreen.tsx's file header for the full explanation.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radii, fonts } from '../theme';

type Network = 'gem' | 'ondc' | 'craftmark';

const NETWORK_LABEL: Record<Network, string> = {
  gem: 'GeM',
  ondc: 'ONDC',
  craftmark: 'Craftmark',
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
});
