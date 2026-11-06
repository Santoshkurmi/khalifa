// Board layout on a 15×15 grid. Cell (col,row) → world (col-7, row-7). Seats: 0 red, 1 green, 2 yellow, 3 blue.
export const COLORS = [
  { key: 'red', name: 'Red', hex: '#ef3b4f', light: '#ff8a96', dark: '#a3162a' },
  { key: 'green', name: 'Green', hex: '#21b86b', light: '#7be3aa', dark: '#0d7a43' },
  { key: 'yellow', name: 'Yellow', hex: '#ffc425', light: '#ffe183', dark: '#c58e00' },
  { key: 'blue', name: 'Blue', hex: '#2f7cf6', light: '#8bb7ff', dark: '#1549a8' },
];

export const START = [0, 13, 26, 39];
export const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
export const LAST_TRACK = 50;
export const HOME = 56;

// 52 shared squares, clockwise, starting at red's entry square.
export const TRACK = [
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
  [7, 0], [8, 0],
  [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
  [14, 7], [14, 8],
  [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
  [7, 14], [6, 14],
  [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  [0, 7], [0, 6],
];

export const HOME_COL = [
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
];

const yard = (c, r) => [[c, r], [c + 2, r], [c, r + 2], [c + 2, r + 2]];
export const YARD_SPOTS = [yard(1.5, 1.5), yard(10.5, 1.5), yard(10.5, 10.5), yard(1.5, 10.5)];
export const YARD_CENTER = [[2.5, 2.5], [11.5, 2.5], [11.5, 11.5], [2.5, 11.5]];

// finished pawns sit in their colour's triangle in the centre
const FIN_CENTER = [[6.33, 7], [7, 6.33], [7.67, 7], [7, 7.67]];
const OFF_V = [[-0.12, -0.21], [0.12, -0.21], [-0.12, 0.21], [0.12, 0.21]]; // left/right triangles are tall
const OFF_H = [[-0.21, -0.12], [0.21, -0.12], [-0.21, 0.12], [0.21, 0.12]]; // top/bottom triangles are wide

export const absIndex = (seat, p) => (START[seat] + p) % 52;

/** Grid coordinates (float col,row) of a pawn with progress p. */
export function cellOf(seat, p, token = 0) {
  if (p < 0) return YARD_SPOTS[seat][token];
  if (p <= LAST_TRACK) return TRACK[absIndex(seat, p)];
  if (p < HOME) return HOME_COL[seat][p - LAST_TRACK - 1];
  const [cx, cy] = FIN_CENTER[seat];
  const off = (seat % 2 === 0 ? OFF_V : OFF_H)[token];
  return [cx + off[0], cy + off[1]];
}

export const toWorld = ([c, r]) => [c - 7, r - 7];

/** Final layout of every pawn, nudging pawns that share a square so they're all visible. */
export function layout(tokens) {
  const groups = new Map();
  const out = tokens.map((row, seat) => row.map((p, t) => {
    const [x, z] = toWorld(cellOf(seat, p, t));
    const item = { x, z, scale: p === HOME ? 0.5 : 1, stacked: false };
    if (p >= 0 && p < HOME) {
      const k = `${x},${z}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(item);
    }
    return item;
  }));
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const r = g.length === 2 ? 0.2 : 0.26;
    g.forEach((it, i) => {
      const a = (i / g.length) * Math.PI * 2 + Math.PI / 4;
      it.x += Math.cos(a) * r;
      it.z += Math.sin(a) * r;
      it.scale = 0.72;
      it.stacked = true;
    });
  }
  return out;
}
