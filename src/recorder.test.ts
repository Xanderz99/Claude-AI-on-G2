import { describe, expect, it } from 'vitest';
import { Recorder, encodeWav, rms } from './recorder';

/** 100 ms of 16 kHz PCM at a constant amplitude. */
function frame(amplitude: number): Uint8Array {
  const out = new Uint8Array(3200);
  const v = new DataView(out.buffer);
  for (let i = 0; i < 1600; i++) v.setInt16(i * 2, (i % 2 ? 1 : -1) * amplitude, true);
  return out;
}

describe('rms', () => {
  it('measures silence and loud frames', () => {
    expect(rms(frame(0))).toBe(0);
    expect(rms(frame(16384))).toBeCloseTo(0.5, 2);
  });
});

describe('Recorder', () => {
  it('stops after a pause that follows speech', () => {
    const rec = new Recorder({ silenceMs: 300 });
    expect(rec.push(frame(8000))).toBe(false);
    expect(rec.push(frame(0))).toBe(false);
    expect(rec.push(frame(0))).toBe(false);
    expect(rec.push(frame(0))).toBe(true);
    expect(rec.hasSpeech).toBe(true);
  });

  it('gives up when nobody speaks', () => {
    const rec = new Recorder({ noSpeechMs: 200 });
    expect(rec.push(frame(0))).toBe(false);
    expect(rec.push(frame(0))).toBe(true);
    expect(rec.hasSpeech).toBe(false);
  });

  it('produces a playable WAV', () => {
    const rec = new Recorder();
    rec.push(frame(8000));
    const wav = rec.toWav();
    const text = (o: number) => String.fromCharCode(...wav.subarray(o, o + 4));
    const v = new DataView(wav.buffer);
    expect(text(0)).toBe('RIFF');
    expect(text(8)).toBe('WAVE');
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint32(40, true)).toBe(3200);
    expect(wav.byteLength).toBe(44 + 3200);
  });
});

describe('encodeWav', () => {
  it('writes the RIFF size', () => {
    const wav = encodeWav(new Uint8Array(10), 16000);
    expect(new DataView(wav.buffer).getUint32(4, true)).toBe(46);
  });
});
