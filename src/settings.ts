import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';

export type Effort = 'low' | 'medium' | 'high';

export interface Settings {
  apiKey: string;
  model: string;
  effort: Effort;
  /** ntfy topic the iPhone Shortcut publishes to. Acts as a shared secret, so keep it random. */
  topic: string;
  ntfyServer: string;
  systemPrompt: string;
  /** How many previous question/answer pairs to send for follow-ups. */
  historyTurns: number;
}

export const MODELS: { id: string; label: string }[] = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (smartest)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (balanced)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (fastest)' },
];

export const DEFAULT_SYSTEM_PROMPT =
  'You are Claude, answering through Even Realities G2 smart glasses. ' +
  'The answer is shown on a small monochrome heads-up display, about 9 short lines per page. ' +
  'Reply in plain text only: no Markdown, no tables, no emoji, no code blocks. ' +
  'Lead with the answer, keep it brief (usually under 80 words), and use short paragraphs. ' +
  'Only go longer when the user explicitly asks for detail.';

export function randomTopic(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return 'g2-claude-' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const DEFAULTS: Omit<Settings, 'topic'> = {
  apiKey: '',
  model: 'claude-opus-5-5',
  effort: 'low',
  ntfyServer: 'https://ntfy.sh',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  historyTurns: 4,
};

const KEY = 'claude-g2-settings';

/**
 * Persists settings in the Even App's storage when running inside it, and in
 * the browser's localStorage during development.
 */
export class SettingsStore {
  constructor(private bridge: EvenAppBridge | null) {}

  async load(): Promise<Settings> {
    let raw = '';
    try {
      raw = this.bridge ? await this.bridge.getLocalStorage(KEY) : (localStorage.getItem(KEY) ?? '');
    } catch {
      raw = '';
    }
    let saved: Partial<Settings> = {};
    try {
      saved = raw ? JSON.parse(raw) : {};
    } catch {
      saved = {};
    }
    const settings: Settings = { ...DEFAULTS, topic: '', ...saved };
    if (!settings.topic) {
      settings.topic = randomTopic();
      await this.save(settings);
    }
    return settings;
  }

  async save(settings: Settings): Promise<void> {
    const raw = JSON.stringify(settings);
    if (this.bridge) await this.bridge.setLocalStorage(KEY, raw);
    else localStorage.setItem(KEY, raw);
  }
}
