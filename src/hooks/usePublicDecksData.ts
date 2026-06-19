import { useCallback, useState } from "react";

import { Deck } from "@/assets/data/decks";
import { useLanguage } from "@/src/contexts/LanguageContext";
import { supabase } from "@/src/lib/supabase";

export function usePublicDecksData(excludeCreatorId: string | undefined) {
  const { t } = useLanguage();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [cardCounts, setCardCounts] = useState<Record<string, number>>({});
  const [ratingByDeckId, setRatingByDeckId] = useState<Record<string, number>>({});
  const [ratingCountByDeckId, setRatingCountByDeckId] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDecks = useCallback(async () => {
    setLoading(true);
    setError(null);

    let decksQuery = supabase
      .from("decks")
      .select("*")
      .eq("is_public", true)
      .order("created_at", { ascending: false });

    if (excludeCreatorId) {
      decksQuery = decksQuery.neq("creator_id", excludeCreatorId);
    }

    const { data: decksData, error: decksError } = await decksQuery;

    if (decksError) {
      setError(t("failedToLoadData"));
      setDecks([]);
      setLoading(false);
      return;
    }

    const deckList = (decksData ?? []) as Deck[];
    setDecks(deckList);

    if (deckList.length === 0) {
      setCardCounts({});
      setRatingByDeckId({});
      setRatingCountByDeckId({});
      setLoading(false);
      return;
    }

    const deckIds = deckList.map((d) => d.deck_id);
    const { data: cardsData } = await supabase
      .from("cards")
      .select("deck_id")
      .in("deck_id", deckIds);

    const counts: Record<string, number> = {};
    (cardsData ?? []).forEach((c) => {
      const did = c.deck_id as string;
      counts[did] = (counts[did] ?? 0) + 1;
    });
    setCardCounts(counts);

    const { data: ratingsData, error: ratingsError } = await supabase
      .from("pack_ratings")
      .select("deck_id, rating")
      .in("deck_id", deckIds);

    if (!ratingsError && ratingsData) {
      const sumByDeck: Record<string, number> = {};
      const countByDeck: Record<string, number> = {};

      for (const r of ratingsData) {
        const did = r.deck_id as string;
        const rating = r.rating as number;
        sumByDeck[did] = (sumByDeck[did] ?? 0) + rating;
        countByDeck[did] = (countByDeck[did] ?? 0) + 1;
      }

      const avgByDeck: Record<string, number> = {};
      for (const did of Object.keys(countByDeck)) {
        avgByDeck[did] = sumByDeck[did] / countByDeck[did];
      }

      setRatingByDeckId(avgByDeck);
      setRatingCountByDeckId(countByDeck);
    } else {
      setRatingByDeckId({});
      setRatingCountByDeckId({});
    }
    setLoading(false);
  }, [excludeCreatorId, t]);

  return {
    decks,
    cardCounts,
    ratingByDeckId,
    ratingCountByDeckId,
    loading,
    error,
    reload: loadDecks,
  };
}
