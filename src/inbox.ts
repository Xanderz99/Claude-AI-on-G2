/**
 * Receives messages from the iPhone Shortcut.
 *
 * The Shortcut does an HTTP POST to `<ntfyServer>/<topic>` with the dictated
 * text as the body. This app keeps a Server-Sent Events subscription open on the
 * same topic. ntfy.sh is a free, open-source pub/sub relay, so no server of your
 * own is needed.
 *
 * The optional `Title` header picks what to do with the message:
 *   (none) / "ask"  ask Claude the text as a question (follow-ups keep context)
 *   "new"           start a new conversation, then ask
 *   "show"          show the text as-is on the glasses (no Claude call), e.g. the
 *                   output of the Claude app's own Shortcuts action
 */
export type InboxKind = 'ask' | 'new' | 'show';

export interface InboxMessage {
  id: string;
  kind: InboxKind;
  text: string;
}

export type InboxStatus = 'connecting' | 'connected' | 'error';

interface NtfyEvent {
  id: string;
  event: string;
  message?: string;
  title?: string;
}

export function parseKind(title: string | undefined): InboxKind {
  const t = (title ?? '').trim().toLowerCase();
  if (t === 'new' || t === 'new chat') return 'new';
  if (t === 'show' || t === 'display' || t === 'answer') return 'show';
  return 'ask';
}

export class Inbox {
  private source: EventSource | null = null;
  private seen = new Set<string>();

  constructor(
    private onMessage: (msg: InboxMessage) => void,
    private onStatus: (status: InboxStatus) => void,
  ) {}

  connect(server: string, topic: string): void {
    this.close();
    if (!topic) return;
    const url = `${server.replace(/\/+$/, '')}/${encodeURIComponent(topic)}/sse`;
    this.onStatus('connecting');
    const source = new EventSource(url);
    this.source = source;
    source.onopen = () => this.onStatus('connected');
    // EventSource reconnects on its own; just report the state.
    source.onerror = () => this.onStatus(source.readyState === EventSource.CLOSED ? 'error' : 'connecting');
    source.onmessage = (e) => {
      let data: NtfyEvent;
      try {
        data = JSON.parse(e.data);
      } catch {
        return;
      }
      if (data.event !== 'message' || !data.message || this.seen.has(data.id)) return;
      this.seen.add(data.id);
      this.onMessage({ id: data.id, kind: parseKind(data.title), text: data.message.trim() });
    };
  }

  close(): void {
    this.source?.close();
    this.source = null;
  }
}

/** Publish to the topic. Used by the phone UI's "Send test" button. */
export async function publish(server: string, topic: string, text: string, title?: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (title) headers['Title'] = title;
  const res = await fetch(`${server.replace(/\/+$/, '')}/${encodeURIComponent(topic)}`, {
    method: 'POST',
    body: text,
    headers,
  });
  if (!res.ok) throw new Error(`ntfy returned ${res.status}`);
}
