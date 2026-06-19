/**
 * Shared Gemini REST calls: model fallbacks + retries on 429/503.
 * Used by gemini.ts, geminiComplaint.ts.
 */

/** Try newest first; fall back when a model is overloaded or unavailable. */
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'] as const;

export function getExpoGeminiApiKey(): string | undefined {
  const k = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  return typeof k === 'string' && k.trim().length > 0 ? k.trim() : undefined;
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export type GeminiTextResult =
  | { ok: true; text: string }
  | { ok: false; noApiKey: true }
  | { ok: false; noApiKey: false; lastStatus: number | null; quotaExceeded?: boolean };

/**
 * Generates plain text via Gemini REST. Retries once on 503/429 per model; then tries next model.
 */
export async function geminiGenerateText(
  prompt: string,
  options: { maxOutputTokens: number; temperature?: number; thinkingBudget?: number },
): Promise<GeminiTextResult> {
  const apiKey = getExpoGeminiApiKey();
  if (!apiKey) {
    return { ok: false, noApiKey: true };
  }

  const temperature = options.temperature ?? 0.4;
  let lastStatus: number | null = null;
  let quotaExceeded = false;

  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: options.maxOutputTokens,
    temperature,
  };
  if (options.thinkingBudget !== undefined) {
    generationConfig.thinkingConfig = { thinkingBudget: options.thinkingBudget };
  }

  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig,
          }),
        });
        lastStatus = res.status;

        const data = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
          error?: { code?: number; message?: string; status?: string };
        };

        if (!res.ok) {
          const errMsg = data.error?.message ?? '';
          if (res.status === 429 && /quota|limit:\s*0/i.test(errMsg)) {
            quotaExceeded = true;
          }
          const retryLater = res.status === 503 || (res.status === 429 && !quotaExceeded);
          if (__DEV__) {
            console.warn(`[Gemini] ${model} → HTTP ${res.status}`);
          }
          if (retryLater && attempt === 0) {
            await sleep(res.status === 429 ? 4500 : 1600);
            continue;
          }
          break;
        }

        if (data.error && __DEV__) {
          console.warn('[Gemini] error message:', data.error.message ?? data.error.status);
        }

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        const trimmed = typeof text === 'string' ? text.trim() : '';
        if (trimmed.length > 0) {
          return { ok: true, text: trimmed };
        }
        break;
      } catch (e) {
        if (__DEV__) {
          console.warn('[Gemini] network error:', e);
        }
        lastStatus = null;
        if (attempt === 0) await sleep(600);
      }
    }
  }

  return { ok: false, noApiKey: false, lastStatus, quotaExceeded: quotaExceeded || lastStatus === 429 };
}
