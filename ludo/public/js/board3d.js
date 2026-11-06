import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  COLORS, TRACK, HOME_COL, SAFE, START, YARD_SPOTS, YARD_CENTER, HOME, LAST_TRACK,
  cellOf, toWorld, layout, absIndex,
} from './geometry.js';
import { makeBuddy, updateBuddy, act, ghostGeometry } from './buddies.js';
import { buildScenery } from './scenery.js';

// heights of the surfaces pieces stand on
const TILE_TOP = 0.12;
const TRAY_TOP = 0.24;
const HOME_TOP = 0.1;
const DIE = 0.78;
const BUDDY_SCALE = 1.12;
const SEAT_AZIMUTH = [-Math.PI / 2, Math.PI, Math.PI / 2, 0]; // your colour ends up bottom-left
const UP = new THREE.Vector3(0, 1, 0);
// BoxGeometry material order (+X,-X,+Y,-Y,+Z,-Z) → die values; opposite faces sum to 7
const FACE_VALUES = [1, 6, 2, 5, 3, 4];
const FACE_NORMALS = [
  new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
];
const POKE_LINES = {
  giggle: ['Hehe! 😆', 'Tickles!', 'Hihihi 🤭'],
  jump: ['Wheee!', 'Boing! 🐸', 'Hop hop!'],
  spin: ['Weee! 🌀', 'Whoa!'],
  wave: ['Hi! 👋', 'Hello!', 'Namaste 🙏'],
  dance: ['La la la 🎶', 'Dance! 💃'],
  love: ['🥰', 'Aww!', '💕'],
  shakeNo: ['Hey! 😠', 'Stop it!', 'Rude! 😤', 'Grr!'],
  dizzy: ['😵‍💫', 'Too much!', 'Bleh…'],
};

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const baseY = (p) => (p < 0 ? TRAY_TOP : p === HOME ? HOME_TOP : TILE_TOP);
const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const soft = (hex, amt = 0.28) => '#' + new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), amt).getHexString();
const tint = (hex) => soft(hex, 0.64);

// ------------------------------------------------------------------ textures
function boardTexture() {
  const S = 2048;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const u = S / 15;
  ctx.fillStyle = '#3d2a1c';
  ctx.fillRect(0, 0, S, S);
  [[0, 0], [9, 0], [9, 9], [0, 9]].forEach(([cx, cy], s) => {
    const g = ctx.createLinearGradient(cx * u, cy * u, (cx + 6) * u, (cy + 6) * u);
    g.addColorStop(0, soft(COLORS[s].hex, 0.18));
    g.addColorStop(1, COLORS[s].hex);
    ctx.fillStyle = g;
    ctx.fillRect(cx * u, cy * u, 6 * u, 6 * u);
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
      ctx.beginPath();
      ctx.arc((cx + i + 0.5) * u, (cy + j + 0.5) * u, u * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.strokeStyle = '#6d4a26';
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, S - 12, S - 12);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}

function dieFace(value) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S * 0.4, S * 0.35, 10, S / 2, S / 2, S * 0.75);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#ece6da');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const P = {
    1: [[0.5, 0.5]], 2: [[0.28, 0.28], [0.72, 0.72]], 3: [[0.26, 0.26], [0.5, 0.5], [0.74, 0.74]],
    4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
    5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
    6: [[0.28, 0.24], [0.72, 0.24], [0.28, 0.5], [0.72, 0.5], [0.28, 0.76], [0.72, 0.76]],
  }[value];
  for (const [x, y] of P) {
    const r = value === 1 ? S * 0.13 : S * 0.085;
    const pg = ctx.createRadialGradient(x * S - r * 0.3, y * S - r * 0.3, 1, x * S, y * S, r);
    pg.addColorStop(0, value === 1 ? '#ff5a6a' : '#555');
    pg.addColorStop(1, value === 1 ? '#c8102e' : '#111');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(x * S, y * S, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function starShape(outer = 0.3, inner = 0.13) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
  }
  return s;
}

// ------------------------------------------------------------------ main class
export class LudoBoard {
  constructor(container, handlers = {}) {
    this.container = container;
    this.h = handlers;
    this.tweens = [];
    this.tokens = [[-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]];
    this.seated = [true, true, true, true];
    this.inter = null;
    this.shake = 0;
    this.time = 0;
    this.night = 0;
    this.bubbles = [];

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(r.domElement);
    this.bubbleLayer = document.createElement('div');
    this.bubbleLayer.className = 'bubble-layer';
    container.appendChild(this.bubbleLayer);

    const scene = (this.scene = new THREE.Scene());
    this.envMap = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
    this.controls = new OrbitControls(this.camera, r.domElement);
    Object.assign(this.controls, {
      enableDamping: true, dampingFactor: 0.08, enablePan: false,
      minDistance: 7, maxDistance: 42, minPolarAngle: 0.05, maxPolarAngle: 1.32, rotateSpeed: 0.7,
    });

    this.scenery = buildScenery(scene);
    this.buildLights();
    this.buildBoard();
    this.buildPieces();
    this.buildDie();
    this.buildPreview();
    this.buildParticles();
    scene.traverse((o) => {
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) if (m.isMeshPhysicalMaterial) { m.envMap = this.envMap; m.envMapIntensity = 0.45; }
    });

    this.view = { seat: 3, top: false };
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.setView(3, { instant: true });
    this.bindPointer();
    this.clock = new THREE.Clock();
    r.setAnimationLoop(() => this.tick());
  }

  // ---------------------------------------------------------------- build
  buildLights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0xe6f2ff, 0x3f6a32, 0.75);
    s.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight(0xfff0dc, 1.9));
    sun.position.set(8, 18, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 60 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 4;
    s.add(sun);
    this.rim = new THREE.DirectionalLight(0xc8dcff, 0.35);
    this.rim.position.set(-10, 8, -8);
    s.add(this.rim);
    // warm lamp over the board that switches on at night so the board stays easy to read
    this.lamp = new THREE.SpotLight(0xffd9a0, 0, 0, 0.62, 0.55, 0);
    this.lamp.position.set(0, 15, 1);
    s.add(this.lamp, this.lamp.target);
  }

  buildBoard() {
    const s = this.scene;
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a2814, roughness: 0.5, metalness: 0.05 });
    const slab = new THREE.Mesh(new RoundedBoxGeometry(16.6, 0.8, 16.6, 4, 0.3), wood);
    slab.position.y = -0.4;
    slab.castShadow = slab.receiveShadow = true;
    s.add(slab);
    const top = new THREE.Mesh(
      new THREE.PlaneGeometry(15, 15),
      new THREE.MeshStandardMaterial({ map: boardTexture(), roughness: 0.75 }),
    );
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.002;
    top.receiveShadow = true;
    s.add(top);

    // raised track tiles with dark edges
    const cells = [];
    TRACK.forEach(([c, r], i) => {
      const startSeat = START.indexOf(i);
      cells.push([c, r, startSeat >= 0 ? COLORS[startSeat].hex : '#fbf6ea']);
    });
    HOME_COL.forEach((list, seat) => list.forEach(([c, r]) => cells.push([c, r, COLORS[seat].hex])));
    const tiles = new THREE.InstancedMesh(
      new RoundedBoxGeometry(0.88, TILE_TOP, 0.88, 2, 0.05),
      new THREE.MeshStandardMaterial({ roughness: 0.6 }),
      cells.length,
    );
    const edge = new THREE.InstancedMesh(
      new RoundedBoxGeometry(0.94, TILE_TOP * 0.7, 0.94, 2, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.8 }),
      cells.length,
    );
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    cells.forEach(([c, r, hex], i) => {
      const [x, z] = toWorld([c, r]);
      tiles.setMatrixAt(i, m4.makeTranslation(x, TILE_TOP / 2, z));
      tiles.setColorAt(i, col.set(hex));
      edge.setMatrixAt(i, m4.makeTranslation(x, TILE_TOP * 0.35, z));
    });
    tiles.castShadow = tiles.receiveShadow = true;
    s.add(tiles, edge);

    // 3D stars on safe squares, arrows into each home lane
    const starGeo = new THREE.ExtrudeGeometry(starShape(), { depth: 0.03, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 });
    starGeo.rotateX(-Math.PI / 2);
    const goldStar = new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.5, roughness: 0.3 });
    const whiteStar = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    SAFE.forEach((idx) => {
      const st = new THREE.Mesh(starGeo, START.includes(idx) ? whiteStar : goldStar);
      const [x, z] = toWorld(TRACK[idx]);
      st.position.set(x, TILE_TOP, z);
      st.castShadow = true;
      s.add(st);
    });
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0.3, 0);
    arrowShape.lineTo(-0.15, 0.25);
    arrowShape.lineTo(-0.15, -0.25);
    arrowShape.closePath();
    const arrowGeo = new THREE.ExtrudeGeometry(arrowShape, { depth: 0.04, bevelEnabled: false });
    arrowGeo.rotateX(-Math.PI / 2);
    [[[0, 7], 0], [[7, 0], -Math.PI / 2], [[14, 7], Math.PI], [[7, 14], Math.PI / 2]].forEach(([cell, rot], seat) => {
      const a = new THREE.Mesh(arrowGeo, new THREE.MeshStandardMaterial({ color: COLORS[seat].hex, roughness: 0.4 }));
      const [x, z] = toWorld(cell);
      a.position.set(x, 0.01, z);
      a.rotation.y = rot;
      s.add(a);
    });

    // raised home: four coloured triangles + a little pyramid + floating gem
    const tri = (pts, hex) => {
      const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
      const g = new THREE.ExtrudeGeometry(sh, { depth: HOME_TOP, bevelEnabled: false });
      g.rotateX(Math.PI / 2);
      g.translate(0, HOME_TOP, 0);
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.5 }));
      m.receiveShadow = true;
      s.add(m);
    };
    tri([[-1.5, -1.5], [0, 0], [-1.5, 1.5]], COLORS[0].hex);
    tri([[-1.5, -1.5], [1.5, -1.5], [0, 0]], COLORS[1].hex);
    tri([[1.5, -1.5], [1.5, 1.5], [0, 0]], COLORS[2].hex);
    tri([[-1.5, 1.5], [0, 0], [1.5, 1.5]], COLORS[3].hex);
    const pyr = new THREE.ConeGeometry(0.4, 0.55, 4).toNonIndexed();
    pyr.rotateY(Math.PI / 4);
    const pos = pyr.attributes.position;
    const colors = [];
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i += 3) {
      const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
      const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      const seat = Math.abs(cx) > Math.abs(cz) ? (cx < 0 ? 0 : 2) : (cz < 0 ? 1 : 3);
      tmp.set(COLORS[seat].hex);
      for (let k = 0; k < 3; k++) colors.push(tmp.r, tmp.g, tmp.b);
    }
    pyr.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    pyr.computeVertexNormals();
    const pyramid = new THREE.Mesh(pyr, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, flatShading: true }));
    pyramid.position.y = HOME_TOP + 0.275;
    pyramid.castShadow = true;
    s.add(pyramid);
    this.gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.22),
      new THREE.MeshPhysicalMaterial({ color: 0xffe08a, metalness: 0.6, roughness: 0.1, clearcoat: 1, emissive: 0x7a5200, emissiveIntensity: 0.5 }),
    );
    this.gem.castShadow = true;
    s.add(this.gem);

    // raised yard trays with pads
    this.yardGlows = [];
    YARD_CENTER.forEach(([c, rr], seat) => {
      const [x, z] = toWorld([c, rr]);
      const tray = new THREE.Mesh(
        new RoundedBoxGeometry(4.4, TRAY_TOP, 4.4, 3, 0.12),
        new THREE.MeshStandardMaterial({ color: tint(COLORS[seat].hex), roughness: 0.6 }),
      );
      tray.position.set(x, TRAY_TOP / 2, z);
      tray.castShadow = tray.receiveShadow = true;
      s.add(tray);
      const padMat = new THREE.MeshStandardMaterial({ color: soft(COLORS[seat].hex, 0.3), roughness: 0.5 });
      const rimMat = new THREE.MeshStandardMaterial({ color: COLORS[seat].hex, roughness: 0.4 });
      YARD_SPOTS[seat].forEach((spot) => {
        const [px, pz] = toWorld(spot);
        const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.02, 40), padMat);
        pad.position.set(px, TRAY_TOP + 0.005, pz);
        pad.receiveShadow = true;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.03, 8, 40), rimMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(px, TRAY_TOP + 0.015, pz);
        s.add(pad, ring);
      });
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(7, 7),
        new THREE.MeshBasicMaterial({
          map: radialTexture(), color: COLORS[seat].hex, transparent: true, opacity: 0,
          depthWrite: false, blending: THREE.AdditiveBlending,
        }),
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(x, TRAY_TOP + 0.03, z);
      s.add(glow);
      this.yardGlows.push(glow);
    });
  }

  buildPieces() {
    const hitGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.2, 12);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const ringGeo = new THREE.RingGeometry(0.44, 0.54, 48);
    this.hitboxes = [];
    this.pawns = COLORS.map((col, seat) => YARD_SPOTS[seat].map((spot, t) => {
      const b = makeBuddy(seat, col);
      b.yaw.scale.setScalar(BUDDY_SCALE);
      const hit = new THREE.Mesh(hitGeo, hitMat);
      hit.position.y = 0.55;
      hit.userData = { seat, token: t };
      this.hitboxes.push(hit);
      b.root.add(hit);
      const [x, z] = toWorld(spot);
      b.root.position.set(x, TRAY_TOP, z);
      this.scene.add(b.root);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      this.scene.add(ring);
      return Object.assign(b, { g: b.root, ring, t, busy: false, scale: 1, hover: 0, dragging: false, dropped: false, dragPos: null });
    }));
  }

  buildDie() {
    const mats = FACE_VALUES.map((v) => new THREE.MeshPhysicalMaterial({
      map: dieFace(v), roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.2,
    }));
    this.die = new THREE.Mesh(new RoundedBoxGeometry(DIE, DIE, DIE, 5, 0.14), mats);
    this.die.castShadow = true;
    this.scene.add(this.die);
    this.dieGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 2.6),
      new THREE.MeshBasicMaterial({ map: radialTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.dieGlow.rotation.x = -Math.PI / 2;
    this.scene.add(this.dieGlow);
    this.dieState = { seat: 0, ready: false, rolling: false, value: 6, held: null, thrownAt: 0 };
    this.placeDie(0, 6);
  }

  dieQuat(value, yaw = 0) {
    const i = FACE_VALUES.indexOf(value);
    const q = new THREE.Quaternion().setFromUnitVectors(FACE_NORMALS[i], UP);
    return new THREE.Quaternion().setFromAxisAngle(UP, yaw).multiply(q);
  }

  placeDie(seat, value) {
    const [x, z] = toWorld(YARD_CENTER[seat]);
    this.die.position.set(x, TRAY_TOP + DIE / 2, z);
    this.die.quaternion.copy(this.dieQuat(value, Math.PI / 4));
    this.dieRest = this.die.quaternion.clone();
    this.dieState.seat = seat;
    this.dieState.value = value;
  }

  buildPreview() {
    const tileGeo = new THREE.PlaneGeometry(0.88, 0.88);
    this.previewTiles = Array.from({ length: 7 }, () => {
      const m = new THREE.Mesh(tileGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      this.scene.add(m);
      return m;
    });
    this.ghostMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false });
    this.ghost = new THREE.Mesh(ghostGeometry(), this.ghostMat);
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    // pulsing beacon over the drop target while dragging
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 3, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    );
    this.beacon.visible = false;
    this.scene.add(this.beacon);
  }

  buildParticles() {
    const N = 900;
    this.pN = N;
    const geo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(N * 3);
    this.pCol = new Float32Array(N * 3);
    this.pVel = new Float32Array(N * 3);
    this.pLife = new Float32Array(N);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.18, vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, map: radialTexture(),
    }));
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.pNext = 0;
    for (let i = 0; i < N; i++) this.pPos[i * 3 + 1] = -100;
  }

  burst(x, y, z, hex, count = 60, speed = 4, up = 4) {
    const col = new THREE.Color(hex);
    for (let n = 0; n < count; n++) {
      const i = this.pNext++ % this.pN;
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.3 + Math.random());
      this.pPos.set([x, y, z], i * 3);
      this.pVel.set([Math.cos(a) * sp, up * (0.4 + Math.random()), Math.sin(a) * sp], i * 3);
      const c = col.clone().offsetHSL(rand(-0.04, 0.04), 0, rand(-0.1, 0.2));
      this.pCol.set([c.r, c.g, c.b], i * 3);
      this.pLife[i] = rand(0.7, 1.4);
    }
  }

  fireworks(hex) {
    for (let k = 0; k < 5; k++) {
      setTimeout(() => this.burst(rand(-2, 2), rand(2.5, 4), rand(-2, 2), k % 2 ? hex : '#ffe08a', 90, 3.5, 2), k * 220);
    }
  }

  // ---------------------------------------------------------------- speech bubbles
  bubble(pw, text, ms = 1800) {
    if (!text || !pw.g.visible) return;
    this.bubbles = this.bubbles.filter((b) => {
      if (b.pw === pw) { b.el.remove(); return false; }
      return true;
    });
    const el = document.createElement('div');
    el.className = 'bubble';
    el.textContent = text;
    el.style.setProperty('--c', COLORS[pw.seat].hex);
    this.bubbleLayer.appendChild(el);
    this.bubbles.push({ el, pw, until: performance.now() + ms });
  }

  updateBubbles() {
    const now = performance.now();
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const v = new THREE.Vector3();
    this.bubbles = this.bubbles.filter((b) => {
      if (now > b.until || !b.pw.g.visible) {
        b.el.classList.add('out');
        setTimeout(() => b.el.remove(), 250);
        return false;
      }
      v.set(b.pw.g.position.x, b.pw.g.position.y + 1.15 * b.pw.scale * BUDDY_SCALE, b.pw.g.position.z).project(this.camera);
      b.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
      return true;
    });
  }

  // ---------------------------------------------------------------- day / night
  setNight(on, { instant = false } = {}) {
    const from = this.night;
    const to = on ? 1 : 0;
    const apply = (k) => {
      this.night = k;
      const c = (a, b) => new THREE.Color(a).lerp(new THREE.Color(b), k);
      this.hemi.color.copy(c('#e6f2ff', '#7d8fd6'));
      this.hemi.groundColor.copy(c('#3f6a32', '#1b1733'));
      this.hemi.intensity = lerp(0.75, 0.34, k);
      this.sun.color.copy(c('#fff0dc', '#9fb6ff'));
      this.sun.intensity = lerp(1.9, 0.4, k);
      this.rim.intensity = lerp(0.35, 0.2, k);
      this.lamp.intensity = lerp(0, 2.3, k);
      this.scenery.setNight(k);
    };
    if (instant) apply(to);
    else this.tween(1400, (k) => apply(lerp(from, to, ease(k))));
  }

  // ---------------------------------------------------------------- camera
  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const vHalf = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    this.fitDist = Math.max(10 / Math.tan(vHalf), 10.6 / Math.tan(hHalf));
  }

  setView(seat = this.view.seat, { instant = false, top = this.view.top } = {}) {
    this.view = { seat, top };
    const target = { theta: SEAT_AZIMUTH[seat], phi: top ? 0.06 : 0.7, r: this.fitDist * (top ? 0.98 : 1) };
    const sph = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
    if (instant || !this.camera.position.lengthSq()) {
      this.camera.position.setFromSpherical(new THREE.Spherical(target.r, target.phi, target.theta));
      this.camera.lookAt(0, 0, 0);
      return;
    }
    let dTheta = target.theta - sph.theta;
    dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));
    const from = { theta: sph.theta, phi: sph.phi, r: sph.radius };
    this.tween(900, (k) => {
      const e = ease(k);
      this.camera.position.setFromSpherical(new THREE.Spherical(
        lerp(from.r, target.r, e), lerp(from.phi, target.phi, e), from.theta + dTheta * e,
      ));
    });
  }

  setAutoRotate(on) {
    this.controls.autoRotate = on;
    this.controls.autoRotateSpeed = 0.6;
  }

  tween(dur, update) {
    return new Promise((resolve) => {
      this.tweens.push({ start: performance.now(), dur, update, resolve });
    });
  }

  // ---------------------------------------------------------------- state
  setSeated(seated) { this.seated = seated; }

  setTokens(tokens) {
    this.tokens = tokens.map((r) => [...r]);
    const L = layout(this.tokens);
    this.pawns.forEach((row, seat) => row.forEach((pw, t) => {
      if (pw.busy || pw.dragging) return;
      const it = L[seat][t];
      pw.g.position.set(it.x, baseY(tokens[seat][t]), it.z);
      pw.scale = it.scale;
      pw.g.scale.setScalar(it.scale);
      pw.g.visible = this.seated[seat];
    }));
  }

  /** Hop a piece along its path (or drop it where it was dragged), then fling captured pieces home. */
  async animateMove(ev, newTokens, { fast = false } = {}) {
    const pw = this.pawns[ev.seat][ev.token];
    const L = layout(newTokens);
    const hopMs = fast ? 90 : 240;
    const wasDropped = pw.dropped;
    pw.busy = true;
    pw.dragging = false;
    pw.dropped = false;
    pw.dragPos = null;
    pw.action = null;
    pw.expr = 'happy';
    this.clearPreview();
    const fin = [L[ev.seat][ev.token].x, baseY(ev.to), L[ev.seat][ev.token].z];
    const pts = wasDropped ? [fin] : ev.path.map((p, i) => {
      if (i === ev.path.length - 1) return fin;
      const [x, z] = toWorld(cellOf(ev.seat, p, ev.token));
      return [x, baseY(p), z];
    });
    let [cx, cy, cz] = [pw.g.position.x, pw.g.position.y, pw.g.position.z];
    for (let i = 0; i < pts.length; i++) {
      const [nx, ny, nz] = pts[i];
      const leaving = ev.from === -1 && !wasDropped;
      const h = wasDropped ? 0.15 : leaving ? 1.6 : 0.6;
      const sx = cx, sy = cy, sz = cz;
      const s0 = pw.g.scale.x;
      const s1 = i === pts.length - 1 ? L[ev.seat][ev.token].scale : 1;
      if (!wasDropped) pw.faceYaw = Math.atan2(nx - sx, nz - sz);
      await this.tween(wasDropped ? 220 : leaving ? hopMs * 2.2 : hopMs, (k) => {
        pw.g.position.set(lerp(sx, nx, k), lerp(sy, ny, k) + Math.sin(Math.PI * k) * h, lerp(sz, nz, k));
        pw.g.scale.setScalar(lerp(s0, s1, k));
        pw.squashY = k < 0.12 ? 1 - 0.25 * Math.sin((k / 0.12) * Math.PI)
          : k < 0.85 ? 1 + 0.18 * Math.sin(((k - 0.12) / 0.73) * Math.PI)
            : 1 - 0.28 * Math.sin(((k - 0.85) / 0.15) * Math.PI);
      });
      this.h.onHop?.(i, pts.length);
      [cx, cy, cz] = [nx, ny, nz];
    }
    if (wasDropped) this.h.sfx?.('drop');
    pw.squashY = 1;
    pw.faceYaw = null;
    pw.expr = 'normal';
    pw.scale = L[ev.seat][ev.token].scale;
    pw.g.scale.setScalar(pw.scale);
    pw.busy = false;

    if (ev.captures?.length) {
      this.shake = 0.35;
      this.h.onCapture?.();
      this.burst(cx, 0.6, cz, COLORS[ev.captures[0].seat].hex, 120, 5, 5);
      act(pw, 'cheer', this.time);
      this.bubble(pw, pick(['Gotcha! 😈', 'Bye bye! 👋', 'Mine! 😎', 'Boom! 💥']));
      await Promise.all(ev.captures.map(async (c) => {
        const vp = this.pawns[c.seat][c.token];
        vp.busy = true;
        vp.expr = 'scared';
        this.bubble(vp, pick(['Noooo! 😭', 'Aaaah!', 'Not fair! 😫', 'Mommy! 😱']), 1600);
        const s = vp.g.position.clone();
        const tgt = L[c.seat][c.token];
        vp.faceYaw = Math.atan2(tgt.x - s.x, tgt.z - s.z) + Math.PI;
        await this.tween(fast ? 300 : 1000, (k) => {
          const e = ease(k);
          vp.g.position.set(lerp(s.x, tgt.x, e), lerp(s.y, TRAY_TOP, k) + Math.sin(Math.PI * k) * 4.5, lerp(s.z, tgt.z, e));
          vp.tumble = k * Math.PI * 4;
          vp.g.scale.setScalar(lerp(vp.scale, 1, k));
        });
        vp.tumble = 0;
        vp.scale = 1;
        vp.busy = false;
        vp.faceYaw = null;
        vp.expr = 'normal';
        vp.dizzyUntil = this.time + 1.8;
        this.burst(tgt.x, 0.5, tgt.z, COLORS[c.seat].hex, 30, 2, 2);
      }));
    }
    if (ev.reachedHome) {
      this.h.onHome?.();
      this.fireworks(COLORS[ev.seat].hex);
      pw.celebrateUntil = this.time + 3;
      this.bubble(pw, pick(['Home! 🎉', 'I made it! 🏠', 'Yaaay! 🥳']), 2200);
    }
    this.setTokens(newTokens);
  }

  /** Throw the die into the player's yard (from where you let go of it, if you dragged it). */
  rollDice(seat, value, { fast = false } = {}) {
    const [x, z] = toWorld(YARD_CENTER[seat]);
    const out = new THREE.Vector2(x, z).normalize();
    let from = new THREE.Vector3(x + out.x * 3 + rand(-0.6, 0.6), 3.4, z + out.y * 3 + rand(-0.6, 0.6));
    let spin = 1;
    const pt = this.pendingThrow;
    if (pt && performance.now() - pt.at < 3000) {
      from = pt.from.clone();
      spin = 1 + Math.min(2, pt.vel.length() / 10);
    }
    this.pendingThrow = null;
    this.dieState.held = null;
    this.dieState.thrownAt = 0;
    const to = new THREE.Vector3(x, TRAY_TOP + DIE / 2, z);
    const qEnd = this.dieQuat(value, rand(0, Math.PI * 2));
    const axis = new THREE.Vector3(rand(-1, 1), rand(-0.3, 0.3), rand(-1, 1)).normalize();
    const turns = rand(5, 8) * Math.PI * spin;
    const q0 = this.die.quaternion.clone();
    this.dieState = { ...this.dieState, seat, ready: false, rolling: true, value };
    this.pawns[seat].forEach((b) => { if (this.tokens[seat][b.t] < 0 && !b.busy) b.expr = 'scared'; });
    const q = new THREE.Quaternion();
    let bounced = 0;
    return this.tween(fast ? 250 : 1150, (k) => {
      const e = 1 - Math.pow(1 - k, 3);
      this.die.position.set(
        lerp(from.x, to.x, e),
        to.y + (from.y - to.y) * Math.abs(Math.cos(k * Math.PI * 2.5)) * Math.pow(1 - k, 2),
        lerp(from.z, to.z, e),
      );
      q.setFromAxisAngle(axis, turns * Math.pow(1 - k, 3));
      this.die.quaternion.copy(qEnd).multiply(q);
      if (k < 0.05) this.die.quaternion.slerp(q0, 1 - k / 0.05);
      const b = Math.floor(k * 2.5 + 0.5);
      if (b > bounced && k < 1) { bounced = b; this.h.onDieBounce?.(1 - k); }
    }).then(() => {
      this.dieRest = qEnd.clone();
      this.dieState.rolling = false;
      this.pawns[seat].forEach((b) => {
        if (b.busy) return;
        b.expr = 'normal';
        if (value === 6 && this.tokens[seat][b.t] < 0) act(b, 'cheer', this.time);
      });
      if (value === 6) {
        const yardOnes = this.pawns[seat].filter((b) => this.tokens[seat][b.t] < 0);
        if (yardOnes.length) this.bubble(pick(yardOnes), pick(['Six! 🎉', 'Let me out! 🙌', 'Yesss!']));
      }
    });
  }

  cancelThrow() {
    this.pendingThrow = null;
    this.dieState.held = null;
    this.dieState.thrownAt = 0;
  }

  cancelDrops() {
    for (const row of this.pawns) for (const pw of row) {
      if (pw.dropped || pw.dragging) this.snapBack(pw);
    }
  }

  setInteractive(inter) {
    this.inter = inter;
    this.clearPreview();
    const turnSeat = inter?.turnSeat ?? -1;
    this.yardGlows.forEach((g, i) => { g.userData.on = i === turnSeat; });
    if (inter && !this.dieState.rolling && !this.dieState.held && this.dieState.seat !== turnSeat && turnSeat >= 0) {
      this.placeDie(turnSeat, this.dieState.value);
    }
    this.dieState.ready = !!inter?.canRoll;
    this.dieGlow.material.color.set(turnSeat >= 0 ? COLORS[turnSeat].hex : '#ffffff');
    // a movable buddy asks to be picked (once per decision)
    const key = inter?.pawns?.length ? `${inter.seat}:${inter.dice}:${inter.pawns.join()}:${this.tokens[inter.seat].join()}` : null;
    if (key && key !== this.pickMeKey) {
      this.pickMeKey = key;
      const pw = this.pawns[inter.seat][pick(inter.pawns)];
      setTimeout(() => {
        if (this.inter?.pawns?.includes(pw.t) && !pw.dragging) {
          act(pw, 'wave', this.time);
          this.bubble(pw, pick(['Pick me! 🙋', 'Me! Me!', 'Drag me! ✋']), 1500);
        }
      }, 400);
    }
  }

  // ---------------------------------------------------------------- preview & targets
  targetFor(seat, token) {
    const d = this.inter?.dice;
    if (!d) return null;
    const from = this.tokens[seat][token];
    const to = from === -1 ? 0 : from + d;
    const [x, z] = toWorld(cellOf(seat, to, token));
    return { x, z, y: baseY(to), to, from };
  }

  previewFor(seat, token) {
    this.clearPreview();
    const tg = this.targetFor(seat, token);
    if (!tg) return;
    const { from, to } = tg;
    const d = this.inter.dice;
    const steps = from === -1 ? [0] : Array.from({ length: d }, (_, i) => from + i + 1);
    let capture = false;
    if (to <= LAST_TRACK && !SAFE.has(absIndex(seat, to))) {
      const cell = absIndex(seat, to);
      capture = this.tokens.some((row, o) => o !== seat && this.seated[o] && row.some((q) => q >= 0 && q <= LAST_TRACK && absIndex(o, q) === cell));
    }
    steps.forEach((p, i) => {
      const tile = this.previewTiles[i];
      const [x, z] = toWorld(cellOf(seat, p, token));
      const last = i === steps.length - 1;
      tile.position.set(x, baseY(p) + 0.012, z);
      tile.material.color.set(last && capture ? '#ff2d4b' : last ? COLORS[seat].hex : '#ffffff');
      tile.material.opacity = last ? 0.8 : 0.4 + (i / steps.length) * 0.3;
      tile.visible = true;
    });
    this.ghost.position.set(tg.x, tg.y, tg.z);
    this.ghostMat.color.set(COLORS[seat].hex);
    this.ghost.scale.setScalar((to === HOME ? 0.5 : 1) * BUDDY_SCALE);
    this.ghost.visible = true;
    this.beacon.position.set(tg.x, tg.y + 1.5, tg.z);
    this.beacon.material.color.set(capture ? '#ff2d4b' : COLORS[seat].hex);
    this.preview = { seat, token, capture, target: tg };
    const pw = this.pawns[seat][token];
    if (!pw.busy && !pw.dragging) pw.expr = 'happy';
    this.h.onPreview?.({ capture, home: to === HOME, steps: steps.length });
  }

  clearPreview() {
    this.previewTiles.forEach((t) => { t.visible = false; });
    this.ghost.visible = false;
    this.beacon.visible = false;
    if (this.preview) {
      const pw = this.pawns[this.preview.seat][this.preview.token];
      if (!pw.busy && !pw.dragging) pw.expr = 'normal';
    }
    this.preview = null;
    this.hovered = null;
  }

  // ---------------------------------------------------------------- poking
  poke(seat, token, { reaction, text, remote = false } = {}) {
    const pw = this.pawns[seat][token];
    if (!pw || pw.busy || pw.dragging || !pw.g.visible) return;
    const t = this.time;
    if (!reaction) {
      pw.pokes = pw.pokes.filter((x) => t - x < 3);
      pw.pokes.push(t);
      const n = pw.pokes.length;
      if (n >= 6) { reaction = 'dizzy'; pw.pokes = []; } else if (n >= 4) reaction = 'shakeNo';
      else reaction = pick(['giggle', 'jump', 'spin', 'wave', 'dance', 'love']);
      text = pick(POKE_LINES[reaction]);
    }
    act(pw, reaction, t);
    if (reaction === 'dizzy') pw.dizzyUntil = t + 2;
    this.bubble(pw, text, 1500);
    this.h.sfx?.('squeak', seat, reaction);
    if (!remote) this.h.onPoke?.({ seat, token, reaction, text });
  }

  snapBack(pw) {
    pw.dragging = false;
    pw.dropped = false;
    pw.dragPos = null;
    pw.action = null;
    pw.busy = true;
    const it = layout(this.tokens)[pw.seat][pw.t];
    const s = pw.g.position.clone();
    const y = baseY(this.tokens[pw.seat][pw.t]);
    this.tween(350, (k) => {
      const e = ease(k);
      pw.g.position.set(lerp(s.x, it.x, e), lerp(s.y, y, e) + Math.sin(Math.PI * k) * 0.4, lerp(s.z, it.z, e));
    }).then(() => {
      pw.busy = false;
      pw.expr = 'normal';
    });
  }

  // ---------------------------------------------------------------- input: hover, drag, throw, poke
  bindPointer() {
    const el = this.renderer.domElement;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(UP, 0);
    const setRay = (e) => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
    };
    const pickAt = (e) => {
      setRay(e);
      const inter = this.inter;
      if (inter?.canRoll && ray.intersectObject(this.die).length) return { die: true };
      const hit = ray.intersectObjects(this.hitboxes.filter((h) => this.seated[h.userData.seat]))[0];
      if (!hit) return null;
      const { seat, token } = hit.object.userData;
      const movable = !!(inter && inter.seat === seat && inter.pawns?.includes(token));
      return { seat, token, movable };
    };
    const onPlane = (e, h) => {
      setRay(e);
      plane.constant = -h;
      const p = new THREE.Vector3();
      return ray.ray.intersectPlane(plane, p) ? p : null;
    };

    let drag = null;
    el.addEventListener('pointerdown', (e) => {
      const p = pickAt(e);
      if (!p) return;
      drag = { ...p, kind: p.die ? 'die' : p.movable ? 'piece' : 'poke', sx: e.clientX, sy: e.clientY, moved: false, vel: new THREE.Vector3(), last: null, lastT: performance.now() };
      if (drag.kind !== 'poke') {
        this.controls.enabled = false;
        el.setPointerCapture(e.pointerId);
      }
    });

    el.addEventListener('pointermove', (e) => {
      if (drag && drag.kind !== 'poke') {
        if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) {
          drag.moved = true;
          if (drag.kind === 'die') {
            this.dieState.held = this.die.position.clone();
            this.h.sfx?.('pickup');
          } else {
            const pw = this.pawns[drag.seat][drag.token];
            pw.dragging = true;
            act(pw, 'carried', this.time);
            this.previewFor(drag.seat, drag.token);
            this.beacon.visible = true;
            this.bubble(pw, pick(['Wheee! 🎈', 'Whoa, high!', 'Put me there! 👉']), 1200);
            this.h.sfx?.('pickup');
          }
        }
        if (drag.moved) {
          const pt = onPlane(e, drag.kind === 'die' ? 1.8 : 1.1);
          if (pt) {
            const now = performance.now();
            const dt = Math.max(16, now - drag.lastT) / 1000;
            if (drag.last) drag.vel.lerp(pt.clone().sub(drag.last).divideScalar(dt), 0.5);
            drag.last = pt;
            drag.lastT = now;
            if (drag.kind === 'die') this.dieState.held = pt;
            else {
              const pw = this.pawns[drag.seat][drag.token];
              pw.dragPos = pt;
              pw.dragVel = drag.vel;
              const tg = this.preview?.target;
              const near = tg && Math.hypot(pt.x - tg.x, pt.z - tg.z) < 1.1;
              if (near !== this.dropNear) {
                this.dropNear = near;
                if (near) this.h.sfx?.('hover');
              }
            }
          }
        }
        return;
      }
      if (e.pointerType !== 'mouse' || drag) return;
      const p = pickAt(e);
      el.style.cursor = p ? (p.die || p.movable ? 'grab' : 'pointer') : 'default';
      const key = p && p.movable ? `${p.seat}:${p.token}` : null;
      if (key !== this.hovered) {
        if (key) {
          this.previewFor(p.seat, p.token);
          this.hovered = key;
          this.h.onHoverPawn?.();
        } else this.clearPreview();
      }
    });

    const end = (e, cancelled) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      this.controls.enabled = true;
      const clickish = Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 8;
      if (d.kind === 'poke') {
        if (clickish && !cancelled) this.poke(d.seat, d.token);
        return;
      }
      if (d.kind === 'die') {
        if (cancelled) { this.cancelThrow(); return; }
        if (d.moved) {
          this.pendingThrow = { from: this.die.position.clone(), vel: d.vel.clone(), at: performance.now() };
          this.dieState.thrownAt = performance.now();
          this.h.sfx?.('whoosh');
        }
        this.h.onDie?.();
        return;
      }
      const pw = this.pawns[d.seat][d.token];
      if (!d.moved) {
        if (!cancelled) this.h.onPawn?.(d.token);
        return;
      }
      const tg = this.preview?.target;
      const pos = pw.dragPos || pw.g.position;
      this.beacon.visible = false;
      if (!cancelled && tg && Math.hypot(pos.x - tg.x, pos.z - tg.z) < 1.1) {
        pw.dropped = true;
        pw.dragPos = new THREE.Vector3(tg.x, tg.y + 0.5, tg.z);
        this.h.onPawn?.(d.token);
      } else {
        this.snapBack(pw);
        this.bubble(pw, pick(['Not there! 🙅', 'Oops!', 'Wrong spot 😅']), 1200);
        this.h.sfx?.('noMove');
      }
    };
    el.addEventListener('pointerup', (e) => end(e, false));
    el.addEventListener('pointercancel', (e) => end(e, true));
  }

  // ---------------------------------------------------------------- loop
  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = (this.time = this.clock.elapsedTime);
    const now = performance.now();

    this.tweens = this.tweens.filter((tw) => {
      const k = Math.min(1, (now - tw.start) / tw.dur);
      tw.update(k);
      if (k >= 1) { tw.resolve(); return false; }
      return true;
    });

    const cam = this.camera.position;
    const inter = this.inter;
    this.pawns.forEach((row, seat) => row.forEach((pw, ti) => {
      const can = inter && inter.seat === seat && inter.pawns?.includes(ti) && !pw.busy && !pw.dragging;
      const isHover = this.hovered === `${seat}:${ti}`;
      pw.hover += ((isHover ? 1 : 0) - pw.hover) * 0.2;
      const pulse = 0.5 + 0.5 * Math.sin(t * 5 + ti);
      pw.mat.emissiveIntensity = can || pw.dragging ? 0.1 + 0.18 * pulse + pw.hover * 0.2 : 0;

      // facing: camera, travel direction, or spinning when dizzy
      const target = pw.faceYaw ?? Math.atan2(cam.x - pw.g.position.x, cam.z - pw.g.position.z);
      if (t < pw.dizzyUntil) pw.baseYaw += dt * 9;
      else pw.baseYaw = lerpAngle(pw.baseYaw, target, 0.12);
      pw.yaw.rotation.y = pw.baseYaw + pw.actionYaw;
      const dist = Math.hypot(cam.x - pw.g.position.x, cam.z - pw.g.position.z);
      const lean = pw.busy ? 0 : -Math.atan2(cam.y - pw.g.position.y, dist) * 0.38;
      pw.yaw.rotation.x += (lean - pw.yaw.rotation.x) * 0.15;

      if (pw.dragging && pw.dragPos) {
        // follow the pointer, dangling and tilting with the drag
        pw.g.position.lerp(pw.dragPos, 0.35);
        const v = pw.dragVel || new THREE.Vector3();
        pw.body.rotation.z += (THREE.MathUtils.clamp(-v.x * 0.03, -0.5, 0.5) - pw.body.rotation.z) * 0.2;
        pw.squashY = 1;
      } else if (!pw.busy) {
        const by = baseY(this.tokens[seat][ti]);
        let y = by;
        if (can) {
          const j = Math.abs(Math.sin(t * 5.5 + ti * 0.9));
          y += 0.06 + j * 0.28 + pw.hover * 0.25;
          pw.squashY = 1 + (j - 0.5) * 0.12;
        } else {
          if (t < pw.celebrateUntil) y += Math.abs(Math.sin(t * 9 + ti)) * 0.35;
          pw.squashY = 1;
          // personality: random idle antics
          if (t > pw.nextIdle) {
            pw.nextIdle = t + rand(6, 16);
            if (!pw.action && pw.g.visible && Math.random() < 0.65) {
              const a = pick(['wave', 'lookAround', 'yawn', 'dance', 'giggle', 'jump', 'lookAround', 'love']);
              act(pw, a, t);
              if (a === 'yawn' && Math.random() < 0.5) this.bubble(pw, 'Zzz… 😴', 1400);
              if (a === 'dance' && Math.random() < 0.4) this.bubble(pw, '🎶', 1400);
            }
          }
        }
        pw.g.position.y = y + pw.actionY;
      }
      if (!pw.dragging || !pw.action || pw.action.type !== 'carried') {
        if (!pw.dragging && pw.action?.type === 'carried') pw.action = null;
      }
      updateBuddy(pw, t);

      pw.ring.visible = !!can;
      if (can) {
        pw.ring.position.set(pw.g.position.x, baseY(this.tokens[seat][ti]) + 0.015, pw.g.position.z);
        pw.ring.scale.setScalar(pw.scale * (1 + 0.15 * pulse));
        pw.ring.material.opacity = 0.55 + 0.4 * pulse;
        pw.ring.material.color.set(isHover ? '#ffe08a' : '#ffffff');
      }
    }));

    // drop-target beacon
    if (this.beacon.visible) {
      this.beacon.material.opacity = (this.dropNear ? 0.45 : 0.18) + 0.1 * Math.sin(t * 6);
      this.beacon.scale.set(this.dropNear ? 1.15 : 1, 1, this.dropNear ? 1.15 : 1);
    }

    // die: held in hand, waiting after a throw, bobbing when ready, or resting
    const ds = this.dieState;
    if (!ds.rolling) {
      const [x, z] = toWorld(YARD_CENTER[ds.seat]);
      const rest = TRAY_TOP + DIE / 2;
      if (ds.held) {
        this.die.position.lerp(ds.held, 0.4);
        this.die.rotation.x += dt * 9;
        this.die.rotation.y += dt * 13;
        if (now - (this.lastShake || 0) > 110) { this.lastShake = now; this.h.sfx?.('dieShake'); }
        if (ds.thrownAt && now - ds.thrownAt > 2500) this.cancelThrow();
      } else if (ds.ready) {
        this.die.position.set(x, rest + 0.35 + Math.sin(t * 3) * 0.15, z);
        this.die.rotation.y += dt * 1.2;
      } else {
        this.die.position.set(x, rest, z);
        if (this.dieRest) this.die.quaternion.slerp(this.dieRest, 0.25);
      }
    }
    this.dieGlow.position.set(this.die.position.x, TRAY_TOP + 0.02, this.die.position.z);
    this.dieGlow.material.opacity = ds.ready || ds.held ? 0.55 + 0.3 * Math.sin(t * 4) : 0.12;
    this.yardGlows.forEach((g) => {
      const target = g.userData.on ? 0.3 + 0.1 * Math.sin(t * 2.5) : 0;
      g.material.opacity += (target - g.material.opacity) * 0.1;
    });

    this.gem.rotation.y += dt * 1.1;
    this.gem.position.y = 1.15 + Math.sin(t * 1.6) * 0.1;
    this.scenery.update(t);

    // particles
    const P = this.pPos, V = this.pVel, Lf = this.pLife;
    for (let i = 0; i < this.pN; i++) {
      if (Lf[i] <= 0) continue;
      Lf[i] -= dt;
      V[i * 3 + 1] -= 9 * dt;
      P[i * 3] += V[i * 3] * dt;
      P[i * 3 + 1] += V[i * 3 + 1] * dt;
      P[i * 3 + 2] += V[i * 3 + 2] * dt;
      if (P[i * 3 + 1] < 0.12) { P[i * 3 + 1] = 0.12; V[i * 3 + 1] *= -0.4; V[i * 3] *= 0.7; V[i * 3 + 2] *= 0.7; }
      if (Lf[i] <= 0) P[i * 3 + 1] = -100;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;

    this.controls.update();
    const off = new THREE.Vector3();
    if (this.shake > 0) {
      off.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(this.shake);
      this.shake = Math.max(0, this.shake - dt * 1.2);
      this.camera.position.add(off);
    }
    this.renderer.render(this.scene, this.camera);
    this.camera.position.sub(off);
    this.updateBubbles();
  }
}
