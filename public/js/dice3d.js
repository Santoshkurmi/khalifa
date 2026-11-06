import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { dieFaceCanvas, drawSymbol } from './symbols.js';

// BoxGeometry material order: +X, -X, +Y, -Y, +Z, -Z  → material i shows symbol i
const FACE_NORMALS = [
  new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
];
const UP = new THREE.Vector3(0, 1, 0);
const DIE = 0.92;
const HALF = DIE / 2;
const TABLE_R = 6.2;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const rand = (a, b) => a + Math.random() * (b - a);

function targetQuat(symbol, yaw) {
  const qUp = new THREE.Quaternion().setFromUnitVectors(FACE_NORMALS[symbol], UP);
  const qYaw = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  return qYaw.multiply(qUp);
}

function feltTexture() {
  const px = 2048;
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(px / 2, px / 2, px * 0.05, px / 2, px / 2, px * 0.5);
  g.addColorStop(0, '#8e1426');
  g.addColorStop(0.6, '#6b0d1c');
  g.addColorStop(1, '#3a0610');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, px, px);
  // velvet noise
  const img = ctx.getImageData(0, 0, px, px);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 18;
    img.data[i] += n;
    img.data[i + 1] += n * 0.6;
    img.data[i + 2] += n * 0.6;
  }
  ctx.putImageData(img, 0, 0);

  const cx = px / 2;
  const gold = 'rgba(232, 190, 92, 0.85)';
  const ring = (r, w, col = gold) => {
    ctx.beginPath();
    ctx.arc(cx, cx, r, 0, Math.PI * 2);
    ctx.lineWidth = w;
    ctx.strokeStyle = col;
    ctx.stroke();
  };
  ring(px * 0.47, 6);
  ring(px * 0.455, 2);
  ring(px * 0.36, 2);
  ring(px * 0.345, 5);
  // dotted mandala band
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    const r = px * 0.405;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r, cx + Math.sin(a) * r, i % 2 ? 4 : 7, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(232,190,92,.55)';
    ctx.fill();
  }
  // symbols around the rim
  ctx.globalAlpha = 0.9;
  for (let s = 0; s < 6; s++) {
    const a = (s / 6) * Math.PI * 2 - Math.PI / 2 + Math.PI / 6;
    const r = px * 0.405;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * r, cx + Math.sin(a) * r);
    ctx.rotate(a + Math.PI / 2);
    ctx.beginPath();
    ctx.arc(0, 0, px * 0.04, 0, Math.PI * 2);
    ctx.fillStyle = '#f7ecd2';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = gold;
    ctx.stroke();
    drawSymbol(ctx, s, 0, 0, px * 0.055);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  // centre lotus
  ctx.save();
  ctx.translate(cx, cx);
  ctx.strokeStyle = 'rgba(232,190,92,.22)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 16; i++) {
    ctx.rotate(Math.PI / 8);
    ctx.beginPath();
    ctx.ellipse(0, -px * 0.16, px * 0.045, px * 0.16, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,220,120,1)');
  g.addColorStop(0.35, 'rgba(255,190,60,.55)');
  g.addColorStop(1, 'rgba(255,160,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class DiceTable {
  constructor(container, { onBounce } = {}) {
    this.container = container;
    this.onBounce = onBounce || (() => {});
    this.highlightOn = false;

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(r.domElement);

    const scene = (this.scene = new THREE.Scene());
    const pmrem = new THREE.PMREMGenerator(r);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    this.camBase = new THREE.Vector3();
    this.camLook = new THREE.Vector3(0, 0, 0.3);
    this.zoom = 1;

    // lights
    scene.add(new THREE.HemisphereLight(0xffeedd, 0x220810, 0.35));
    const key = new THREE.DirectionalLight(0xfff1d6, 2.4);
    key.position.set(3, 12, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
    key.shadow.bias = -0.0005;
    key.shadow.radius = 4;
    scene.add(key);
    const spot = new THREE.SpotLight(0xffc98a, 2.2, 0, 0.55, 0.7, 0);
    spot.position.set(0, 14, 0);
    scene.add(spot, spot.target);
    const rim = new THREE.DirectionalLight(0x9db8ff, 0.5);
    rim.position.set(-6, 4, -8);
    scene.add(rim);

    // table
    const felt = new THREE.Mesh(
      new THREE.CircleGeometry(TABLE_R, 128),
      new THREE.MeshStandardMaterial({ map: feltTexture(), roughness: 0.95, metalness: 0 }),
    );
    felt.rotation.x = -Math.PI / 2;
    felt.receiveShadow = true;
    scene.add(felt);
    const wood = new THREE.MeshStandardMaterial({ color: 0x3b1d0e, roughness: 0.35, metalness: 0.2 });
    const rail = new THREE.Mesh(new THREE.TorusGeometry(TABLE_R + 0.15, 0.32, 32, 160), wood);
    rail.rotation.x = Math.PI / 2;
    rail.position.y = 0.1;
    rail.castShadow = rail.receiveShadow = true;
    scene.add(rail);
    const goldTrim = new THREE.Mesh(
      new THREE.TorusGeometry(TABLE_R + 0.15, 0.06, 16, 160),
      new THREE.MeshStandardMaterial({ color: 0xe0b45a, roughness: 0.25, metalness: 1 }),
    );
    goldTrim.rotation.x = Math.PI / 2;
    goldTrim.position.y = 0.42;
    scene.add(goldTrim);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_R + 0.4, TABLE_R - 0.4, 1.4, 96, 1, true), wood);
    base.position.y = -0.7;
    scene.add(base);

    // dice
    const geo = new RoundedBoxGeometry(DIE, DIE, DIE, 5, 0.13);
    const faceTex = Array.from({ length: 6 }, (_, i) => {
      const t = new THREE.CanvasTexture(dieFaceCanvas(i));
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      return t;
    });
    const glowTex = glowTexture();
    this.dice = Array.from({ length: 6 }, (_, i) => {
      const mats = faceTex.map(
        (map) => new THREE.MeshPhysicalMaterial({
          map, roughness: 0.28, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25,
          envMapIntensity: 0.7, emissive: new THREE.Color(0xffb020), emissiveIntensity: 0,
        }),
      );
      const mesh = new THREE.Mesh(geo, mats);
      mesh.castShadow = true;
      scene.add(mesh);
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(DIE * 3.2, DIE * 3.2),
        new THREE.MeshBasicMaterial({
          map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
        }),
      );
      glow.rotation.x = -Math.PI / 2;
      scene.add(glow);
      // resting "showcase" layout: each die shows a different symbol
      const a = (i / 6) * Math.PI * 2;
      mesh.position.set(Math.cos(a) * 1.7, HALF, 0.7 + Math.sin(a) * 1.5);
      mesh.quaternion.copy(targetQuat(i, -a + Math.PI / 2));
      return { mesh, mats, glow, symbol: i, anim: null, win: false };
    });

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.clock = new THREE.Clock();
    r.setAnimationLoop(() => this.tick());
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    const cam = this.camera;
    cam.aspect = w / h;
    // fit a circle of radius R around the dice area, whatever the aspect
    const R = 3.4;
    const vHalf = THREE.MathUtils.degToRad(cam.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * cam.aspect);
    const dist = Math.max(R / Math.tan(vHalf), R / Math.tan(hHalf)) * 1.08;
    this.camBase.set(0, 1.2, 0.95).normalize().multiplyScalar(dist);
    cam.updateProjectionMatrix();
  }

  makeSlots() {
    const pts = [];
    let guard = 0;
    while (pts.length < 6 && guard++ < 5000) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * 2.3;
      // shifted toward the camera so the results banner at the top doesn't cover the dice
      const p = new THREE.Vector3(Math.cos(a) * rr * 1.1, HALF, 0.9 + Math.sin(a) * rr * 0.75);
      if (pts.every((q) => q.distanceTo(p) > DIE * 1.45)) pts.push(p);
    }
    while (pts.length < 6) pts.push(new THREE.Vector3((pts.length - 2.5) * 1.2, HALF, 0));
    return pts;
  }

  /** Animate (or snap) the six dice to land showing `result` symbols. */
  roll(result, { instant = false } = {}) {
    this.clearHighlight();
    const slots = this.makeSlots();
    const side = rand(Math.PI * 1.15, Math.PI * 1.85); // thrown from the far side, towards the camera
    const dir = new THREE.Vector3(Math.cos(side), 0, Math.sin(side));
    const now = performance.now();
    result.forEach((sym, i) => {
      const d = this.dice[i];
      d.symbol = sym;
      const qEnd = targetQuat(sym, rand(0, Math.PI * 2));
      const to = slots[i];
      if (instant) {
        d.anim = null;
        d.mesh.position.copy(to);
        d.mesh.quaternion.copy(qEnd);
        return;
      }
      const from = to.clone().addScaledVector(dir, rand(5.5, 7));
      from.x += rand(-0.8, 0.8);
      from.y = HALF + rand(2.6, 4);
      d.anim = {
        from, to, qEnd,
        axis: new THREE.Vector3(rand(-1, 1), rand(-0.4, 0.4), rand(-1, 1)).normalize(),
        angle: rand(6, 10) * Math.PI,
        start: now + i * 70,
        dur: rand(2500, 3000),
        bounced: 0,
      };
    });
    if (!instant) this.zoomKick = now;
  }

  highlight(counts) {
    this.highlightOn = true;
    for (const d of this.dice) {
      d.win = counts[d.symbol] >= 2;
      for (const m of d.mats) m.color.setScalar(d.win ? 1 : 0.55);
    }
  }

  clearHighlight() {
    this.highlightOn = false;
    for (const d of this.dice) {
      d.win = false;
      d.glow.material.opacity = 0;
      for (const m of d.mats) {
        m.color.setScalar(1);
        m.emissiveIntensity = 0;
      }
    }
  }

  tick() {
    const now = performance.now();
    const t = this.clock.getElapsedTime();
    const q = new THREE.Quaternion();
    for (const d of this.dice) {
      const a = d.anim;
      if (a) {
        const k = clamp01((now - a.start) / a.dur);
        const e = 1 - Math.pow(1 - k, 3);
        const p = d.mesh.position;
        p.x = lerp(a.from.x, a.to.x, e);
        p.z = lerp(a.from.z, a.to.z, e);
        p.y = HALF + (a.from.y - HALF) * Math.abs(Math.cos(k * Math.PI * 2.5)) * Math.pow(1 - k, 2);
        const off = a.angle * Math.pow(1 - k, 3.2);
        q.setFromAxisAngle(a.axis, off);
        d.mesh.quaternion.copy(a.qEnd).multiply(q);
        const b = Math.floor(k * 2.5 + 0.5);
        if (b > a.bounced && k < 1) {
          a.bounced = b;
          this.onBounce(Math.pow(1 - k, 1.5));
        }
        if (k >= 1) d.anim = null;
      }
      // glow follows the die
      d.glow.position.set(d.mesh.position.x, 0.012, d.mesh.position.z);
      if (this.highlightOn && d.win) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 4);
        d.glow.material.opacity = 0.55 + 0.35 * pulse;
        for (const m of d.mats) m.emissiveIntensity = 0.08 + 0.1 * pulse;
      }
    }

    // camera: gentle drift + a little push-in while dice fly
    let push = 0;
    if (this.zoomKick) {
      const k = (now - this.zoomKick) / 3600;
      push = k < 1 ? Math.sin(k * Math.PI) * 0.1 : 0;
      if (k >= 1) this.zoomKick = null;
    }
    const cam = this.camera;
    cam.position.copy(this.camBase).multiplyScalar(1 - push);
    cam.position.x += Math.sin(t * 0.15) * 0.5;
    cam.position.y += Math.sin(t * 0.21) * 0.15;
    cam.lookAt(this.camLook);
    this.renderer.render(this.scene, cam);
  }
}
