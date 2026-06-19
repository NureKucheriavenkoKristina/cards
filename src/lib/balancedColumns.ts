import type { Card } from "@/assets/data/cards";
import { getCardMediaForSide } from "@/src/lib/cardMedia";
import {
  getClozePartsFromCard,
  isClozeLearnable,
  normalizeCardType,
} from "@/src/lib/cardModel";

export type ColumnEntry<T> = { item: T; index: number };

/** Simple alternating column distribution: odd items go left, even items go right.
 *  This keeps cards in natural visual order and avoids misalignment. */
export function splitIntoBalancedColumns<T>(
  items: T[],
  columnCount: number,
  estimateHeight: (item: T, index: number) => number,
): ColumnEntry<T>[][] {
  if (columnCount <= 1) {
    return [items.map((item, index) => ({ item, index }))];
  }
  const cols: ColumnEntry<T>[][] = Array.from({ length: columnCount }, () => []);
  items.forEach((item, index) => {
    const col = index % columnCount;
    cols[col].push({ item, index });
  });
  return cols;
}

const TILE_BASE = 108;
const LINE_H = 22;
const CHARS_PER_LINE = 42;
const DIVIDER = 36;

function textLines(text: string): number {
  const len = text.trim().length;
  if (len === 0) return 0;
  return Math.max(1, Math.ceil(len / CHARS_PER_LINE));
}

function mediaBlockHeight(type: string): number {
  if (type === "image") return 140;
  if (type === "video") return 168;
  return 80;
}

/** Rough height for balancing two columns in the deck card list. */
export function estimateCardTileHeight(card: Card): number {
  const ctype = normalizeCardType(card.card_type);
  const clozeParts = getClozePartsFromCard(card);
  const frontText =
    ctype === "cloze" && clozeParts && isClozeLearnable(clozeParts)
      ? `${clozeParts.before}${clozeParts.gapFront.trim() || "…"}${clozeParts.after}`
      : (card.front_text ?? "");
  const backText =
    ctype === "cloze" && clozeParts && isClozeLearnable(clozeParts)
      ? `${clozeParts.before}${clozeParts.hidden}${clozeParts.after}`
      : ctype === "cloze" && clozeParts?.hidden?.trim()
        ? clozeParts.hidden.trim()
        : (card.back_text?.trim() ?? "");

  const frontMedia = getCardMediaForSide(card, "front");
  const backMedia = getCardMediaForSide(card, "back");
  const showBack = backText.length > 0 || backMedia.length > 0;

  let h = TILE_BASE + textLines(frontText) * LINE_H;
  h += frontMedia.reduce((sum, m) => sum + mediaBlockHeight(m.media_type), 0);

  if (showBack) {
    h += DIVIDER + textLines(backText) * LINE_H;
    h += backMedia.reduce((sum, m) => sum + mediaBlockHeight(m.media_type), 0);
  }

  if (card.notes?.trim()) {
    h += 28 + textLines(card.notes) * 18;
  }

  return Math.max(120, h);
}
