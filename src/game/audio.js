// Tiny synthesised sound effects (Web Audio, no files). Off until the player turns sound on; remembered per browser.
const KEY = 'shinobi-run-sound';

export function createAudio() {
  let ctx = null, master = null;
  let on = false;
  try { on = localStorage.getItem(KEY) !== 'off'; } catch (e) { on = true; }
  const ensure = () => {
    if (!on) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.32; master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };
  const tone = (freq, dur, { type = 'sine', vol = 0.5, slide = 0, delay = 0 } = {}) => {
    const c = ensure(); if (!c) return;
    const t0 = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
  };
  const noise = (dur, { vol = 0.4, from = 2000, to = 600, q = 1.2 } = {}) => {
    const c = ensure(); if (!c) return;
    const n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q; f.frequency.setValueAtTime(from, c.currentTime); f.frequency.exponentialRampToValueAtTime(to, c.currentTime + dur);
    const g = c.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(master); src.start();
  };
  return {
    get on() { return on; },
    set(v) { on = v; try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch (e) {} if (v) ensure(); else if (ctx) ctx.suspend(); },
    jump() { tone(360, 0.16, { type: 'triangle', vol: 0.35, slide: 1.9 }); },
    coin() { tone(1320, 0.09, { type: 'square', vol: 0.12 }); tone(1760, 0.14, { type: 'square', vol: 0.1, delay: 0.06 }); },
    slash() { noise(0.18, { vol: 0.5, from: 4200, to: 900, q: 0.8 }); },
    wood() { noise(0.22, { vol: 0.6, from: 900, to: 220, q: 2 }); tone(180, 0.12, { type: 'triangle', vol: 0.3, slide: 0.6 }); },
    hit() { tone(180, 0.25, { type: 'sawtooth', vol: 0.22, slide: 0.45 }); noise(0.15, { vol: 0.3, from: 600, to: 200 }); },
    scroll() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.32, { type: 'sine', vol: 0.22, delay: i * 0.07 })); },
    checkpoint() { [523, 659, 784].forEach((f, i) => tone(f, 0.25, { type: 'triangle', vol: 0.2, delay: i * 0.08 })); },
    win() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.38, { type: 'triangle', vol: 0.22, delay: i * 0.12 })); },
    dispose() { if (ctx) ctx.close(); },
  };
}
