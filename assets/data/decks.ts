export interface Deck {
  deck_id: string;       // UUID from DB
  creator_id: string;    // UUID (users.user_id)
  title: string;
  description: string | null;
  cover_image_url: string | null;
  is_public: boolean;
  original_deck_id: string | null;
  config_id: string | null;
  /** Optional per-deck daily study limits: `new_cards_per_day`, `cards_per_day`. */
  srs_overrides?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// Початково масив порожній – колоди приходять з бекенду / створюються користувачем
export const decks: Deck[] = [];