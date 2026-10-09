/**
 * Receives messages from the iPhone Shortcut.
 *
 * The Shortcut runs the Claude app's "Ask Claude" action and then does an HTTP
 * POST of the response to `<ntfyServer>/<topic>`. This app keeps a Server-Sent
 * Events subscription open on the same topic. ntfy.sh is a free, open-source
 * pub/sub relay, so no server of your own is needed.
 *
 * The optional `Title` header says what the text is:
 *   (none) / "answer"  Claude's answer: shown on the glasses
 *   "question"         your question: shown in the header while Claude works
 *   "clear"            clear the glasses
 */
export type InboxKind = 'answer' | 'question' | 'clear';

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
  /** ntfy turns bodies over 4 KB into an attachment; long answers arrive this way. */
  attachment?: { url: string; type?: string; size?: number };
}

export function parseKind(title: string | undefined): InboxKind {
  const t = (title ?? '').trim().toLowerCase();
  if (t === 'question' || t === 'q' || t === 'ask') return 'question';
  if (t === 'clear' || t === 'new' || t === 'new chat') return 'clear';
  return 'answer';
}

/** Get the full text of an event, downloading it when ntfy stored it as an attachment. */
export async function eventText(data: NtfyEvent, fetchFn: typeof fetch = fetch): Promise<string> {
  const att = data.attachment;
  if (att?.url && (!att.type || att.type.startsWith('text/')) && (att.size ?? 0) < 256_000) {
    const res = await fetchFn(att.url);
    if (res.ok) return (await res.text()).trim();
  }
  return (data.message ?? '').trim();
}

export class Inbox {
  private source: EventSource | null = null;
  private seen = new Set<string>();
  private queue: Promise<void> = Promise.resolve();

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
      if (data.event !== 'message' || this.seen.has(data.id)) return;
      this.seen.add(data.id);
      // Keep messages in order even when one needs an attachment download.
      this.queue = this.queue.then(async () => {
        const text = await eventText(data).catch(() => (data.message ?? '').trim());
        const kind = parseKind(data.title);
        if (text || kind === 'clear') this.onMessage({ id: data.id, kind, text });
      });
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
