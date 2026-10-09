import { AudioInputSource, waitForEvenAppBridge, type EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { GlassesView, type GlassesAction } from './glasses';
import { toPlainText } from './paginate';
import { Inbox, publish, runShortcutUrl, uploadAudio, type InboxMessage, type InboxStatus } from './inbox';
import { Recorder } from './recorder';
import { DEFAULT_VOICE_SHORTCUT, SettingsStore, randomTopic, type Settings } from './settings';
import './style.css';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const READY_TEXT =
  'Ready.\n\nDouble-tap: talk to Claude\nTap or swipe: next page\n\n' +
  'Or say "Hey Siri, Ask Claude on G2" on your iPhone.';

/** If the Shortcut hasn't reported back by then, suggest running it from the phone. */
const SHORTCUT_TIMEOUT_MS = 45_000;

/** An answer arriving within this long of a question is treated as its reply. */
const PENDING_MS = 5 * 60_000;

let settings: Settings;
let store: SettingsStore;
let glasses: GlassesView | null = null;
let bridge: EvenAppBridge | null = null;
let pending: { question: string; at: number; answerEl: HTMLElement } | null = null;
let recorder: Recorder | null = null;
let voiceTimer: ReturnType<typeof setTimeout> | null = null;
let talkWatchdog: ReturnType<typeof setInterval> | null = null;
/** Shortcut link for the last recording, for the phone's "Run Shortcut" fallback button. */
let lastVoiceLink = '';

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
  $<HTMLInputElement>('voiceShortcut').value = settings.voiceShortcut;
  for (const el of document.querySelectorAll('.shortcut-url')) el.textContent = shortcutUrl();
  for (const el of document.querySelectorAll('.voice-shortcut-name')) el.textContent = settings.voiceShortcut;
}

async function saveSettingsFromForm() {
  settings = {
    topic: $<HTMLInputElement>('topic').value.trim() || randomTopic(),
    ntfyServer: $<HTMLInputElement>('ntfyServer').value.trim() || 'https://ntfy.sh',
    voiceShortcut: $<HTMLInputElement>('voiceShortcut').value.trim() || DEFAULT_VOICE_SHORTCUT,
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
  shortcutReported();
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

function onGlassesAction(action: GlassesAction): boolean {
  switch (action) {
    case 'talk':
      if (recorder) void finishTalk();
      else void startTalk();
      return true;
    case 'tap':
      // While recording, a tap means "I'm done talking".
      if (!recorder) return false;
      void finishTalk();
      return true;
    case 'clear':
      clearAll();
      return true;
    case 'exit':
      if (recorder) void stopMic();
      return true;
  }
}

// ---------- Voice from the glasses mic ----------

async function startTalk() {
  if (!bridge || !glasses) return;
  const rec = new Recorder();
  recorder = rec;
  glasses.show('Listening...', 'Speak now.\n\nTap when you are done, or just pause.', 'rec');
  const ok = await bridge.audioControl(true, AudioInputSource.Glasses);
  if (!ok) {
    recorder = null;
    glasses.show('Claude', 'Could not turn on the glasses microphone. Try again.', 'error');
    return;
  }
  // Stop even if the mic never delivers audio.
  const started = Date.now();
  talkWatchdog = setInterval(() => {
    if (recorder !== rec) return;
    const elapsed = Date.now() - started;
    if (elapsed > rec.maxMs || (!rec.hasSpeech && elapsed > rec.noSpeechMs + 1000)) void finishTalk();
  }, 500);
}

async function stopMic(): Promise<Recorder | null> {
  const rec = recorder;
  recorder = null;
  if (talkWatchdog) clearInterval(talkWatchdog);
  talkWatchdog = null;
  await bridge?.audioControl(false).catch(() => false);
  return rec;
}

function onMicFrame(pcm: Uint8Array) {
  if (recorder?.push(pcm)) void finishTalk();
}

async function finishTalk() {
  const rec = await stopMic();
  if (!rec) return;
  if (!rec.hasSpeech) {
    glasses?.show('Claude', "Didn't hear anything.\n\nDouble-tap to try again.");
    return;
  }
  glasses?.show('Sending...', 'Uploading your question.', 'busy');
  try {
    const audioUrl = await uploadAudio(settings.ntfyServer, settings.topic, rec.toWav());
    lastVoiceLink = runShortcutUrl(settings.voiceShortcut, audioUrl);
    $('runVoiceShortcut').hidden = false;
    glasses?.show('Asking Claude...', `Running the "${settings.voiceShortcut}" Shortcut on your iPhone.`, 'thinking');
    voiceTimer = setTimeout(() => {
      voiceTimer = null;
      glasses?.show(
        'Waiting for your iPhone',
        `The Shortcut hasn't answered yet. If it didn't start, open the Claude page in the Even app and tap "Run Shortcut".`,
      );
    }, SHORTCUT_TIMEOUT_MS);
    openShortcut(lastVoiceLink);
  } catch (err) {
    glasses?.show('Claude', err instanceof Error ? err.message : String(err), 'error');
  }
}

/**
 * Ask iOS to run the Shortcut. iOS only allows this while the Even app is in the
 * foreground. A hidden iframe is used because navigating the page itself to an
 * unsupported scheme would replace (and kill) this app.
 */
function openShortcut(link: string) {
  const frame = document.createElement('iframe');
  frame.style.display = 'none';
  frame.src = link;
  document.body.append(frame);
  setTimeout(() => frame.remove(), 2000);
}

function shortcutReported() {
  if (voiceTimer) clearTimeout(voiceTimer);
  voiceTimer = null;
  $('runVoiceShortcut').hidden = true;
}

const inbox = new Inbox(onInboxMessage, onInboxStatus);

// ---------- Boot ----------

async function boot() {
  bridge = await connectBridge();
  store = new SettingsStore(bridge);
  settings = await store.load();
  fillSettingsForm();
  clearLog();

  if (bridge) {
    glasses = new GlassesView(bridge, onGlassesAction);
    const ok = await glasses.start();
    setPill('glassesStatus', ok ? 'Glasses: connected' : 'Glasses: not available', ok ? 'ok' : 'off');
    if (ok) glasses.show('Claude', READY_TEXT);
    bridge.onEvenHubEvent((e) => {
      if (e.audioEvent && recorder) onMicFrame(e.audioEvent.audioPcm);
    });
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
  $('runVoiceShortcut').addEventListener('click', () => {
    if (lastVoiceLink) openShortcut(lastVoiceLink);
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
