-- Card difficulty stats: use latest study rating per card (review_logs), not SRS ease_factor.
-- ease_factor defaults to 2.5 so almost every card was counted as "easy".

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
