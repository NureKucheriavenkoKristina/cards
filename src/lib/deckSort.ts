import { Deck } from '@/assets/data/decks';

/** Ukrainian collation for deck titles (UA letters and mixed Latin/UA). */
export function compareDeckTitles(a: Deck, b: Deck): number {
  return (a.title ?? '').localeCompare(b.title ?? '', 'uk', { sensitivity: 'base' });
}
