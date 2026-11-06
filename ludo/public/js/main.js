import { LudoBoard } from './board3d.js';
import { COLORS, HOME } from './geometry.js';
import { sfx } from './sfx.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};
const AVATARS = ['🐵', '🐯', '🦁', '🐘', '🦚', '🐉', '🦅', '🐺', '🦊', '🐼', '🐸', '🐮', '🐻', '🦄', '🐷', '🐲'];
const EMOTES = ['😂', '😎', '😡', '😭', '🔥', '🎉', '👏', '🙏'];
const TURN_MS = 30000;
const POS = ['bl', 'tl', 'tr', 'br']; // clockwise from your seat

const socket = window.io();
let clientId = store.get('ludo-id');
let profile = { name: store.get('ludo-name') || '', avatar: store.get('ludo-avatar') || AVATARS[Math.floor(Math.random() * AVATARS.length)] };
let S = null; // last *applied* state
let first = true;
let lastEventId = null;
let clockOffset = 0;
let viewSeat = null;
let lastTurnKey = null;
const queue = [];
let pumping = false;

// ------------------------------------------------------------------ board
const board = new LudoBoard($('#stage'), {
  onDie: () => roll(),
  onPawn: (t) => move(t),
  onHop: (i, n) => sfx.hop(i, n),
  onCapture: () => { sfx.capture(); navigator.vibrate?.([30, 40, 60]); },
  onHome: () => sfx.home(),
  onDieBounce: (s) => sfx.dieBounce(s),
  onHoverPawn: () => sfx.hover(),
  sfx: (name, ...args) => sfx[name]?.(...args),
  onPoke: (p) => socket.emit('poke', p),
  onPreview: (info) => {
    if (info.capture) hint('💥 This move knocks out an opponent!');
    else if (info.home) hint('🏠 This pawn reaches home!');
  },
});
board.setAutoRotate(true);
window.__ludo = { board }; // handy for debugging from the console

// ------------------------------------------------------------------ helpers
function toast(html, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = html;
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 2300);
  setTimeout(() => el.remove(), 2800);
}
let hintTimer;
function hint(text) {
  const el = $('#hint');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => el.classList.remove('show'), 1600);
}
const ackErr = (r) => r?.error && toast(esc(r.error), 'error');
const mySeats = (st = S) => (st ? st.seats.map((s, i) => (s && s.kind === 'human' && s.clientId === clientId ? i : -1)).filter((i) => i >= 0) : []);
const isMine = (seat, st = S) => mySeats(st).includes(seat);
const seatName = (i, st = S) => {
  const s = st.seats[i];
  return s ? `<b style="color:${COLORS[i].hex}">${esc(s.name)}</b>` : COLORS[i].name;
};

function confetti(n = 160) {
  const fx = $('#fx');
  const colors = COLORS.map((c) => c.hex).concat(['#ffffff', '#ffe08a']);
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.className = 'confetti';
    p.style.left = `${Math.random() * 100}vw`;
    p.style.background = colors[i % colors.length];
    p.style.setProperty('--dx', `${(Math.random() - 0.5) * 30}vw`);
    p.style.setProperty('--rot', `${Math.random() * 1080 - 540}deg`);
    p.style.animationDelay = `${Math.random() * 0.6}s`;
    p.style.animationDuration = `${2.4 + Math.random() * 2}s`;
    fx.appendChild(p);
    setTimeout(() => p.remove(), 5200);
  }
}

// ------------------------------------------------------------------ actions
function roll() {
  if (!S || S.phase !== 'playing' || !isMine(S.turn) || S.rolled || pumping) { board.cancelThrow(); return; }
  sfx.click();
  socket.emit('roll', (r) => { if (r?.error) { board.cancelThrow(); ackErr(r); } });
}
function move(token) {
  if (!S || S.phase !== 'playing' || !isMine(S.turn) || !S.rolled || !S.movable.includes(token)) { board.cancelDrops(); return; }
  sfx.click();
  board.setInteractive({ ...board.inter, pawns: [] });
  socket.emit('move', { token }, (r) => { if (r?.error) { board.cancelDrops(); ackErr(r); } });
}

// someone poked a character on their screen, so it reacts here too
socket.on('poke', ({ seat, token, reaction, text }) => board.poke(seat, token, { reaction, text, remote: true }));

// ------------------------------------------------------------------ event queue
socket.on('state', (st) => {
  clockOffset = st.serverNow - Date.now();
  queue.push(st);
  pump();
});

async function pump() {
  if (pumping) return;
  pumping = true;
  while (queue.length) {
    const st = queue.shift();
    try {
      await apply(st, queue.length > 2);
    } catch (e) {
      console.error(e);
    }
  }
  pumping = false;
  render();
}

async function apply(st, fast) {
  const ev = st.event;
  board.setSeated(st.seats.map((s) => !!s));
  if (first) {
    first = false;
    lastEventId = ev?.id ?? null;
    if (st.dice) board.placeDie(st.turn, st.dice);
    board.setTokens(st.tokens);
    S = st;
    return;
  }
  if (ev && ev.id !== lastEventId) {
    lastEventId = ev.id;
    if (ev.type === 'start') {
      board.setTokens(st.tokens);
      sfx.win();
      toast('🎉 Game on! Roll a <b>6</b> to bring a pawn out');
    } else if (ev.type === 'roll') {
      S = { ...S, rolled: false };
      board.setInteractive({ turnSeat: ev.seat });
      await board.rollDice(ev.seat, ev.value, { fast });
      showDice(ev.value, ev.seat);
      if (ev.voided) { sfx.noMove(); toast(`🎲🎲🎲 Three 6s! ${seatName(ev.seat, st)} loses the turn`, 'warn'); }
      else if (ev.noMoves) { sfx.noMove(); if (isMine(ev.seat, st)) hint('No moves, passing the turn…'); }
      else if (ev.value === 6) sfx.six();
    } else if (ev.type === 'move') {
      board.setInteractive({ turnSeat: ev.seat });
      await board.animateMove(ev, st.tokens, { fast });
      if (ev.captures.length) toast(`💥 ${seatName(ev.seat, st)} knocked out ${ev.captures.map((c) => seatName(c.seat, st)).join(', ')}!`, 'boom');
      if (ev.extra && st.phase === 'playing' && st.turn === ev.seat) {
        const why = ev.captures.length ? 'capture' : ev.reachedHome ? 'home' : 'six';
        toast(`⭐ Bonus roll for ${seatName(ev.seat, st)} <small>(${why})</small>`);
      }
    }
  }
  S = st;
  board.setTokens(st.tokens);
}

function showDice(v, seat) {
  const b = $('#diceBadge');
  b.textContent = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][v];
  b.style.setProperty('--c', COLORS[seat].hex);
  b.classList.remove('pop');
  void b.offsetWidth;
  b.classList.add('pop');
}

// ------------------------------------------------------------------ render
function render() {
  if (!S) return;
  document.body.dataset.phase = S.phase;
  const mine = mySeats();

  // camera: look from your seat (or the active one if you control several)
  const want = mine.includes(S.turn) ? S.turn : mine[0] ?? 3;
  if (S.phase === 'lobby') {
    board.setAutoRotate(true);
  } else {
    board.setAutoRotate(false);
    if (want !== viewSeat) {
      viewSeat = want;
      board.setView(want);
    }
  }

  renderCards();
  renderLobby();
  renderResults();
  renderFeed();

  // interaction + status
  const playing = S.phase === 'playing';
  const myTurn = playing && mine.includes(S.turn);
  const canRoll = myTurn && !S.rolled;
  const canMove = myTurn && S.rolled && S.movable.length > 0;
  board.setInteractive(playing ? {
    turnSeat: S.turn, seat: S.turn, canRoll, pawns: canMove ? S.movable : [], dice: S.dice,
  } : null);
  const btn = $('#rollBtn');
  btn.hidden = !canRoll;
  btn.style.setProperty('--c', playing ? COLORS[S.turn].hex : '#fff');

  const st = $('#status');
  if (!playing) st.innerHTML = '';
  else {
    const s = S.seats[S.turn];
    const who = `<span class="dot" style="background:${COLORS[S.turn].hex}"></span>`;
    if (canRoll) st.innerHTML = `${who}<b>${mine.length > 1 ? esc(s.name) + ', your' : 'Your'} turn!</b> Grab &amp; flick the dice 🎲`;
    else if (canMove) st.innerHTML = `${who}You rolled <b>${S.dice}</b>. Drag or tap a glowing buddy`;
    else if (myTurn) st.innerHTML = `${who}No moves…`;
    else st.innerHTML = `${who}<b>${esc(s.name)}</b> ${S.rolled ? 'is moving…' : 'is rolling…'}${s.kind === 'bot' ? ' 🤖' : s.afk || !s.connected ? ' (autoplay)' : ''}`;
  }
  st.style.setProperty('--c', playing ? COLORS[S.turn].hex : 'transparent');

  const turnKey = `${S.turn}:${S.event?.id}`;
  if (myTurn && canRoll && lastTurnKey !== turnKey) {
    lastTurnKey = turnKey;
    sfx.yourTurn();
    navigator.vibrate?.(40);
  }
}

function renderCards() {
  const base = viewSeat ?? 3;
  for (let i = 0; i < 4; i++) {
    const el = $(`#card-${i}`);
    const s = S.seats[i];
    el.dataset.pos = POS[(i - base + 4) % 4];
    el.hidden = !s || S.phase === 'lobby';
    if (!s) continue;
    el.style.setProperty('--c', COLORS[i].hex);
    el.classList.toggle('active', S.phase === 'playing' && S.turn === i);
    el.classList.toggle('mine', isMine(i));
    const rank = S.ranking.indexOf(i);
    const tag = isMine(i) ? 'YOU' : s.kind === 'bot' ? 'BOT' : !s.connected ? 'OFFLINE' : s.afk ? 'AWAY' : '';
    const pips = S.tokens[i].map((p) => `<i class="${p === HOME ? 'home' : p >= 0 ? 'out' : ''}"></i>`).join('');
    const html = `
      <div class="pav"><span>${s.avatar}</span></div>
      <div class="pinfo">
        <div class="pname">${esc(s.name)} ${tag ? `<em>${tag}</em>` : ''}</div>
        <div class="pips">${pips}</div>
      </div>
      ${rank >= 0 ? `<div class="medal">${['🥇', '🥈', '🥉', '4️⃣'][rank]}</div>` : ''}`;
    if (el._html !== html) { el._html = html; el.querySelector('.inner').innerHTML = html; }
  }
}

function tickTimer() {
  requestAnimationFrame(tickTimer);
  if (!S) return;
  for (let i = 0; i < 4; i++) {
    const el = $(`#card-${i}`);
    const on = S.phase === 'playing' && S.turn === i && S.turnEndsAt;
    const left = on ? Math.max(0, S.turnEndsAt - (Date.now() + clockOffset)) : TURN_MS;
    el.style.setProperty('--t', `${(left / TURN_MS) * 100}%`);
    el.classList.toggle('hurry', !!on && left < 8000);
  }
}
requestAnimationFrame(tickTimer);

// ------------------------------------------------------------------ lobby
function renderLobby() {
  const lobby = $('#lobby');
  lobby.hidden = S.phase !== 'lobby';
  if (lobby.hidden) return;
  const mine = mySeats();
  $('#meChip').innerHTML = profile.name
    ? `<span class="av">${profile.avatar}</span><b>${esc(profile.name)}</b>`
    : '<span class="av">👤</span><b>Set your name</b>';
  const html = S.seats.map((s, i) => {
    const c = COLORS[i];
    let body;
    if (!s) {
      body = `<div class="seat-empty">Empty seat</div>
        <div class="seat-actions"><button class="btn solid" data-act="take" data-seat="${i}">${mine.length ? '+ Friend here 📱' : 'Sit here'}</button>
        <button class="btn" data-act="bot" data-seat="${i}">+ Bot 🤖</button></div>`;
    } else {
      const me = s.kind === 'human' && s.clientId === clientId;
      body = `<div class="seat-who"><span class="big">${s.avatar}</span><div><b>${esc(s.name)}</b>
        <small>${s.kind === 'bot' ? 'Computer player' : me ? 'You' : s.connected ? 'Ready' : 'Offline'}</small></div></div>
        <div class="seat-actions">${s.kind === 'bot' ? `<button class="btn" data-act="leave" data-seat="${i}">Remove bot</button>`
        : me ? `<button class="btn" data-act="leave" data-seat="${i}">Leave seat</button>` : ''}</div>`;
    }
    return `<div class="seat ${s ? 'filled' : ''}" style="--c:${c.hex};--cl:${c.light};--cd:${c.dark}">
      <div class="seat-head"><span class="pawn-ico"></span>${c.name}</div>${body}</div>`;
  }).join('');
  const grid = $('#seats');
  if (grid._html !== html) { grid._html = html; grid.innerHTML = html; }
  const filled = S.seats.filter(Boolean).length;
  const start = $('#startBtn');
  start.disabled = filled < 2 || !mine.length;
  $('#startHint').textContent = !mine.length
    ? 'Pick a colour to join the game'
    : filled < 2 ? 'Need one more player. Invite a friend or add a bot!' : `${filled} players ready`;
}

$('#seats').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const seat = Number(b.dataset.seat);
  sfx.click();
  if (b.dataset.act === 'take') {
    if (!profile.name) return openProfile(() => socket.emit('seat:take', { seat }, ackErr));
    if (mySeats().length) return openExtraPlayer(seat);
    socket.emit('seat:take', { seat }, ackErr);
  } else if (b.dataset.act === 'bot') socket.emit('seat:bot', { seat }, ackErr);
  else socket.emit('seat:leave', { seat }, ackErr);
});
$('#startBtn').addEventListener('click', () => socket.emit('game:start', ackErr));
$('#meChip').addEventListener('click', () => openProfile());
$('#inviteBtn').addEventListener('click', () => {
  $('#invite').hidden = !$('#invite').hidden;
  socket.emit('invite');
});
socket.on('invite', ({ urls, qr }) => {
  $('#qr').src = qr || '';
  $('#qr').hidden = !qr;
  $('#urls').innerHTML = urls.map((u) => `<code>${esc(u)}</code>`).join('') || '<small>Connect this computer to Wi-Fi</small>';
});

// ------------------------------------------------------------------ results
let celebrated = false;
function renderResults() {
  const box = $('#results');
  box.hidden = S.phase !== 'finished';
  if (box.hidden) { celebrated = false; return; }
  const html = S.ranking.map((seat, i) => {
    const s = S.seats[seat];
    return `<div class="podium p${i}" style="--c:${COLORS[seat].hex}">
      <div class="medal">${['🥇', '🥈', '🥉', '4️⃣'][i]}</div>
      <div class="pav"><span>${s.avatar}</span></div>
      <b>${esc(s.name)}</b><small>${['Winner!', '2nd place', '3rd place', '4th place'][i]}</small></div>`;
  }).join('');
  $('#podium').innerHTML = html;
  if (!celebrated) {
    celebrated = true;
    const winner = S.ranking[0];
    $('#winTitle').innerHTML = isMine(winner) ? 'You win! 🎉' : `${esc(S.seats[winner].name)} wins!`;
    confetti();
    sfx.win();
  }
}
$('#againBtn').addEventListener('click', () => socket.emit('game:again', ackErr));

// ------------------------------------------------------------------ feed
const seenLog = new Set();
function renderFeed() {
  const feed = $('#feed');
  for (const item of [...S.log].reverse()) {
    if (seenLog.has(item.id)) continue;
    seenLog.add(item.id);
    const el = document.createElement('div');
    el.className = 'feed-item';
    el.textContent = item.text;
    feed.prepend(el);
    setTimeout(() => el.classList.add('fade'), 6000);
    setTimeout(() => el.remove(), 7000);
  }
  while (feed.children.length > 4) feed.lastChild.remove();
}

// ------------------------------------------------------------------ emotes
const emoteBar = $('#emotes');
EMOTES.forEach((e) => {
  const b = document.createElement('button');
  b.textContent = e;
  b.addEventListener('click', () => { socket.emit('emote', { emoji: e }); sfx.pop(); });
  emoteBar.appendChild(b);
});
socket.on('emote', ({ seat, name, emoji }) => {
  const card = seat >= 0 ? $(`#card-${seat}`) : null;
  const r = card && !card.hidden ? card.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
  const el = document.createElement('div');
  el.className = 'emote-float';
  el.textContent = emoji;
  el.style.left = `${r.left + r.width / 2}px`;
  el.style.top = `${r.top + r.height / 2}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
  if (seat < 0) toast(`${esc(name)}: ${emoji}`);
});

// ------------------------------------------------------------------ profile
const grid = $('#avatarGrid');
AVATARS.forEach((a) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = a;
  b.addEventListener('click', () => {
    if (extraSeat !== null) extraAvatar = a;
    else profile.avatar = a;
    $$('button', grid).forEach((x) => x.classList.toggle('sel', x === b));
  });
  grid.appendChild(b);
});
let afterProfile = null;
let extraSeat = null; // adding a second player who shares this device
let extraAvatar = null;
function openExtraPlayer(seat) {
  extraSeat = seat;
  afterProfile = null;
  $('#profileTitle').textContent = 'Add a friend on this device';
  $('#profileSub').hidden = false;
  $('#nameInput').value = '';
  const used = new Set(S.seats.filter(Boolean).map((s) => s.avatar));
  extraAvatar = AVATARS.find((a) => !used.has(a)) || AVATARS[0];
  $$('button', grid).forEach((x) => x.classList.toggle('sel', x.textContent === extraAvatar));
  $('#profile').hidden = false;
  setTimeout(() => $('#nameInput').focus(), 50);
}
function openProfile(cb) {
  afterProfile = cb || null;
  extraSeat = null;
  $('#profileTitle').textContent = "Who's playing?";
  $('#profileSub').hidden = true;
  $('#nameInput').value = profile.name;
  $$('button', grid).forEach((x) => x.classList.toggle('sel', x.textContent === profile.avatar));
  $('#profile').hidden = false;
  setTimeout(() => $('#nameInput').focus(), 50);
}
$('#profileForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#nameInput').value.trim();
  if (!name) return toast('Enter a name', 'error');
  if (extraSeat !== null) {
    socket.emit('seat:take', { seat: extraSeat, name: name.slice(0, 14), avatar: extraAvatar }, ackErr);
    extraSeat = null;
    $('#profile').hidden = true;
    return;
  }
  profile.name = name.slice(0, 14);
  store.set('ludo-name', profile.name);
  store.set('ludo-avatar', profile.avatar);
  $('#profile').hidden = true;
  hello();
  const cb = afterProfile;
  afterProfile = null;
  if (cb) setTimeout(cb, 150);
  if (S) render();
});
$('#profileClose').addEventListener('click', () => { $('#profile').hidden = true; });

// ------------------------------------------------------------------ menu
$('#menuBtn').addEventListener('click', () => { $('#menu').hidden = false; });
$('#menuClose').addEventListener('click', () => { $('#menu').hidden = true; });
$('#menu').addEventListener('click', (e) => { if (e.target.id === 'menu') $('#menu').hidden = true; });
$('#resetForm').addEventListener('submit', (e) => {
  e.preventDefault();
  socket.emit('admin:reset', { password: $('#pwInput').value }, (r) => {
    if (r.error) return toast(esc(r.error), 'error');
    $('#pwInput').value = '';
    $('#menu').hidden = true;
    toast('Game ended, back to the lobby');
  });
});
$('#viewBtn').addEventListener('click', () => {
  board.setView(viewSeat ?? 3, { top: !board.view.top });
  $('#viewBtn').classList.toggle('on', board.view.top);
});
$('#resetViewBtn').addEventListener('click', () => board.setView(viewSeat ?? 3, { top: false }));
// day / night
let night = store.get('ludo-night') === '1';
board.setNight(night, { instant: true });
document.body.classList.toggle('night', night);
$('#themeBtn').textContent = night ? '☀️' : '🌙';
$('#themeBtn').addEventListener('click', () => {
  night = !night;
  store.set('ludo-night', night ? '1' : '0');
  board.setNight(night);
  document.body.classList.toggle('night', night);
  $('#themeBtn').textContent = night ? '☀️' : '🌙';
});

$('#muteBtn').textContent = sfx.muted ? '🔇' : '🔊';
$('#muteBtn').addEventListener('click', () => { $('#muteBtn').textContent = sfx.toggle() ? '🔇' : '🔊'; });
$('#rollBtn').addEventListener('click', roll);
window.addEventListener('keydown', (e) => {
  if (e.target.closest('input')) return;
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); roll(); }
  const n = Number(e.key);
  if (n >= 1 && n <= 4) move(n - 1);
});

// ------------------------------------------------------------------ connect
function hello() {
  socket.emit('hello', { clientId, name: profile.name, avatar: profile.avatar }, (r) => {
    if (r?.clientId) { clientId = r.clientId; store.set('ludo-id', clientId); }
    if (S) render();
  });
}
socket.on('connect', () => { $('#conn').hidden = true; hello(); });
socket.on('disconnect', () => { $('#conn').hidden = false; });
if (!profile.name) openProfile();
