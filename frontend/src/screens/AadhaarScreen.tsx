// src/screens/AadhaarScreen.tsx
//
// *** MOCK ONLY — no real UIDAI/Aadhaar e-KYC API is ever called. ***
// Shown once, right after a first-time signup (see AuthContext's
// isNewUser + App.tsx's gating) — just captures a 12-digit number and
// stores it against the user's Firestore record via
// POST /api/auth/link-aadhaar, purely to simulate what a "verified
// artisan" state would look like for demo purposes. A real
// implementation would need UIDAI's actual licensed e-KYC API, which is
// well outside this hackathon's scope — see that route's own comment.

import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import { colors, spacing, radii, fonts } from '../theme';
import { Card } from '../components/Card';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';

export function AadhaarScreen() {
  const { submitAadhaar, skipAadhaar } = useAuth();
  const { t } = useLanguage();
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (aadhaarNumber.length !== 12) {
      setError(t('aadhaarNumberError'));
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await submitAadhaar(aadhaarNumber);
      if (!result.success) setError(result.error || t('couldNotLinkAadhaar'));
      // On success, isNewUser flips false in AuthContext and App.tsx
      // swaps to the main app automatically.
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        <Text style={styles.heading}>{t('aadhaarTitle')}</Text>
        <Text style={styles.subtitle}>{t('aadhaarSubtitle')}</Text>
        <Text style={styles.mockNotice}>{t('aadhaarMockNotice')}</Text>

        <Card style={{ marginTop: spacing.lg }}>
          <View style={styles.stepHeader}>
            <View style={styles.iconCircle}>
              <ShieldCheck size={20} color={colors.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepTitle}>{t('aadhaarTitle')}</Text>
            </View>
          </View>

          <TextInput
            style={styles.input}
            placeholder={t('aadhaarPlaceholder')}
            placeholderTextColor={colors.textBody}
            keyboardType="number-pad"
            maxLength={12}
            value={aadhaarNumber}
            onChangeText={(text) => setAadhaarNumber(text.replace(/[^0-9]/g, ''))}
            autoFocus
          />

          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? <ActivityIndicator color={colors.textOnDark} /> : <Text style={styles.submitButtonText}>{t('aadhaarSubmit')}</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipButton} onPress={skipAadhaar} disabled={isSubmitting}>
            <Text style={styles.skipButtonText}>{t('aadhaarSkip')}</Text>
          </TouchableOpacity>
        </Card>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  heading: { fontFamily: fonts.heading, fontSize: 26, color: colors.textHeading, textAlign: 'center' },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.textBody, marginTop: spacing.xs, textAlign: 'center' },
  mockNotice: { fontFamily: fonts.body, fontSize: 11, color: colors.statusReview, marginTop: spacing.sm, textAlign: 'center' },
  stepHeader: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  iconCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.goldLight, alignItems: 'center', justifyContent: 'center' },
  stepTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.textHeading },
  input: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontFamily: fonts.bodySemibold,
    fontSize: 18,
    color: colors.textHeading,
    letterSpacing: 2,
  },
  errorText: { fontFamily: fonts.body, fontSize: 13, color: colors.statusRejected, marginTop: spacing.sm },
  submitButton: { backgroundColor: colors.gold, borderRadius: radii.lg, paddingVertical: 16, alignItems: 'center', marginTop: spacing.lg },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.textOnDark },
  skipButton: { alignItems: 'center', marginTop: spacing.md },
  skipButtonText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textBody },
});
