-- ═══════════════════════════════════════════════════════════════
-- Statistics Module
-- ═══════════════════════════════════════════════════════════════

-- 1. review_logs: зберігає кожен окремий огляд картки
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.review_logs (
  id           UUID        NOT NULL DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  card_id      UUID        NOT NULL REFERENCES public.cards(card_id) ON DELETE CASCADE,
  deck_id      UUID        NOT NULL REFERENCES public.decks(deck_id) ON DELETE CASCADE,
  rating       SMALLINT    NOT NULL CHECK (rating BETWEEN 0 AND 3),
  reviewed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT review_logs_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS review_logs_user_date_idx
  ON public.review_logs (user_id, reviewed_at DESC);

CREATE INDEX IF NOT EXISTS review_logs_deck_idx
  ON public.review_logs (user_id, deck_id);

-- RLS
ALTER TABLE public.review_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS review_logs_select ON public.review_logs;
CREATE POLICY review_logs_select
  ON public.review_logs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS review_logs_insert ON public.review_logs;
CREATE POLICY review_logs_insert
  ON public.review_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());


-- ═══════════════════════════════════════════════════════════════
-- 2. get_my_stats() — загальна статистика поточного користувача
-- ═══════════════════════════════════════════════════════════════
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
  total_decks      BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_streak    INT := 0;
  v_check     DATE;
  v_today     DATE := CURRENT_DATE;
BEGIN
  -- Рахуємо стрік: кількість послідовних днів з оглядами
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
    (SELECT COUNT(*)   FROM public.review_logs     WHERE user_id = auth.uid())                                         AS total_reviews,
    (SELECT COUNT(*)   FROM public.review_logs     WHERE user_id = auth.uid()
                                                     AND DATE(reviewed_at AT TIME ZONE 'UTC') = v_today)               AS reviews_today,
    v_streak                                                                                                            AS streak_days,
    (SELECT COUNT(*)   FROM public.user_card_progress WHERE user_id = auth.uid() AND status = 'new')                   AS cards_new,
    (SELECT COUNT(*)   FROM public.user_card_progress WHERE user_id = auth.uid() AND status = 'learning')              AS cards_learning,
    (SELECT COUNT(*)   FROM public.user_card_progress WHERE user_id = auth.uid() AND status = 'review')                AS cards_review,
    (SELECT COUNT(*)   FROM public.user_card_progress WHERE user_id = auth.uid() AND status = 'relearning')            AS cards_relearning,
    (SELECT COUNT(DISTINCT dc.deck_id)
       FROM public.user_card_progress ucp
       JOIN public.cards c ON c.card_id = ucp.card_id
       JOIN public.decks dc ON dc.deck_id = c.deck_id
      WHERE ucp.user_id = auth.uid())                                                                                   AS total_decks;
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- 3. get_review_activity(days) — огляди за останні N днів
-- ═══════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.get_review_activity(INT);
CREATE OR REPLACE FUNCTION public.get_review_activity(p_days INT DEFAULT 30)
RETURNS TABLE(
  review_date  DATE,
  count        BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH date_series AS (
    SELECT generate_series(
      CURRENT_DATE - (p_days - 1) * INTERVAL '1 day',
      CURRENT_DATE,
      INTERVAL '1 day'
    )::DATE AS review_date
  ),
  daily AS (
    SELECT DATE(reviewed_at AT TIME ZONE 'UTC') AS review_date,
           COUNT(*) AS cnt
    FROM public.review_logs
    WHERE user_id = auth.uid()
      AND reviewed_at >= CURRENT_DATE - (p_days - 1) * INTERVAL '1 day'
    GROUP BY DATE(reviewed_at AT TIME ZONE 'UTC')
  )
  SELECT ds.review_date, COALESCE(d.cnt, 0) AS count
  FROM date_series ds
  LEFT JOIN daily d ON d.review_date = ds.review_date
  ORDER BY ds.review_date;
$$;


-- ═══════════════════════════════════════════════════════════════
-- 4. get_my_deck_stats() — прогрес по кожній дошці
-- ═══════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.get_my_deck_stats();
CREATE OR REPLACE FUNCTION public.get_my_deck_stats()
RETURNS TABLE(
  deck_id          UUID,
  deck_title       TEXT,
  cover_image_url  TEXT,
  total_cards      BIGINT,
  cards_new        BIGINT,
  cards_learning   BIGINT,
  cards_review     BIGINT,
  cards_relearning BIGINT,
  reviews_total    BIGINT,
  last_studied     TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.deck_id,
    d.title                                                  AS deck_title,
    d.cover_image_url,
    COUNT(DISTINCT c.card_id)                                AS total_cards,
    COUNT(DISTINCT CASE WHEN ucp.status = 'new'        THEN ucp.card_id END) AS cards_new,
    COUNT(DISTINCT CASE WHEN ucp.status = 'learning'   THEN ucp.card_id END) AS cards_learning,
    COUNT(DISTINCT CASE WHEN ucp.status = 'review'     THEN ucp.card_id END) AS cards_review,
    COUNT(DISTINCT CASE WHEN ucp.status = 'relearning' THEN ucp.card_id END) AS cards_relearning,
    COUNT(DISTINCT rl.id)                                    AS reviews_total,
    MAX(rl.reviewed_at)                                      AS last_studied
  FROM public.decks d
  JOIN public.cards c ON c.deck_id = d.deck_id
  LEFT JOIN public.user_card_progress ucp
         ON ucp.card_id = c.card_id AND ucp.user_id = auth.uid()
  LEFT JOIN public.review_logs rl
         ON rl.deck_id = d.deck_id AND rl.user_id = auth.uid()
  WHERE d.creator_id = auth.uid()
     OR EXISTS (
       SELECT 1 FROM public.deck_collaborators dc
       WHERE dc.deck_id = d.deck_id
         AND dc.user_id = auth.uid()
         AND dc.status  = 'accepted'
     )
  GROUP BY d.deck_id, d.title, d.cover_image_url
  ORDER BY last_studied DESC NULLS LAST;
$$;
