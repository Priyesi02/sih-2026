// src/screens/ListingReviewScreen.tsx
//
// NOT in the original design screenshots — this screen doesn't exist
// yet in the Figma file you shared. Built here because the "List a
// craft" flow needs somewhere to land after generation completes;
// styled to match the rest of the app (cream background, gold accents,
// serif headings, white cards) so it doesn't look out of place.
// Replace with the real designed screen once it exists.

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { createAudioPlayer } from 'expo-audio';
import { File, Directory, Paths } from 'expo-file-system';
import { Volume2, AlertTriangle, CheckCircle, Video } from 'lucide-react-native';
import { colors, spacing, radii, fonts } from '../theme';
import { Card } from '../components/Card';
import { speakListing, syncToMarketplace, generateVideo, Listing } from '../api/client';
import { saveVideoAndCaption, SaveVideoResult } from '../utils/saveVideoAndCaption';
import { SaveShareConfirmation } from '../components/SaveShareConfirmation';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

type Props = NativeStackScreenProps<any, 'ListingReview'>;

export function ListingReviewScreen({ route, navigation }: Props) {
  const { listing } = route.params as { listing: Listing; originalPhotoUri: string };

  const [isListening, setIsListening] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [published, setPublished] = useState(false);

  // Video generate -> save -> share state. Kept separate from the
  // Listen state above since they're independent actions.
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [localVideoUri, setLocalVideoUri] = useState<string | null>(null);
  const [saveShareResult, setSaveShareResult] = useState<SaveVideoResult | null>(null);

  async function handleListen() {
    setIsListening(true);
    try {
      const { url } = await speakListing(listing);
      const player = createAudioPlayer(url);
      player.play();
    } catch (err: any) {
      Alert.alert("Couldn't generate audio right now", err.message);
    } finally {
      setIsListening(false);
    }
  }

  /**
   * Full flow requested for "Save & Share": generate the video (backend,
   * no Gemini call — see lib/generateVideo.js), download it locally
   * (the backend returns a REMOTE URL, but expo-media-library needs a
   * LOCAL file), then save to gallery + copy caption + offer Share Now.
   * Does NOT call speakListing itself — narration is optional and
   * speakListing has its own 10/day quota, so only pass audioUrl if the
   * artisan already tapped Listen above.
   */
  async function handleGenerateAndSaveVideo() {
    setIsGeneratingVideo(true);
    setSaveShareResult(null);
    try {
      const { url: remoteVideoUrl } = await generateVideo(listing);

      const destination = new Directory(Paths.document);
      const downloadedFile = await File.downloadFileAsync(remoteVideoUrl, destination);

      setLocalVideoUri(downloadedFile.uri);

      const result = await saveVideoAndCaption(downloadedFile.uri, listing.descriptionEn);
      setSaveShareResult(result);
    } catch (err: any) {
      Alert.alert('Could not create video', err.message);
    } finally {
      setIsGeneratingVideo(false);
    }
  }

  async function handlePublish() {
    setIsPublishing(true);
    try {
      // Mock sync — no real ONDC/GeM/Craftmark submission happens here,
      // see lib/mockMarketplaceSync.js on the backend.
      await syncToMarketplace({ ...listing, status: 'published' });
      setPublished(true);
    } catch (err: any) {
      Alert.alert('Publish failed', err.message);
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.md, paddingTop: 60, paddingBottom: spacing.xl }}>
      <Text style={styles.heading}>Review your listing</Text>
      <Text style={styles.subtitle}>AI-generated — edit anything before publishing</Text>

      {listing.enhancedImageUrl && <Image source={{ uri: listing.enhancedImageUrl }} style={styles.heroImage} />}

      <View style={styles.categoryTag}>
        <Text style={styles.categoryTagText}>{listing.category}</Text>
      </View>

      <Card style={{ marginTop: spacing.md }}>
        <Text style={styles.cardLabel}>Description (English)</Text>
        <Text style={styles.cardBody}>{listing.descriptionEn}</Text>
      </Card>

      <Card style={{ marginTop: spacing.sm }}>
        <Text style={styles.cardLabel}>Description (हिंदी)</Text>
        <Text style={styles.cardBody}>{listing.descriptionHi}</Text>
      </Card>

      <Card style={{ marginTop: spacing.sm }}>
        <Text style={styles.cardLabel}>Craft Story</Text>
        <Text style={[styles.cardBody, styles.craftStory]}>{listing.craftStory}</Text>
      </Card>

      <Card style={{ marginTop: spacing.sm }}>
        <Text style={styles.priceValue}>
          ₹{listing.suggestedPriceMin.toLocaleString('en-IN')} – ₹{listing.suggestedPriceMax.toLocaleString('en-IN')}
        </Text>
        <Text style={styles.cardBody}>{listing.priceReasoning}</Text>
      </Card>

      {/* B2B / wholesale section */}
      <Text style={styles.sectionHeading}>For Bulk Buyers</Text>
      <Card>
        <Text style={styles.cardBody}>{listing.b2bDescription}</Text>
        <View style={styles.wholesaleRow}>
          <View>
            <Text style={styles.cardLabel}>Wholesale price</Text>
            <Text style={styles.priceValueSmall}>
              ₹{listing.wholesalePriceMin.toLocaleString('en-IN')} – ₹{listing.wholesalePriceMax.toLocaleString('en-IN')}
            </Text>
          </View>
          <View>
            <Text style={styles.cardLabel}>Min. order qty</Text>
            <Text style={styles.priceValueSmall}>{listing.minOrderQuantity} units</Text>
          </View>
        </View>
      </Card>

      {/* Government schemes — disclaimer stays visible, not optional (see HANDOFF.md 5.7) */}
      {listing.suggestedSchemes?.length > 0 && (
        <>
          <Text style={styles.sectionHeading}>Schemes you may want to look into</Text>
          <View style={styles.disclaimerBox}>
            <AlertTriangle size={14} color={colors.statusReview} />
            <Text style={styles.disclaimerText}>Eligibility isn't guaranteed — confirm with the scheme's official office.</Text>
          </View>
          {listing.suggestedSchemes.map((s) => (
            <Card key={s.name} style={{ marginTop: spacing.sm }}>
              <Text style={styles.cardLabel}>{s.name}</Text>
              <Text style={styles.cardBody}>{s.reason}</Text>
            </Card>
          ))}
        </>
      )}

      {/* Listen button */}
      <TouchableOpacity style={styles.listenButton} onPress={handleListen} disabled={isListening}>
        {isListening ? (
          <ActivityIndicator color={colors.gold} />
        ) : (
          <>
            <Volume2 size={18} color={colors.gold} />
            <Text style={styles.listenButtonText}>Listen ({listing.detectedLanguage})</Text>
          </>
        )}
      </TouchableOpacity>
      <Text style={styles.listenHint}>Takes ~20-25s — free tier is limited to 10 uses/day for the whole app</Text>

      {/* Save & Share video */}
      <Text style={styles.sectionHeading}>Share on social</Text>
      {!saveShareResult ? (
        <TouchableOpacity style={styles.videoButton} onPress={handleGenerateAndSaveVideo} disabled={isGeneratingVideo}>
          {isGeneratingVideo ? (
            <ActivityIndicator color={colors.textOnDark} />
          ) : (
            <>
              <Video size={18} color={colors.textOnDark} />
              <Text style={styles.videoButtonText}>Create Shareable Video</Text>
            </>
          )}
        </TouchableOpacity>
      ) : (
        localVideoUri && <SaveShareConfirmation result={saveShareResult} videoUri={localVideoUri} />
      )}
      {isGeneratingVideo && <Text style={styles.listenHint}>Generating video, then saving + preparing to share...</Text>}

      {/* Publish */}
      {published ? (
        <View style={styles.publishedBanner}>
          <CheckCircle size={18} color={colors.statusLive} />
          <Text style={styles.publishedText}>Published! Synced to marketplaces (mock).</Text>
        </View>
      ) : (
        <TouchableOpacity style={styles.publishButton} onPress={handlePublish} disabled={isPublishing}>
          {isPublishing ? <ActivityIndicator color={colors.textOnDark} /> : <Text style={styles.publishButtonText}>Publish</Text>}
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  heading: { fontFamily: fonts.heading, fontSize: 26, color: colors.textHeading },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.textBody, marginTop: 4, marginBottom: spacing.md },
  heroImage: { width: '100%', height: 260, borderRadius: radii.md, backgroundColor: colors.cardBorder },
  categoryTag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.goldLight,
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: spacing.sm,
  },
  categoryTagText: { fontFamily: fonts.bodySemibold, fontSize: 12, color: colors.goldDark },
  cardLabel: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.gold, marginBottom: 4 },
  cardBody: { fontFamily: fonts.body, fontSize: 14, color: colors.textHeading, lineHeight: 20 },
  craftStory: { fontStyle: 'italic' },
  priceValue: { fontFamily: fonts.heading, fontSize: 22, color: colors.textHeading, marginBottom: 4 },
  priceValueSmall: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.textHeading, marginTop: 2 },
  sectionHeading: { fontFamily: fonts.heading, fontSize: 18, color: colors.textHeading, marginTop: spacing.lg, marginBottom: spacing.xs },
  wholesaleRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  disclaimerBox: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: colors.goldLight,
    borderRadius: radii.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    alignItems: 'center',
  },
  disclaimerText: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: colors.textHeading },
  listenButton: {
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.gold,
    borderRadius: radii.lg,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  listenButtonText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.gold },
  listenHint: { textAlign: 'center', fontFamily: fonts.body, fontSize: 11, color: colors.textBody, marginTop: spacing.xs },
  videoButton: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.textHeading,
    borderRadius: radii.lg,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoButtonText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.textOnDark },
  publishButton: {
    backgroundColor: colors.gold,
    borderRadius: radii.lg,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  publishButtonText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.textOnDark },
  publishedBanner: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.goldLight,
    borderRadius: radii.lg,
    paddingVertical: 16,
    marginTop: spacing.md,
  },
  publishedText: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.textHeading },
});
