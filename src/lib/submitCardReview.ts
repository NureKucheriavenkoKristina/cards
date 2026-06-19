import { supabase } from "@/src/lib/supabase";
import { Platform } from "react-native";

export type SubmitCardReviewRating = "again" | "hard" | "good" | "easy";

function appendNetworkFailureHint(detail: string): string {
  if (!/failed to fetch|network request failed/i.test(detail)) {
    return detail;
  }
  if (Platform.OS === "web") {
    return `${detail}\n\nExpo Web: ad blockers, extensions, or incognito mode often block requests. Try Chrome without extensions, or the same flow in Expo Go on a device (iOS/Android).`;
  }
  return `${detail}\n\nCheck network and VPN. Ensure .env has EXPO_PUBLIC_SUPABASE_URL=https://….supabase.co and restart Expo after changes: npx expo start -c`;
}

/**
 * Extracts the real cause from FunctionsFetchError: `context` is the native fetch error;
 * JSON.stringify on it yields `{}`, so the UI looked empty.
 */
function enrichInvokeError(error: unknown): Error {
  if (!(error && typeof error === "object")) {
    return error instanceof Error ? error : new Error(String(error));
  }
  const e = error as { name?: string; message?: string; context?: unknown };
  if (e.name === "FunctionsFetchError" && e.context != null) {
    const ctx = e.context;
    const detail =
      ctx instanceof Error
        ? ctx.message
        : typeof ctx === "object" &&
            ctx !== null &&
            "message" in ctx &&
            typeof (ctx as { message: unknown }).message === "string"
          ? (ctx as { message: string }).message
          : String(ctx);
    const raw =
      detail && detail !== "{}"
        ? detail
        : "Network unavailable, invalid EXPO_PUBLIC_SUPABASE_URL, or request blocked (VPN/firewall).";
    const hint = appendNetworkFailureHint(raw);
    return new Error(`${e.message}\n→ ${hint}`);
  }
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * FunctionsHttpError.context is a `Response`; the body contains the real reason (error/details).
 */
async function enrichHttpInvokeError(error: unknown): Promise<Error> {
  if (!(error && typeof error === "object")) {
    return error instanceof Error ? error : new Error(String(error));
  }
  const e = error as { name?: string; message?: string; context?: unknown };
  if (e.name !== "FunctionsHttpError" || e.context == null) {
    return enrichInvokeError(error);
  }

  const ctx = e.context;
  const isResponse =
    typeof Response !== "undefined" && ctx instanceof Response;

  if (!isResponse) {
    return enrichInvokeError(error);
  }

  const res = ctx as Response;
  const status = res.status;
  let body = "";
  try {
    body = await res.clone().text();
  } catch {
    body = "";
  }

  let detail = body;
  try {
    const j = JSON.parse(body) as {
      error?: string;
      details?: string;
      message?: string;
    };
    detail =
      [j.details, j.error, j.message].filter(Boolean).join(" — ") ||
      JSON.stringify(j, null, 2);
  } catch {
    /* keep body as text */
  }

  const hint =
    status === 503 || /failed to start/i.test(detail)
      ? "\n(503: check Edge Function logs in the Supabase dashboard; often deploy or import issues.)"
      : status >= 500
        ? "\n(5xx: often a missing DB migration, RLS policy, or server misconfiguration — check Supabase and Edge Function logs.)"
        : "";

  return new Error(`HTTP ${status} from Edge Function\n${detail || "(empty body)"}${hint}`);
}

const RATING_NUMERIC: Record<SubmitCardReviewRating, number> = {
  again: 0,
  hard: 1,
  good: 2,
  easy: 3,
};

/** Client-side review log when Edge Function logging fails (same RLS as user session). */
async function logReviewFromClient(
  cardId: string,
  deckId: string,
  rating: SubmitCardReviewRating,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.rpc("ensure_public_user_profile");
  await supabase.from("review_logs").insert({
    user_id: user.id,
    card_id: cardId,
    deck_id: deckId,
    rating: RATING_NUMERIC[rating],
  });
}

/** Invokes the `submit-card-review` Edge Function (server-side SRS and review_logs). */
export async function submitCardReviewInvoke(
  cardId: string,
  rating: SubmitCardReviewRating,
  deckId?: string,
) {
  const result = await supabase.functions.invoke("submit-card-review", {
    body: { card_id: cardId, deck_id: deckId, rating },
  });
  if (result.error) {
    return { ...result, error: await enrichHttpInvokeError(result.error) };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    let resolvedDeckId = deckId;
    if (!resolvedDeckId) {
      const { data: cardRow } = await supabase
        .from("cards")
        .select("deck_id")
        .eq("card_id", cardId)
        .maybeSingle();
      resolvedDeckId = cardRow?.deck_id as string | undefined;
    }
    if (resolvedDeckId) {
      const { data: existing } = await supabase
        .from("review_logs")
        .select("id")
        .eq("user_id", user.id)
        .eq("card_id", cardId)
        .gte("reviewed_at", new Date(Date.now() - 60_000).toISOString())
        .limit(1);
      if (!existing?.length) {
        await logReviewFromClient(cardId, resolvedDeckId, rating);
      }
    }
  }

  return result;
}
