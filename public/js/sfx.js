// Tiny procedural sound effects via WebAudio (unlocked on first tap).
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('lb-muted') === '1'; } catch {}

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
window.addEventListener('pointerdown', () => ac(), { once: true });

function noiseBuffer(c, secs) {
  const b = c.createBuffer(1, Math.floor(c.sampleRate * secs), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  return b;
}

function tone(freq, start, dur, { type = 'sine', vol = 0.2, slide = 0 } = {}) {
  const c = ac();
  if (!c || muted) return;
  const t = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, freq, vol, q = 1.5) {
  const c = ac();
  if (!c || muted) return;
  const s = c.createBufferSource();
  s.buffer = noiseBuffer(c, dur);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.value = vol;
  s.connect(f).connect(g).connect(c.destination);
  s.start();
}

export const sfx = {
  get muted() { return muted; },
  toggle() {
    muted = !muted;
    try { localStorage.setItem('lb-muted', muted ? '1' : '0'); } catch {}
    return muted;
  },
  chip() {
    noise(0.05, 4200, 0.5, 3);
    tone(2400, 0, 0.06, { type: 'triangle', vol: 0.08 });
  },
  bounce(strength = 1) {
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      setTimeout(() => noise(0.06, 1800 + Math.random() * 1800, 0.25 + 0.6 * strength, 2), i * 28);
    }
    tone(140, 0, 0.12, { vol: 0.25 * strength, slide: 0.6 });
  },
  tick() { tone(1100, 0, 0.05, { type: 'square', vol: 0.04 }); },
  open() { [523, 659, 784].forEach((f, i) => tone(f, i * 0.08, 0.25, { type: 'triangle', vol: 0.12 })); },
  win() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.45, { type: 'triangle', vol: 0.16 }));
    setTimeout(() => noise(0.4, 6000, 0.15, 0.7), 450);
  },
  lose() { [392, 311, 233].forEach((f, i) => tone(f, i * 0.16, 0.35, { type: 'sine', vol: 0.14 })); },
};
