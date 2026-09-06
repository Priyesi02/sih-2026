// src/screens/ListCraftScreen.tsx
//
// Matches the "List your craft" screen: photo upload step + voice
// recording step. This one is fully wired to the real backend —
// tapping "Generate Listing" actually calls POST /api/generate-listing
// with the real photo + recorded audio and navigates to the review
// screen with the real AI result.

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Alert, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAudioRecorder, useAudioRecorderState, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { Camera, Mic, Square, ArrowLeft } from 'lucide-react-native';
import { colors, spacing, radii, fonts } from '../theme';
import { Card } from '../components/Card';
import { generateListing } from '../api/client';
import { useLanguage } from '../i18n/LanguageContext';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export function ListCraftScreen({ navigation }: { navigation: NativeStackNavigationProp<any> }) {
  const { t } = useLanguage();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // "List" is a tab, not a pushed screen, so there's no navigation back
  // stack to pop — the back arrow just returns to Home. If the artisan
  // has already added a photo or recording, confirm first rather than
  // silently losing that progress (there's no listing object yet at
  // this stage to save as a draft — that only exists after Generate).
  function handleBack() {
    if (photoUri || audioUri) {
      Alert.alert(t('discardProgressTitle'), t('discardProgressMessage'), [
        { text: t('keepEditingButton'), style: 'cancel' },
        { text: t('discardButton'), style: 'destructive', onPress: () => navigation.navigate('Home') },
      ]);
    } else {
      navigation.navigate('Home');
    }
  }

  // expo-audio (NOT expo-av, which React Native Directory flags as
  // unmaintained — caught by `npx expo-doctor` while building this).
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  async function handleAddPhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    Alert.alert(t('addPhotoTitle'), t('chooseSource'), [
      {
        text: t('cameraOption'),
        onPress: async () => {
          if (status !== 'granted') return Alert.alert(t('cameraPermissionNeeded'));
          const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
          if (!result.canceled) setPhotoUri(result.assets[0].uri);
        },
      },
      {
        text: t('galleryOption'),
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
          if (!result.canceled) setPhotoUri(result.assets[0].uri);
        },
      },
      { text: t('cancel'), style: 'cancel' },
    ]);
  }

  async function handleToggleRecording() {
    if (recorderState.isRecording) {
      await recorder.stop();
      setAudioUri(recorder.uri);
      return;
    }

    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      Alert.alert(t('micPermissionNeeded'));
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  }

  async function handleGenerate() {
    if (!photoUri || !audioUri) return;
    setIsGenerating(true);
    try {
      const listing = await generateListing({ imageUri: photoUri, audioUri });
      if (!listing.success) {
        Alert.alert(t('somethingWentWrong'), listing.error || t('pleaseTryAgain'));
        return;
      }
      navigation.navigate('ListingReview', { listing, originalPhotoUri: photoUri });
    } catch (err: any) {
      Alert.alert(t('couldNotReachServer'), err.message);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.md, paddingTop: 60, paddingBottom: spacing.xl }}>
      <TouchableOpacity style={styles.backButton} onPress={handleBack} hitSlop={8}>
        <ArrowLeft size={22} color={colors.textHeading} />
      </TouchableOpacity>

      <Text style={styles.heading}>{t('listCraftHeading')}</Text>
      <Text style={styles.subtitle}>{t('listCraftSubtitle')}</Text>

      {/* Step 1: photo */}
      <Card style={{ marginTop: spacing.md }}>
        <View style={styles.stepHeader}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>1</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.stepTitle}>{t('addPhotoTitle')}</Text>
            <Text style={styles.stepSubtitle}>{t('addPhotoSubtitle')}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.photoBox} onPress={handleAddPhoto}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photoPreview} />
          ) : (
            <>
              <View style={styles.iconCircle}>
                <Camera size={22} color={colors.gold} />
              </View>
              <Text style={styles.photoBoxTitle}>{t('tapToAddPhoto')}</Text>
              <Text style={styles.photoBoxSubtitle}>{t('cameraOrGallery')}</Text>
            </>
          )}
        </TouchableOpacity>
      </Card>

      {/* Step 2: voice */}
      <Card style={{ marginTop: spacing.md }}>
        <View style={styles.stepHeader}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>2</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.stepTitle}>{t('describeCraftTitle')}</Text>
            <Text style={styles.stepSubtitle}>{t('describeCraftSubtitle')}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.micWrapper} onPress={handleToggleRecording}>
          <View style={[styles.micCircle, recorderState.isRecording && styles.micCircleActive]}>
            {recorderState.isRecording ? (
              <Square size={26} color={colors.textOnDark} />
            ) : (
              <Mic size={30} color={colors.gold} />
            )}
          </View>
        </TouchableOpacity>
        <Text style={styles.micHint}>
          {recorderState.isRecording ? t('recordingStop') : audioUri ? t('recordedRerecord') : t('tapToRecord')}
        </Text>
      </Card>

      <TouchableOpacity
        style={[styles.generateButton, (!photoUri || !audioUri || isGenerating) && styles.generateButtonDisabled]}
        onPress={handleGenerate}
        disabled={!photoUri || !audioUri || isGenerating}
      >
        {isGenerating ? (
          <ActivityIndicator color={colors.textOnDark} />
        ) : (
          <Text style={styles.generateButtonText}>{t('generateListingButton')}</Text>
        )}
      </TouchableOpacity>
      {isGenerating && <Text style={styles.generatingHint}>{t('generatingHint')}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  heading: { fontFamily: fonts.heading, fontSize: 28, color: colors.textHeading },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.textBody, marginTop: 4 },
  stepHeader: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textOnDark },
  stepTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.textHeading },
  stepSubtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.textBody, marginTop: 2 },
  photoBox: {
    marginTop: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.gold,
    borderStyle: 'dashed',
    borderRadius: radii.md,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoPreview: { width: '100%', height: '100%' },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.goldLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoBoxTitle: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.textHeading, marginTop: spacing.sm },
  photoBoxSubtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.textBody, marginTop: 2 },
  micWrapper: { alignItems: 'center', marginTop: spacing.md },
  micCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.goldLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micCircleActive: { backgroundColor: colors.statusRejected },
  micHint: { textAlign: 'center', fontFamily: fonts.body, fontSize: 13, color: colors.textBody, marginTop: spacing.sm },
  generateButton: {
    backgroundColor: colors.gold,
    borderRadius: radii.lg,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  generateButtonDisabled: { opacity: 0.5 },
  generateButtonText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.textOnDark },
  generatingHint: { textAlign: 'center', fontFamily: fonts.body, fontSize: 12, color: colors.textBody, marginTop: spacing.sm },
});
