// src/components/TabBar.tsx
//
// Custom bottom tab bar: Home (left) / List (raised center FAB) /
// Listings (right) — Impact was merged into Home, so this is 3 tabs
// total now, not 4 (see App.tsx's Tab.Navigator + HomeScreen.tsx's file
// header). The center button is gold when you're NOT on the List screen
// (drawing attention as the primary CTA) and switches to dark when you
// ARE on it (showing "you're here").

import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Home, Package, Plus } from 'lucide-react-native';
import { colors, fonts } from '../theme';
import { useLanguage } from '../i18n/LanguageContext';

const TAB_ICONS: Record<string, any> = {
  Home: Home,
  Listings: Package,
};

const TAB_LABEL_KEYS: Record<string, 'tabHome' | 'tabListings'> = {
  Home: 'tabHome',
  Listings: 'tabListings',
};

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const { t } = useLanguage();

  return (
    <View style={styles.container}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;

        if (route.name === 'ListCraft') {
          // The raised center FAB — visually distinct from the other 2 tabs.
          return (
            <TouchableOpacity
              key={route.key}
              onPress={() => navigation.navigate(route.name)}
              style={styles.fabWrapper}
              activeOpacity={0.85}
            >
              <View style={[styles.fab, { backgroundColor: isFocused ? colors.textHeading : colors.gold }]}>
                <Plus color={colors.textOnDark} size={26} />
              </View>
              <Text style={[styles.label, isFocused && styles.labelActive]}>{t('tabList')}</Text>
            </TouchableOpacity>
          );
        }

        const Icon = TAB_ICONS[route.name] ?? Home;
        return (
          <TouchableOpacity
            key={route.key}
            onPress={() => navigation.navigate(route.name)}
            style={styles.tab}
            activeOpacity={0.7}
          >
            <Icon color={isFocused ? colors.gold : colors.textBody} size={24} />
            <Text style={[styles.label, isFocused && styles.labelActive]}>{t(TAB_LABEL_KEYS[route.name] ?? 'tabHome')}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 26 : 12,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  fabWrapper: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    marginTop: -28, // raises the FAB above the tab bar line
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textBody,
  },
  labelActive: {
    color: colors.gold,
    fontFamily: fonts.bodySemibold,
  },
});
