/**
 * Gemini AI helpers for Cardly.
 * Requires EXPO_PUBLIC_GEMINI_API_KEY in .env
 */

import { geminiGenerateText } from '@/src/lib/geminiRequest';
import {
  buildCardImageStoragePath,
  buildDeckCoverStoragePath,
  persistRemoteImageToStorage,
} from '@/src/lib/uploadRemoteImage';

type GeminiCallResult = { text: string | null; quotaExceeded: boolean };

async function callGemini(
  prompt: string,
  maxTokens = 512,
  options?: { thinkingBudget?: number },
): Promise<GeminiCallResult> {
  const r = await geminiGenerateText(prompt, {
    maxOutputTokens: maxTokens,
    temperature: 0.4,
    thinkingBudget: options?.thinkingBudget,
  });
  if (r.ok) return { text: r.text, quotaExceeded: false };
  if (!r.noApiKey) {
    return { text: null, quotaExceeded: Boolean(r.quotaExceeded) };
  }
  return { text: null, quotaExceeded: false };
}

/**
 * Polish or generate a deck description.
 * If userText is provided → improves/expands it.
 * If userText is empty → generates a description from the title.
 */
export async function generateDeckDescription(
  title: string,
  userText?: string,
): Promise<string | null> {
  const hasText = userText && userText.trim().length > 0;

  const prompt = hasText
    ? `You are a writing assistant. Improve the following short description for a flashcard deck titled "${title}".
Make it clear, engaging and natural (1–3 sentences). Keep the original meaning. Match the language of the input text. Do not use quotes or markdown.

Original text: "${userText!.trim()}"`
    : `Write a short, engaging description (1–2 sentences) for a flashcard deck titled "${title}".
Match the language of the title. Be informative and natural. Do not use quotes or markdown.`;

  return callGemini(prompt, 200).then((r) => r.text);
}

/**
 * Auto-fill the back side of a flashcard.
 * Uses deck title + description for full context.
 * Supports: translations, definitions, term explanations.
 */
export async function generateCardBack(
  frontText: string,
  deckTitle: string,
  deckDescription?: string | null,
): Promise<string | null> {
  const context = [
    `Deck title: "${deckTitle}"`,
    deckDescription?.trim() ? `Deck description: "${deckDescription.trim()}"` : null,
    `Front text: "${frontText}"`,
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = `You are a flashcard assistant. Based on the deck context below, write the back side of a flashcard.

${context}

Rules:
- If the deck is about language learning or vocabulary: write the translation in the target language suggested by the deck context
- If the deck is about terminology or science: write a concise definition or explanation (1–3 sentences)
- If the deck is about facts or geography: write the answer directly
- Keep it short and clear
- Do not add meta text like "Translation:" or "Definition:" — just the answer
- Do not wrap in quotes`;

  return callGemini(prompt, 300).then((r) => r.text);
}

/**
 * Find a relevant stock photo URL for a flashcard using Pixabay.
 * Requires EXPO_PUBLIC_PIXABAY_API_KEY in .env (free at pixabay.com/api/docs/).
 *
 * Flow: Gemini → English photo keywords → Pixabay → best tag match.
 */
const PIXABAY_SKIP_WORDS = new Set([
  'ukrainian', 'ukraine', 'german', 'germany', 'chinese', 'china', 'french', 'france',
  'italian', 'italy', 'japanese', 'japan', 'kiev', 'kyiv', 'lviv', 'european', 'eastern',
  'traditional', 'national', 'regional', 'local', 'various', 'small', 'large', 'with', 'and',
  'the', 'or', 'for', 'from', 'filled', 'fillings', 'type', 'kinds', 'kind',
]);

const FOOD_QUERY_WORDS = new Set([
  'food', 'soup', 'bread', 'bun', 'buns', 'pastry', 'pastries', 'cake', 'pie', 'cookie',
  'pancake', 'pancakes', 'dumpling', 'dumplings', 'meat', 'fish', 'fruit', 'vegetable',
  'salad', 'cheese', 'coffee', 'tea', 'rice', 'pasta', 'pizza', 'borscht', 'soup',
  'breakfast', 'dessert', 'snack', 'baked', 'fried', 'roast', 'stew', 'porridge',
  'pyrizhky', 'varenyky', 'holubtsi', 'syrniki', 'mlyntsi',
]);

const ARCHITECTURE_TAG_RE =
  /\b(building|architecture|church|cathedral|monastery|landmark|kyiv|kiev|ukraine|ukrainian|temple|urban|cityscape|belfry|orthodox|historic)\b/i;

const FOOD_TAG_RE =
  /\b(food|pastry|pastries|bun|buns|bread|baked|fried|soup|meal|dish|cuisine|gourmet|breakfast|dessert|cake|pie|cookie|snack|baking|kitchen|plate|bowl)\b/i;

function parseKeywordText(text: string): string[] {
  return text
    .replace(/[^a-zA-Z0-9 \n]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function filterSearchWords(words: string[]): string[] {
  return words
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 2 && !PIXABAY_SKIP_WORDS.has(w));
}

function toPixabayQuery(words: string[], maxWords = 4): string | null {
  const filtered = filterSearchWords(words).slice(0, maxWords);
  return filtered.length > 0 ? filtered.join('+') : null;
}

function extractEnglishPhotoHint(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const paren = trimmed.match(/\(([^)]+)\)/);
  if (paren?.[1]?.trim() && /[a-zA-Z]/.test(paren[1])) {
    return paren[1].trim();
  }

  if (/^[a-zA-Z0-9\s.,'()-]+$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

function hasNonLatinText(text: string): boolean {
  return /[^\x00-\x7F]/.test(text);
}

function inferPixabayCategory(
  deckTitle: string,
  deckDescription?: string | null,
  cardText?: string,
): string | undefined {
  const blob = `${deckTitle} ${deckDescription ?? ''} ${cardText ?? ''}`.toLowerCase();
  if (
    /food|cuisine|kitchen|recipe|cook|meal|restaurant|gastro|кулінар|їжа|страв|харч|culinary|buns|soup|bread|pastry|borscht|pyrizhky|varenyky|pancake|dumpling/.test(
      blob,
    )
  ) {
    return 'food';
  }
  if (/animal|zoo|pet|wildlife|тварин/.test(blob)) {
    return 'animals';
  }
  if (/travel|place|city|country|geograph|landmark|міст|країн/.test(blob)) {
    return 'places';
  }
  return undefined;
}

function normalizeForTagMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function tagMatchesWord(tags: string, word: string): boolean {
  const w = normalizeForTagMatch(word);
  if (w.length < 3) return false;
  const normTags = normalizeForTagMatch(tags);
  if (normTags.includes(w)) return true;
  return normTags.split(',').some((tag) => {
    const t = tag.trim();
    return t.includes(w) || w.includes(t);
  });
}

function pickBestPixabayHit(
  hits: { tags?: string; webformatURL?: string }[],
  queryWords: string[],
  category?: string,
): string | null {
  if (hits.length === 0) return null;

  const primaryWords = filterSearchWords(queryWords);
  const words =
    primaryWords.length > 0
      ? primaryWords
      : queryWords.map((w) => w.toLowerCase()).filter((w) => w.length > 2);

  if (words.length === 0) return hits[0]?.webformatURL ?? null;

  let bestHit = hits[0];
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const hit of hits) {
    const tags = hit.tags ?? '';
    const wordMatches = words.filter((w) => tagMatchesWord(tags, w)).length;
    if (wordMatches === 0) continue;

    let score = wordMatches;

    if (category === 'food') {
      if (FOOD_TAG_RE.test(tags)) score += 2;
      if (ARCHITECTURE_TAG_RE.test(tags) && !FOOD_TAG_RE.test(tags)) score -= 8;
    }

    if (score > bestScore) {
      bestScore = score;
      bestHit = hit;
    }
  }

  if (bestScore <= 0) return null;

  return bestHit?.webformatURL ?? null;
}

async function fetchPixabayImage(
  pixabayKey: string,
  queryWords: string[],
  category?: string,
): Promise<string | null> {
  const query = toPixabayQuery(queryWords);
  if (!query) return null;

  const params = new URLSearchParams({
    key: pixabayKey,
    q: query.replace(/\+/g, ' '),
    image_type: 'photo',
    safesearch: 'true',
    per_page: '20',
    orientation: 'horizontal',
    order: 'popular',
  });
  if (category) params.set('category', category);

  const res = await fetch(`https://pixabay.com/api/?${params.toString()}`);
  if (!res.ok) return null;

  const data = (await res.json()) as {
    hits?: { tags?: string; webformatURL?: string }[];
  };

  return pickBestPixabayHit(data.hits ?? [], queryWords, category);
}

function extractLatinHeadword(text: string): string | null {
  const m = text.trim().match(/^([A-Za-z][A-Za-z'-]*)/);
  return m?.[1] ?? null;
}

function usableKeywordWords(words: string[]): boolean {
  return filterSearchWords(words).length >= 1 || (words.length === 1 && words[0].length >= 5);
}

async function resolveImageSearchWords(
  cardText: string,
  deckTitle: string,
  deckDescription: string | null | undefined,
  side: 'front' | 'back',
): Promise<{ words: string[]; quotaExceeded: boolean }> {
  const englishHint = extractEnglishPhotoHint(cardText);
  if (englishHint) {
    const words = parseKeywordText(englishHint);
    if (usableKeywordWords(words)) return { words, quotaExceeded: false };
  }

  const latinHead = extractLatinHeadword(cardText);
  if (latinHead) {
    const words = parseKeywordText(latinHead);
    if (usableKeywordWords(words)) return { words, quotaExceeded: false };
  }

  if (!hasNonLatinText(cardText)) {
    const words = parseKeywordText(cardText);
    if (usableKeywordWords(words)) return { words, quotaExceeded: false };
  }

  const context = [
    `Deck title: "${deckTitle}"`,
    deckDescription?.trim() ? `Deck description: "${deckDescription.trim()}"` : null,
    `Card ${side} text: "${cardText}"`,
  ]
    .filter(Boolean)
    .join('\n');

  const keywordPrompt = `You pick stock photo search terms for vocabulary flashcards.
The photo must clearly show the exact object, food, place, or concept on the card.

${context}

Rules:
- Reply with 2–4 simple English nouns only (lowercase, spaces between words, one line)
- If the card text is not English, translate its meaning to English first
- Name the visible subject only (e.g. "borscht soup", "fried buns", "pancakes")
- Never use country, city, or nationality words (no ukrainian, german, kiev, etc.)
- Do not use generic words like nature, background, abstract, concept, people
- No punctuation, quotes, or explanations`;

  const raw = await callGemini(keywordPrompt, 128, { thinkingBudget: 0 });
  if (raw.quotaExceeded) return { words: [], quotaExceeded: true };
  if (raw.text) {
    const words = parseKeywordText(raw.text);
    if (usableKeywordWords(words)) return { words, quotaExceeded: false };
  }

  const deckWords = parseKeywordText(deckTitle);
  if (usableKeywordWords(deckWords)) return { words: deckWords, quotaExceeded: false };

  return { words: [], quotaExceeded: false };
}

export type ImageGenResult =
  | { ok: true; url: string }
  | {
      ok: false;
      reason: 'quota' | 'no_match' | 'no_pixabay_key' | 'upload_failed' | 'not_authenticated';
    };

export type ImagePersistContext = {
  userId: string;
  deckId?: string | null;
  cardId?: string | null;
  kind: 'deck-cover' | 'card-image';
  side?: 'front' | 'back';
};

async function persistPixabayUrl(
  remoteUrl: string,
  persist: ImagePersistContext,
): Promise<ImageGenResult> {
  const storagePath =
    persist.kind === 'deck-cover'
      ? buildDeckCoverStoragePath(persist.userId, persist.deckId)
      : buildCardImageStoragePath(
          persist.userId,
          persist.deckId ?? 'pending',
          persist.cardId,
          persist.side ?? 'front',
        );

  const stored = await persistRemoteImageToStorage({ remoteUrl, storagePath });
  if (!stored.ok) {
    if (stored.error === 'not_authenticated') {
      return { ok: false, reason: 'not_authenticated' };
    }
    console.warn('[AI image] Storage upload failed:', stored.error);
    return { ok: false, reason: 'upload_failed' };
  }
  return { ok: true, url: stored.publicUrl };
}

export async function generateCardImageUrl(
  frontText: string,
  deckTitle: string,
  deckDescription?: string | null,
  side: 'front' | 'back' = 'front',
  persist?: ImagePersistContext,
): Promise<ImageGenResult> {
  const pixabayKey = process.env.EXPO_PUBLIC_PIXABAY_API_KEY?.trim();
  if (!pixabayKey) return { ok: false, reason: 'no_pixabay_key' };

  const cardText = frontText.trim();
  if (!cardText) return { ok: false, reason: 'no_match' };

  const { words: queryWords, quotaExceeded } = await resolveImageSearchWords(
    cardText,
    deckTitle,
    deckDescription,
    side,
  );

  if (queryWords.length === 0) {
    return { ok: false, reason: quotaExceeded ? 'quota' : 'no_match' };
  }

  const category = inferPixabayCategory(deckTitle, deckDescription, cardText);

  try {
    const searchPlans: string[][] = [];
    const seen = new Set<string>();
    const addPlan = (words: string[]) => {
      const filtered = filterSearchWords(words);
      if (filtered.length === 0) return;
      const key = filtered.join(' ');
      if (seen.has(key)) return;
      seen.add(key);
      searchPlans.push(filtered);
    };

    addPlan(queryWords);
    addPlan(queryWords.filter((w) => FOOD_QUERY_WORDS.has(w.toLowerCase())));

    for (const words of searchPlans) {
      const imgUrl = await fetchPixabayImage(pixabayKey, words, category);
      if (imgUrl) {
        if (persist) return persistPixabayUrl(imgUrl, persist);
        return { ok: true, url: imgUrl };
      }
    }

    return { ok: false, reason: quotaExceeded ? 'quota' : 'no_match' };
  } catch (e) {
    console.warn('[AI image] Pixabay error:', e);
    return { ok: false, reason: 'no_match' };
  }
}

export interface GeneratedCard {
  front: string;
  back: string;
}

export type GenerateCardsError = 'no_api_key' | 'service_error' | 'bad_output';

/**
 * Generate a list of flashcard pairs.
 * Uses deck title + description as context so cards match the deck's purpose.
 * Supports vocabulary (with translation), terminology (with definitions), facts, etc.
 *
 * @param userPrompt  What the user typed (topic, extra instructions, or just context)
 * @param count       Number of cards to generate (5–20)
 * @param locale      'en' or 'uk' — UI language (fallback if deck context doesn't imply a language)
 * @param deckTitle   Deck title for context
 * @param deckDesc    Deck description for context
 */
export async function generateCards(
  userPrompt: string,
  count: number,
  locale: 'en' | 'uk',
  deckTitle?: string,
  deckDesc?: string | null,
): Promise<{ cards: GeneratedCard[]; error?: GenerateCardsError }> {
  const uiLang = locale === 'uk' ? 'Ukrainian' : 'English';

  const deckContext = [
    deckTitle?.trim() ? `Deck title: "${deckTitle.trim()}"` : null,
    deckDesc?.trim() ? `Deck description: "${deckDesc.trim()}"` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = `You are a flashcard generator. Create exactly ${count} flashcard pairs.

${deckContext ? `Deck context:\n${deckContext}\n` : ''}User request: "${userPrompt}"

Instructions:
- Infer the card format from the deck context:
  • If it's a language/vocabulary deck (e.g. "Chinese trees", "Italian food") → front: word/term in source language, back: translation in target language
  • If it's a terminology/science deck → front: term or concept, back: concise definition or explanation
  • If it's a facts/geography/history deck → front: question or name, back: answer or description
- Use the language implied by the deck context. If unclear, use ${uiLang}.
- Make cards diverse and genuinely useful for studying the deck topic.
- Keep each side concise (max 2 sentences).

Return ONLY a valid JSON array, no markdown, no extra text:
[{"front":"...","back":"..."},...]`;

  const ai = await geminiGenerateText(prompt, { maxOutputTokens: Math.min(8192, count * 180), temperature: 0.4 });
  if (!ai.ok) {
    if (ai.noApiKey) {
      return { cards: [], error: 'no_api_key' };
    }
    return { cards: [], error: 'service_error' };
  }

  const raw = ai.text;
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) {
      return { cards: [], error: 'bad_output' };
    }
    const cards = parsed
      .filter((item): item is GeneratedCard =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.front === 'string' &&
        typeof item.back === 'string' &&
        item.front.trim().length > 0 &&
        item.back.trim().length > 0,
      )
      .slice(0, count);
    if (cards.length === 0) {
      return { cards: [], error: 'bad_output' };
    }
    return { cards };
  } catch {
    return { cards: [], error: 'bad_output' };
  }
}
