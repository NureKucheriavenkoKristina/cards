import {
  getQuizAnswer,
  getQuizPrompt,
  cardHasQuizSides,
  generateQuizQuestions,
  buildQuizTitle,
  createDeckQuizFromSelection,
  QUIZ_MIN_CARDS,
} from '../deckQuiz';
import type { Card } from '@/assets/data/cards';

// Mock supabase since it's imported globally, but we already have a global mock in jest.setup.ts
import { supabase } from '@/src/lib/supabase';

describe('deckQuiz', () => {
  const tMock = (key: string) => key;

  const basicCardMock = (id: string, front: string, back: string): Card => ({
    card_id: id,
    deck_id: 'deck1',
    card_type: 'basic',
    front_text: front,
    back_text: back,
    notes: '',
    created_at: '',
    updated_at: '',
    card_media: [],
    created_by: 'user1',
  });

  const clozeCardMock = (id: string, before: string, gap: string, after: string, hidden: string): Card => ({
    card_id: id,
    deck_id: 'deck1',
    card_type: 'cloze',
    front_text: `${before}[[${hidden}]]${after}`,
    back_text: hidden,
    notes: '',
    created_at: '',
    updated_at: '',
    card_media: [],
    created_by: 'user1',
  });

  describe('getQuizAnswer & getQuizPrompt', () => {
    it('handles basic cards correctly', () => {
      const card = basicCardMock('1', 'Front Question', 'Back Answer');
      expect(getQuizPrompt(card)).toBe('Front Question');
      expect(getQuizAnswer(card)).toBe('Back Answer');
    });

    it('handles cloze cards correctly', () => {
      const card = clozeCardMock('2', 'React is ', 'cool', ' indeed', 'cool');
      // Cloze prompt should replace gap with gap marker "[…]"
      expect(getQuizPrompt(card)).toBe('React is […] indeed');
      expect(getQuizAnswer(card)).toBe('cool');
    });
  });

  describe('cardHasQuizSides', () => {
    it('returns true if prompt and answer are both valid strings', () => {
      const card = basicCardMock('1', 'Q', 'A');
      expect(cardHasQuizSides(card)).toBe(true);
    });

    it('returns false if front text is empty', () => {
      const card = basicCardMock('1', '   ', 'A');
      expect(cardHasQuizSides(card)).toBe(false);
    });
  });

  describe('generateQuizQuestions', () => {
    it('generates correct questions and options from card pool', () => {
      const cards = [
        basicCardMock('1', 'Q1', 'Ans1'),
        basicCardMock('2', 'Q2', 'Ans2'),
        basicCardMock('3', 'Q3', 'Ans3'),
        basicCardMock('4', 'Q4', 'Ans4'),
      ];

      const questions = generateQuizQuestions(cards);
      expect(questions).toHaveLength(4);

      const q1 = questions.find((q) => q.cardId === '1')!;
      expect(q1.prompt).toBe('Q1');
      expect(q1.correctAnswer).toBe('Ans1');
      expect(q1.options).toContain('Ans1');
      expect(q1.options.length).toBe(4); // 4 options generated since pool has enough alternatives
    });

    it('generates fewer options when the pool is small', () => {
      const cards = [
        basicCardMock('1', 'Q1', 'Ans1'),
        basicCardMock('2', 'Q2', 'Ans2'),
      ];

      const questions = generateQuizQuestions(cards);
      expect(questions).toHaveLength(2);

      const q1 = questions.find((q) => q.cardId === '1')!;
      expect(q1.options.length).toBe(2); // Only Ans1 and Ans2 are possible options
      expect(q1.options).toContain('Ans1');
      expect(q1.options).toContain('Ans2');
    });
  });

  describe('buildQuizTitle', () => {
    it('builds title for manual source', () => {
      const title = buildQuizTitle('manual', 5, (key) => `t:${key}`);
      expect(title).toBe('t:deckQuizTitleManual'); // replace logic is mocked to return key
    });

    it('builds title for preset sources', () => {
      const title = buildQuizTitle('preset_10', 10, (key) => `t:${key}`);
      expect(title).toBe('t:deckQuizTitlePreset');
    });
  });

  describe('createDeckQuizFromSelection', () => {
    it('fails if there are not enough cards selected', async () => {
      const allCards = [
        basicCardMock('1', 'Q1', 'Ans1'),
        basicCardMock('2', 'Q2', 'Ans2'),
      ];

      const result = await createDeckQuizFromSelection({
        deckId: 'deck1',
        userId: 'user1',
        source: 'manual',
        selectedCardIds: ['1', '2'],
        allCards,
        t: tMock,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorKey).toBe('deckQuizNeedMinCards');
      }
    });

    it('creates quiz session when cards count is sufficient', async () => {
      const allCards = [
        basicCardMock('1', 'Q1', 'Ans1'),
        basicCardMock('2', 'Q2', 'Ans2'),
        basicCardMock('3', 'Q3', 'Ans3'),
        basicCardMock('4', 'Q4', 'Ans4'),
      ];

      const result = await createDeckQuizFromSelection({
        deckId: 'deck1',
        userId: 'user1',
        source: 'manual',
        selectedCardIds: ['1', '2', '3', '4'],
        allCards,
        t: tMock,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.quiz.questions).toHaveLength(4);
        expect(result.quiz.source).toBe('manual');
      }
    });
  });
});
