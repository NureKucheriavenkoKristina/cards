import { renderHook, act } from '@testing-library/react';
import { usePublicDecksData } from '../../hooks/usePublicDecksData';
import { supabase } from '@/src/lib/supabase';
import { useLanguage } from '@/src/contexts/LanguageContext';

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock('@/src/contexts/LanguageContext', () => ({
  useLanguage: jest.fn(),
}));

describe('usePublicDecksData', () => {
  const mockT = jest.fn((key) => `translated_${key}`);

  beforeEach(() => {
    jest.clearAllMocks();
    (useLanguage as jest.Mock).mockReturnValue({ t: mockT });
  });

  const setupSupabaseMock = ({
    decksError = null,
    decksData = [],
    cardsData = [],
    ratingsError = null,
    ratingsData = [],
  }: any = {}) => {
    const mockOrder = jest.fn().mockResolvedValue({ data: decksData, error: decksError });
    const mockEq = jest.fn().mockReturnValue({ order: mockOrder, neq: mockOrder });
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq, in: jest.fn().mockResolvedValue({ data: cardsData }) });
    const mockFrom = jest.fn((table) => {
      if (table === 'decks') {
        return { select: mockSelect };
      }
      if (table === 'cards') {
        return { select: jest.fn().mockReturnValue({ in: jest.fn().mockResolvedValue({ data: cardsData }) }) };
      }
      if (table === 'pack_ratings') {
        return { select: jest.fn().mockReturnValue({ in: jest.fn().mockResolvedValue({ data: ratingsData, error: ratingsError }) }) };
      }
      return { select: jest.fn() };
    });

    (supabase.from as jest.Mock).mockImplementation(mockFrom);
    return { mockOrder, mockEq, mockSelect, mockFrom };
  };

  it('initializes with loading state', () => {
    setupSupabaseMock();
    const { result } = renderHook(() => usePublicDecksData(undefined));

    expect(result.current.loading).toBe(true);
    expect(result.current.decks).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('loads empty decks successfully', async () => {
    setupSupabaseMock({ decksData: [] });
    const { result } = renderHook(() => usePublicDecksData(undefined));

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.decks).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('handles error when loading decks', async () => {
    setupSupabaseMock({ decksError: new Error('Failed') });
    const { result } = renderHook(() => usePublicDecksData(undefined));

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.decks).toEqual([]);
    expect(result.current.error).toBe('translated_failedToLoadData');
  });

  it('loads decks, card counts, and ratings successfully', async () => {
    const mockDecks = [
      { deck_id: 'deck1', title: 'Deck 1' },
      { deck_id: 'deck2', title: 'Deck 2' },
    ];
    const mockCards = [
      { deck_id: 'deck1' },
      { deck_id: 'deck1' },
      { deck_id: 'deck2' },
    ];
    const mockRatings = [
      { deck_id: 'deck1', rating: 5 },
      { deck_id: 'deck1', rating: 3 },
      { deck_id: 'deck2', rating: 4 },
    ];

    setupSupabaseMock({
      decksData: mockDecks,
      cardsData: mockCards,
      ratingsData: mockRatings,
    });

    const { result } = renderHook(() => usePublicDecksData(undefined));

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.decks).toEqual(mockDecks);
    expect(result.current.cardCounts).toEqual({ deck1: 2, deck2: 1 });
    expect(result.current.ratingByDeckId).toEqual({ deck1: 4, deck2: 4 });
    expect(result.current.ratingCountByDeckId).toEqual({ deck1: 2, deck2: 1 });
  });

  it('handles ratings query error gracefully', async () => {
    const mockDecks = [{ deck_id: 'deck1', title: 'Deck 1' }];
    setupSupabaseMock({
      decksData: mockDecks,
      ratingsError: new Error('Ratings failed'),
    });

    const { result } = renderHook(() => usePublicDecksData(undefined));

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.decks).toEqual(mockDecks);
    expect(result.current.ratingByDeckId).toEqual({});
    expect(result.current.ratingCountByDeckId).toEqual({});
  });
});
