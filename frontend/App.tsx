// App.tsx — navigation root.
//
// Structure: a native-stack Root navigator holding the 3-tab bottom
// navigator (Home/List/Listings — Impact merged into Home, see
// HomeScreen.tsx's file header) plus ListingReview pushed on top
// full-screen (no tab bar) once a listing is generated.
//
// Auth gating has 3 states, not 2: logged out -> Login; logged in but
// first-time signup with no Aadhaar decision yet -> Aadhaar (mock) step;
// fully logged in -> the main Tabs. See AuthContext's uid/isNewUser.

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
import { ListingReviewScreen } from './src/screens/ListingReviewScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { AadhaarScreen } from './src/screens/AadhaarScreen';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { LanguageProvider } from './src/i18n/LanguageContext';

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();

function Tabs() {
  return (
    <Tab.Navigator tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="ListCraft" component={ListCraftScreen} />
      <Tab.Screen name="Listings" component={ListingsScreen} />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { uid, isNewUser, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.gold} size="large" />
      </View>
    );
  }

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {!uid ? (
        <RootStack.Screen name="Login" component={LoginScreen} />
      ) : isNewUser ? (
        <RootStack.Screen name="Aadhaar" component={AadhaarScreen} />
      ) : (
        <>
          <RootStack.Screen name="Tabs" component={Tabs} />
          <RootStack.Screen name="ListingReview" component={ListingReviewScreen} options={{ presentation: 'modal' }} />
        </>
      )}
    </RootStack.Navigator>
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
    <LanguageProvider>
      <AuthProvider>
        <NavigationContainer>
          <StatusBar style="dark" />
          <RootNavigator />
        </NavigationContainer>
      </AuthProvider>
    </LanguageProvider>
  );
}
