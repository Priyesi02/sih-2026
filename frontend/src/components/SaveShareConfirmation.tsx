// src/components/SaveShareConfirmation.tsx
// Ported from the standalone expo-snippets version into the real theme system.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { CheckCircle2, AlertTriangle, Share2 } from 'lucide-react-native';
import { colors, spacing, radii, fonts } from '../theme';
import { shareVideoNow, SaveVideoResult } from '../utils/saveVideoAndCaption';

// mediaLabel lets this same component/copy work for either the video
// or the poster save/share flow (see ListingReviewScreen) — the
// underlying save/share logic (expo-media-library, expo-sharing)
// doesn't care whether the file is an .mp4 or a .png.
export function SaveShareConfirmation({
  result,
  videoUri,
  mediaLabel = 'Video',
}: {
  result: SaveVideoResult;
  videoUri: string;
  mediaLabel?: string;
}) {
  async function handleShareNow() {
    try {
      await shareVideoNow(videoUri);
    } catch (err: any) {
      Alert.alert('Could not open share sheet', err.message);
    }
  }

  return (
    <View style={styles.container}>
      {result.videoSaved && (
        <View style={styles.row}>
          <CheckCircle2 size={16} color={colors.statusLive} />
          <Text style={styles.successText}>{mediaLabel} saved to gallery</Text>
        </View>
      )}

      {result.captionCopied && (
        <View style={styles.row}>
          <CheckCircle2 size={16} color={colors.statusLive} />
          <Text style={styles.successText}>Caption copied to clipboard — paste it when you post!</Text>
        </View>
      )}

      {result.permissionDenied && (
        <View style={styles.warningBox}>
          <AlertTriangle size={16} color={colors.statusReview} />
          <Text style={styles.warningText}>
            Gallery access wasn't allowed, so the {mediaLabel.toLowerCase()} wasn't saved to your phone. You can still tap "Share Now"
            below to send it directly — saving to your gallery first isn't required.
          </Text>
        </View>
      )}

      <TouchableOpacity style={styles.shareButton} onPress={handleShareNow}>
        <Share2 size={18} color={colors.textOnDark} />
        <Text style={styles.shareButtonText}>Share Now</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  successText: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.textHeading },
  warningBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.goldLight,
    borderRadius: radii.sm,
    padding: spacing.sm,
    alignItems: 'flex-start',
  },
  warningText: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: colors.textHeading, lineHeight: 17 },
  shareButton: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.gold,
    borderRadius: radii.lg,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  shareButtonText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.textOnDark },
});
