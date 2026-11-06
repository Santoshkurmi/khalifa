// Langur Burja (Jhandi Munda / Khorkhore) — LAN multiplayer server
const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { Server } = require('socket.io');

const PORT = Number(process.env.PORT) || 3000;
// Host password: set HOST_PASSWORD, or one is generated and printed at startup.
const HOST_PASSWORD = process.env.HOST_PASSWORD || crypto.randomBytes(3).toString('hex');
const PASSWORD_GENERATED = !process.env.HOST_PASSWORD;
const failedLogins = new Map(); // ip -> { count, until }
const SYMBOL_COUNT = 6;
const DICE_COUNT = 6;
const ROLL_MS = 4300; // must cover the client dice animation
const RESULT_MS = 7000; // pause before the next auto round

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three')));
app.get('/host', (_req, res) => res.sendFile(path.join(__dirname, 'public/host.html')));

// ---------------------------------------------------------------- state
const defaults = { bankStart: 10000, startingBalance: 1000, bettingSeconds: 20, autoPlay: false };
const state = {
  phase: 'lobby', // lobby | betting | rolling | result
  round: 0,
  bank: defaults.bankStart,
  dice: null,
  rollId: 0,
  bettingEndsAt: null,
  history: [],
  results: null,
  settings: { ...defaults },
};
const players = new Map();
const timers = { betting: null, settle: null, auto: null };

const emptyBets = () => Array(SYMBOL_COUNT).fill(0);
const toInt = (v) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : NaN);

function publicState() {
  return {
    phase: state.phase,
    round: state.round,
    bank: state.bank,
    dice: state.dice,
    rollId: state.rollId,
    bettingEndsAt: state.bettingEndsAt,
    history: state.history.slice(0, 15),
    results: state.results,
    settings: state.settings,
    serverNow: Date.now(),
    players: [...players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      color: p.color,
      balance: p.balance,
      bets: p.bets,
      connected: p.sockets.size > 0,
      lastNet: p.lastNet,
      totalNet: p.totalNet,
    })),
  };
}

let broadcastQueued = false;
function broadcast() {
  if (broadcastQueued) return;
  broadcastQueued = true;
  setImmediate(() => {
    broadcastQueued = false;
    io.emit('state', publicState());
  });
}

function clearTimers() {
  for (const k of Object.keys(timers)) {
    clearTimeout(timers[k]);
    timers[k] = null;
  }
}

// ---------------------------------------------------------------- game flow
function startBetting() {
  if (state.phase === 'betting' || state.phase === 'rolling') return;
  clearTimers();
  for (const p of players.values()) {
    p.bets = emptyBets();
    p.lastNet = null;
  }
  state.round += 1;
  state.results = null;
  state.phase = 'betting';
  const secs = state.settings.bettingSeconds;
  state.bettingEndsAt = secs > 0 ? Date.now() + secs * 1000 : null;
  if (secs > 0) timers.betting = setTimeout(roll, secs * 1000);
  broadcast();
}

function roll() {
  if (state.phase !== 'betting') return;
  clearTimers();
  state.dice = Array.from({ length: DICE_COUNT }, () => crypto.randomInt(SYMBOL_COUNT));
  state.rollId += 1;
  state.phase = 'rolling';
  state.bettingEndsAt = null;
  timers.settle = setTimeout(settle, ROLL_MS);
  broadcast();
}

function settle() {
  const counts = Array(SYMBOL_COUNT).fill(0);
  for (const d of state.dice) counts[d] += 1;

  const perPlayer = {};
  let bankDelta = 0;
  for (const p of players.values()) {
    const staked = p.bets.reduce((a, b) => a + b, 0);
    if (!staked) continue;
    let net = 0;
    p.bets.forEach((stake, s) => {
      if (!stake) return;
      if (counts[s] >= 2) {
        // Nepali rule: 2+ matching dice pay stake × count, and the stake comes back.
        const win = stake * counts[s];
        p.balance += stake + win;
        net += win;
      } else {
        net -= stake;
      }
    });
    bankDelta -= net;
    p.lastNet = net;
    p.totalNet += net;
    p.lastBets = [...p.bets];
    perPlayer[p.id] = { net, staked };
  }
  state.bank += bankDelta;
  state.results = { counts, perPlayer, bankDelta };
  state.history.unshift({ round: state.round, dice: state.dice, counts });
  state.history.length = Math.min(state.history.length, 30);
  state.phase = 'result';
  if (state.settings.autoPlay) timers.auto = setTimeout(startBetting, RESULT_MS);
  broadcast();
}

// Bets are only "live" (unpaid) while betting/rolling; after settle they are kept just for display.
function refundBets(p) {
  const total = p.bets.reduce((a, b) => a + b, 0);
  if (state.phase === 'betting' || state.phase === 'rolling') p.balance += total;
  p.bets = emptyBets();
  return total;
}

// ---------------------------------------------------------------- networking
function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) out.push({ name, address: a.address });
    }
  }
  // Prefer typical Wi-Fi/Ethernet interfaces and private ranges first
  const score = (a) =>
    (/^(en|eth|wlan|wl|Wi-Fi)/i.test(a.name) ? 0 : 2) + (/^(192\.168|10\.|172\.)/.test(a.address) ? 0 : 1);
  return out.sort((a, b) => score(a) - score(b));
}

function passwordMatches(given) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(HOST_PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const AVATARS = ['🐵', '🐯', '🦁', '🐘', '🦚', '🐉', '🦅', '🐺', '🦊', '🐼', '🐸', '🐮', '🐻', '🦄', '🐷', '🐲'];
const COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#748ffc', '#da77f2', '#f783ac', '#20c997'];

io.on('connection', (socket) => {
  socket.emit('state', publicState());

  const me = () => players.get(socket.data.playerId);
  const requireHost = (fn) => (...args) => {
    const ack = typeof args[args.length - 1] === 'function' ? args.pop() : () => {};
    if (!socket.data.isHost) return ack({ error: 'Host only' });
    try {
      const r = fn(...args);
      ack(r || { ok: true });
    } catch (e) {
      ack({ error: e.message });
    }
    broadcast();
  };

  // ---------- players
  socket.on('join', (data = {}, ack = () => {}) => {
    const name = String(data.name || '').trim().replace(/\s+/g, ' ').slice(0, 16);
    if (!name) return ack({ error: 'Please enter a name' });
    const avatar = AVATARS.includes(data.avatar) ? data.avatar : AVATARS[crypto.randomInt(AVATARS.length)];
    let p = data.id && players.get(data.id);
    if (!p) {
      p = {
        id: crypto.randomUUID(),
        name,
        avatar,
        color: COLORS[players.size % COLORS.length],
        balance: state.settings.startingBalance,
        bets: emptyBets(),
        lastBets: null,
        lastNet: null,
        totalNet: 0,
        sockets: new Set(),
      };
      players.set(p.id, p);
    } else {
      p.name = name;
      p.avatar = avatar;
    }
    socket.data.playerId = p.id;
    p.sockets.add(socket.id);
    socket.join(`p:${p.id}`);
    ack({ ok: true, id: p.id });
    broadcast();
  });

  socket.on('bet', ({ symbol, amount } = {}, ack = () => {}) => {
    const p = me();
    symbol = toInt(symbol);
    amount = toInt(amount);
    if (!p) return ack({ error: 'Join the game first' });
    if (state.phase !== 'betting') return ack({ error: 'Betting is closed' });
    if (!(symbol >= 0 && symbol < SYMBOL_COUNT)) return ack({ error: 'Bad symbol' });
    if (!(amount > 0)) return ack({ error: 'Bad amount' });
    if (amount > p.balance) return ack({ error: 'Not enough money' });
    p.balance -= amount;
    p.bets[symbol] += amount;
    ack({ ok: true });
    broadcast();
  });

  socket.on('bet:clear', (ack = () => {}) => {
    const p = me();
    if (!p || state.phase !== 'betting') return ack({ error: 'Betting is closed' });
    refundBets(p);
    ack({ ok: true });
    broadcast();
  });

  socket.on('bet:repeat', (ack = () => {}) => {
    const p = me();
    if (!p || state.phase !== 'betting') return ack({ error: 'Betting is closed' });
    if (!p.lastBets) return ack({ error: 'No previous bet' });
    refundBets(p);
    const need = p.lastBets.reduce((a, b) => a + b, 0);
    if (need > p.balance) return ack({ error: 'Not enough money to repeat' });
    p.balance -= need;
    p.bets = [...p.lastBets];
    ack({ ok: true });
    broadcast();
  });

  // ---------- host
  socket.on('host:auth', async ({ password } = {}, ack = () => {}) => {
    const ip = socket.handshake.address || '?';
    const f = failedLogins.get(ip);
    if (f && f.until > Date.now()) {
      return ack({ error: `Too many wrong tries. Wait ${Math.ceil((f.until - Date.now()) / 1000)}s.` });
    }
    if (!passwordMatches(password)) {
      const count = (f?.count || 0) + 1;
      failedLogins.set(ip, { count, until: count >= 5 ? Date.now() + 30000 : 0 });
      return ack({ error: password ? 'Wrong password' : 'Enter the host password' });
    }
    failedLogins.delete(ip);
    socket.data.isHost = true;
    const port = server.address().port;
    const urls = lanAddresses().map((a) => `http://${a.address}:${port}/`);
    const qr = urls[0] ? await QRCode.toDataURL(urls[0], { margin: 1, width: 280 }) : null;
    ack({ ok: true, urls, qr });
  });

  socket.on('host:start', requireHost(() => {
    if (!['lobby', 'result'].includes(state.phase)) throw new Error('A round is already running');
    startBetting();
  }));

  socket.on('host:roll', requireHost(() => {
    if (state.phase !== 'betting') throw new Error('Open betting first');
    roll();
  }));

  socket.on('host:settings', requireHost((s = {}) => {
    const st = state.settings;
    if (s.startingBalance !== undefined) st.startingBalance = Math.max(0, toInt(s.startingBalance) || 0);
    if (s.bettingSeconds !== undefined) st.bettingSeconds = Math.min(300, Math.max(0, toInt(s.bettingSeconds) || 0));
    if (s.autoPlay !== undefined) {
      st.autoPlay = !!s.autoPlay;
      if (st.autoPlay && state.phase === 'result' && !timers.auto) timers.auto = setTimeout(startBetting, 2500);
      if (!st.autoPlay) {
        clearTimeout(timers.auto);
        timers.auto = null;
      }
    }
  }));

  socket.on('host:bank', requireHost(({ amount } = {}) => {
    amount = toInt(amount);
    if (!amount) throw new Error('Enter an amount');
    state.bank += amount;
  }));

  socket.on('host:give', requireHost(({ id, amount } = {}) => {
    const p = players.get(id);
    amount = toInt(amount);
    if (!p) throw new Error('Player not found');
    if (!amount) throw new Error('Enter an amount');
    if (p.balance + amount < 0) throw new Error(`${p.name} only has ${p.balance}`);
    p.balance += amount;
    state.bank -= amount;
  }));

  socket.on('host:kick', requireHost(({ id } = {}) => {
    const p = players.get(id);
    if (!p) throw new Error('Player not found');
    refundBets(p);
    io.to(`p:${p.id}`).emit('kicked');
    players.delete(id);
  }));

  socket.on('host:reset', requireHost(() => {
    clearTimers();
    Object.assign(state, {
      phase: 'lobby', round: 0, bank: state.settings.bankStart, dice: null,
      bettingEndsAt: null, history: [], results: null,
    });
    for (const p of players.values()) {
      Object.assign(p, { balance: state.settings.startingBalance, bets: emptyBets(), lastBets: null, lastNet: null, totalNet: 0 });
    }
  }));

  socket.on('disconnect', () => {
    const p = me();
    if (p) {
      p.sockets.delete(socket.id);
      broadcast();
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const addrs = lanAddresses();
  const line = '─'.repeat(56);
  console.log(`\n${line}\n  🎲  LANGUR BURJA — server running\n${line}`);
  console.log(`  HOST (you):      http://localhost:${PORT}/host`);
  for (const a of addrs) console.log(`  PLAYERS (${a.name}): http://${a.address}:${PORT}/`);
  console.log(
    PASSWORD_GENERATED
      ? `  Host password: ${HOST_PASSWORD}   (random — set your own with HOST_PASSWORD=...)`
      : '  Host password: (the one you set in HOST_PASSWORD)',
  );
  console.log(line + '\n');
});
