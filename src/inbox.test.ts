import { describe, expect, it } from 'vitest';
import { parseKind } from './inbox';

describe('parseKind', () => {
  it('defaults to ask', () => {
    expect(parseKind(undefined)).toBe('ask');
    expect(parseKind('')).toBe('ask');
    expect(parseKind('whatever')).toBe('ask');
  });

  it('recognises new and show titles', () => {
    expect(parseKind('New')).toBe('new');
    expect(parseKind(' show ')).toBe('show');
    expect(parseKind('display')).toBe('show');
  });
});
