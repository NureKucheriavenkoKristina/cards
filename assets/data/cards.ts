/** Optional JSON from `cards.card_extra` — see `src/lib/cardModel.ts`. */
export type CardExtraJson = Record<string, unknown>;

export type CardMediaSide = "front" | "back";
export type CardMediaType = "image" | "audio" | "video";

export interface CardMedia {
  media_id: string;
  card_id: string;
  side: CardMediaSide;
  media_type: CardMediaType;
  url: string;
  position: number;
  created_at?: string;
  updated_at?: string;
}

export interface Card {
  card_id: string;   // UUID from DB
  deck_id: string;   // UUID (decks.deck_id)
  card_type: string | null;
  front_text: string;
  back_text: string;
  /** Normalized media rows from `card_media`. */
  card_media?: CardMedia[] | null;
  /** Reversible pair ids, cloze data, etc. */
  card_extra?: CardExtraJson | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Spaced repetition (SRS / SM-2)
  next_review_at?: string | null;
  interval_days?: number;
  ease_factor?: number;
  repetitions?: number;
  last_reviewed_at?: string | null;
}

// Початково масив порожній – картки приходять з бекенду / створюються користувачем
export const cards: Card[] = [];