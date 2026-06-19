import {
  parseImportFromCsvText,
  parseImportFromTxtText,
  inferImportKind,
} from '../deckImportParse';

describe('deckImportParse', () => {
  describe('inferImportKind', () => {
    it('infers from extension', () => {
      expect(inferImportKind('data.csv')).toBe('csv');
      expect(inferImportKind('DATA.CSV')).toBe('csv');
      expect(inferImportKind('notes.txt')).toBe('txt');
      expect(inferImportKind('deck.xlsx')).toBe('xlsx');
      expect(inferImportKind('old.xls')).toBe('xlsx');
    });

    it('infers from MIME if extension is unknown', () => {
      expect(inferImportKind('blob', 'text/csv')).toBe('csv');
      expect(inferImportKind('blob', 'application/csv')).toBe('csv');
      expect(inferImportKind('file', 'text/plain')).toBe('txt');
      expect(inferImportKind('file', 'application/vnd.ms-excel')).toBe('xlsx');
    });

    it('returns null if cannot infer', () => {
      expect(inferImportKind('unknown.dat', 'application/octet-stream')).toBeNull();
    });
  });

  describe('parseImportFromTxtText', () => {
    it('returns no_rows for empty string', () => {
      const res = parseImportFromTxtText('');
      expect(res.error).toBe('no_rows');
      expect(res.rows).toEqual([]);
    });

    it('parses tab-separated values', () => {
      const text = 'apple\tяблуко\tfruit\ncat\tкіт\tdomestic animal';
      const res = parseImportFromTxtText(text);
      expect(res.error).toBeUndefined();
      expect(res.rows).toHaveLength(2);
      expect(res.rows[0]).toEqual({ front: 'apple', back: 'яблуко', notes: 'fruit' });
      expect(res.rows[1]).toEqual({ front: 'cat', back: 'кіт', notes: 'domestic animal' });
    });

    it('parses pipe-separated values', () => {
      const text = 'dog | собака | animal\nmouse | миша | small';
      const res = parseImportFromTxtText(text);
      expect(res.error).toBeUndefined();
      expect(res.rows).toHaveLength(2);
      expect(res.rows[0]).toEqual({ front: 'dog', back: 'собака', notes: 'animal' });
      expect(res.rows[1]).toEqual({ front: 'mouse', back: 'миша', notes: 'small' });
    });

    it('parses double-space separated values', () => {
      const text = 'hello  привіт\nworld   світ';
      const res = parseImportFromTxtText(text);
      expect(res.error).toBeUndefined();
      expect(res.rows).toHaveLength(2);
      expect(res.rows[0]).toEqual({ front: 'hello', back: 'привіт' });
      expect(res.rows[1]).toEqual({ front: 'world', back: 'світ' });
    });
    
    it('skips empty or invalid rows', () => {
      const text = '\n  \nonlyone\nhello\tworld';
      const res = parseImportFromTxtText(text);
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0]).toEqual({ front: 'hello', back: 'world' });
    });
  });

  describe('parseImportFromCsvText', () => {
    it('parses simple comma separated values', () => {
      const text = 'apple,яблуко\ncat,кіт';
      const res = parseImportFromCsvText(text);
      expect(res.error).toBeUndefined();
      expect(res.rows).toHaveLength(2);
      expect(res.rows[0]).toEqual({ front: 'apple', back: 'яблуко' });
    });

    it('parses semicolon separated values', () => {
      const text = 'apple;яблуко;fruit\ncat;кіт;notes';
      const res = parseImportFromCsvText(text);
      expect(res.error).toBeUndefined();
      expect(res.rows).toHaveLength(2);
      expect(res.rows[0]).toEqual({ front: 'apple', back: 'яблуко', notes: 'fruit' });
      expect(res.rows[1]).toEqual({ front: 'cat', back: 'кіт', notes: 'notes' });
    });

    it('handles quoted fields with delimiters inside', () => {
      const text = '"apple, red",яблуко\n"cat",кіт';
      const res = parseImportFromCsvText(text);
      expect(res.rows[0]).toEqual({ front: 'apple, red', back: 'яблуко' });
    });

    it('detects explicit header row and maps columns', () => {
      const text = 'Notes,Front,Back\nsome note,apple,яблуко';
      const res = parseImportFromCsvText(text);
      expect(res.error).toBeUndefined();
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0]).toEqual({ front: 'apple', back: 'яблуко', notes: 'some note' });
    });

    it('skips implicit header row if it looks like one', () => {
      const text = 'English,Ukrainian\napple,яблуко\ncat,кіт';
      const res = parseImportFromCsvText(text);
      expect(res.error).toBeUndefined();
      expect(res.rows).toHaveLength(2);
      expect(res.rows[0]).toEqual({ front: 'apple', back: 'яблуко' });
      expect(res.rows[1]).toEqual({ front: 'cat', back: 'кіт' });
    });

    it('returns invalid_format if too many columns and no header map', () => {
      const text = 'a,b,c,d,e\n1,2,3,4,5';
      const res = parseImportFromCsvText(text);
      expect(res.error).toBe('invalid_format');
      expect(res.rows).toEqual([]);
    });
  });
});
