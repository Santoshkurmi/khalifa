// 3D Ludo — LAN multiplayer server (authoritative game rules + bots)
const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { Server } = require('socket.io');

const PORT = Number(process.env.PORT) || 3001;
const HOST_PASSWORD = process.env.HOST_PASSWORD || crypto.randomBytes(3).toString('hex');
const TURN_SECONDS = 30;
const FAST = process.env.LUDO_FAST === '1'; // test mode: no animation delays
const ms = (x) => (FAST ? 1 : x);

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three')));

// ------------------------------------------------------------------ rules
const COLORS = ['red', 'green', 'yellow', 'blue'];
const START = [0, 13, 26, 39]; // track index where each colour enters
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]); // start squares + stars
const LAST_TRACK = 50; // progress 0..50 on the shared track
const HOME = 56; // 51..55 home column, 56 = finished
const BOT_NAMES = ['Robo Ram', 'Bot Bhim', 'Chatur AI', 'Tin Tara', 'Gear Gita', 'Dice Dipu'];
const AVATARS = ['🐵', '🐯', '🦁', '🐘', '🦚', '🐉', '🦅', '🐺', '🦊', '🐼', '🐸', '🐮', '🐻', '🦄', '🐷', '🐲'];

const abs = (seat, p) => (START[seat] + p) % 52;
const onTrack = (p) => p >= 0 && p <= LAST_TRACK;

const clients = new Map(); // clientId -> { name, avatar, sockets:Set }
let state = freshState();
let eventId = 0;
const timers = { auto: null, pass: null };

function freshState(seats = [null, null, null, null]) {
  return {
    phase: 'lobby', // lobby | playing | finished
    seats, // { kind:'human'|'bot', clientId?, name, avatar, afk }
    tokens: [[-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]],
    turn: 0,
    dice: null,
    rolled: false,
    sixes: 0,
    movable: [],
    ranking: [],
    event: null,
    turnEndsAt: null,
    log: [],
  };
}

const isFinished = (seat) => state.tokens[seat].every((p) => p === HOME);
const connected = (s) => s && (s.kind === 'bot' || (clients.get(s.clientId)?.sockets.size || 0) > 0);
const activeSeats = () => [0, 1, 2, 3].filter((i) => state.seats[i] && !state.ranking.includes(i));

function legalMoves(seat, d) {
  return state.tokens[seat]
    .map((p, t) => ({ p, t }))
    .filter(({ p }) => (p === -1 ? d === 6 : p !== HOME && p + d <= HOME))
    .map(({ t }) => t);
}

function log(text) {
  state.log.unshift({ id: ++eventId, text });
  state.log.length = Math.min(state.log.length, 8);
}

function emitEvent(ev) {
  state.event = { id: ++eventId, ...ev };
}

// ------------------------------------------------------------------ turn actions
function doRoll(seat) {
  const d = crypto.randomInt(1, 7);
  state.dice = d;
  state.sixes = d === 6 ? state.sixes + 1 : 0;
  const name = state.seats[seat].name;
  if (state.sixes === 3) {
    emitEvent({ type: 'roll', seat, value: d, voided: true });
    log(`🎲 ${name} rolled three 6s in a row and loses the turn`);
    state.rolled = true;
    state.movable = [];
    passLater(ms(1700));
    return;
  }
  const moves = legalMoves(seat, d);
  state.rolled = true;
  state.movable = moves;
  emitEvent({ type: 'roll', seat, value: d, noMoves: moves.length === 0 });
  if (!moves.length) passLater(ms(1500));
}

function passLater(ms) {
  clearTimeout(timers.pass);
  timers.pass = setTimeout(() => {
    nextTurn();
    broadcast();
  }, ms);
}

function doMove(seat, t) {
  const d = state.dice;
  const from = state.tokens[seat][t];
  const to = from === -1 ? 0 : from + d;
  const pathSteps = from === -1 ? [0] : Array.from({ length: d }, (_, i) => from + i + 1);
  state.tokens[seat][t] = to;

  const captures = [];
  if (onTrack(to) && !SAFE.has(abs(seat, to))) {
    const cell = abs(seat, to);
    for (let o = 0; o < 4; o++) {
      if (o === seat || !state.seats[o]) continue;
      state.tokens[o].forEach((q, ot) => {
        if (onTrack(q) && abs(o, q) === cell) {
          captures.push({ seat: o, token: ot, from: q });
          state.tokens[o][ot] = -1;
        }
      });
    }
  }
  const reachedHome = to === HOME;
  const name = state.seats[seat].name;
  for (const c of captures) log(`💥 ${name} knocked out ${state.seats[c.seat].name}!`);
  if (reachedHome) log(`🏠 ${name} brought a pawn home`);

  const extra = d === 6 || captures.length > 0 || reachedHome;
  emitEvent({ type: 'move', seat, token: t, from, to, path: pathSteps, captures, extra, reachedHome });

  state.rolled = false;
  state.movable = [];
  if (isFinished(seat)) {
    state.ranking.push(seat);
    log(`🏆 ${name} finished #${state.ranking.length}!`);
    const left = activeSeats();
    if (left.length <= 1) {
      state.ranking.push(...left);
      state.phase = 'finished';
      state.turnEndsAt = null;
      return;
    }
    nextTurn();
  } else if (!extra) {
    nextTurn();
  } else {
    state.sixes = d === 6 ? state.sixes : 0;
  }
}

function nextTurn() {
  state.sixes = 0;
  state.rolled = false;
  state.movable = [];
  for (let i = 1; i <= 4; i++) {
    const s = (state.turn + i) % 4;
    if (state.seats[s] && !state.ranking.includes(s)) {
      state.turn = s;
      return;
    }
  }
}

// ------------------------------------------------------------------ bot brain
function threatenedAt(seat, cell) {
  if (SAFE.has(cell)) return false;
  for (let o = 0; o < 4; o++) {
    if (o === seat || !state.seats[o]) continue;
    for (const q of state.tokens[o]) {
      if (!onTrack(q)) continue;
      const dist = (cell - abs(o, q) + 52) % 52;
      if (dist >= 1 && dist <= 6 && q + dist <= LAST_TRACK) return true;
    }
  }
  return false;
}

function chooseMove(seat) {
  const d = state.dice;
  let best = null;
  for (const t of state.movable) {
    const from = state.tokens[seat][t];
    const to = from === -1 ? 0 : from + d;
    let score = to / 10 + Math.random() * 2;
    if (from === -1) score += 30;
    if (to === HOME) score += 45;
    else if (to > LAST_TRACK && from <= LAST_TRACK) score += 25;
    if (onTrack(to)) {
      const cell = abs(seat, to);
      if (SAFE.has(cell)) score += 12;
      for (let o = 0; o < 4; o++) {
        if (o === seat || !state.seats[o] || SAFE.has(cell)) continue;
        for (const q of state.tokens[o]) if (onTrack(q) && abs(o, q) === cell) score += 50 + q / 2;
      }
      if (threatenedAt(seat, cell)) score -= 28 + to / 4;
    }
    if (onTrack(from) && from >= 0 && threatenedAt(seat, abs(seat, from))) score += 18 + from / 4;
    if (!best || score > best.score) best = { t, score };
  }
  return best.t;
}

// ------------------------------------------------------------------ scheduler
function animDelay() {
  const ev = state.event;
  if (!ev) return 400;
  if (ev.type === 'roll') return 1300;
  if (ev.type === 'move') return 260 * ev.path.length + (ev.captures.length ? 1000 : 0) + (ev.reachedHome ? 500 : 0) + 450;
  return 600;
}

function schedule() {
  clearTimeout(timers.auto);
  state.turnEndsAt = null;
  if (state.phase !== 'playing') return;
  if (state.rolled && !state.movable.length) return; // turn passes on its own
  const seat = state.turn;
  const s = state.seats[seat];
  const delay = animDelay();
  const auto = s.kind === 'bot' || !connected(s) || s.afk;

  // Equivalent moves (e.g. only one pawn can move) are made automatically.
  if (!auto && state.rolled) {
    const froms = new Set(state.movable.map((t) => state.tokens[seat][t]));
    if (froms.size === 1) {
      // give the player a few seconds to drag/tap it themselves first
      timers.auto = setTimeout(() => act(seat, () => doMove(seat, state.movable[0])), ms(delay + 4000));
      return;
    }
  }
  if (auto) {
    timers.auto = setTimeout(() => autoStep(seat), ms(delay + (s.kind === 'bot' ? 450 : 200)));
  } else {
    state.turnEndsAt = Date.now() + delay + TURN_SECONDS * 1000;
    timers.auto = setTimeout(() => {
      s.afk = true;
      log(`⏰ ${s.name} is away, so autoplay takes over`);
      autoStep(seat);
    }, delay + TURN_SECONDS * 1000);
  }
}

function autoStep(seat) {
  if (state.phase !== 'playing' || state.turn !== seat) return;
  act(seat, () => (state.rolled ? doMove(seat, chooseMove(seat)) : doRoll(seat)));
}

function act(seat, fn) {
  if (state.phase !== 'playing' || state.turn !== seat) return;
  fn();
  broadcast();
}

// ------------------------------------------------------------------ broadcast
function publicState() {
  return {
    ...state,
    seats: state.seats.map((s) => s && {
      kind: s.kind, clientId: s.clientId || null, name: s.name, avatar: s.avatar,
      afk: !!s.afk, connected: connected(s),
    }),
    serverNow: Date.now(),
  };
}

function broadcast() {
  schedule();
  io.emit('state', publicState());
}

function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push({ name, address: a.address });
  }
  const score = (a) => (/^(en|eth|wlan|wl|Wi-Fi)/i.test(a.name) ? 0 : 2) + (/^(192\.168|10\.|172\.)/.test(a.address) ? 0 : 1);
  return out.sort((a, b) => score(a) - score(b));
}

let inviteCache = null;
async function invite() {
  if (!inviteCache) {
    const urls = lanAddresses().map((a) => `http://${a.address}:${server.address().port}/`);
    inviteCache = { urls, qr: urls[0] ? await QRCode.toDataURL(urls[0], { margin: 1, width: 260 }) : null };
  }
  return inviteCache;
}

// ------------------------------------------------------------------ sockets
io.on('connection', (socket) => {
  const me = () => socket.data.clientId;
  const owns = (seat) => state.seats[seat]?.kind === 'human' && state.seats[seat].clientId === me();
  const wrap = (fn) => (data, ack) => {
    if (typeof data === 'function') { ack = data; data = {}; }
    ack = typeof ack === 'function' ? ack : () => {};
    try {
      const r = fn(data || {});
      ack(r || { ok: true });
    } catch (e) {
      ack({ error: e.message });
    }
  };

  socket.on('hello', wrap(({ clientId, name, avatar }) => {
    const id = typeof clientId === 'string' && clientId.length < 64 ? clientId : crypto.randomUUID();
    const c = clients.get(id) || { sockets: new Set() };
    c.name = String(name || '').trim().slice(0, 14) || c.name || null;
    c.avatar = AVATARS.includes(avatar) ? avatar : c.avatar || AVATARS[crypto.randomInt(AVATARS.length)];
    c.sockets.add(socket.id);
    clients.set(id, c);
    socket.data.clientId = id;
    // keep seat names in sync with the profile
    state.seats.forEach((s) => {
      if (s?.clientId !== id) return;
      s.afk = false;
      if (c.name && !s.custom) { s.name = c.name; s.avatar = c.avatar; }
    });
    broadcast();
    return { ok: true, clientId: id };
  }));

  socket.on('invite', wrap(() => { invite().then((r) => socket.emit('invite', r)); }));

  // A device can take several seats: the extra ones are friends sharing that device (own name/avatar).
  socket.on('seat:take', wrap(({ seat, name, avatar }) => {
    const c = clients.get(me());
    if (state.phase !== 'lobby') throw new Error('Game already started');
    if (!c?.name) throw new Error('Enter your name first');
    if (!(seat >= 0 && seat < 4) || state.seats[seat]) throw new Error('Seat taken');
    const extraName = String(name || '').trim().slice(0, 14);
    state.seats[seat] = extraName
      ? { kind: 'human', clientId: me(), name: extraName, avatar: AVATARS.includes(avatar) ? avatar : c.avatar, custom: true }
      : { kind: 'human', clientId: me(), name: c.name, avatar: c.avatar };
    broadcast();
  }));

  socket.on('poke', (p = {}) => {
    const now = Date.now();
    if (now - (socket.data.lastPoke || 0) < 120) return;
    socket.data.lastPoke = now;
    const seat = Number(p.seat);
    const token = Number(p.token);
    if (!(seat >= 0 && seat < 4 && token >= 0 && token < 4)) return;
    const reaction = String(p.reaction || '').slice(0, 16);
    const text = String(p.text || '').slice(0, 24);
    socket.broadcast.emit('poke', { seat, token, reaction, text });
  });

  socket.on('seat:bot', wrap(({ seat }) => {
    if (state.phase !== 'lobby') throw new Error('Game already started');
    if (!(seat >= 0 && seat < 4) || state.seats[seat]) throw new Error('Seat taken');
    const used = state.seats.filter(Boolean).map((s) => s.name);
    const name = BOT_NAMES.find((n) => !used.includes(n)) || 'Bot';
    state.seats[seat] = { kind: 'bot', name, avatar: '🤖' };
    broadcast();
  }));

  socket.on('seat:leave', wrap(({ seat }) => {
    if (state.phase !== 'lobby') throw new Error('Game already started');
    const s = state.seats[seat];
    if (!s) return;
    if (s.kind === 'human' && s.clientId !== me()) throw new Error('That is not your seat');
    state.seats[seat] = null;
    broadcast();
  }));

  socket.on('game:start', wrap(() => {
    if (state.phase !== 'lobby') throw new Error('Already playing');
    const filled = state.seats.filter(Boolean);
    if (filled.length < 2) throw new Error('Need at least 2 players (add a bot!)');
    if (!state.seats.some((s, i) => s && owns(i))) throw new Error('Take a seat first');
    state = { ...freshState(state.seats), phase: 'playing' };
    state.turn = state.seats.findIndex(Boolean);
    emitEvent({ type: 'start' });
    log('🎉 Game started! Roll a 6 to bring a pawn out.');
    broadcast();
  }));

  socket.on('roll', wrap(() => {
    const seat = state.turn;
    if (state.phase !== 'playing' || !owns(seat)) throw new Error('Not your turn');
    if (state.rolled) throw new Error('Already rolled');
    state.seats[seat].afk = false;
    act(seat, () => doRoll(seat));
  }));

  socket.on('move', wrap(({ token }) => {
    const seat = state.turn;
    if (state.phase !== 'playing' || !owns(seat)) throw new Error('Not your turn');
    if (!state.rolled || !state.movable.includes(token)) throw new Error('That pawn cannot move');
    state.seats[seat].afk = false;
    act(seat, () => doMove(seat, token));
  }));

  socket.on('emote', wrap(({ emoji }) => {
    if (typeof emoji !== 'string' || emoji.length > 8) return;
    const now = Date.now();
    if (now - (socket.data.lastEmote || 0) < 700) return;
    socket.data.lastEmote = now;
    const seat = state.seats.findIndex((s, i) => s && owns(i));
    const c = clients.get(me());
    io.emit('emote', { seat, name: c?.name || 'Spectator', emoji });
  }));

  socket.on('game:again', wrap(() => {
    if (state.phase !== 'finished') throw new Error('Game is not finished');
    state = freshState(state.seats);
    broadcast();
  }));

  socket.on('admin:reset', wrap(({ password }) => {
    const a = Buffer.from(String(password || ''));
    const b = Buffer.from(HOST_PASSWORD);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('Wrong host password');
    clearTimeout(timers.pass);
    state = freshState(state.seats);
    log('🔁 The host ended the game');
    broadcast();
  }));

  socket.on('disconnect', () => {
    const c = clients.get(me());
    if (c) c.sockets.delete(socket.id);
    broadcast(); // offline players are auto-played until they return
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const line = '─'.repeat(56);
  console.log(`\n${line}\n  🎲  3D LUDO — server running\n${line}`);
  console.log(`  On this computer:  http://localhost:${PORT}/`);
  for (const a of lanAddresses()) console.log(`  Same Wi-Fi (${a.name}): http://${a.address}:${PORT}/`);
  console.log(
    process.env.HOST_PASSWORD
      ? '  Host password: (the one you set in HOST_PASSWORD)'
      : `  Host password: ${HOST_PASSWORD}   (set your own with HOST_PASSWORD=...)`,
  );
  console.log(`${line}\n`);
});
