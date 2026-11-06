import { SYMBOLS, symbolURL } from './symbols.js';
import { DiceTable } from './dice3d.js';
import { sfx } from './sfx.js';

const isHost = document.body.dataset.mode === 'host';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sum = (a) => a.reduce((x, y) => x + y, 0);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => `रु ${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;
const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + money(n);
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};

const CHIPS = [10, 50, 100, 500, 1000];
const AVATARS = ['🐵', '🐯', '🦁', '🐘', '🦚', '🐉', '🦅', '🐺', '🦊', '🐼', '🐸', '🐮', '🐻', '🦄', '🐷', '🐲'];
const PHASE_LABEL = { lobby: 'Lobby', betting: 'Betting open', rolling: 'Rolling', result: 'Results' };

const socket = window.io();
let S = null;
let myId = isHost ? null : store.get('lb-id');
let clockOffset = 0;
let seenRollId = null;
let highlightedRoll = null;
let celebratedRound = null;
let lastPhase = null;
let chip = Number(store.get('lb-chip')) || 50;
let lastTickSec = null;

// ------------------------------------------------------------------ helpers
function toast(msg, kind = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3100);
}

function animateNumber(el, to, fmt = money) {
  if (!el) return;
  const from = el._v ?? to;
  el._v = to;
  if (from === to) { el.textContent = fmt(to); return; }
  el.classList.remove('bump-up', 'bump-down');
  void el.offsetWidth;
  el.classList.add(to > from ? 'bump-up' : 'bump-down');
  const t0 = performance.now();
  const dur = 700;
  cancelAnimationFrame(el._raf);
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (k < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}

function setHTML(el, html) {
  if (el && el._html !== html) { el._html = html; el.innerHTML = html; }
}

function confetti(n = 140) {
  const fx = $('#fx');
  const colors = ['#ffd166', '#ef476f', '#06d6a0', '#4cc9f0', '#f8f9fa', '#e8be5c'];
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.className = 'confetti';
    p.style.left = `${Math.random() * 100}vw`;
    p.style.background = colors[i % colors.length];
    p.style.setProperty('--dx', `${(Math.random() - 0.5) * 30}vw`);
    p.style.setProperty('--rot', `${Math.random() * 1080 - 540}deg`);
    p.style.animationDelay = `${Math.random() * 0.5}s`;
    p.style.animationDuration = `${2.4 + Math.random() * 1.8}s`;
    fx.appendChild(p);
    setTimeout(() => p.remove(), 5000);
  }
}

function flyChip(fromEl, toEl, value) {
  if (!fromEl || !toEl) return;
  const a = fromEl.getBoundingClientRect();
  const b = toEl.getBoundingClientRect();
  const c = document.createElement('div');
  c.className = `chip chip-${value} flying`;
  c.textContent = chipLabel(value);
  c.style.left = `${a.left + a.width / 2 - 22}px`;
  c.style.top = `${a.top + a.height / 2 - 22}px`;
  document.body.appendChild(c);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height * 0.62 - (a.top + a.height / 2);
  c.animate(
    [
      { transform: 'translate(0,0) scale(1) rotate(0)' },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(1.15) rotate(180deg)`, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(.7) rotate(360deg)`, opacity: 0.2 },
    ],
    { duration: 480, easing: 'cubic-bezier(.4,.1,.3,1)' },
  ).onfinish = () => c.remove();
}

const chipLabel = (v) => (v >= 1000 ? `${v / 1000}K` : String(v));

// ------------------------------------------------------------------ 3D table
const table = new DiceTable($('#canvasWrap'), { onBounce: (s) => sfx.bounce(s) });

// ------------------------------------------------------------------ board
function buildBoard() {
  const wrap = $('#tiles');
  SYMBOLS.forEach((sym, i) => {
    const b = document.createElement('button');
    b.className = 'tile';
    b.dataset.s = i;
    b.innerHTML = `
      <span class="tile-count"></span>
      <img class="tile-img" src="${symbolURL(i)}" alt="${sym.en}">
      <span class="tile-name">${sym.name}<small>${sym.np} · ${sym.en}</small></span>
      <span class="tile-mine"></span>
      <span class="tile-pot"></span>
      <span class="tile-bettors"></span>`;
    if (!isHost) b.addEventListener('click', () => placeBet(i, b));
    wrap.appendChild(b);
  });
}

function buildChips() {
  const bar = $('#chips');
  if (!bar) return;
  CHIPS.forEach((v) => {
    const c = document.createElement('button');
    c.className = `chip chip-${v}`;
    c.dataset.v = v;
    c.textContent = chipLabel(v);
    c.addEventListener('click', () => {
      chip = v;
      store.set('lb-chip', v);
      sfx.chip();
      renderChips();
    });
    bar.appendChild(c);
  });
  renderChips();
  $('#clearBtn').addEventListener('click', () => socket.emit('bet:clear', ackErr));
  $('#repeatBtn').addEventListener('click', () => socket.emit('bet:repeat', ackErr));
}

function renderChips() {
  const me = S?.players.find((p) => p.id === myId);
  $$('#chips .chip').forEach((c) => {
    const v = Number(c.dataset.v);
    c.classList.toggle('selected', v === chip);
    c.classList.toggle('unaffordable', !!me && v > me.balance);
  });
}

const ackErr = (r) => r?.error && toast(r.error, 'error');

function placeBet(symbol, tileEl) {
  if (!S || !myId) return;
  if (S.phase !== 'betting') return toast(S.phase === 'rolling' ? 'Dice are rolling!' : 'Wait for the host to open betting', 'error');
  const me = S.players.find((p) => p.id === myId);
  if (!me || me.balance < chip) return toast('Not enough money for that chip', 'error');
  flyChip($(`#chips .chip-${chip}`), tileEl, chip);
  sfx.chip();
  socket.emit('bet', { symbol, amount: chip }, ackErr);
}

function renderBoard(me) {
  const counts = S.phase === 'result' && S.results ? S.results.counts : null;
  $$('#tiles .tile').forEach((t) => {
    const s = Number(t.dataset.s);
    const bettors = S.players.filter((p) => p.bets[s] > 0);
    const pot = sum(bettors.map((p) => p.bets[s]));
    const mine = me ? me.bets[s] : 0;
    t.classList.toggle('open', S.phase === 'betting' && !isHost);
    t.classList.toggle('has-mine', mine > 0);
    t.classList.toggle('win', !!counts && counts[s] >= 2);
    t.classList.toggle('lose', !!counts && counts[s] < 2);
    const c = counts ? counts[s] : 0;
    setHTML($('.tile-count', t), counts && c > 0 ? `×${c}` : '');
    setHTML($('.tile-mine', t), mine ? `<i class="stack"></i>${money(mine)}` : '');
    setHTML($('.tile-pot', t), pot ? `Pot ${money(pot)}` : isHost ? 'No bets' : 'Tap to bet');
    const av = bettors.slice(0, 5).map((p) => `<span class="av" style="--c:${p.color}" title="${esc(p.name)}: ${money(p.bets[s])}">${p.avatar}</span>`).join('');
    setHTML($('.tile-bettors', t), av + (bettors.length > 5 ? `<span class="av more">+${bettors.length - 5}</span>` : ''));
  });
}

// ------------------------------------------------------------------ players
const playerEls = new Map();
function renderPlayers() {
  const list = $('#playerList');
  const live = S.phase === 'betting' || S.phase === 'rolling';
  const total = (p) => p.balance + (live ? sum(p.bets) : 0);
  const sorted = [...S.players].sort((a, b) => total(b) - total(a));
  $('#playerCount').textContent = sorted.length;
  $('#emptyPlayers').hidden = sorted.length > 0;
  for (const [id, el] of playerEls) {
    if (!sorted.find((p) => p.id === id)) { el.remove(); playerEls.delete(id); }
  }
  sorted.forEach((p, i) => {
    let el = playerEls.get(p.id);
    if (!el) {
      el = document.createElement('li');
      el.className = 'player';
      el.innerHTML = `
        <span class="rank"></span>
        <span class="pav"></span>
        <div class="pinfo">
          <div class="pname"></div>
          <div class="pbets"></div>
        </div>
        <div class="pmoney"><b class="pbal"></b><span class="pnet"></span></div>`;
      if (isHost) el.addEventListener('click', () => openManage(p.id));
      playerEls.set(p.id, el);
      el.classList.add('enter');
    }
    list.appendChild(el); // keeps sorted order
    el.classList.toggle('me', p.id === myId);
    el.classList.toggle('offline', !p.connected);
    el.style.setProperty('--c', p.color);
    $('.rank', el).textContent = i === 0 && sorted.length > 1 ? '👑' : `#${i + 1}`;
    $('.pav', el).textContent = p.avatar;
    setHTML($('.pname', el), `${esc(p.name)}${p.id === myId ? ' <em>you</em>' : ''}${p.connected ? '' : ' <em class="off">offline</em>'}`);
    const bets = p.bets
      .map((v, s) => (v ? `<span class="mini"><img src="${symbolURL(s, 64)}" alt="">${chipLabel(v)}</span>` : ''))
      .join('');
    setHTML($('.pbets', el), bets || `<span class="nobet">${S.phase === 'betting' ? 'thinking…' : ''}</span>`);
    animateNumber($('.pbal', el), p.balance);
    const net = $('.pnet', el);
    if (S.phase === 'result' && p.lastNet != null) {
      net.textContent = signed(p.lastNet);
      net.className = `pnet ${p.lastNet > 0 ? 'up' : p.lastNet < 0 ? 'down' : ''}`;
    } else if (sum(p.bets)) {
      net.textContent = `bet ${money(sum(p.bets))}`;
      net.className = 'pnet bet';
    } else {
      net.textContent = '';
      net.className = 'pnet';
    }
  });
}

// ------------------------------------------------------------------ history
function renderHistory() {
  const html = S.history.length
    ? S.history.slice(0, 12).map((h) => {
      const hits = h.counts.map((c, s) => [c, s]).filter(([c]) => c >= 2).sort((a, b) => b[0] - a[0]);
      const icons = hits.length
        ? hits.map(([c, s]) => `<span class="hit"><img src="${symbolURL(s, 64)}" alt="">×${c}</span>`).join('')
        : '<span class="nohit">no hit</span>';
      return `<li><span class="hr">R${h.round}</span><span class="hdice">${h.dice.map((d) => `<img src="${symbolURL(d, 48)}" alt="">`).join('')}</span><span class="hhits">${icons}</span></li>`;
    }).join('')
    : '<li class="empty">No rounds yet</li>';
  setHTML($('#history'), html);
}

// ------------------------------------------------------------------ banner / phase
function renderBanner(me) {
  let html = '';
  const counts = S.results?.counts;
  if (S.phase === 'lobby') {
    html = isHost
      ? `<h2>Ready to host</h2><p>Let players scan the QR code, then press <b>Start Round</b>.</p>`
      : `<h2>Namaste${me ? `, ${esc(me.name)}` : ''}! 🙏</h2><p>Waiting for the host to open betting…</p>`;
  } else if (S.phase === 'betting') {
    html = `<h2>Place your bets!</h2><p>${S.bettingEndsAt ? 'Dice roll when the timer ends' : isHost ? 'Press <b>Roll the Dice</b> when everyone is ready' : 'The host will roll soon'}</p>`;
  } else if (S.phase === 'rolling') {
    html = `<h2 class="shake">Rolling…</h2><p>खेल्दै · 6 dice in the air</p>`;
  } else if (S.phase === 'result' && counts) {
    const hits = counts.map((c, s) => [c, s]).filter(([c]) => c >= 2).sort((a, b) => b[0] - a[0]);
    const hitHtml = hits.length
      ? `<div class="hits">${hits.map(([c, s]) => `<span><img src="${symbolURL(s, 96)}" alt="">${SYMBOLS[s].name} ×${c}</span>`).join('')}</div>`
      : '<p>No symbol came twice — the bank takes everything!</p>';
    let mine = '';
    if (isHost) {
      const d = S.results.bankDelta;
      mine = `<div class="net ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">Bank ${signed(d)}</div>`;
    } else if (me && S.results.perPlayer[me.id]) {
      const n = S.results.perPlayer[me.id].net;
      mine = `<div class="net ${n > 0 ? 'up' : n < 0 ? 'down' : ''}">${n > 0 ? 'You won ' : n < 0 ? 'You lost ' : 'Even '}${money(n)}</div>`;
    }
    html = `${mine}${hitHtml}`;
  }
  setHTML($('#banner'), html);
}

function handlePhaseChange(me) {
  // dice
  if (seenRollId === null) {
    if (S.dice) table.roll(S.dice, { instant: true });
    seenRollId = S.rollId;
  } else if (S.dice && S.rollId !== seenRollId) {
    table.roll(S.dice, { instant: S.phase !== 'rolling' });
    seenRollId = S.rollId;
  }
  if (S.phase === 'result' && S.results && highlightedRoll !== S.rollId) {
    highlightedRoll = S.rollId;
    table.highlight(S.results.counts);
  }
  if (S.phase !== 'result' && lastPhase === 'result') table.clearHighlight();
  if (!S.dice && lastPhase !== null && lastPhase !== 'lobby') table.clearHighlight();

  // celebrations (not on first page load)
  if (lastPhase !== null && S.phase !== lastPhase) {
    if (S.phase === 'betting') sfx.open();
    if (S.phase === 'result' && celebratedRound !== S.round) {
      celebratedRound = S.round;
      const net = isHost ? S.results.bankDelta : S.results.perPlayer[me?.id]?.net;
      if (net > 0) { sfx.win(); confetti(); } else if (net < 0) sfx.lose();
      if (net != null) document.body.classList.add(net > 0 ? 'flash-win' : net < 0 ? 'flash-lose' : 'flash-none');
      setTimeout(() => document.body.classList.remove('flash-win', 'flash-lose', 'flash-none'), 1400);
    }
  }
  lastPhase = S.phase;
}

function tickCountdown() {
  requestAnimationFrame(tickCountdown);
  const el = $('#countdown');
  if (!S || S.phase !== 'betting' || !S.bettingEndsAt) {
    el.hidden = true;
    lastTickSec = null;
    return;
  }
  const left = Math.max(0, S.bettingEndsAt - (Date.now() + clockOffset));
  const sec = Math.ceil(left / 1000);
  el.hidden = false;
  el.textContent = `${sec}s`;
  el.classList.toggle('urgent', sec <= 5);
  const total = S.settings.bettingSeconds * 1000 || 1;
  el.style.setProperty('--p', `${(left / total) * 100}%`);
  if (sec !== lastTickSec) {
    if (lastTickSec !== null && sec <= 5 && sec > 0) sfx.tick();
    lastTickSec = sec;
  }
}
requestAnimationFrame(tickCountdown);

// ------------------------------------------------------------------ render
function render() {
  const me = S.players.find((p) => p.id === myId);
  $('#roundNo').textContent = S.round ? `Round ${S.round}` : 'Not started';
  const pb = $('#phaseBadge');
  pb.textContent = PHASE_LABEL[S.phase];
  pb.className = `phase ${S.phase}`;
  document.body.dataset.phase = S.phase;

  renderPlayers();
  renderBoard(me);
  renderHistory();
  renderBanner(me);
  handlePhaseChange(me);
  if (isHost) renderHost();
  else renderWallet(me);
}

function renderWallet(me) {
  renderChips();
  if (!me) return;
  $('#meAvatar').textContent = me.avatar;
  $('#meName').textContent = me.name;
  animateNumber($('#meBalance'), me.balance);
  animateNumber($('#topBalance'), me.balance);
  animateNumber($('#meOnTable'), sum(me.bets));
  const tn = $('#meTotal');
  animateNumber(tn, me.totalNet, signed);
  tn.className = me.totalNet > 0 ? 'up' : me.totalNet < 0 ? 'down' : '';
  const betting = S.phase === 'betting';
  $('#clearBtn').disabled = !betting || !sum(me.bets);
  $('#repeatBtn').disabled = !betting;
}

// ------------------------------------------------------------------ host
function renderHost() {
  animateNumber($('#bankBal'), S.bank);
  animateNumber($('#topBank'), S.bank);
  const onTable = sum(S.players.map((p) => sum(p.bets)));
  animateNumber($('#tableTotal'), onTable);
  $('#betCount').textContent = `${S.players.filter((p) => sum(p.bets) > 0).length}/${S.players.length}`;
  const btn = $('#primaryBtn');
  const map = {
    lobby: ['Start Round', 'start', false],
    result: ['Next Round', 'start', false],
    betting: ['Roll the Dice 🎲', 'roll', false],
    rolling: ['Rolling…', '', true],
  };
  const [label, action, dis] = map[S.phase];
  btn.textContent = label;
  btn.dataset.action = action;
  btn.disabled = dis;
  btn.classList.toggle('pulse', S.phase === 'betting');
  const st = S.settings;
  $('#autoPlay').checked = st.autoPlay;
  for (const [id, v] of [['betSecs', st.bettingSeconds], ['startBal', st.startingBalance]]) {
    const el = $(`#${id}`);
    if (document.activeElement !== el) el.value = v;
  }
  if (manageId) fillManage();
}

const hostAck = (r) => (r?.error ? toast(r.error, 'error') : null);

function setupHost() {
  const PW_KEY = 'lb-host-pw';
  const login = (password, silent) => socket.emit('host:auth', { password }, (r) => {
    if (r.error) {
      sessionStorage.removeItem(PW_KEY);
      $('#loginModal').hidden = false;
      if (!silent) {
        const err = $('#loginError');
        err.textContent = r.error;
        err.hidden = false;
        const card = $('#loginForm');
        card.classList.remove('shake-x');
        void card.offsetWidth;
        card.classList.add('shake-x');
      }
      $('#pwInput').focus();
      return;
    }
    try { sessionStorage.setItem(PW_KEY, password); } catch {}
    $('#loginModal').hidden = true;
    onHostInfo(r);
  });
  $('#loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    login($('#pwInput').value, false);
  });
  // re-login automatically after a reconnect (password kept only for this browser tab)
  socket.on('connect', () => {
    let saved = null;
    try { saved = sessionStorage.getItem(PW_KEY); } catch {}
    if (saved) login(saved, true);
    else { $('#loginModal').hidden = false; $('#pwInput').focus(); }
  });
  function onHostInfo(r) {
    $('#qr').src = r.qr || '';
    $('#qr').hidden = !r.qr;
    setHTML($('#urls'), r.urls.length
      ? r.urls.map((u) => `<button class="url" data-u="${u}">${u}</button>`).join('')
      : '<p class="muted">No Wi-Fi network found. Connect this computer to Wi-Fi.</p>');
    $$('#urls .url').forEach((b) => b.addEventListener('click', () => {
      navigator.clipboard?.writeText(b.dataset.u).then(() => toast('Link copied'));
    }));
  }
  $('#primaryBtn').addEventListener('click', (e) => {
    const a = e.currentTarget.dataset.action;
    if (a) socket.emit(`host:${a}`, hostAck);
  });
  $('#autoPlay').addEventListener('change', (e) => socket.emit('host:settings', { autoPlay: e.target.checked }, hostAck));
  $('#betSecs').addEventListener('change', (e) => socket.emit('host:settings', { bettingSeconds: e.target.value }, hostAck));
  $('#startBal').addEventListener('change', (e) => socket.emit('host:settings', { startingBalance: e.target.value }, hostAck));
  $('#bankAdd').addEventListener('click', () => socket.emit('host:bank', { amount: $('#bankAmt').value }, hostAck));
  $('#bankSub').addEventListener('click', () => socket.emit('host:bank', { amount: -$('#bankAmt').value }, hostAck));
  $('#resetBtn').addEventListener('click', () => {
    if (confirm('Reset the whole game? Bank, balances and history go back to the start.')) socket.emit('host:reset', hostAck);
  });

  // manage-player modal
  $('#mGive').addEventListener('click', () => socket.emit('host:give', { id: manageId, amount: $('#mAmt').value }, hostAck));
  $('#mTake').addEventListener('click', () => socket.emit('host:give', { id: manageId, amount: -$('#mAmt').value }, hostAck));
  $('#mKick').addEventListener('click', () => {
    const p = S.players.find((x) => x.id === manageId);
    if (p && confirm(`Remove ${p.name} from the game?`)) {
      socket.emit('host:kick', { id: manageId }, hostAck);
      closeManage();
    }
  });
  $('#mClose').addEventListener('click', closeManage);
  $('#manageModal').addEventListener('click', (e) => e.target.id === 'manageModal' && closeManage());
}

let manageId = null;
function openManage(id) {
  manageId = id;
  fillManage();
  $('#manageModal').hidden = false;
}
function closeManage() {
  manageId = null;
  $('#manageModal').hidden = true;
}
function fillManage() {
  const p = S.players.find((x) => x.id === manageId);
  if (!p) return closeManage();
  $('#mAvatar').textContent = p.avatar;
  $('#mName').textContent = p.name;
  animateNumber($('#mBal'), p.balance);
}

// ------------------------------------------------------------------ player join
function setupPlayer() {
  const grid = $('#avatarGrid');
  let avatar = store.get('lb-avatar') || AVATARS[Math.floor(Math.random() * AVATARS.length)];
  AVATARS.forEach((a) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = a;
    b.className = a === avatar ? 'sel' : '';
    b.addEventListener('click', () => {
      avatar = a;
      $$('button', grid).forEach((x) => x.classList.toggle('sel', x === b));
    });
    grid.appendChild(b);
  });
  $('#nameInput').value = store.get('lb-name') || '';

  const join = (name) => new Promise((res) => {
    socket.emit('join', { id: myId, name, avatar }, (r) => {
      if (r.error) { toast(r.error, 'error'); return res(false); }
      myId = r.id;
      store.set('lb-id', r.id);
      store.set('lb-name', name);
      store.set('lb-avatar', avatar);
      $('#joinModal').hidden = true;
      if (S) render();
      res(true);
    });
  });

  $('#joinForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#nameInput').value.trim();
    if (!name) return toast('Enter your name', 'error');
    join(name);
  });

  socket.on('connect', () => {
    const name = store.get('lb-name');
    if (name && myId) join(name);
    else $('#joinModal').hidden = false;
  });
  socket.on('kicked', () => {
    myId = null;
    store.set('lb-id', null);
    $('#joinModal').hidden = false;
    toast('The host removed you from the game', 'error');
  });
  $('#leaveBtn').addEventListener('click', () => {
    $('#joinModal').hidden = false;
  });
}

// ------------------------------------------------------------------ boot
buildBoard();
if (isHost) setupHost();
else { buildChips(); setupPlayer(); }

$('#muteBtn').textContent = sfx.muted ? '🔇' : '🔊';
$('#muteBtn').addEventListener('click', () => {
  $('#muteBtn').textContent = sfx.toggle() ? '🔇' : '🔊';
});

socket.on('state', (st) => {
  S = st;
  clockOffset = st.serverNow - Date.now();
  render();
});
socket.on('disconnect', () => {
  $('#conn').hidden = false;
});
socket.on('connect', () => {
  $('#conn').hidden = true;
});
