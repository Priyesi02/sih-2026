// src/auth/AuthContext.tsx
//
// Phone + OTP login state (Twilio Verify on the backend, see
// server.js's /api/auth/send-otp and /api/auth/verify-otp). Gates the
// WHOLE app behind login (see App.tsx) — there's no separate
// buyer-facing app, so every screen benefits from knowing who's
// logged in: "My Listings" and the Impact dashboard can finally be
// scoped to one artisan's own uid instead of showing everyone's data
// mixed together.
//
// `uid` and `phoneNumber` are persisted in expo-secure-store so the
// login survives an app restart — loaded once on mount, then kept in
// memory for the rest of the session.

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { sendOtp as apiSendOtp, verifyOtp as apiVerifyOtp, linkAadhaar as apiLinkAadhaar } from '../api/client';

const UID_KEY = 'kriya_uid';
const PHONE_KEY = 'kriya_phone';

type AuthContextValue = {
  uid: string | null;
  phoneNumber: string | null;
  isLoading: boolean; // true only while reading SecureStore on mount
  isNewUser: boolean; // true right after a first-time signup, until Aadhaar step completes (see LoginScreen) — resets on logout
  requestOtp: (phoneNumber: string) => Promise<{ success: boolean; error?: string }>;
  confirmOtp: (phoneNumber: string, code: string) => Promise<{ success: boolean; isNewUser?: boolean; error?: string }>;
  submitAadhaar: (aadhaarNumber: string) => Promise<{ success: boolean; error?: string }>;
  skipAadhaar: () => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [uid, setUid] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNewUser, setIsNewUser] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [storedUid, storedPhone] = await Promise.all([
          SecureStore.getItemAsync(UID_KEY),
          SecureStore.getItemAsync(PHONE_KEY),
        ]);
        if (storedUid) setUid(storedUid);
        if (storedPhone) setPhoneNumber(storedPhone);
      } catch (err) {
        // SecureStore read failing just means "not logged in" — not fatal.
        console.warn('[auth] failed to read stored login:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const requestOtp = useCallback(async (phone: string) => {
    try {
      const result = await apiSendOtp(phone);
      if (!result.success) return { success: false, error: result.error || 'Could not send code.' };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error — is the backend running?' };
    }
  }, []);

  const confirmOtp = useCallback(async (phone: string, code: string) => {
    try {
      const result = await apiVerifyOtp(phone, code);
      if (!result.success || !result.uid) {
        return { success: false, error: result.error || 'Incorrect or expired code.' };
      }
      await Promise.all([
        SecureStore.setItemAsync(UID_KEY, result.uid),
        SecureStore.setItemAsync(PHONE_KEY, result.phoneNumber || phone),
      ]);
      setUid(result.uid);
      setPhoneNumber(result.phoneNumber || phone);
      setIsNewUser(Boolean(result.isNewUser));
      return { success: true, isNewUser: result.isNewUser };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error — is the backend running?' };
    }
  }, []);

  // *** MOCK — no real UIDAI/Aadhaar API is ever called, see
  // POST /api/auth/link-aadhaar's own comment. *** Only meaningful right
  // after a first-time signup (isNewUser); once submitted (or skipped),
  // isNewUser resets so the one-time Aadhaar screen doesn't show again
  // this session.
  const submitAadhaar = useCallback(
    async (aadhaarNumber: string) => {
      if (!uid) return { success: false, error: 'Not logged in.' };
      try {
        const result = await apiLinkAadhaar(uid, aadhaarNumber);
        if (result.success) setIsNewUser(false);
        return result.success ? { success: true } : { success: false, error: result.error || 'Could not link Aadhaar.' };
      } catch (err: any) {
        return { success: false, error: err.message || 'Network error — is the backend running?' };
      }
    },
    [uid]
  );

  const skipAadhaar = useCallback(() => setIsNewUser(false), []);

  const logout = useCallback(async () => {
    await Promise.all([SecureStore.deleteItemAsync(UID_KEY), SecureStore.deleteItemAsync(PHONE_KEY)]);
    setUid(null);
    setPhoneNumber(null);
    setIsNewUser(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{ uid, phoneNumber, isLoading, isNewUser, requestOtp, confirmOtp, submitAadhaar, skipAadhaar, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() must be called inside an <AuthProvider>.');
  return ctx;
}
