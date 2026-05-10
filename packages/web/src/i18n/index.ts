// Locale registry + the `useStrings()` hook. To add a new language:
//
//   1. Copy `en.ts` to e.g. `fr.ts`, translate as much as you want
//      (everything is optional — see below).
//   2. Add the new id to `LocaleId` in `types.ts`.
//   3. Import the new file here and append to `LOCALES`.
//
// The hook persists the selected locale in localStorage so a refresh
// keeps the user's choice. On first load we honour the browser's
// `navigator.language` if it matches a supported locale.
//
// Graceful fallback: every non-English locale ships
// `Partial<Strings>`. `useStrings()` merges English on top of the
// active locale at runtime, so a missing key shows the English
// value rather than `undefined` or a missing-key placeholder. This
// means contributors can land translations incrementally without
// the build breaking when a new key is introduced upstream.

import { useEffect, useState } from "react";
import type { Locale, LocaleId, Strings } from "./types";
import { en } from "./en";
import { es } from "./es";
import { bn } from "./bn";
import { as } from "./as";
import { hi } from "./hi";
import { ta } from "./ta";
import { te } from "./te";
import { gu } from "./gu";
import { mr } from "./mr";
import { kn } from "./kn";
import { ml } from "./ml";
import { pa } from "./pa";
import { or } from "./or";

const STORAGE_KEY = "emu8086-modern.locale";

export const LOCALES: Locale[] = [en, es, bn, as, hi, ta, te, gu, mr, kn, ml, pa, or];

const FALLBACK = en;

function detectInitialLocale(): Locale {
  if (typeof window === "undefined") return FALLBACK;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const found = LOCALES.find((l) => l.id === stored);
      if (found) return found;
    }
  } catch {
    // localStorage may be unavailable (private browsing).
  }
  const nav = (typeof navigator !== "undefined" ? navigator.language : "") || "";
  const prefix = nav.split("-")[0]?.toLowerCase();
  const match = LOCALES.find((l) => l.id === prefix);
  return match ?? FALLBACK;
}

let listeners: Array<(l: Locale) => void> = [];
let current: Locale = detectInitialLocale();

export function getLocale(): Locale {
  return current;
}

export function setLocale(id: LocaleId): void {
  const next = LOCALES.find((l) => l.id === id);
  if (!next || next.id === current.id) return;
  current = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore — next reload will fall back to navigator detection.
  }
  for (const fn of listeners) fn(current);
}

/// React hook returning the active strings table. Re-renders the
/// component whenever the locale changes via `setLocale()`.
///
/// The returned object always carries every `Strings` key, even
/// when the active locale is sparse: missing keys come from
/// English. The merge is recomputed only when the locale changes.
export function useStrings(): Strings {
  const [merged, setMerged] = useState<Strings>(() => mergeWithEnglish(current));
  useEffect(() => {
    const fn = (l: Locale) => setMerged(mergeWithEnglish(l));
    listeners.push(fn);
    return () => {
      listeners = listeners.filter((f) => f !== fn);
    };
  }, []);
  return merged;
}

function mergeWithEnglish(locale: Locale): Strings {
  // English first, locale on top — locale's keys win, but every
  // missing key falls through to the English value.
  return { ...en.strings, ...locale.strings };
}

/// Hook for a language-picker UI. Returns the active locale id and a
/// setter; together with `LOCALES` it's enough to render a
/// `<select>`.
export function useLocaleId(): [LocaleId, (id: LocaleId) => void] {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((n) => n + 1);
    listeners.push(fn);
    return () => {
      listeners = listeners.filter((f) => f !== fn);
    };
  }, []);
  return [current.id, setLocale];
}
