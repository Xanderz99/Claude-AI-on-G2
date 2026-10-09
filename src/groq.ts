import Groq, {
  APIConnectionError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  NotFoundError,
  RateLimitError,
  toFile,
} from 'groq-sdk';

/**
 * Groq's free tier (a free key from console.groq.com) gives fast Whisper
 * speech-to-text and open chat models. The key stays on this phone in the
 * Even app's storage and is only sent to api.groq.com.
 */

export const STT_MODEL = 'whisper-large-v3-turbo';

/** Shown before the live model list loads. Groq retires models often, so the list is fetched from the API. */
export const DEFAULT_CHAT_MODELS = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'];

export const GROQ_SYSTEM_PROMPT =
  'You answer questions through Even Realities G2 smart glasses. The answer is shown on a small ' +
  'monochrome heads-up display, about 9 short lines per page. Reply in plain text only: no Markdown, ' +
  'no tables, no emoji. Lead with the answer and keep it brief (usually under 80 words) unless the user asks for detail.';

export interface ChatTurn {
  question: string;
  answer: string;
}

function client(apiKey: string): Groq {
  return new Groq({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
}

/** Turn a WAV recording into text. */
export async function transcribe(apiKey: string, wav: Uint8Array): Promise<string> {
  const file = await toFile(wav, 'question.wav', { type: 'audio/wav' });
  const res = await client(apiKey).audio.transcriptions.create({
    file,
    model: STT_MODEL,
    response_format: 'json',
    temperature: 0,
  });
  return res.text.trim();
}

/** Chat models the key can use, for the Settings picker. Speech and safety models are left out. */
export async function listChatModels(apiKey: string): Promise<string[]> {
  const res = await client(apiKey).models.list();
  return res.data
    .map((m) => m.id)
    .filter((id) => !/whisper|guard|tts|playai|orpheus|safeguard/i.test(id))
    .sort();
}

export interface AnswerHandle {
  done: Promise<string>;
  cancel: () => void;
}

/** Stream an answer, calling onText with the full text so far. */
export function streamAnswer(
  apiKey: string,
  model: string,
  history: ChatTurn[],
  question: string,
  onText: (text: string) => void,
): AnswerHandle {
  const controller = new AbortController();
  const messages: Groq.Chat.ChatCompletionMessageParam[] = [{ role: 'system', content: GROQ_SYSTEM_PROMPT }];
  for (const turn of history) {
    messages.push({ role: 'user', content: turn.question }, { role: 'assistant', content: turn.answer });
  }
  messages.push({ role: 'user', content: question });

  const done = (async () => {
    const stream = await client(apiKey).chat.completions.create(
      {
        model,
        messages,
        stream: true,
        max_completion_tokens: 2048,
        // gpt-oss models think before answering; keep that short for a quick reply.
        ...(model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' as const } : {}),
      },
      { signal: controller.signal },
    );
    let text = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        text += delta;
        onText(text);
      }
    }
    return text.trim();
  })();

  return { done, cancel: () => controller.abort() };
}

/** A short error message that fits on the glasses. */
export function describeGroqError(err: unknown): string {
  if (err instanceof AuthenticationError) return 'Groq key not accepted. Check it in Settings.';
  if (err instanceof RateLimitError) return 'Groq free-tier limit reached. Try again in a minute.';
  if (err instanceof NotFoundError) return 'That Groq model is no longer available. Pick another in Settings.';
  if (err instanceof APIUserAbortError) return 'Stopped.';
  if (err instanceof APIConnectionError) return 'Could not reach Groq. Check your connection.';
  if (err instanceof APIError) return `Groq error ${err.status ?? ''}: ${err.message}`.trim();
  if (err instanceof Error && err.name === 'AbortError') return 'Stopped.';
  return err instanceof Error ? err.message : String(err);
}
