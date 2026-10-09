import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';

export interface Settings {
  /** ntfy topic the iPhone Shortcut publishes to. Acts as a shared secret, so keep it random. */
  topic: string;
  ntfyServer: string;
  /** Shortcut that the glasses run to transcribe a recording and ask Claude. */
  voiceShortcut: string;
  /** Start listening as soon as the app is opened from the glasses menu, like Even AI. */
  listenOnLaunch: boolean;
  /** Free key from console.groq.com. Enables fast in-app transcription and the Groq answer engine. */
  groqKey: string;
  /** Who answers: the Claude app through the Shortcut, or Groq directly (hands-free, phone can stay locked). */
  engine: Engine;
  groqModel: string;
}

export type Engine = 'claude' | 'groq';

export const DEFAULT_VOICE_SHORTCUT = 'G2 Voice to Claude';

export function randomTopic(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return 'g2-claude-' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

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
    const settings: Settings = {
      topic: saved.topic || randomTopic(),
      ntfyServer: saved.ntfyServer || import.meta.env.VITE_NTFY_SERVER || 'https://ntfy.sh',
      voiceShortcut: saved.voiceShortcut || DEFAULT_VOICE_SHORTCUT,
      listenOnLaunch: saved.listenOnLaunch ?? true,
      groqKey: saved.groqKey ?? '',
      engine: saved.engine === 'groq' ? 'groq' : 'claude',
      groqModel: saved.groqModel || 'openai/gpt-oss-20b',
    };
    if (settings.topic !== saved.topic) await this.save(settings);
    return settings;
  }

  async save(settings: Settings): Promise<void> {
    const raw = JSON.stringify(settings);
    if (this.bridge) await this.bridge.setLocalStorage(KEY, raw);
    else localStorage.setItem(KEY, raw);
  }
}
