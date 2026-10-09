import Anthropic from '@anthropic-ai/sdk';
import type { Settings } from './settings';

export interface Turn {
  question: string;
  answer: string;
}

export interface AskCallbacks {
  onText: (fullTextSoFar: string) => void;
}

export interface AskHandle {
  done: Promise<string>;
  cancel: () => void;
}

/**
 * Streams one answer from Claude. Previous turns are sent as plain text so
 * follow-up questions ("and what about tomorrow?") work.
 */
export function askClaude(settings: Settings, history: Turn[], question: string, cb: AskCallbacks): AskHandle {
  // The key lives only on this phone, inside the Even App's storage, and is sent
  // straight to api.anthropic.com. That is why browser access is allowed here.
  const client = new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true });

  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  for (const turn of history.slice(-settings.historyTurns)) {
    messages.push({ role: 'user', content: turn.question });
    messages.push({ role: 'assistant', content: turn.answer });
  }
  messages.push({ role: 'user', content: question });

  const stream = client.beta.messages.stream({
    model: settings.model,
    max_tokens: 16000,
    system: settings.systemPrompt,
    output_config: { effort: settings.effort },
    // If a safety classifier declines, let the API retry on its recommended fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages,
  });

  let text = '';
  stream.on('text', (delta) => {
    text += delta;
    cb.onText(text);
  });

  const done = stream.finalMessage().then((message) => {
    if (message.stop_reason === 'refusal') {
      throw new Error('Claude declined to answer this one.');
    }
    return text.trim();
  });

  return { done, cancel: () => stream.abort() };
}

/** Turn an API/network error into a short message that fits on the glasses. */
export function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'Invalid API key. Check Settings in the Even app.';
  if (err instanceof Anthropic.PermissionDeniedError) return 'This API key cannot use that model.';
  if (err instanceof Anthropic.NotFoundError) return 'Model not found. Pick another model in Settings.';
  if (err instanceof Anthropic.RateLimitError) return 'Rate limited. Try again in a moment.';
  if (err instanceof Anthropic.APIUserAbortError) return 'Cancelled.';
  if (err instanceof Anthropic.APIConnectionError) return 'No connection to Claude. Check your network.';
  if (err instanceof Anthropic.APIError) return `Claude API error ${err.status ?? ''}: ${err.message}`.trim();
  if (err instanceof Error) return err.message;
  return String(err);
}
