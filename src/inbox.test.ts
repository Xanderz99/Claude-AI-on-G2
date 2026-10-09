import { describe, expect, it, vi } from 'vitest';
import { eventText, parseKind } from './inbox';

describe('parseKind', () => {
  it('treats untitled messages as answers', () => {
    expect(parseKind(undefined)).toBe('answer');
    expect(parseKind('')).toBe('answer');
    expect(parseKind('whatever')).toBe('answer');
  });

  it('recognises question and clear titles', () => {
    expect(parseKind('Question')).toBe('question');
    expect(parseKind(' clear ')).toBe('clear');
    expect(parseKind('new')).toBe('clear');
  });
});

describe('eventText', () => {
  it('uses the message body for short messages', async () => {
    const fetchFn = vi.fn();
    expect(await eventText({ id: '1', event: 'message', message: ' hi ' }, fetchFn)).toBe('hi');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('downloads long answers that ntfy stored as an attachment', async () => {
    const fetchFn = vi.fn(async () => new Response('a long answer'));
    const text = await eventText(
      {
        id: '2',
        event: 'message',
        message: 'You received a file: attachment.txt',
        attachment: { url: 'https://ntfy.sh/file/abc.txt', type: 'text/plain; charset=utf-8', size: 5000 },
      },
      fetchFn as unknown as typeof fetch,
    );
    expect(text).toBe('a long answer');
    expect(fetchFn).toHaveBeenCalledWith('https://ntfy.sh/file/abc.txt');
  });
});
