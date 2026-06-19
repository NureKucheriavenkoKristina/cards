/**
 * Gemini helpers for admin moderation (translate quoted user content).
 * Set EXPO_PUBLIC_GEMINI_API_KEY or deploy translate-moderation edge function with GEMINI_API_KEY.
 */

import { geminiGenerateText } from '@/src/lib/geminiRequest';
import { supabase } from '@/src/lib/supabase';
import type { Locale } from '@/src/locales/translations';

function looksCyrillic(text: string): boolean {
  return /[\u0400-\u04FF]/.test(text);
}

async function translateViaEdgeFunction(text: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('translate-moderation', {
    body: { texts: [text] },
  });
  if (error) return null;
  const list = (data as { translations?: string[] } | null)?.translations;
  const out = list?.[0]?.trim();
  return out && out.length > 0 ? out : null;
}

/** Translate moderator-facing snippets when admin UI is Ukrainian. */
export async function translateModerationDisplayText(
  text: string,
  locale: Locale,
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed || locale === 'en' || looksCyrillic(trimmed)) {
    return text;
  }

  const fromEdge = await translateViaEdgeFunction(trimmed);
  if (fromEdge && fromEdge !== trimmed) {
    return fromEdge;
  }

  const result = await geminiGenerateText(
    `Translate the following moderation text to Ukrainian. Keep deck titles, usernames, and proper nouns unchanged. Output only the translation, no quotes or preamble.\n\n${trimmed}`,
    { maxOutputTokens: 500, temperature: 0.1, thinkingBudget: 0 },
  );
  if (!result.ok || !result.text.trim()) {
    return text;
  }
  const client = result.text.trim();
  return client !== trimmed ? client : text;
}

/** Batch translate for admin complaint list (server Gemini key). */
export async function translateModerationDisplayTexts(
  texts: string[],
  locale: Locale,
): Promise<string[]> {
  const trimmed = texts.map((t) => t.trim());
  if (locale === 'en') return trimmed;

  const needIdx: number[] = [];
  const out = [...trimmed];
  for (let i = 0; i < trimmed.length; i++) {
    if (!trimmed[i] || looksCyrillic(trimmed[i])) continue;
    needIdx.push(i);
  }
  if (needIdx.length === 0) return out;

  const payload = needIdx.map((i) => trimmed[i]);
  const { data, error } = await supabase.functions.invoke('translate-moderation', {
    body: { texts: payload },
  });

  if (!error) {
    const list = (data as { translations?: string[] } | null)?.translations;
    if (list && list.length === needIdx.length) {
      needIdx.forEach((idx, j) => {
        const t = list[j]?.trim();
        if (t && t !== trimmed[idx]) out[idx] = t;
      });
      return out;
    }
  }

  await Promise.all(
    needIdx.map(async (idx) => {
      out[idx] = await translateModerationDisplayText(trimmed[idx], locale);
    }),
  );
  return out;
}
