import { describe, expect, it } from 'vitest';
import { paginate, toPlainText, wrapLine } from './paginate';

// 10 px per character keeps the expectations readable.
const mono = (s: string) => s.length * 10;

describe('wrapLine', () => {
  it('wraps on word boundaries', () => {
    expect(wrapLine('the quick brown fox', 100, mono)).toEqual(['the quick', 'brown fox']);
  });

  it('hard-breaks words wider than the line', () => {
    expect(wrapLine('abcdefghijkl', 50, mono)).toEqual(['abcde', 'fghij', 'kl']);
  });

  it('keeps empty paragraphs as blank lines', () => {
    expect(wrapLine('', 100, mono)).toEqual(['']);
  });
});

describe('paginate', () => {
  it('splits lines into pages', () => {
    const text = 'one\ntwo\nthree\nfour\nfive';
    expect(paginate(text, 100, 2, mono)).toEqual(['one\ntwo', 'three\nfour', 'five']);
  });

  it('does not start a page with a blank line', () => {
    expect(paginate('a\nb\n\nc', 100, 2, mono)).toEqual(['a\nb', 'c']);
  });

  it('always returns at least one page', () => {
    expect(paginate('', 100, 3, mono)).toEqual(['']);
  });
});

describe('toPlainText', () => {
  it('strips common Markdown', () => {
    expect(toPlainText('## Title\n**bold** and *it* `code` [link](http://x)\n* item')).toBe(
      'Title\nbold and it code link\n- item',
    );
  });
});
