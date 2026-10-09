import { describe, expect, it } from 'vitest';
import { AuthenticationError, RateLimitError } from 'groq-sdk';
import { describeGroqError } from './groq';

describe('describeGroqError', () => {
  it('explains common failures briefly', () => {
    expect(describeGroqError(new AuthenticationError(401, undefined, 'bad key', new Headers()))).toMatch(/key/);
    expect(describeGroqError(new RateLimitError(429, undefined, 'slow down', new Headers()))).toMatch(/limit/);
    expect(describeGroqError(new Error('boom'))).toBe('boom');
  });
});
