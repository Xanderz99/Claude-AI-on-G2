import { waitForEvenAppBridge, type EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { GlassesView, type GlassesAction } from './glasses';
import { toPlainText } from './paginate';
import { Inbox, publish, type InboxMessage, type InboxStatus } from './inbox';
import { SettingsStore, randomTopic, type Settings } from './settings';
import './style.css';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const READY_TEXT =
  'Ready. Run your "Ask Claude" Shortcut on your iPhone, or say "Hey Siri, Ask Claude on G2".\n\n' +
  'Tap or swipe: next page\nDouble-tap: clear';

/** An answer arriving within this long of a question is treated as its reply. */
const PENDING_MS = 5 * 60_000;

let settings: Settings;
let store: SettingsStore;
let glasses: GlassesView | null = null;
let pending: { question: string; at: number; answerEl: HTMLElement } | null = null;

/** Resolves to the Even App bridge, or null when running in a plain browser (dev preview). */
async function connectBridge(): Promise<EvenAppBridge | null> {
  const hasHost = () => typeof (window as any).flutter_inappwebview?.callHandler === 'function';
  // The WebView host can be injected slightly after the page starts.
  for (let i = 0; i < 20 && !hasHost(); i++) await new Promise((r) => setTimeout(r, 100));
  if (!hasHost()) return null;
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 8000));
  try {
    return await Promise.race([waitForEvenAppBridge(), timeout]);
  } catch {
    return null;
  }
}

// ---------- Phone UI ----------

function setPill(id: string, text: string, state: 'ok' | 'warn' | 'off') {
  const el = $(id);
  el.textContent = text;
  el.dataset.state = state;
}

function clearLog() {
  const empty = document.createElement('p');
  empty.className = 'muted';
  empty.textContent = 'Nothing yet. Run your Shortcut and the answers will show up here and on your glasses.';
  $('log').replaceChildren(empty);
}

function addLogEntry(question: string, answer: string): HTMLElement {
  const log = $('log');
  log.querySelector('.muted')?.remove();
  const item = document.createElement('div');
  item.className = 'turn';
  if (question) {
    const q = document.createElement('div');
    q.className = 'q';
    q.textContent = question;
    item.append(q);
  }
  const a = document.createElement('div');
  a.className = 'a';
  a.textContent = toPlainText(answer);
  item.append(a);
  log.append(item);
  item.scrollIntoView({ block: 'end' });
  return a;
}

function shortcutUrl() {
  return `${settings.ntfyServer.replace(/\/+$/, '')}/${settings.topic}`;
}

function fillSettingsForm() {
  $<HTMLInputElement>('topic').value = settings.topic;
  $<HTMLInputElement>('ntfyServer').value = settings.ntfyServer;
  $('shortcutUrl').textContent = shortcutUrl();
}

async function saveSettingsFromForm() {
  settings = {
    topic: $<HTMLInputElement>('topic').value.trim() || randomTopic(),
    ntfyServer: $<HTMLInputElement>('ntfyServer').value.trim() || 'https://ntfy.sh',
  };
  await store.save(settings);
  fillSettingsForm();
  inbox.connect(settings.ntfyServer, settings.topic);
  flash('Saved. Update the URL in your Shortcut.');
}

function flash(text: string) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  setTimeout(() => (el.hidden = true), 2200);
}

// ---------- Messages from the Shortcut ----------

function clearAll() {
  pending = null;
  glasses?.show('Claude', READY_TEXT);
  clearLog();
}

function onInboxMessage(msg: InboxMessage) {
  switch (msg.kind) {
    case 'clear':
      return clearAll();
    case 'question': {
      const answerEl = addLogEntry(msg.text, 'Asking Claude...');
      pending = { question: msg.text, at: Date.now(), answerEl };
      glasses?.show(`> ${msg.text}`, 'Asking Claude...', 'thinking');
      return;
    }
    case 'answer': {
      const p = pending && Date.now() - pending.at < PENDING_MS ? pending : null;
      pending = null;
      glasses?.show(p ? `> ${p.question}` : 'Claude', msg.text);
      if (p) p.answerEl.textContent = toPlainText(msg.text);
      else addLogEntry('', msg.text);
      return;
    }
  }
}

function onInboxStatus(status: InboxStatus) {
  if (status === 'connected') setPill('inboxStatus', 'Shortcut inbox: listening', 'ok');
  else if (status === 'connecting') setPill('inboxStatus', 'Shortcut inbox: connecting', 'warn');
  else setPill('inboxStatus', 'Shortcut inbox: offline', 'off');
}

function onGlassesAction(action: GlassesAction) {
  if (action === 'clear') clearAll();
}

const inbox = new Inbox(onInboxMessage, onInboxStatus);

// ---------- Boot ----------

async function boot() {
  const bridge = await connectBridge();
  store = new SettingsStore(bridge);
  settings = await store.load();
  fillSettingsForm();
  clearLog();

  if (bridge) {
    glasses = new GlassesView(bridge, onGlassesAction);
    const ok = await glasses.start();
    setPill('glassesStatus', ok ? 'Glasses: connected' : 'Glasses: not available', ok ? 'ok' : 'off');
    if (ok) glasses.show('Claude', READY_TEXT);
  } else {
    glasses = null;
    setPill('glassesStatus', 'Glasses: browser preview', 'off');
  }

  inbox.connect(settings.ntfyServer, settings.topic);

  $('settingsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    void saveSettingsFromForm();
  });
  $('newTopic').addEventListener('click', () => {
    $<HTMLInputElement>('topic').value = randomTopic();
  });
  $('clear').addEventListener('click', clearAll);
  $('copyUrl').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shortcutUrl());
      flash('Copied');
    } catch {
      flash('Long-press the URL to copy it');
    }
  });
  $('testShortcut').addEventListener('click', async () => {
    try {
      await publish(settings.ntfyServer, settings.topic, 'Is this working?', 'question');
      await publish(
        settings.ntfyServer,
        settings.topic,
        'Yes! Messages from your Shortcut reach your glasses. Now build the Shortcut below.',
      );
      flash('Test sent');
    } catch (err) {
      flash(err instanceof Error ? err.message : String(err));
    }
  });
}

void boot();
