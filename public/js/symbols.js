// Six Langur Burja symbols, drawn procedurally on canvas (no image assets needed).
export const SYMBOLS = [
  { key: 'jhanda', name: 'Jhanda', np: 'झण्डा', en: 'Flag' },
  { key: 'burja', name: 'Burja', np: 'बुर्जा', en: 'Crown' },
  { key: 'itta', name: 'Itta', np: 'इट्टा', en: 'Diamond' },
  { key: 'paan', name: 'Paan', np: 'पान', en: 'Heart' },
  { key: 'hukum', name: 'Hukum', np: 'हुकुम', en: 'Spade' },
  { key: 'chidi', name: 'Chidi', np: 'चिडी', en: 'Club' },
];

const RED = '#d4142a';
const BLACK = '#161616';

function fillWithShade(ctx, color, shade) {
  const g = ctx.createLinearGradient(0, 0, 0.9, 1);
  g.addColorStop(0, shade);
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  ctx.fill();
}

const drawers = [
  // 0 Jhanda — Nepal's double-pennant flag
  (ctx) => {
    ctx.fillStyle = '#5b3a1e';
    ctx.fillRect(0.12, 0.03, 0.055, 0.94);
    ctx.beginPath();
    ctx.moveTo(0.2, 0.07);
    ctx.lineTo(0.86, 0.5);
    ctx.lineTo(0.43, 0.5);
    ctx.lineTo(0.86, 0.9);
    ctx.lineTo(0.2, 0.9);
    ctx.closePath();
    ctx.lineJoin = 'miter';
    ctx.lineWidth = 0.055;
    ctx.strokeStyle = '#0b3a8f';
    ctx.stroke();
    fillWithShade(ctx, '#c8102e', '#ef3a4f');
    // moon
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0.35, 0.37, 0.075, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d91a33';
    ctx.beginPath();
    ctx.arc(0.35, 0.325, 0.075, 0, Math.PI * 2);
    ctx.fill();
    // sun
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    const cx = 0.35, cy = 0.73;
    for (let i = 0; i < 24; i++) {
      const r = i % 2 ? 0.055 : 0.095;
      const a = (i / 24) * Math.PI * 2;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  },
  // 1 Burja — crown
  (ctx) => {
    ctx.beginPath();
    ctx.moveTo(0.15, 0.74);
    ctx.lineTo(0.07, 0.3);
    ctx.lineTo(0.32, 0.5);
    ctx.lineTo(0.5, 0.17);
    ctx.lineTo(0.68, 0.5);
    ctx.lineTo(0.93, 0.3);
    ctx.lineTo(0.85, 0.74);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0.15, 0, 0.75);
    g.addColorStop(0, '#ffe58a');
    g.addColorStop(0.5, '#f2b822');
    g.addColorStop(1, '#b8780a');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 0.025;
    ctx.strokeStyle = '#7a4b00';
    ctx.stroke();
    // band
    const b = ctx.createLinearGradient(0, 0.72, 0, 0.9);
    b.addColorStop(0, '#f6c843');
    b.addColorStop(1, '#a86b06');
    ctx.fillStyle = b;
    ctx.beginPath();
    ctx.roundRect(0.13, 0.72, 0.74, 0.15, 0.03);
    ctx.fill();
    ctx.stroke();
    // tips
    for (const [x, y] of [[0.07, 0.27], [0.5, 0.13], [0.93, 0.27]]) {
      ctx.beginPath();
      ctx.arc(x, y, 0.055, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd84d';
      ctx.fill();
      ctx.stroke();
    }
    // jewels
    const jewels = [[0.3, '#1c64d6'], [0.5, '#d4142a'], [0.7, '#14a05a']];
    for (const [x, c] of jewels) {
      ctx.beginPath();
      ctx.arc(x, 0.795, 0.04, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
    }
  },
  // 2 Itta — diamond
  (ctx) => {
    ctx.beginPath();
    ctx.moveTo(0.5, 0.03);
    ctx.quadraticCurveTo(0.66, 0.3, 0.86, 0.5);
    ctx.quadraticCurveTo(0.66, 0.7, 0.5, 0.97);
    ctx.quadraticCurveTo(0.34, 0.7, 0.14, 0.5);
    ctx.quadraticCurveTo(0.34, 0.3, 0.5, 0.03);
    fillWithShade(ctx, RED, '#f24a5e');
  },
  // 3 Paan — heart
  (ctx) => {
    ctx.beginPath();
    ctx.moveTo(0.5, 0.92);
    ctx.bezierCurveTo(0.12, 0.66, 0.0, 0.44, 0.07, 0.27);
    ctx.bezierCurveTo(0.16, 0.06, 0.42, 0.06, 0.5, 0.27);
    ctx.bezierCurveTo(0.58, 0.06, 0.84, 0.06, 0.93, 0.27);
    ctx.bezierCurveTo(1.0, 0.44, 0.88, 0.66, 0.5, 0.92);
    ctx.closePath();
    fillWithShade(ctx, RED, '#f24a5e');
  },
  // 4 Hukum — spade
  (ctx) => {
    ctx.beginPath();
    ctx.moveTo(0.5, 0.04);
    ctx.bezierCurveTo(0.62, 0.22, 0.98, 0.4, 0.92, 0.62);
    ctx.bezierCurveTo(0.86, 0.8, 0.62, 0.8, 0.54, 0.68);
    ctx.quadraticCurveTo(0.56, 0.86, 0.68, 0.96);
    ctx.lineTo(0.32, 0.96);
    ctx.quadraticCurveTo(0.44, 0.86, 0.46, 0.68);
    ctx.bezierCurveTo(0.38, 0.8, 0.14, 0.8, 0.08, 0.62);
    ctx.bezierCurveTo(0.02, 0.4, 0.38, 0.22, 0.5, 0.04);
    ctx.closePath();
    fillWithShade(ctx, BLACK, '#4a4a4a');
  },
  // 5 Chidi — club
  (ctx) => {
    ctx.beginPath();
    for (const [x, y] of [[0.5, 0.25], [0.27, 0.56], [0.73, 0.56]]) {
      ctx.moveTo(x + 0.2, y);
      ctx.arc(x, y, 0.2, 0, Math.PI * 2);
    }
    ctx.moveTo(0.62, 0.5);
    ctx.arc(0.5, 0.5, 0.12, 0, Math.PI * 2);
    ctx.moveTo(0.54, 0.6);
    ctx.quadraticCurveTo(0.56, 0.86, 0.68, 0.96);
    ctx.lineTo(0.32, 0.96);
    ctx.quadraticCurveTo(0.44, 0.86, 0.46, 0.6);
    ctx.closePath();
    fillWithShade(ctx, BLACK, '#4a4a4a');
  },
];

/** Draw symbol `idx` inside a square of side `size` centred on (cx, cy). */
export function drawSymbol(ctx, idx, cx, cy, size) {
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size, size);
  drawers[idx](ctx);
  ctx.restore();
}

const urlCache = new Map();
/** PNG data URL of a symbol on a transparent background (for the HTML UI). */
export function symbolURL(idx, px = 160) {
  const k = `${idx}:${px}`;
  if (!urlCache.has(k)) {
    const c = document.createElement('canvas');
    c.width = c.height = px;
    const ctx = c.getContext('2d');
    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = px * 0.05;
    ctx.shadowOffsetY = px * 0.025;
    drawSymbol(ctx, idx, px / 2, px / 2, px * 0.84);
    urlCache.set(k, c.toDataURL());
  }
  return urlCache.get(k);
}

/** Ivory die face with the symbol, for 3D textures. */
export function dieFaceCanvas(idx, px = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(px * 0.4, px * 0.35, px * 0.1, px / 2, px / 2, px * 0.75);
  g.addColorStop(0, '#fffdf7');
  g.addColorStop(1, '#eadfc6');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, px, px);
  ctx.strokeStyle = 'rgba(150,120,70,.35)';
  ctx.lineWidth = px * 0.012;
  ctx.beginPath();
  ctx.roundRect(px * 0.08, px * 0.08, px * 0.84, px * 0.84, px * 0.08);
  ctx.stroke();
  drawSymbol(ctx, idx, px / 2, px / 2, px * 0.64);
  return c;
}
