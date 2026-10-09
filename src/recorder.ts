/**
 * Collects 16 kHz mono s16le PCM frames from the G2 microphone and packages
 * them as a WAV file. Ends the recording automatically after a pause in speech.
 */
export const SAMPLE_RATE = 16_000;

export interface RecorderOptions {
  /** Stop this long after speech was heard and then went quiet. */
  silenceMs?: number;
  /** Give up if nobody speaks within this long. */
  noSpeechMs?: number;
  /** Hard limit on recording length. */
  maxMs?: number;
  /** RMS level (0..1) above which a frame counts as speech. */
  speechLevel?: number;
  /** End on a pause in speech. Off for hold-to-talk, which ends on release. */
  autoStop?: boolean;
}

export class Recorder {
  private chunks: Uint8Array[] = [];
  private bytes = 0;
  private heardSpeech = false;
  private quietMs = 0;
  private lastLevel = 0;
  private opts: Required<RecorderOptions>;

  constructor(opts: RecorderOptions = {}) {
    this.opts = { silenceMs: 1800, noSpeechMs: 8000, maxMs: 30_000, speechLevel: 0.02, autoStop: true, ...opts };
  }

  get durationMs(): number {
    return (this.bytes / 2 / SAMPLE_RATE) * 1000;
  }

  get maxMs(): number {
    return this.opts.maxMs;
  }

  get noSpeechMs(): number {
    return this.opts.noSpeechMs;
  }

  get autoStop(): boolean {
    return this.opts.autoStop;
  }

  /** Loudness of the latest frame, 0..1. */
  get level(): number {
    return this.lastLevel;
  }

  get hasSpeech(): boolean {
    return this.heardSpeech;
  }

  /** Add a frame. Returns true when the recording should stop. */
  push(frame: Uint8Array): boolean {
    this.chunks.push(frame);
    this.bytes += frame.byteLength;
    const frameMs = (frame.byteLength / 2 / SAMPLE_RATE) * 1000;
    this.lastLevel = rms(frame);
    if (this.lastLevel >= this.opts.speechLevel) {
      this.heardSpeech = true;
      this.quietMs = 0;
    } else {
      this.quietMs += frameMs;
    }
    if (this.durationMs >= this.opts.maxMs) return true;
    if (!this.opts.autoStop) return false;
    if (this.heardSpeech) return this.quietMs >= this.opts.silenceMs;
    return this.durationMs >= this.opts.noSpeechMs;
  }

  toWav(): Uint8Array {
    const pcm = new Uint8Array(this.bytes - (this.bytes % 2));
    let offset = 0;
    for (const c of this.chunks) {
      const n = Math.min(c.byteLength, pcm.byteLength - offset);
      pcm.set(c.subarray(0, n), offset);
      offset += n;
    }
    return encodeWav(pcm, SAMPLE_RATE);
  }
}

/** Root-mean-square level of a little-endian 16-bit PCM frame, 0..1. */
export function rms(frame: Uint8Array): number {
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const samples = Math.floor(frame.byteLength / 2);
  if (samples === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    const s = view.getInt16(i * 2, true) / 32768;
    sum += s * s;
  }
  return Math.sqrt(sum / samples);
}

/** Wrap mono 16-bit PCM in a 44-byte RIFF/WAVE header. */
export function encodeWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const out = new Uint8Array(44 + pcm.byteLength);
  const v = new DataView(out.buffer);
  const ascii = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + pcm.byteLength, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true); // fmt chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  v.setUint32(40, pcm.byteLength, true);
  out.set(pcm, 44);
  return out;
}

/** A simple sound-level meter for the Listening screen: 0 to 14 bars from -50 dB to -10 dB. */
export function levelMeter(level: number): string {
  const db = 20 * Math.log10(Math.max(level, 1e-6));
  const bars = Math.round(Math.min(Math.max((db + 50) / 40, 0), 1) * 14);
  return '|'.repeat(bars) || '.';
}
