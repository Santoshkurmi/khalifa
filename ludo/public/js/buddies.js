// Cute, expressive "buddy" pieces with arms, eyebrows, mouths, personality actions and per-colour accessories.
import * as THREE from 'three';

const GUM = new THREE.LatheGeometry(
  [
    [0, 0], [0.26, 0], [0.33, 0.025], [0.375, 0.09], [0.395, 0.19], [0.39, 0.3], [0.365, 0.41],
    [0.32, 0.5], [0.25, 0.575], [0.16, 0.625], [0.07, 0.648], [0, 0.652],
  ].map(([x, y]) => new THREE.Vector2(x, y)),
  48,
);
const G = {
  eye: new THREE.SphereGeometry(0.118, 24, 16),
  pupil: new THREE.SphereGeometry(0.07, 18, 12),
  glint: new THREE.SphereGeometry(0.028, 8, 6),
  glint2: new THREE.SphereGeometry(0.014, 6, 4),
  brow: new THREE.CapsuleGeometry(0.02, 0.08, 4, 8),
  cheek: new THREE.SphereGeometry(0.06, 14, 10),
  foot: new THREE.SphereGeometry(0.09, 16, 10),
  arm: new THREE.CapsuleGeometry(0.065, 0.12, 6, 12),
  wing: new THREE.SphereGeometry(0.13, 16, 10),
  smile: new THREE.TorusGeometry(0.055, 0.015, 8, 20, Math.PI),
  open: new THREE.SphereGeometry(0.075, 18, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
  tongue: new THREE.SphereGeometry(0.036, 12, 8),
  oMouth: new THREE.SphereGeometry(0.042, 14, 10),
  belly: new THREE.SphereGeometry(0.21, 24, 16),
};
const M = {
  white: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }),
  black: new THREE.MeshStandardMaterial({ color: 0x1b1a2a, roughness: 0.25 }),
  glint: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  cheek: new THREE.MeshBasicMaterial({ color: 0xff6f91, transparent: true, opacity: 0.6 }),
  pink: new THREE.MeshStandardMaterial({ color: 0xffa3bb, roughness: 0.5 }),
  outline: new THREE.MeshBasicMaterial({ color: 0x1e1530, side: THREE.BackSide }),
  mouth: new THREE.MeshStandardMaterial({ color: 0x4a1028, roughness: 0.5, side: THREE.DoubleSide }),
  tongue: new THREE.MeshStandardMaterial({ color: 0xff7d9c, roughness: 0.5 }),
  brow: new THREE.MeshStandardMaterial({ color: 0x2a1f30, roughness: 0.5 }),
};

const rand = (a, b) => a + Math.random() * (b - a);
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const ACTION_DUR = {
  wave: 1.6, jump: 0.7, spin: 0.9, dance: 2.2, giggle: 1.1, yawn: 1.8, shakeNo: 0.9,
  cheer: 1.6, lookAround: 2.2, dizzy: 2, love: 1.5, carried: 999,
};

function addAccessory(seat, body, mat, col, acc) {
  if (seat === 0) {
    // floppy bunny ears
    acc.ears = [-1, 1].map((s) => {
      const ear = new THREE.Group();
      const outer = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.26, 6, 14), mat);
      outer.position.y = 0.17;
      const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.18, 4, 10), M.pink);
      inner.position.set(0, 0.17, 0.04);
      outer.castShadow = true;
      ear.add(outer, inner);
      ear.position.set(s * 0.12, 0.6, -0.04);
      ear.userData.base = -s * 0.2;
      ear.rotation.z = ear.userData.base;
      body.add(ear);
      return ear;
    });
  } else if (seat === 1) {
    // bobbing sprout
    const sprout = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.15, 8), new THREE.MeshStandardMaterial({ color: 0x2f7d3a }));
    stem.position.y = 0.07;
    sprout.add(stem);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x7ef08a, roughness: 0.4 });
    for (const s of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 10), leafMat);
      leaf.scale.set(1, 0.22, 0.5);
      leaf.position.set(s * 0.085, 0.15, 0);
      leaf.rotation.z = s * 0.45;
      leaf.castShadow = true;
      sprout.add(leaf);
    }
    sprout.position.y = 0.63;
    body.add(sprout);
    acc.sprout = sprout;
  } else if (seat === 2) {
    // chick tuft + beak
    const tuftMat = new THREE.MeshStandardMaterial({ color: col.dark, roughness: 0.5 });
    const tuft = new THREE.Group();
    [-0.45, 0, 0.45].forEach((r, i) => {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), tuftMat);
      f.scale.set(0.6, 1.8, 0.6);
      f.position.set((i - 1) * 0.045, 0.06, 0);
      f.rotation.z = -r;
      tuft.add(f);
    });
    tuft.position.y = 0.62;
    body.add(tuft);
    acc.sprout = tuft;
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.09, 12), new THREE.MeshStandardMaterial({ color: 0xff8a1f }));
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.33, 0.4);
    body.add(beak);
  } else {
    // cat ears + swishing tail
    acc.ears = [-1, 1].map((s) => {
      const ear = new THREE.Group();
      const outer = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.22, 16), mat);
      outer.position.y = 0.08;
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.13, 12), M.pink);
      inner.position.set(0, 0.06, 0.045);
      outer.castShadow = true;
      ear.add(outer, inner);
      ear.position.set(s * 0.18, 0.55, -0.02);
      ear.userData.base = -s * 0.42;
      ear.rotation.z = ear.userData.base;
      body.add(ear);
      return ear;
    });
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.02, -0.18),
      new THREE.Vector3(0.06, 0.15, -0.3), new THREE.Vector3(0, 0.33, -0.24),
    ]);
    const tail = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.045, 10), mat);
    tube.castShadow = true;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), new THREE.MeshStandardMaterial({ color: col.light }));
    tip.position.set(0, 0.33, -0.24);
    tail.add(tube, tip);
    tail.position.set(0, 0.12, -0.32);
    body.add(tail);
    acc.tail = tail;
  }
}

export function makeBuddy(seat, col) {
  const root = new THREE.Group(); // board position + layout scale
  const yaw = new THREE.Group(); // turns to face camera / travel direction
  const body = new THREE.Group(); // squash, stretch, tumble, sway
  root.add(yaw);
  yaw.add(body);

  const mat = new THREE.MeshPhysicalMaterial({
    color: col.hex, roughness: 0.4, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.2,
    sheen: 0.5, sheenColor: new THREE.Color(col.light),
    emissive: new THREE.Color(col.hex), emissiveIntensity: 0,
  });
  const shell = new THREE.Mesh(GUM, mat);
  shell.castShadow = true;
  const outline = new THREE.Mesh(GUM, M.outline);
  outline.scale.set(1.07, 1.045, 1.07);
  outline.position.y = -0.012;
  body.add(outline, shell);

  const belly = new THREE.Mesh(G.belly, new THREE.MeshStandardMaterial({ color: col.light, roughness: 0.5 }));
  belly.scale.set(1, 0.8, 0.42);
  belly.position.set(0, 0.17, 0.27);
  body.add(belly);

  const darkMat = new THREE.MeshStandardMaterial({ color: col.dark, roughness: 0.5 });
  for (const s of [-1, 1]) {
    const foot = new THREE.Mesh(G.foot, darkMat);
    foot.scale.set(1, 0.55, 1.35);
    foot.position.set(s * 0.15, 0.035, 0.14);
    foot.castShadow = true;
    body.add(foot);
  }

  // arms (wings for the chick) on shoulder pivots
  const arms = [-1, 1].map((s) => {
    const sh = new THREE.Group();
    sh.position.set(s * 0.36, 0.3, 0.03);
    const limb = seat === 2 ? new THREE.Mesh(G.wing, mat) : new THREE.Mesh(G.arm, mat);
    if (seat === 2) limb.scale.set(0.45, 1, 0.3);
    limb.position.y = -0.11;
    limb.castShadow = true;
    sh.add(limb);
    sh.userData.side = s;
    body.add(sh);
    return sh;
  });

  const eyes = [];
  const pupils = [];
  const brows = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(s * 0.135, 0.4, 0.27);
    const w = new THREE.Mesh(G.eye, M.white);
    const p = new THREE.Mesh(G.pupil, M.black);
    p.position.z = 0.075;
    const gl = new THREE.Mesh(G.glint, M.glint);
    gl.position.set(-0.025, 0.035, 0.135);
    const gl2 = new THREE.Mesh(G.glint2, M.glint);
    gl2.position.set(0.025, -0.02, 0.14);
    e.add(w, p, gl, gl2);
    body.add(e);
    eyes.push(e);
    pupils.push(p);
    const br = new THREE.Mesh(G.brow, M.brow);
    br.rotation.z = Math.PI / 2;
    const bg = new THREE.Group();
    bg.position.set(s * 0.135, 0.55, 0.262);
    bg.add(br);
    bg.userData.side = s;
    body.add(bg);
    brows.push(bg);
    const ch = new THREE.Mesh(G.cheek, M.cheek.clone());
    ch.scale.set(1, 0.6, 0.35);
    ch.position.set(s * 0.235, 0.28, 0.3);
    body.add(ch);
    (body.userData.cheeks ||= []).push(ch);
  }
  const mouthY = seat === 2 ? 0.235 : 0.26;
  const smile = new THREE.Mesh(G.smile, M.mouth);
  smile.position.set(0, mouthY, 0.385);
  const open = new THREE.Group();
  const bowl = new THREE.Mesh(G.open, M.mouth);
  bowl.scale.set(1, 0.95, 0.55);
  const tongue = new THREE.Mesh(G.tongue, M.tongue);
  tongue.position.set(0, -0.045, 0.012);
  tongue.scale.set(1, 0.6, 0.6);
  open.add(bowl, tongue);
  open.position.set(0, mouthY + 0.02, 0.37);
  const oMouth = new THREE.Mesh(G.oMouth, M.mouth);
  oMouth.scale.set(1, 1.25, 0.5);
  oMouth.position.set(0, mouthY - 0.01, 0.38);
  body.add(smile, open, oMouth);

  const acc = {};
  addAccessory(seat, body, mat, col, acc);

  return {
    root, yaw, body, mat, eyes, pupils, brows, arms, smile, open, oMouth, acc, cheeks: body.userData.cheeks,
    seat, expr: 'normal', action: null, actionY: 0, actionYaw: 0, baseYaw: 0,
    blinkAt: rand(0.5, 4), blinkStart: -1, squashY: 1, tumble: 0,
    phase: Math.random() * Math.PI * 2, dizzyUntil: 0, celebrateUntil: 0, faceYaw: null,
    nextIdle: rand(3, 9), pokes: [],
  };
}

/** Start a personality action ('wave', 'jump', 'spin', 'dance', 'giggle', 'yawn', 'shakeNo', 'cheer', 'lookAround', 'dizzy', 'love', 'carried'). */
export function act(b, type, t) {
  b.action = { type, start: t, dur: ACTION_DUR[type] || 1 };
}

function setArm(arm, angle) {
  arm.rotation.z += (arm.userData.side * angle - arm.rotation.z) * 0.3;
}

function applyExpr(b, expr, blink) {
  const squint = { happy: 0.3, love: 0.3, sleepy: 0.22, angry: 0.75, dizzy: 0.9 }[expr] ?? 1;
  const big = expr === 'scared' ? 1.25 : 1;
  for (const e of b.eyes) e.scale.set(big, big * squint * (1 - blink * 0.92), big);
  for (const p of b.pupils) p.scale.setScalar(expr === 'scared' ? 0.65 : expr === 'dizzy' ? 0.5 : 1);
  for (const br of b.brows) {
    const s = br.userData.side;
    const [y, rot] = {
      angry: [0.52, s * 0.5], scared: [0.6, -s * 0.35], happy: [0.575, -s * 0.12],
      love: [0.575, -s * 0.12], sleepy: [0.53, 0], dizzy: [0.58, -s * 0.25],
    }[expr] || [0.55, 0];
    br.position.y += (y - br.position.y) * 0.3;
    br.rotation.z += (rot - br.rotation.z) * 0.3;
  }
  b.smile.visible = expr === 'normal' || expr === 'love' || expr === 'angry';
  b.smile.rotation.z = expr === 'angry' ? 0 : Math.PI; // frown vs smile
  b.smile.scale.setScalar(expr === 'love' ? 1.3 : 1);
  b.open.visible = expr === 'happy';
  b.oMouth.visible = expr === 'scared' || expr === 'sleepy' || expr === 'dizzy';
  b.oMouth.scale.set(1, expr === 'sleepy' ? 1.7 : 1.25, 0.5);
  const cheek = expr === 'love' ? 1 : expr === 'happy' ? 0.85 : expr === 'angry' ? 0.95 : 0.55;
  for (const c of b.cheeks) {
    c.material.opacity = cheek;
    c.material.color.set(expr === 'angry' ? 0xff3355 : 0xff6f91);
  }
}

/** Per-frame life: breathing, blinking, actions, expressions, accessory wiggles. */
export function updateBuddy(b, t) {
  if (t > b.blinkAt) {
    b.blinkStart = t;
    b.blinkAt = t + rand(1.8, 5.5);
  }
  const bt = t - b.blinkStart;
  const blink = bt >= 0 && bt < 0.16 ? Math.sin((bt / 0.16) * Math.PI) : 0;

  let expr = b.expr;
  if (t < b.dizzyUntil) expr = 'dizzy';
  else if (t < b.celebrateUntil) expr = 'happy';

  let armL = 0.35;
  let armR = 0.35;
  let y = 0;
  let yawOff = 0;
  let roll = 0;
  let squash = 1;
  const a = b.action;
  if (a) {
    const k = Math.min(1, (t - a.start) / a.dur);
    const s = Math.sin;
    switch (a.type) {
      case 'wave': armR = 2.5 + s(k * Math.PI * 8) * 0.4; expr = 'happy'; roll = s(k * Math.PI * 4) * 0.06; break;
      case 'jump': y = s(k * Math.PI) * 0.6; armL = armR = 0.35 + 1.8 * s(k * Math.PI); squash = k < 0.1 ? 0.8 : 1 + 0.15 * s(k * Math.PI); expr = 'happy'; break;
      case 'spin': yawOff = ease(k) * Math.PI * 2; y = s(k * Math.PI) * 0.3; armL = armR = 1.4; expr = 'happy'; break;
      case 'dance': roll = s(k * Math.PI * 8) * 0.28; y = Math.abs(s(k * Math.PI * 8)) * 0.14; armL = 1.8 + s(k * Math.PI * 8) * 0.8; armR = 1.8 - s(k * Math.PI * 8) * 0.8; expr = 'happy'; break;
      case 'giggle': roll = s(k * Math.PI * 22) * 0.09; squash = 1 + s(k * 40) * 0.05; armL = armR = 0.9; expr = 'happy'; break;
      case 'yawn': expr = 'sleepy'; armL = armR = k < 0.7 ? 0.35 + 2.3 * s((k / 0.7) * Math.PI) : 0.35; squash = 1 + 0.08 * s(k * Math.PI); break;
      case 'shakeNo': yawOff = s(k * Math.PI * 6) * 0.5 * (1 - k); expr = 'angry'; armL = armR = 0.15; break;
      case 'cheer': y = Math.abs(s(k * Math.PI * 4)) * 0.35; armL = armR = 2.6 + s(k * Math.PI * 10) * 0.3; expr = 'happy'; break;
      case 'lookAround': yawOff = s(k * Math.PI * 2) * 0.9; break;
      case 'dizzy': yawOff = k * Math.PI * 6; roll = s(k * Math.PI * 6) * 0.15; expr = 'dizzy'; armL = armR = 1.2; break;
      case 'love': y = s(k * Math.PI) * 0.2; expr = 'love'; armL = armR = 1.2; break;
      case 'carried': armL = 2.2 + s(t * 14) * 0.4; armR = 2.2 - s(t * 14) * 0.4; roll = s(t * 6) * 0.12; expr = 'happy'; break;
      default: break;
    }
    if (k >= 1 && a.type !== 'carried') b.action = null;
  }
  if (expr === 'scared') armL = armR = 2.3 + Math.sin(t * 30) * 0.15;
  b.actionY = y;
  b.actionYaw = yawOff;
  setArm(b.arms[0], armL);
  setArm(b.arms[1], armR);
  applyExpr(b, expr, expr === 'happy' || expr === 'sleepy' ? 0 : blink);

  // pupils wander a little
  const gx = Math.sin(t * 0.7 + b.phase) * 0.018;
  const gy = Math.sin(t * 0.43 + b.phase * 2) * 0.012;
  for (const p of b.pupils) {
    p.position.x = expr === 'dizzy' ? Math.cos(t * 12) * 0.03 : gx;
    p.position.y = expr === 'dizzy' ? Math.sin(t * 12) * 0.03 : gy;
  }

  // accessories
  if (b.acc.ears) b.acc.ears.forEach((e, i) => { e.rotation.x = Math.sin(t * 3 + b.phase + i) * 0.1 + (y > 0.05 ? -0.5 : 0); e.rotation.z = e.userData.base + Math.sin(t * 2.2 + i * 2) * 0.06; });
  if (b.acc.sprout) b.acc.sprout.rotation.z = Math.sin(t * 2.5 + b.phase) * 0.18 + roll * 1.5;
  if (b.acc.tail) b.acc.tail.rotation.y = Math.sin(t * 2.4 + b.phase) * 0.6;

  const breathe = 1 + Math.sin(t * 2.3 + b.phase) * 0.028;
  const sq = b.squashY * breathe * squash;
  b.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
  b.body.rotation.x = b.tumble;
  b.body.rotation.z = roll;
}

export function ghostGeometry() {
  return GUM;
}
