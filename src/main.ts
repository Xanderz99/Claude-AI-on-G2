import { waitForEvenAppBridge, type EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { askClaude, describeError, type AskHandle, type Turn } from './claude';
import { GlassesView, type GlassesAction } from './glasses';
import { Inbox, publish, type InboxMessage, type InboxStatus } from './inbox';
import { MODELS, SettingsStore, randomTopic, DEFAULT_SYSTEM_PROMPT, type Effort, type Settings } from './settings';
import './style.css';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let settings: Settings;
let store: SettingsStore;
let glasses: GlassesView | null = null;
let history: Turn[] = [];
let current: AskHandle | null = null;
let lastQuestion = '';

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

function renderLog() {
  const log = $('log');
  log.replaceChildren();
  for (const turn of history) addLogEntry(turn.question, turn.answer);
  if (history.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No questions yet. Run your Shortcut, or type below.';
    log.append(empty);
  }
}

function addLogEntry(question: string, answer: string): HTMLElement {
  const log = $('log');
  log.querySelector('.muted')?.remove();
  const item = document.createElement('div');
  item.className = 'turn';
  const q = document.createElement('div');
  q.className = 'q';
  q.textContent = question;
  const a = document.createElement('div');
  a.className = 'a';
  a.textContent = answer;
  item.append(q, a);
  log.append(item);
  item.scrollIntoView({ block: 'end' });
  return a;
}

function fillSettingsForm() {
  const model = $<HTMLSelectElement>('model');
  model.replaceChildren(
    ...MODELS.map((m) => {
      const o = document.createElement('option');
      o.value = m.id;
      o.textContent = m.label;
      return o;
    }),
  );
  if (!MODELS.some((m) => m.id === settings.model)) {
    const o = document.createElement('option');
    o.value = o.textContent = settings.model;
    model.append(o);
  }
  model.value = settings.model;
  $<HTMLInputElement>('apiKey').value = settings.apiKey;
  $<HTMLSelectElement>('effort').value = settings.effort;
  $<HTMLInputElement>('topic').value = settings.topic;
  $<HTMLInputElement>('ntfyServer').value = settings.ntfyServer;
  $<HTMLTextAreaElement>('systemPrompt').value = settings.systemPrompt;
  $<HTMLInputElement>('historyTurns').value = String(settings.historyTurns);
  renderShortcutHelp();
}

function renderShortcutHelp() {
  const url = `${settings.ntfyServer.replace(/\/+$/, '')}/${settings.topic}`;
  $('shortcutUrl').textContent = url;
  $('setupWarning').hidden = settings.apiKey !== '';
}

async function saveSettingsFromForm() {
  const prevTopic = `${settings.ntfyServer}|${settings.topic}`;
  settings = {
    apiKey: $<HTMLInputElement>('apiKey').value.trim(),
    model: $<HTMLSelectElement>('model').value,
    effort: $<HTMLSelectElement>('effort').value as Effort,
    topic: $<HTMLInputElement>('topic').value.trim() || randomTopic(),
    ntfyServer: $<HTMLInputElement>('ntfyServer').value.trim() || 'https://ntfy.sh',
    systemPrompt: $<HTMLTextAreaElement>('systemPrompt').value.trim() || DEFAULT_SYSTEM_PROMPT,
    historyTurns: Math.max(0, Math.min(20, Number($<HTMLInputElement>('historyTurns').value) || 0)),
  };
  await store.save(settings);
  fillSettingsForm();
  if (prevTopic !== `${settings.ntfyServer}|${settings.topic}`) inbox.connect(settings.ntfyServer, settings.topic);
  flash('Saved');
}

function flash(text: string) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  setTimeout(() => (el.hidden = true), 1800);
}

// ---------- Asking ----------

function newChat() {
  current?.cancel();
  history = [];
  renderLog();
  glasses?.show('Claude', 'New chat. Ask from your Shortcut.', { resetPage: true });
}

async function ask(question: string) {
  question = question.trim();
  if (!question) return;
  if (!settings.apiKey) {
    glasses?.show('Claude', 'Add your Anthropic API key in the Claude app settings on your phone.', {
      resetPage: true,
    });
    flash('Add your API key first');
    return;
  }
  current?.cancel();
  lastQuestion = question;
  const title = `> ${question}`;
  glasses?.show(title, '...', { status: 'thinking', resetPage: true });
  const answerEl = addLogEntry(question, '...');

  const handle = askClaude(settings, history, question, {
    onText: (text) => {
      glasses?.show(title, text, { status: '...' });
      answerEl.textContent = text;
    },
  });
  current = handle;
  try {
    const answer = await handle.done;
    if (current !== handle) return;
    history.push({ question, answer });
    glasses?.show(title, answer || '(no answer)');
    glasses?.settle();
    answerEl.textContent = answer;
  } catch (err) {
    if (current !== handle) return;
    const msg = describeError(err);
    glasses?.show(title, msg, { status: 'error' });
    answerEl.textContent = msg;
    answerEl.classList.add('error');
  } finally {
    if (current === handle) current = null;
  }
}

function showText(text: string) {
  current?.cancel();
  glasses?.show('Claude', text, { resetPage: true });
  glasses?.settle();
  addLogEntry('(shown from Shortcut)', text);
}

function onInboxMessage(msg: InboxMessage) {
  if (msg.kind === 'show') return showText(msg.text);
  if (msg.kind === 'new') {
    history = [];
    renderLog();
  }
  void ask(msg.text);
}

function onInboxStatus(status: InboxStatus) {
  if (status === 'connected') setPill('inboxStatus', 'Shortcut inbox: listening', 'ok');
  else if (status === 'connecting') setPill('inboxStatus', 'Shortcut inbox: connecting', 'warn');
  else setPill('inboxStatus', 'Shortcut inbox: offline', 'off');
}

function onGlassesAction(action: GlassesAction) {
  switch (action) {
    case 'newChat':
      return newChat();
    case 'repeat':
      if (lastQuestion) {
        // Re-ask without the previous answer to the same question in context.
        if (history.at(-1)?.question === lastQuestion) history.pop();
        void ask(lastQuestion);
      }
      return;
    case 'stop':
      current?.cancel();
      return;
    case 'exit':
      current?.cancel();
      return;
  }
}

const inbox = new Inbox(onInboxMessage, onInboxStatus);

// ---------- Boot ----------

async function boot() {
  const bridge = await connectBridge();
  store = new SettingsStore(bridge);
  settings = await store.load();
  fillSettingsForm();
  renderLog();

  if (bridge) {
    glasses = new GlassesView(bridge, onGlassesAction);
    const ok = await glasses.start();
    setPill('glassesStatus', ok ? 'Glasses: connected' : 'Glasses: not available', ok ? 'ok' : 'off');
    if (ok) {
      glasses.show(
        'Claude',
        settings.apiKey
          ? 'Ready. Say "Hey Siri, Ask Claude" or run your Shortcut.\n\nTap/swipe: next page\nDouble-tap: new chat'
          : 'Open the Claude app on your phone and add your Anthropic API key.',
        { resetPage: true },
      );
      glasses.settle();
    }
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
  $('askForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $<HTMLInputElement>('askInput');
    void ask(input.value);
    input.value = '';
  });
  $('newChat').addEventListener('click', newChat);
  $('copyUrl').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('shortcutUrl').textContent ?? '');
      flash('Copied');
    } catch {
      flash('Long-press the URL to copy it');
    }
  });
  $('testShortcut').addEventListener('click', async () => {
    try {
      await publish(settings.ntfyServer, settings.topic, 'Say hello to me in one short sentence.');
      flash('Test sent through the Shortcut inbox');
    } catch (err) {
      flash(describeError(err));
    }
  });
}

void boot();
