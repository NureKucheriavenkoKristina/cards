import {
  basicCardSideHasContent,
  isClozeCoreContentValid,
  hasAnyBasicFormContent,
  hasAnyClozeFormContent,
  isCardFormValid,
  CardFormFields,
} from '../cardFormValidation';
import { emptyCardMediaForm } from '../cardMedia';

describe('cardFormValidation', () => {
  const mediaFormMock = emptyCardMediaForm();

  describe('basicCardSideHasContent', () => {
    it('returns true when text is present', () => {
      expect(basicCardSideHasContent('Hello', mediaFormMock, 'front')).toBe(true);
    });

    it('returns false when text is empty and no valid media', () => {
      expect(basicCardSideHasContent('  ', mediaFormMock, 'front')).toBe(false);
    });

    it('returns true when valid media URL is present on the side', () => {
      const mediaForm = emptyCardMediaForm();
      mediaForm.front.urls.image = 'https://example.com/image.png';
      expect(basicCardSideHasContent('', mediaForm, 'front')).toBe(true);
    });
  });

  describe('isClozeCoreContentValid', () => {
    it('returns true if hidden field is present', () => {
      expect(isClozeCoreContentValid({ before: '', gapFront: '', after: '', hidden: 'answer' })).toBe(true);
    });

    it('returns true if before field is present', () => {
      expect(isClozeCoreContentValid({ before: 'Hello', gapFront: '', after: '', hidden: '' })).toBe(true);
    });

    it('returns false if only gapFront or notes are present', () => {
      expect(isClozeCoreContentValid({ before: '', gapFront: 'gap', after: '', hidden: '' })).toBe(false);
    });
  });

  describe('hasAnyBasicFormContent', () => {
    it('returns true if front text is set', () => {
      const fields: CardFormFields = {
        frontText: 'Q',
        backText: '',
        notes: '',
        cloze: { before: '', gapFront: '', after: '', hidden: '' },
        mediaForm: emptyCardMediaForm(),
      };
      expect(hasAnyBasicFormContent(fields)).toBe(true);
    });

    it('returns false if all fields are empty', () => {
      const fields: CardFormFields = {
        frontText: '',
        backText: '',
        notes: '',
        cloze: { before: '', gapFront: '', after: '', hidden: '' },
        mediaForm: emptyCardMediaForm(),
      };
      expect(hasAnyBasicFormContent(fields)).toBe(false);
    });
  });

  describe('hasAnyClozeFormContent', () => {
    it('returns true if cloze fields are set', () => {
      const fields: CardFormFields = {
        frontText: '',
        backText: '',
        notes: '',
        cloze: { before: 'test', gapFront: '', after: '', hidden: '' },
        mediaForm: emptyCardMediaForm(),
      };
      expect(hasAnyClozeFormContent(fields)).toBe(true);
    });
  });

  describe('isCardFormValid', () => {
    it('validates a basic card with front and back text', () => {
      const fields: CardFormFields = {
        frontText: 'Front Text',
        backText: 'Back Text',
        notes: 'Notes',
        cloze: { before: '', gapFront: '', after: '', hidden: '' },
        mediaForm: emptyCardMediaForm(),
      };
      expect(isCardFormValid('basic', fields)).toBe(true);
    });

    it('rejects a basic card if front is missing', () => {
      const fields: CardFormFields = {
        frontText: '',
        backText: 'Back Text',
        notes: '',
        cloze: { before: '', gapFront: '', after: '', hidden: '' },
        mediaForm: emptyCardMediaForm(),
      };
      expect(isCardFormValid('basic', fields)).toBe(false);
    });

    it('validates cloze card with correct structure', () => {
      const fields: CardFormFields = {
        frontText: '',
        backText: '',
        notes: '',
        cloze: { before: 'This is a ', gapFront: 'gap', after: ' sentence', hidden: 'gap' },
        mediaForm: emptyCardMediaForm(),
      };
      expect(isCardFormValid('cloze', fields)).toBe(true);
    });

    it('rejects cloze card with invalid image media link format', () => {
      const mediaForm = emptyCardMediaForm();
      mediaForm.front.urls.image = 'invalid-url';
      const fields: CardFormFields = {
        frontText: '',
        backText: '',
        notes: '',
        cloze: { before: 'This is a ', gapFront: 'gap', after: ' sentence', hidden: 'gap' },
        mediaForm,
      };
      expect(isCardFormValid('cloze', fields)).toBe(false);
    });
  });
});
