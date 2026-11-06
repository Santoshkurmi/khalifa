// Procedural sound effects (WebAudio), unlocked on first tap.
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('ludo-muted') === '1'; } catch {}

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

function noise(dur, freq, vol, q = 1.5, start = 0) {
  const c = ac();
  if (!c || muted) return;
  const b = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  const s = c.createBufferSource();
  s.buffer = b;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.value = vol;
  s.connect(f).connect(g).connect(c.destination);
  s.start(c.currentTime + start);
}

export const sfx = {
  get muted() { return muted; },
  toggle() {
    muted = !muted;
    try { localStorage.setItem('ludo-muted', muted ? '1' : '0'); } catch {}
    return muted;
  },
  click() { tone(900, 0, 0.05, { type: 'triangle', vol: 0.08 }); },
  hover() { tone(1400, 0, 0.04, { type: 'sine', vol: 0.04 }); },
  dieBounce(s = 1) {
    for (let i = 0; i < 3; i++) noise(0.05, 2000 + Math.random() * 2000, 0.2 + 0.5 * s, 2, i * 0.025);
    tone(160, 0, 0.1, { vol: 0.2 * s, slide: 0.6 });
  },
  hop(i = 0, n = 1) {
    const f = 420 + (i / Math.max(1, n - 1)) * 380;
    tone(f, 0, 0.09, { type: 'triangle', vol: 0.12, slide: 1.3 });
    noise(0.03, 3000, 0.15, 3);
  },
  capture() {
    noise(0.35, 700, 0.8, 0.8);
    tone(220, 0, 0.45, { type: 'sawtooth', vol: 0.12, slide: 0.3 });
    tone(880, 0.05, 0.3, { type: 'square', vol: 0.05, slide: 0.5 });
  },
  home() { [659, 784, 988, 1319].forEach((f, i) => tone(f, i * 0.08, 0.4, { type: 'triangle', vol: 0.14 })); },
  yourTurn() { [784, 1175].forEach((f, i) => tone(f, i * 0.1, 0.25, { type: 'sine', vol: 0.14 })); },
  six() { [523, 659, 784].forEach((f, i) => tone(f, i * 0.05, 0.2, { type: 'triangle', vol: 0.1 })); },
  noMove() { tone(300, 0, 0.25, { type: 'sine', vol: 0.12, slide: 0.7 }); },
  win() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.11, 0.45, { type: 'triangle', vol: 0.16 }));
  },
  pop() { tone(600, 0, 0.12, { type: 'sine', vol: 0.12, slide: 2 }); },
  // each character has its own voice pitch: bunny, sprout, chick, cat
  squeak(seat = 0, reaction = '') {
    const base = [900, 620, 1150, 760][seat] || 800;
    if (reaction === 'giggle') {
      for (let i = 0; i < 5; i++) tone(base * (1.1 + (i % 2) * 0.15), i * 0.07, 0.07, { type: 'sine', vol: 0.12, slide: 1.2 });
    } else if (reaction === 'shakeNo') {
      tone(base * 0.6, 0, 0.18, { type: 'square', vol: 0.06, slide: 0.7 });
      tone(base * 0.55, 0.2, 0.2, { type: 'square', vol: 0.06, slide: 0.6 });
    } else if (reaction === 'dizzy') {
      for (let i = 0; i < 6; i++) tone(base * (1.4 - i * 0.12), i * 0.08, 0.1, { type: 'triangle', vol: 0.08 });
    } else if (reaction === 'jump') {
      tone(base * 0.5, 0, 0.25, { type: 'sine', vol: 0.15, slide: 2.4 });
    } else {
      tone(base, 0, 0.12, { type: 'sine', vol: 0.14, slide: 1.6 });
      tone(base * 1.5, 0.1, 0.1, { type: 'sine', vol: 0.1, slide: 1.3 });
    }
  },
  pickup() { tone(500, 0, 0.15, { type: 'sine', vol: 0.12, slide: 1.8 }); },
  drop() { tone(300, 0, 0.12, { type: 'sine', vol: 0.15, slide: 0.6 }); noise(0.05, 1500, 0.3, 2); },
  whoosh() { noise(0.3, 1200, 0.5, 0.6); },
  dieShake() { noise(0.04, 2500 + Math.random() * 1500, 0.25, 3); },
};
