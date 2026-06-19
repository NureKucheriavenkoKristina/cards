import { useEffect, useMemo, useState } from 'react';

import { translateModerationDisplayTexts } from '@/src/lib/geminiComplaint';
import type { Locale } from '@/src/locales/translations';

export type ModerationTranslateEntry = { key: string; text: string };

const CACHE_PREFIX = '@cardly_mod_uk:';

function readCache(text: string): string | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage.getItem(`${CACHE_PREFIX}${text}`) ?? null;
  } catch {
    return null;
  }
}

function writeCache(source: string, translated: string) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (translated !== source) {
      sessionStorage.setItem(`${CACHE_PREFIX}${source}`, translated);
    }
  } catch {
    /* ignore quota */
  }
}

/** Ukrainian admin UI: translate stored complaint snippets for display. */
export function useModerationDisplayTranslations(
  locale: Locale,
  entries: ModerationTranslateEntry[],
): { map: Record<string, string>; pending: boolean; failed: boolean } {
  const [map, setMap] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const serialized = useMemo(() => JSON.stringify(entries), [entries]);

  useEffect(() => {
    if (locale !== 'uk') {
      setMap({});
      setPending(false);
      setFailed(false);
      return;
    }

    let parsed: ModerationTranslateEntry[];
    try {
      parsed = JSON.parse(serialized) as ModerationTranslateEntry[];
    } catch {
      setMap({});
      setPending(false);
      return;
    }

    if (parsed.length === 0) {
      setMap({});
      setPending(false);
      setFailed(false);
      return;
    }

    let cancelled = false;
    setPending(true);
    setFailed(false);

    void (async () => {
      const next: Record<string, string> = {};
      const toFetch: { key: string; text: string }[] = [];

      for (const { key, text } of parsed) {
        if (!text.trim()) continue;
        const cached = readCache(text);
        if (cached) {
          next[key] = cached;
        } else {
          toFetch.push({ key, text });
        }
      }

      if (Object.keys(next).length > 0 && !cancelled) {
        setMap((prev) => ({ ...prev, ...next }));
      }

      if (toFetch.length === 0) {
        if (!cancelled) setPending(false);
        return;
      }

      const uniqueTexts = [...new Set(toFetch.map((e) => e.text))];
      const translatedList = await translateModerationDisplayTexts(uniqueTexts, locale);
      if (cancelled) return;

      const bySource = new Map<string, string>();
      uniqueTexts.forEach((src, i) => {
        const tr = translatedList[i] ?? src;
        bySource.set(src, tr);
        writeCache(src, tr);
      });

      const batch: Record<string, string> = {};
      let anyStillEnglish = false;
      for (const { key, text } of toFetch) {
        const tr = bySource.get(text) ?? text;
        batch[key] = tr;
        if (tr === text && !/[\u0400-\u04FF]/.test(text)) {
          anyStillEnglish = true;
        }
      }

      setMap((prev) => ({ ...prev, ...batch }));
      setFailed(anyStillEnglish);
      setPending(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [locale, serialized]);

  return { map, pending, failed };
}

export function moderationDisplayText(
  map: Record<string, string>,
  key: string,
  fallback: string,
  locale: Locale,
): string {
  if (locale !== 'uk') return fallback;
  return map[key] ?? fallback;
}
