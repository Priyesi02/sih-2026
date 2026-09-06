// src/screens/ListingReviewScreen.tsx
//
// NOT in the original design screenshots — this screen doesn't exist
// yet in the Figma file you shared. Built here because the "List a
// craft" flow needs somewhere to land after generation completes;
// styled to match the rest of the app (cream background, gold accents,
// serif headings, white cards) so it doesn't look out of place.
// Replace with the real designed screen once it exists.
//
// EVERYTHING here is editable, always — right after the AI first fills
// the blocks (fresh off ListCraftScreen) AND when reopening an already-
// published listing from ListingsScreen. There's no separate "view-only"
// mode anymore (there used to be a route-param `isEditing` flag gating
// this — removed, since making a fresh listing editable before its
// first publish was itself part of what was asked for). Editable
// fields: title, English description, craft story, retail price, the
// bulk-buyer description, wholesale price, and minimum order quantity.
// NOT editable: the Hindi description (machine-translated alongside the
// English one, not independently authored) and the government scheme
// suggestions (grounded against a verified list — free-text editing
// those would defeat the anti-hallucination point of that feature).
//
// Saving (whether this is the first-ever publish or a re-save of an
// already-published listing) always re-runs the mock marketplace
// approval check — see handlePublish — so an edited listing genuinely
// goes through the approval/rejection process again, not just a silent
// update.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, ActivityIndicator, Alert, TextInput } from 'react-native';
import { createAudioPlayer } from 'expo-audio';
import { File, Directory, Paths } from 'expo-file-system';
import { Volume2, AlertTriangle, Image as ImageIcon, ArrowLeft, CheckCircle2, Clock } from 'lucide-react-native';
import { colors, spacing, radii, fonts } from '../theme';
import { Card } from '../components/Card';
import { speakListing, syncToMarketplace, saveListing, generatePoster, Listing } from '../api/client';
import { saveVideoAndCaption, SaveVideoResult } from '../utils/saveVideoAndCaption';
import { SaveShareConfirmation } from '../components/SaveShareConfirmation';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

type Props = NativeStackScreenProps<any, 'ListingReview'>;

const REASON_KEY_BY_CODE = {
  approved: 'marketplaceReasonApproved',
  quality_review: 'marketplaceReasonQualityReview',
  category_review: 'marketplaceReasonCategoryReview',
} as const;

export function ListingReviewScreen({ route, navigation }: Props) {
  const { listing: initialListing } = route.params as { listing: Listing; originalPhotoUri: string };
  const { uid } = useAuth();
  const { t } = useLanguage();

  // Local, mutable copy — id gets filled in once saveListing() succeeds,
  // and marketplaceStatus once syncToMarketplace() returns
  // (see handlePublish) — both are needed by later actions (poster
  // captions, re-syncing) so they can't just stay on the read-only route param.
  const [listing, setListing] = useState<Listing>(initialListing);

  // Editable copies of every field that can be changed here.
  const [editedTitle, setEditedTitle] = useState(initialListing.title);
  const [editedDescriptionEn, setEditedDescriptionEn] = useState(initialListing.descriptionEn);
  const [editedCraftStory, setEditedCraftStory] = useState(initialListing.craftStory);
  const [editedPriceMin, setEditedPriceMin] = useState(String(initialListing.suggestedPriceMin));
  const [editedPriceMax, setEditedPriceMax] = useState(String(initialListing.suggestedPriceMax));
  const [editedB2bDescription, setEditedB2bDescription] = useState(initialListing.b2bDescription);
  const [editedWholesaleMin, setEditedWholesaleMin] = useState(String(initialListing.wholesalePriceMin));
  const [editedWholesaleMax, setEditedWholesaleMax] = useState(String(initialListing.wholesalePriceMax));
  const [editedMinOrderQuantity, setEditedMinOrderQuantity] = useState(String(initialListing.minOrderQuantity));

  const [isListening, setIsListening] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  // Only gates the "save as draft?" prompt on leaving (see below) — NOT
  // whether the Publish/Save button is shown. That used to be the same
  // flag, which was the bug: reopening an already-published listing
  // started this true, which hid the button behind a "Published!"
  // banner with no way to save further edits at all.
  const [savedThisSession, setSavedThisSession] = useState(false);

  // Poster generate -> save -> share state.
  const [isGeneratingPoster, setIsGeneratingPoster] = useState(false);
  const [localPosterUri, setLocalPosterUri] = useState<string | null>(null);
  const [posterSaveShareResult, setPosterSaveShareResult] = useState<SaveVideoResult | null>(null);

  function buildEditedListing(status: 'draft' | 'published'): Listing {
    return {
      ...listing,
      title: editedTitle,
      descriptionEn: editedDescriptionEn,
      craftStory: editedCraftStory,
      suggestedPriceMin: Number(editedPriceMin) || listing.suggestedPriceMin,
      suggestedPriceMax: Number(editedPriceMax) || listing.suggestedPriceMax,
      b2bDescription: editedB2bDescription,
      wholesalePriceMin: Number(editedWholesaleMin) || listing.wholesalePriceMin,
      wholesalePriceMax: Number(editedWholesaleMax) || listing.wholesalePriceMax,
      minOrderQuantity: Number(editedMinOrderQuantity) || listing.minOrderQuantity,
      status,
      artisanId: uid || undefined,
    };
  }

  // Back button + "save as draft?" prompt on leaving before ever saving —
  // covers BOTH the explicit back arrow (below) and the hardware/gesture
  // back action, via React Navigation's beforeRemove event. Skipped once
  // something has actually been saved in this screen session.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (savedThisSession) return; // already saved this session — let it leave freely
      e.preventDefault();
      Alert.alert(t('discardTitle'), t('discardMessage'), [
        { text: t('keepEditingButton'), style: 'cancel' },
        {
          text: t('discardButton'),
          style: 'destructive',
          onPress: () => navigation.dispatch(e.data.action),
        },
        {
          text: t('saveAsDraftButton'),
          onPress: async () => {
            try {
              await saveListing(buildEditedListing('draft'));
              Alert.alert(t('savedAsDraftMessage'));
            } catch (err: any) {
              Alert.alert(t('couldNotSaveListing'), err.message);
            } finally {
              navigation.dispatch(e.data.action);
            }
          },
        },
      ]);
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    navigation,
    savedThisSession,
    listing,
    editedTitle,
    editedDescriptionEn,
    editedCraftStory,
    editedPriceMin,
    editedPriceMax,
    editedB2bDescription,
    editedWholesaleMin,
    editedWholesaleMax,
    editedMinOrderQuantity,
    uid,
  ]);

  async function handleListen() {
    setIsListening(true);
    try {
      const { url } = await speakListing(listing);
      const player = createAudioPlayer(url);
      player.play();
    } catch (err: any) {
      Alert.alert(t('couldNotGenerateAudio'), err.message);
    } finally {
      setIsListening(false);
    }
  }

  /**
   * Publishes (or re-publishes, if this listing was already live) with
   * whatever's currently in the edit fields. ALWAYS re-runs the mock
   * marketplace approval check afterward — an edit is never just a
   * silent field update, it goes through the same approval/rejection
   * pass a first-time publish does.
   */
  async function handlePublish() {
    setIsPublishing(true);
    try {
      const publishedListing = buildEditedListing('published');

      // Step 1: REAL persistence — this is what makes the listing show
      // up on the Listings/marketplace screen afterward. saveListing()
      // resolves even on failure (503 if Firestore isn't configured on
      // the backend) rather than throwing, so check `success` explicitly.
      // If this listing already has an id (re-saving an edit), this
      // UPDATES that same Firestore doc instead of creating a new one.
      const saveResult = await saveListing(publishedListing);
      if (!saveResult.success) {
        Alert.alert(t('couldNotSaveListing'), saveResult.error || t('unknownError'));
        return;
      }
      const savedListing: Listing = { ...publishedListing, id: publishedListing.id || saveResult.id };

      // Step 2: mock B2B/govt marketplace sync — ALWAYS re-run, whether
      // this is a first publish or a re-save of an edit. No real ONDC/
      // GeM/Craftmark submission happens here, see
      // lib/mockMarketplaceSync.js on the backend.
      let finalListing = savedListing;
      try {
        const syncResult = await syncToMarketplace(savedListing);
        finalListing = {
          ...savedListing,
          marketplaceStatus: syncResult.status,
          marketplaceStatusReasonCode: syncResult.statusReasonCode,
          marketplaceStatusReason: syncResult.statusReason,
        };
      } catch (syncErr) {
        console.warn('Mock marketplace sync failed (listing was still saved):', syncErr);
      }
      setListing(finalListing);
      setSavedThisSession(true);

      const reasonKey = finalListing.marketplaceStatusReasonCode ? REASON_KEY_BY_CODE[finalListing.marketplaceStatusReasonCode] : undefined;
      const statusLine =
        finalListing.marketplaceStatus === 'approved'
          ? t('publishedApproved')
          : finalListing.marketplaceStatus === 'waitlisted'
            ? `${t('publishedWaitlisted')} ${reasonKey ? t(reasonKey) : ''}`
            : t('publishedSavedOnly');
      Alert.alert(t('publishedPrefix'), statusLine);
    } catch (err: any) {
      Alert.alert(t('publishFailed'), err.message);
    } finally {
      setIsPublishing(false);
    }
  }

  /** Generate -> download -> save/share a shareable poster — see lib/generatePoster.js. */
  async function handleGenerateAndSavePoster() {
    setIsGeneratingPoster(true);
    setPosterSaveShareResult(null);
    try {
      const { url: remotePosterUrl } = await generatePoster(listing);

      const destination = new Directory(Paths.document);
      const downloadedFile = await File.downloadFileAsync(remotePosterUrl, destination);

      setLocalPosterUri(downloadedFile.uri);

      const result = await saveVideoAndCaption(downloadedFile.uri, listing.descriptionEn);
      setPosterSaveShareResult(result);
    } catch (err: any) {
      Alert.alert(t('couldNotCreatePoster'), err.message);
    } finally {
      setIsGeneratingPoster(false);
    }
  }

  const isAlreadyPublished = listing.status === 'published';
  const reasonKey = listing.marketplaceStatusReasonCode ? REASON_KEY_BY_CODE[listing.marketplaceStatusReasonCode] : undefined;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.md, paddingTop: 60, paddingBottom: spacing.xl }}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} hitSlop={8}>
        <ArrowLeft size={22} color={colors.textHeading} />
      </TouchableOpacity>

      <Text style={styles.heading}>{isAlreadyPublished ? t('editListingHeading') : t('reviewHeading')}</Text>
      <Text style={styles.subtitle}>{t('reviewSubtitle')}</Text>

      {listing.enhancedImageUrl && <Image source={{ uri: listing.enhancedImageUrl }} style={styles.heroImage} />}

      <View style={styles.categoryTag}>
        <Text style={styles.categoryTagText}>{listing.category}</Text>
      </View>

      {/* Current marketplace status, if this listing has been through
          approval before — informational only, doesn't block editing/saving. */}
      {listing.marketplaceStatus && (
        <View style={[styles.statusRow, { backgroundColor: listing.marketplaceStatus === 'approved' ? colors.goldLight : colors.goldLight }]}>
          {listing.marketplaceStatus === 'approved' ? (
            <CheckCircle2 size={14} color={colors.statusLive} />
          ) : (
            <Clock size={14} color={colors.statusReview} />
          )}
          <Text style={styles.statusRowText}>
            {listing.marketplaceStatus === 'approved' ? t('approvedLabel') : t('waitlistedLabel')}
            {reasonKey ? ` — ${t(reasonKey)}` : ''}
          </Text>
        </View>
      )}

      <Card style={{ marginTop: spacing.md }}>
        <Text style={styles.cardLabel}>{t('titleLabel')}</Text>
        <TextInput style={styles.editInput} value={editedTitle} onChangeText={setEditedTitle} />
      </Card>

      <Card style={{ marginTop: spacing.sm }}>
        <Text style={styles.cardLabel}>{t('descriptionEnglishLabel')}</Text>
        <TextInput
          style={[styles.editInput, styles.editInputMultiline]}
          value={editedDescriptionEn}
          onChangeText={setEditedDescriptionEn}
          multiline
        />
      </Card>

      <Card style={{ marginTop: spacing.sm }}>
        <Text style={styles.cardLabel}>{t('descriptionHindiLabel')}</Text>
        <Text style={styles.cardBody}>{listing.descriptionHi}</Text>
      </Card>

      <Card style={{ marginTop: spacing.sm }}>
        <Text style={styles.cardLabel}>{t('craftStoryLabel')}</Text>
        <TextInput
          style={[styles.editInput, styles.editInputMultiline, styles.craftStory]}
          value={editedCraftStory}
          onChangeText={setEditedCraftStory}
          multiline
        />
      </Card>

      <Card style={{ marginTop: spacing.sm }}>
        <View style={styles.priceEditRow}>
          <Text style={styles.rupeeSign}>₹</Text>
          <TextInput style={styles.priceEditInput} value={editedPriceMin} onChangeText={setEditedPriceMin} keyboardType="number-pad" />
          <Text style={styles.priceEditDash}>–</Text>
          <Text style={styles.rupeeSign}>₹</Text>
          <TextInput style={styles.priceEditInput} value={editedPriceMax} onChangeText={setEditedPriceMax} keyboardType="number-pad" />
          {listing.ecoBadge && <Text style={styles.ecoBadgeLarge}>{listing.ecoBadge}</Text>}
        </View>
        <Text style={styles.cardBody}>{listing.priceReasoning}</Text>
        {/* Shows whether this price came from Gemini's cold-start guess
            or has already started learning from real platform data —
            see lib/adaptivePricing.js. */}
        <Text style={styles.priceSourceTag}>
          {listing.priceSource === 'active-learning'
            ? `📈 ${t('learnedFromPrefix')} ${listing.pricingDataPoints} ${t('realListingsSuffix')}`
            : `🤖 ${t('coldStartTag')}`}
        </Text>
      </Card>

      {/* B2B / wholesale section — all editable */}
      <Text style={styles.sectionHeading}>{t('forBulkBuyers')}</Text>
      <Card>
        <Text style={styles.cardLabel}>{t('b2bDescriptionLabel')}</Text>
        <TextInput
          style={[styles.editInput, styles.editInputMultiline]}
          value={editedB2bDescription}
          onChangeText={setEditedB2bDescription}
          multiline
        />
        <View style={styles.wholesaleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardLabel}>{t('wholesalePriceLabel')}</Text>
            <View style={styles.priceEditRow}>
              <Text style={styles.rupeeSign}>₹</Text>
              <TextInput style={styles.priceEditInputSmall} value={editedWholesaleMin} onChangeText={setEditedWholesaleMin} keyboardType="number-pad" />
              <Text style={styles.priceEditDash}>–</Text>
              <Text style={styles.rupeeSign}>₹</Text>
              <TextInput style={styles.priceEditInputSmall} value={editedWholesaleMax} onChangeText={setEditedWholesaleMax} keyboardType="number-pad" />
            </View>
          </View>
          <View>
            <Text style={styles.cardLabel}>{t('minOrderQtyLabel')}</Text>
            <TextInput style={styles.priceEditInputSmall} value={editedMinOrderQuantity} onChangeText={setEditedMinOrderQuantity} keyboardType="number-pad" />
          </View>
        </View>
      </Card>

      {/* Government schemes — read-only (grounded against a verified
          list, see lib/governmentSchemesReference.js) and the disclaimer
          stays visible, not optional (see HANDOFF.md 5.7) */}
      {listing.suggestedSchemes?.length > 0 && (
        <>
          <Text style={styles.sectionHeading}>{t('schemesHeading')}</Text>
          <View style={styles.disclaimerBox}>
            <AlertTriangle size={14} color={colors.statusReview} />
            <Text style={styles.disclaimerText}>{t('schemesDisclaimer')}</Text>
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
            <Text style={styles.listenButtonText}>{t('listen')} ({listing.detectedLanguage})</Text>
          </>
        )}
      </TouchableOpacity>
      <Text style={styles.listenHint}>{t('listenHintText')}</Text>

      {/* Save & Share poster — a still, story-shaped (9:16) image for
          WhatsApp Status / Instagram Story. The video-generation feature
          that used to sit alongside this was removed entirely on request. */}
      <Text style={styles.sectionHeading}>{t('shareOnSocial')}</Text>
      {!posterSaveShareResult ? (
        <TouchableOpacity style={styles.posterButton} onPress={handleGenerateAndSavePoster} disabled={isGeneratingPoster}>
          {isGeneratingPoster ? (
            <ActivityIndicator color={colors.textOnDark} />
          ) : (
            <>
              <ImageIcon size={18} color={colors.textOnDark} />
              <Text style={styles.posterButtonText}>{t('createPoster')}</Text>
            </>
          )}
        </TouchableOpacity>
      ) : (
        localPosterUri && <SaveShareConfirmation result={posterSaveShareResult} videoUri={localPosterUri} mediaLabel="Poster" />
      )}
      {isGeneratingPoster && <Text style={styles.listenHint}>{t('generatingPosterHint')}</Text>}

      {/* Publish/save — ALWAYS visible, regardless of whether this
          listing has already been published before. This is the fix for
          "no save option when editing a listing": that used to be
          replaced by a static "Published!" banner whenever a listing
          was already live, with no way to save further changes. */}
      <TouchableOpacity style={styles.publishButton} onPress={handlePublish} disabled={isPublishing}>
        {isPublishing ? <ActivityIndicator color={colors.textOnDark} /> : <Text style={styles.publishButtonText}>{isAlreadyPublished ? t('saveAndResubmit') : t('publish')}</Text>}
      </TouchableOpacity>
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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  statusRowText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textHeading, flexShrink: 1 },
  editInput: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textHeading,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.sm,
    padding: spacing.sm,
  },
  editInputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  priceEditRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rupeeSign: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.textHeading },
  priceEditInput: {
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    color: colors.textHeading,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    minWidth: 80,
  },
  priceEditInputSmall: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.textHeading,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    minWidth: 60,
    marginTop: 2,
  },
  priceEditDash: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.textHeading },
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
  ecoBadgeLarge: { fontFamily: fonts.bodyMedium, fontSize: 20, marginLeft: spacing.xs },
  priceSourceTag: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.gold, marginTop: spacing.xs },
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
  posterButton: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.textHeading,
    borderRadius: radii.lg,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterButtonText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.textOnDark },
  publishButton: {
    backgroundColor: colors.gold,
    borderRadius: radii.lg,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  publishButtonText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.textOnDark },
});
