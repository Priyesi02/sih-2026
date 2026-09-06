// src/i18n/LanguageContext.tsx
//
// Small custom i18n provider — no external library, just a dictionary
// lookup (see translations.ts). Language is chosen on the login screen
// (before the user is even authenticated) and persisted so it sticks
// across app restarts.
//
// SCOPE NOTE: this translates app CHROME (nav labels, buttons, screen
// headings) — it does NOT translate the AI-generated listing content
// itself (descriptions, craft story, etc.), which already comes back in
// the artisan's own language directly from the backend (see
// lib/generateListing.js's descriptionLocal field) — a separate,
// stronger mechanism that doesn't need a static dictionary at all.

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { LanguageCode, TRANSLATIONS } from './translations';

const LANGUAGE_KEY = 'kriya_language';
const DEFAULT_LANGUAGE: LanguageCode = 'en';

type LanguageContextValue = {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: keyof (typeof TRANSLATIONS)['en']) => string;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(DEFAULT_LANGUAGE);

  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(LANGUAGE_KEY);
        if (stored && stored in TRANSLATIONS) setLanguageState(stored as LanguageCode);
      } catch (err) {
        console.warn('[i18n] failed to read stored language:', err);
      }
    })();
  }, []);

  const setLanguage = useCallback((lang: LanguageCode) => {
    setLanguageState(lang);
    SecureStore.setItemAsync(LANGUAGE_KEY, lang).catch((err) => console.warn('[i18n] failed to persist language:', err));
  }, []);

  const t = useCallback(
    (key: keyof (typeof TRANSLATIONS)['en']) => {
      // Falls back to English for any key not yet covered in a given
      // language's dictionary, rather than showing a blank/undefined.
      return TRANSLATIONS[language]?.[key] ?? TRANSLATIONS.en[key] ?? String(key);
    },
    [language]
  );

  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage() must be called inside a <LanguageProvider>.');
  return ctx;
}
