// App.tsx — navigation root.
//
// Structure: a native-stack Root navigator holding the 4-tab bottom
// navigator (Home/Listings/ListCraft/Impact) plus ListingReview pushed
// on top full-screen (no tab bar) once a listing is generated.

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts, PlayfairDisplay_700Bold, PlayfairDisplay_600SemiBold } from '@expo-google-fonts/playfair-display';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';

import { colors } from './src/theme';
import { TabBar } from './src/components/TabBar';
import { HomeScreen } from './src/screens/HomeScreen';
import { ListingsScreen } from './src/screens/ListingsScreen';
import { ListCraftScreen } from './src/screens/ListCraftScreen';
import { ImpactScreen } from './src/screens/ImpactScreen';
import { ListingReviewScreen } from './src/screens/ListingReviewScreen';

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();

function Tabs() {
  return (
    <Tab.Navigator tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Listings" component={ListingsScreen} />
      <Tab.Screen name="ListCraft" component={ListCraftScreen} />
      <Tab.Screen name="Impact" component={ImpactScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    PlayfairDisplay_700Bold,
    PlayfairDisplay_600SemiBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.gold} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="dark" />
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="Tabs" component={Tabs} />
        <RootStack.Screen name="ListingReview" component={ListingReviewScreen} options={{ presentation: 'modal' }} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
