import {
  getCardSearchableText,
  matchesCardFilter,
  sortDeckCards,
  fetchProgressMapForCardIds,
  queryDeckCards,
  hasActiveDeckCardQuery,
} from '../deckCardListQuery';
import { supabase } from '@/src/lib/supabase';
import type { Card } from '@/assets/data/cards';

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

describe('deckCardListQuery', () => {
  const mockCard: Card = {
    card_id: '1',
    deck_id: 'd1',
    front_text: 'apple',
    back_text: 'яблуко',
    notes: 'fruit',
    card_type: 'standard',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
  };

  describe('getCardSearchableText', () => {
    it('returns combined text lowercased', () => {
      const text = getCardSearchableText({
        ...mockCard,
        front_text: 'Apple',
        back_text: 'ЯБЛУКО',
        notes: 'Fruit',
      });
      expect(text).toBe('apple яблуко fruit');
    });

    it('includes cloze parts if card is cloze', () => {
      const text = getCardSearchableText({
        ...mockCard,
        card_type: 'cloze',
        front_text: 'I like {{c1::apple::fruit}} today.',
      });
      expect(text).toContain('i like');
      expect(text).toContain('apple');
      expect(text).toContain('fruit');
      expect(text).toContain('today.');
    });
  });

  describe('matchesCardFilter', () => {
    const progressMap = new Map();
    const now = new Date('2023-01-01T12:00:00Z');

    it('returns true for "all"', () => {
      expect(matchesCardFilter(mockCard, 'all', progressMap, 4, now)).toBe(true);
    });

    it('filters "standard"', () => {
      expect(matchesCardFilter(mockCard, 'standard', progressMap, 4, now)).toBe(true);
      expect(matchesCardFilter({ ...mockCard, card_type: 'cloze' }, 'standard', progressMap, 4, now)).toBe(false);
    });

    it('filters "cloze"', () => {
      expect(matchesCardFilter({ ...mockCard, card_type: 'cloze' }, 'cloze', progressMap, 4, now)).toBe(true);
      expect(matchesCardFilter(mockCard, 'cloze', progressMap, 4, now)).toBe(false);
    });

    it('filters "new" cards', () => {
      expect(matchesCardFilter(mockCard, 'new', progressMap, 4, now)).toBe(true); // no progress
      
      const map = new Map();
      map.set('1', { status: 'new' });
      expect(matchesCardFilter(mockCard, 'new', map, 4, now)).toBe(true);
      
      map.set('1', { status: 'learning' });
      expect(matchesCardFilter(mockCard, 'new', map, 4, now)).toBe(false);
    });

    it('filters "dueToday" cards', () => {
      expect(matchesCardFilter(mockCard, 'dueToday', progressMap, 4, now)).toBe(true); // new cards are due

      const map = new Map();
      map.set('1', { due_date: '2023-01-01T10:00:00Z' }); // past due
      expect(matchesCardFilter(mockCard, 'dueToday', map, 4, now)).toBe(true);

      map.set('1', { due_date: '2023-01-02T10:00:00Z' }); // future
      expect(matchesCardFilter(mockCard, 'dueToday', map, 4, now)).toBe(false);
    });
  });

  describe('sortDeckCards', () => {
    const cards: Card[] = [
      { ...mockCard, card_id: '1', front_text: 'Zebra', created_at: '2023-01-03T00:00:00Z', updated_at: '2023-01-04T00:00:00Z' },
      { ...mockCard, card_id: '2', front_text: 'Apple', created_at: '2023-01-01T00:00:00Z', updated_at: '2023-01-02T00:00:00Z' },
      { ...mockCard, card_id: '3', front_text: 'Mango', created_at: '2023-01-02T00:00:00Z', updated_at: '2023-01-03T00:00:00Z' },
    ];

    it('sorts newest', () => {
      const res = sortDeckCards(cards, 'newest');
      expect(res.map(c => c.card_id)).toEqual(['1', '3', '2']);
    });

    it('sorts oldest', () => {
      const res = sortDeckCards(cards, 'oldest');
      expect(res.map(c => c.card_id)).toEqual(['2', '3', '1']);
    });

    it('sorts frontAsc', () => {
      const res = sortDeckCards(cards, 'frontAsc');
      expect(res.map(c => c.card_id)).toEqual(['2', '3', '1']);
    });

    it('sorts frontDesc', () => {
      const res = sortDeckCards(cards, 'frontDesc');
      expect(res.map(c => c.card_id)).toEqual(['1', '3', '2']);
    });

    it('sorts updatedDesc', () => {
      const res = sortDeckCards(cards, 'updatedDesc');
      expect(res.map(c => c.card_id)).toEqual(['1', '3', '2']);
    });
  });

  describe('fetchProgressMapForCardIds', () => {
    it('returns empty map if no ids', async () => {
      const map = await fetchProgressMapForCardIds('user1', []);
      expect(map.size).toBe(0);
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('fetches and maps progress', async () => {
      const mockIn = jest.fn().mockResolvedValue({ data: [{ card_id: 'c1', status: 'learning' }] });
      const mockEq = jest.fn().mockReturnValue({ in: mockIn });
      const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
      (supabase.from as jest.Mock).mockReturnValue({ select: mockSelect });

      const map = await fetchProgressMapForCardIds('user1', ['c1']);
      expect(map.get('c1')).toEqual({ card_id: 'c1', status: 'learning' });
    });
  });

  describe('queryDeckCards', () => {
    const cards: Card[] = [
      { ...mockCard, card_id: '1', front_text: 'Apple is red', created_at: '2023-01-01T00:00:00Z' },
      { ...mockCard, card_id: '2', front_text: 'Banana is yellow', created_at: '2023-01-02T00:00:00Z', card_type: 'cloze' },
      { ...mockCard, card_id: '3', front_text: 'Cherry', created_at: '2023-01-03T00:00:00Z' },
    ];

    it('applies search, filter, and sort combined', () => {
      const res = queryDeckCards(cards, {
        search: 'is',
        filter: 'standard',
        sort: 'newest',
        progressMap: new Map(),
        srsDayStartHour: 4,
        now: new Date(),
      });
      
      // Should match 'is', only standard (not cloze), newest first
      // Apple is red -> matches search, is standard
      // Banana is yellow -> matches search, but is cloze
      // Cherry -> no 'is'
      expect(res).toHaveLength(1);
      expect(res[0].card_id).toBe('1');
    });
  });
  
  describe('hasActiveDeckCardQuery', () => {
    it('returns true if any filter active', () => {
      expect(hasActiveDeckCardQuery('a', 'all', 'newest')).toBe(true);
      expect(hasActiveDeckCardQuery('', 'standard', 'newest')).toBe(true);
      expect(hasActiveDeckCardQuery('', 'all', 'oldest')).toBe(true);
    });
    
    it('returns false if defaults', () => {
      expect(hasActiveDeckCardQuery('', 'all', 'newest')).toBe(false);
    });
  });
});
