-- ═══════════════════════════════════════════════════════════════
-- Extra statistics RPCs:
--   get_review_forecast(p_days)      — cards due per day for the next N days
--   get_added_cards_activity(p_days) — new cards added per day in the last N days
-- ═══════════════════════════════════════════════════════════════

-- 1) Forecast of upcoming reviews based on user_card_progress.due_date
DROP FUNCTION IF EXISTS public.get_review_forecast(INT);
CREATE OR REPLACE FUNCTION public.get_review_forecast(p_days INT DEFAULT 30)
RETURNS TABLE(
  due_day  DATE,
  count    BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH date_series AS (
    SELECT generate_series(
      CURRENT_DATE,
      CURRENT_DATE + (p_days - 1) * INTERVAL '1 day',
      INTERVAL '1 day'
    )::DATE AS day
  ),
  buckets AS (
    SELECT
      CASE
        WHEN ucp.due_date IS NULL                 THEN CURRENT_DATE
        WHEN ucp.due_date < CURRENT_DATE          THEN CURRENT_DATE
        WHEN DATE(ucp.due_date AT TIME ZONE 'UTC')
             > CURRENT_DATE + (p_days - 1)        THEN NULL
        ELSE DATE(ucp.due_date AT TIME ZONE 'UTC')
      END AS bucket_day
    FROM public.user_card_progress ucp
    WHERE ucp.user_id = auth.uid()
  )
  SELECT ds.day                              AS due_day,
         COALESCE(COUNT(b.bucket_day), 0)    AS count
  FROM date_series ds
  LEFT JOIN buckets b ON b.bucket_day = ds.day
  GROUP BY ds.day
  ORDER BY ds.day;
$$;


-- 2) New cards added per day, last N days
DROP FUNCTION IF EXISTS public.get_added_cards_activity(INT);
CREATE OR REPLACE FUNCTION public.get_added_cards_activity(p_days INT DEFAULT 30)
RETURNS TABLE(
  added_day  DATE,
  count      BIGINT
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
    )::DATE AS day
  ),
  -- decks the user can add cards to: own decks + decks where user is an accepted collaborator
  my_decks AS (
    SELECT d.deck_id
    FROM public.decks d
    WHERE d.creator_id = auth.uid()
    UNION
    SELECT dc.deck_id
    FROM public.deck_collaborators dc
    WHERE dc.user_id = auth.uid()
      AND dc.status  = 'accepted'
  ),
  daily AS (
    SELECT DATE(c.created_at AT TIME ZONE 'UTC') AS day,
           COUNT(*) AS cnt
    FROM public.cards c
    WHERE c.deck_id IN (SELECT deck_id FROM my_decks)
      AND c.created_at >= CURRENT_DATE - (p_days - 1) * INTERVAL '1 day'
    GROUP BY 1
  )
  SELECT ds.day                          AS added_day,
         COALESCE(d.cnt, 0)              AS count
  FROM date_series ds
  LEFT JOIN daily d ON d.day = ds.day
  ORDER BY ds.day;
$$;
