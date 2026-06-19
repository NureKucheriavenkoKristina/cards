-- Fix statistics: review_logs FK, missing RPCs, rating counts, backfill from progress.

-- Allow review_logs for any authenticated auth user (public.users row may be missing).
ALTER TABLE public.review_logs
  DROP CONSTRAINT IF EXISTS review_logs_user_id_fkey;

-- Ensure profile row exists before logging reviews (called from Edge Function / app).
CREATE OR REPLACE FUNCTION public.ensure_public_user_profile()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.users (user_id, email, username, "isAdmin", registration_date)
  SELECT
    au.id,
    au.email,
    COALESCE(au.raw_user_meta_data->>'username', split_part(COALESCE(au.email, 'user'), '@', 1)),
    false,
    COALESCE(au.created_at, now())
  FROM auth.users au
  WHERE au.id = auth.uid()
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_public_user_profile() TO authenticated;

-- Backfill review_logs from existing SRS progress (one row per card, no duplicates).
INSERT INTO public.review_logs (user_id, card_id, deck_id, rating, reviewed_at)
SELECT
  ucp.user_id,
  ucp.card_id,
  c.deck_id,
  2,
  COALESCE(ucp.last_reviewed_at, now())
FROM public.user_card_progress ucp
JOIN public.cards c ON c.card_id = ucp.card_id
WHERE (ucp.repetitions > 0 OR ucp.status <> 'new')
  AND NOT EXISTS (
    SELECT 1
    FROM public.review_logs rl
    WHERE rl.user_id = ucp.user_id
      AND rl.card_id = ucp.card_id
  );

-- Extended stats: rating breakdown + existing counters.
DROP FUNCTION IF EXISTS public.get_my_stats();
CREATE OR REPLACE FUNCTION public.get_my_stats()
RETURNS TABLE(
  total_reviews    BIGINT,
  reviews_today    BIGINT,
  streak_days      INT,
  cards_new        BIGINT,
  cards_learning   BIGINT,
  cards_review     BIGINT,
  cards_relearning BIGINT,
  total_decks      BIGINT,
  count_again      BIGINT,
  count_hard       BIGINT,
  count_good       BIGINT,
  count_easy       BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_streak INT := 0;
  v_check  DATE;
  v_today  DATE := CURRENT_DATE;
BEGIN
  v_check := v_today;
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.review_logs
      WHERE user_id = auth.uid()
        AND DATE(reviewed_at AT TIME ZONE 'UTC') = v_check
    ) THEN
      v_streak := v_streak + 1;
      v_check  := v_check - INTERVAL '1 day';
    ELSE
      EXIT;
    END IF;
  END LOOP;

  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM public.review_logs WHERE user_id = auth.uid()),
    (SELECT COUNT(*) FROM public.review_logs
      WHERE user_id = auth.uid()
        AND DATE(reviewed_at AT TIME ZONE 'UTC') = v_today),
    v_streak,
    (SELECT COUNT(*) FROM public.user_card_progress WHERE user_id = auth.uid() AND status = 'new'),
    (SELECT COUNT(*) FROM public.user_card_progress WHERE user_id = auth.uid() AND status = 'learning'),
    (SELECT COUNT(*) FROM public.user_card_progress WHERE user_id = auth.uid() AND status = 'review'),
    (SELECT COUNT(*) FROM public.user_card_progress WHERE user_id = auth.uid() AND status = 'relearning'),
    (SELECT COUNT(DISTINCT dc.deck_id)
       FROM public.user_card_progress ucp
       JOIN public.cards c ON c.card_id = ucp.card_id
       JOIN public.decks dc ON dc.deck_id = c.deck_id
      WHERE ucp.user_id = auth.uid()),
    (SELECT COUNT(*) FROM public.review_logs WHERE user_id = auth.uid() AND rating = 0),
    (SELECT COUNT(*) FROM public.review_logs WHERE user_id = auth.uid() AND rating = 1),
    (SELECT COUNT(*) FROM public.review_logs WHERE user_id = auth.uid() AND rating = 2),
    (SELECT COUNT(*) FROM public.review_logs WHERE user_id = auth.uid() AND rating = 3);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_stats() TO authenticated;

-- Word / card study stats (was missing — UI always showed 0).
DROP FUNCTION IF EXISTS public.get_my_word_stats();
CREATE OR REPLACE FUNCTION public.get_my_word_stats()
RETURNS TABLE(
  cards_total        BIGINT,
  cards_not_started  BIGINT,
  cards_in_progress  BIGINT,
  cards_graduated    BIGINT,
  ease_easy          BIGINT,
  ease_medium        BIGINT,
  ease_hard          BIGINT,
  words_today        BIGINT,
  words_month        BIGINT,
  words_alltime      BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH my_decks AS (
    SELECT d.deck_id FROM public.decks d WHERE d.creator_id = auth.uid()
    UNION
    SELECT dc.deck_id FROM public.deck_collaborators dc
    WHERE dc.user_id = auth.uid() AND dc.status = 'accepted'
  ),
  my_cards AS (
    SELECT c.card_id FROM public.cards c
    WHERE c.deck_id IN (SELECT deck_id FROM my_decks)
  ),
  progress AS (
    SELECT ucp.*
    FROM public.user_card_progress ucp
    WHERE ucp.user_id = auth.uid()
      AND ucp.card_id IN (SELECT card_id FROM my_cards)
  ),
  latest_rating AS (
    SELECT DISTINCT ON (rl.card_id)
      rl.card_id,
      rl.rating
    FROM public.review_logs rl
    WHERE rl.user_id = auth.uid()
      AND rl.card_id IN (SELECT card_id FROM my_cards)
    ORDER BY rl.card_id, rl.reviewed_at DESC
  )
  SELECT
    (SELECT COUNT(*)::BIGINT FROM my_cards),
    (SELECT COUNT(*)::BIGINT
       FROM my_cards mc
       LEFT JOIN progress p ON p.card_id = mc.card_id
      WHERE COALESCE(p.status, 'new') = 'new'),
    (SELECT COUNT(*)::BIGINT FROM progress WHERE status IN ('learning', 'relearning')),
    (SELECT COUNT(*)::BIGINT FROM progress WHERE status = 'review'),
    (SELECT COUNT(*)::BIGINT FROM latest_rating WHERE rating = 3),
    (SELECT COUNT(*)::BIGINT FROM latest_rating WHERE rating = 2),
    (SELECT COUNT(*)::BIGINT FROM latest_rating WHERE rating IN (0, 1)),
    (SELECT COUNT(DISTINCT card_id)::BIGINT FROM public.review_logs
      WHERE user_id = auth.uid()
        AND DATE(reviewed_at AT TIME ZONE 'UTC') = CURRENT_DATE),
    (SELECT COUNT(DISTINCT card_id)::BIGINT FROM public.review_logs
      WHERE user_id = auth.uid()
        AND reviewed_at >= CURRENT_DATE - INTERVAL '29 days'),
    (SELECT COUNT(DISTINCT card_id)::BIGINT FROM public.review_logs
      WHERE user_id = auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.get_my_word_stats() TO authenticated;
