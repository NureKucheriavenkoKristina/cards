import { generateCardImageUrl } from '../gemini';
import { geminiGenerateText } from '../geminiRequest';
import { persistRemoteImageToStorage } from '../uploadRemoteImage';

jest.mock('../geminiRequest', () => ({
  geminiGenerateText: jest.fn(),
}));

jest.mock('../uploadRemoteImage', () => ({
  persistRemoteImageToStorage: jest.fn(),
  buildDeckCoverStoragePath: jest.fn().mockReturnValue('mock-cover-path'),
  buildCardImageStoragePath: jest.fn().mockReturnValue('mock-card-path'),
}));

describe('gemini', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateCardImageUrl', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      global.fetch = jest.fn();
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('returns no_pixabay_key if key is missing', async () => {
      delete process.env.EXPO_PUBLIC_PIXABAY_API_KEY;
      const res = await generateCardImageUrl('apple', 'Fruits');
      expect(res).toEqual({ ok: false, reason: 'no_pixabay_key' });
    });

    it('returns no_match if front text is empty', async () => {
      process.env.EXPO_PUBLIC_PIXABAY_API_KEY = 'test_key';
      const res = await generateCardImageUrl('   ', 'Fruits');
      expect(res).toEqual({ ok: false, reason: 'no_match' });
    });

    it('fetches image successfully from pixabay using english hint', async () => {
      process.env.EXPO_PUBLIC_PIXABAY_API_KEY = 'test_key';
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          hits: [{ tags: 'apple, fruit, red', webformatURL: 'https://pixabay.com/apple.jpg' }]
        })
      });

      // Provide english hint in parens
      const res = await generateCardImageUrl('яблуко (apple)', 'Fruits');
      expect(global.fetch).toHaveBeenCalled();
      expect(res).toEqual({ ok: true, url: 'https://pixabay.com/apple.jpg' });
    });

    it('calls gemini to translate search term if non-latin and no hint', async () => {
      process.env.EXPO_PUBLIC_PIXABAY_API_KEY = 'test_key';
      
      (geminiGenerateText as jest.Mock).mockResolvedValue({ ok: true, text: 'apple' });
      
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          hits: [{ tags: 'apple, fruit', webformatURL: 'https://pixabay.com/apple2.jpg' }]
        })
      });

      const res = await generateCardImageUrl('яблуко', 'Fruits');
      expect(geminiGenerateText).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalled();
      expect(res).toEqual({ ok: true, url: 'https://pixabay.com/apple2.jpg' });
    });

    it('persists image if persist context is provided', async () => {
      process.env.EXPO_PUBLIC_PIXABAY_API_KEY = 'test_key';
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          hits: [{ tags: 'apple, fruit', webformatURL: 'https://pixabay.com/apple.jpg' }]
        })
      });

      (persistRemoteImageToStorage as jest.Mock).mockResolvedValue({
        ok: true,
        publicUrl: 'https://supabase.com/apple.jpg'
      });

      const persistCtx = { userId: 'u1', kind: 'card-image' as const, deckId: 'd1' };
      const res = await generateCardImageUrl('apple', 'Fruits', '', 'front', persistCtx);
      
      expect(persistRemoteImageToStorage).toHaveBeenCalledWith({
        remoteUrl: 'https://pixabay.com/apple.jpg',
        storagePath: 'mock-card-path'
      });
      expect(res).toEqual({ ok: true, url: 'https://supabase.com/apple.jpg' });
    });
  });
});
