import type { ReviewRating } from "@cardly/srs/reviewScheduler";
import { scheduleAfterAnswer } from "@cardly/srs/cardScheduling";
import {
    appSettingsRowToGlobal,
    delayDaysForReview,
    initialUserCardProgressPayload,
    nextRepetitionsCount,
    progressRowToSnapshot,
    scheduleOutcomeToProgressPatch,
} from "@cardly/srs/dbMapping";
import type { AppSpacedRepetitionSettingsRow, UserCardProgressRow } from "@cardly/srs/dbTypes";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isReviewRating(x: unknown): x is ReviewRating {
  return x === "again" || x === "hard" || x === "good" || x === "easy";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase env" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { card_id?: string; deck_id?: string; rating?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const cardId = body.card_id;
  const deckId = body.deck_id;
  const rating = body.rating;
  if (!cardId || typeof cardId !== "string") {
    return new Response(JSON.stringify({ error: "card_id is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!isReviewRating(rating)) {
    return new Response(JSON.stringify({ error: "rating must be again|hard|good|easy" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: cardRow, error: cardErr } = await supabase
    .from("cards")
    .select("deck_id")
    .eq("card_id", cardId)
    .maybeSingle();

  if (cardErr || !cardRow?.deck_id) {
    return new Response(JSON.stringify({ error: "Card not found", details: cardErr?.message }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const cardDeckId = cardRow.deck_id as string;
  if (deckId != null && typeof deckId === "string" && deckId !== cardDeckId) {
    return new Response(JSON.stringify({ error: "deck_id does not match card" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: settingsRow, error: settingsError } = await supabase
    .from("app_spaced_repetition_settings")
    .select("*")
    .eq("id", 1)
    .single();

  if (settingsError || !settingsRow) {
    return new Response(
      JSON.stringify({ error: "SRS settings not found", details: settingsError?.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const settings = appSettingsRowToGlobal(settingsRow as AppSpacedRepetitionSettingsRow);

  let { data: progress, error: progressError } = await supabase
    .from("user_card_progress")
    .select("*")
    .eq("user_id", user.id)
    .eq("card_id", cardId)
    .maybeSingle();

  if (progressError) {
    return new Response(JSON.stringify({ error: progressError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!progress) {
    const insertPayload = initialUserCardProgressPayload(user.id, cardId);
    const { error: insertError } = await supabase.from("user_card_progress").insert(insertPayload);
    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const res = await supabase
      .from("user_card_progress")
      .select("*")
      .eq("user_id", user.id)
      .eq("card_id", cardId)
      .single();
    progress = res.data;
    if (!progress) {
      return new Response(JSON.stringify({ error: "Failed to load progress after insert" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const row = progress as UserCardProgressRow;
  const snapshot = progressRowToSnapshot(row);
  const reviewedAt = new Date();
  const delayDays = delayDaysForReview(row.due_date, reviewedAt);
  const outcome = scheduleAfterAnswer(snapshot, rating, delayDays, settings);
  const patch = scheduleOutcomeToProgressPatch(outcome, reviewedAt);
  const repetitions = nextRepetitionsCount(row.repetitions, rating);

  const { data: updated, error: updateError } = await supabase
    .from("user_card_progress")
    .update({
      ...patch,
      repetitions,
    })
    .eq("user_id", user.id)
    .eq("card_id", cardId)
    .select()
    .single();

  if (updateError) {
    return new Response(JSON.stringify({ error: updateError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Log the review for statistics (ensure public.users row exists for legacy accounts).
  {
    await supabase.rpc("ensure_public_user_profile");
    const ratingNumeric: Record<string, number> = { again: 0, hard: 1, good: 2, easy: 3 };
    const { error: logError } = await supabase.from("review_logs").insert({
      user_id: user.id,
      card_id: cardId,
      deck_id: cardDeckId,
      rating: ratingNumeric[rating] ?? 2,
    });
    if (logError) {
      console.error("review_logs insert failed:", logError.message);
    }
  }

  return new Response(
    JSON.stringify({
      progress: updated,
      outcome: {
        phase: outcome.phase,
        learning_step_index: outcome.learningStepIndex,
        interval_days: outcome.intervalDays,
        due_in_seconds_from_now: outcome.dueInSecondsFromNow,
        ease_permille: outcome.easePermille,
      },
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
