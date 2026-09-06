// src/screens/LoginScreen.tsx
//
// Matches the real login mockup shared for this screen — logo, mandala
// background, language dropdown, phone number, Continue — MINUS the
// "Your name" field from that mockup (explicitly excluded; this app
// only ever collects a phone number at login, name is not asked).
//
// Background: the real login-background.jpg (mandala pattern) fills the
// screen, with a vertical gradient overlay fading it into the app's
// cream background color toward the bottom, for text legibility over
// the card — built with expo-linear-gradient (already a dependency)
// rather than a separate gradient image asset.
//
// Two login steps in one screen: enter phone number -> enter the SMS code.
// Talks to Twilio Verify via server.js's /api/auth/send-otp and
// /api/auth/verify-otp (see AuthContext for the actual state/storage).
//
// DEMO NOTE: if the real SMS doesn't arrive (e.g. Twilio trial accounts
// can only deliver to manually-verified numbers), the code "696969"
// always works — see lib/auth.js's DEMO_MASTER_OTP on the backend.

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ImageBackground,
  Image,
  Modal,
  FlatList,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Phone, ShieldCheck, Globe, ChevronDown, X, Check } from 'lucide-react-native';
import { colors, spacing, radii, fonts } from '../theme';
import { Card } from '../components/Card';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { LANGUAGES } from '../i18n/translations';

// India-only assumption baked in here (this is a hackathon build for
// Indian artisans) — prefilled +91 so users just type the 10-digit
// number, not the full E.164 string Twilio Verify requires.
const COUNTRY_CODE = '+91';

export function LoginScreen() {
  const { requestOtp, confirmOtp } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);

  const fullPhoneNumber = `${COUNTRY_CODE}${phoneDigits.trim()}`;
  const selectedLanguage = LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0];

  async function handleSendOtp() {
    if (phoneDigits.trim().length < 10) {
      setError(t('enterValidPhone'));
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await requestOtp(fullPhoneNumber);
      if (!result.success) {
        setError(result.error || t('couldNotSendCode'));
        return;
      }
      setStep('otp');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyOtp() {
    if (code.trim().length < 4) {
      setError(t('enterCodeReceived'));
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await confirmOtp(fullPhoneNumber, code.trim());
      if (!result.success) {
        setError(result.error || t('incorrectOrExpiredCode'));
      }
      // On success, AuthContext's uid (and isNewUser) update and
      // App.tsx swaps to the Aadhaar step or main app automatically.
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ImageBackground
      source={require('../../assets/brand/login-background.jpg')}
      style={styles.background}
      resizeMode="cover"
    >
      {/* Vertical fade so the bottom card area reads clearly over the
          busy mandala pattern, matching the mockup's look. */}
      <LinearGradient
        colors={['transparent', 'rgba(251,243,224,0.75)', colors.background]}
        locations={[0, 0.55, 0.85]}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Image source={require('../../assets/brand/logo.png')} style={styles.logoImage} resizeMode="contain" />

          <Text style={styles.heading}>{step === 'phone' ? t('welcomeToKriya') : t('verifyTitle')}</Text>
          <Text style={styles.subtitle}>{step === 'phone' ? t('tagline') : `${t('verifyHint')} (${fullPhoneNumber})`}</Text>

          <Card style={{ marginTop: spacing.lg }}>
            {step === 'phone' ? (
              <>
                {/* Language dropdown — matches the mockup's globe-icon selector row */}
                <TouchableOpacity style={styles.languageRow} onPress={() => setLanguagePickerOpen(true)}>
                  <View style={styles.languageIconCircle}>
                    <Globe size={18} color={colors.gold} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.languageLabel}>{t('chooseLanguage')}</Text>
                    <Text style={styles.languageValue}>
                      {selectedLanguage.label} · {selectedLanguage.nativeLabel}
                    </Text>
                  </View>
                  <ChevronDown size={18} color={colors.textBody} />
                </TouchableOpacity>

                <View style={styles.stepHeader}>
                  <View style={styles.iconCircle}>
                    <Phone size={20} color={colors.gold} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stepTitle}>{t('phoneNumberLabel')}</Text>
                    <Text style={styles.stepSubtitle}>{t('phoneNumberHint')}</Text>
                  </View>
                </View>

                <View style={styles.phoneInputRow}>
                  <Text style={styles.countryCode}>{COUNTRY_CODE}</Text>
                  <TextInput
                    style={styles.phoneInput}
                    placeholder="98765 43210"
                    placeholderTextColor={colors.textBody}
                    keyboardType="phone-pad"
                    maxLength={10}
                    value={phoneDigits}
                    onChangeText={(t) => setPhoneDigits(t.replace(/[^0-9]/g, ''))}
                    autoFocus
                  />
                </View>

                {error && <Text style={styles.errorText}>{error}</Text>}

                <TouchableOpacity
                  style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
                  onPress={handleSendOtp}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? <ActivityIndicator color={colors.textOnDark} /> : <Text style={styles.submitButtonText}>{t('continueButton')}</Text>}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.stepHeader}>
                  <View style={styles.iconCircle}>
                    <ShieldCheck size={20} color={colors.gold} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stepTitle}>{t('verifyTitle')}</Text>
                    <Text style={styles.stepSubtitle}>{t('verifyHint')}</Text>
                  </View>
                </View>

                <TextInput
                  style={styles.otpInput}
                  placeholder="123456"
                  placeholderTextColor={colors.textBody}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={code}
                  onChangeText={(t) => setCode(t.replace(/[^0-9]/g, ''))}
                  autoFocus
                />

                {error && <Text style={styles.errorText}>{error}</Text>}

                <TouchableOpacity
                  style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
                  onPress={handleVerifyOtp}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? <ActivityIndicator color={colors.textOnDark} /> : <Text style={styles.submitButtonText}>{t('verifyButton')}</Text>}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => {
                    setStep('phone');
                    setCode('');
                    setError(null);
                  }}
                >
                  <Text style={styles.backButtonText}>{t('changePhoneNumber')}</Text>
                </TouchableOpacity>
              </>
            )}
          </Card>

          <Text style={styles.footerDisclaimer}>{t('footerDisclaimer')}</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Language picker modal */}
      <Modal visible={languagePickerOpen} animationType="slide" transparent onRequestClose={() => setLanguagePickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('chooseLanguage')}</Text>
              <TouchableOpacity onPress={() => setLanguagePickerOpen(false)} hitSlop={8}>
                <X size={22} color={colors.textHeading} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={LANGUAGES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalRow}
                  onPress={() => {
                    setLanguage(item.code);
                    setLanguagePickerOpen(false);
                  }}
                >
                  <Text style={styles.modalRowText}>
                    {item.label} · {item.nativeLabel}
                  </Text>
                  {item.code === language && <Check size={18} color={colors.gold} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  logoImage: { width: 140, height: 140, alignSelf: 'center' },
  heading: { fontFamily: fonts.heading, fontSize: 28, color: colors.textHeading, marginTop: spacing.sm, textAlign: 'center' },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.textBody, marginTop: spacing.xs, textAlign: 'center' },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  languageIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.goldLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  languageLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.textBody },
  languageValue: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.textHeading, marginTop: 1 },
  stepHeader: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.goldLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.textHeading },
  stepSubtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.textBody, marginTop: 2 },
  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
  },
  countryCode: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.textHeading, marginRight: spacing.sm },
  phoneInput: { flex: 1, fontFamily: fonts.body, fontSize: 16, color: colors.textHeading, paddingVertical: 14 },
  otpInput: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontFamily: fonts.bodySemibold,
    fontSize: 20,
    color: colors.textHeading,
    letterSpacing: 6,
    textAlign: 'center',
  },
  errorText: { fontFamily: fonts.body, fontSize: 13, color: colors.statusRejected, marginTop: spacing.sm },
  submitButton: {
    backgroundColor: colors.gold,
    borderRadius: radii.lg,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.textOnDark },
  backButton: { alignItems: 'center', marginTop: spacing.md },
  backButtonText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textBody },
  footerDisclaimer: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textBody,
    textAlign: 'center',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    lineHeight: 16,
  },
  modalOverlay: { flex: 1, backgroundColor: colors.overlayDark, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    maxHeight: '70%',
    paddingBottom: spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  modalTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.textHeading },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  modalRowText: { fontFamily: fonts.body, fontSize: 15, color: colors.textHeading },
});
