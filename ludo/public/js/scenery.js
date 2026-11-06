// Cosy garden diorama around the board: sky, grass, wooden deck, trees, flowers, clouds, butterflies.
import * as THREE from 'three';

const GROUND_Y = -1.25; // grass; the board stands on a wooden deck above it
const DECK_TOP = -0.85;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
// keep decorations out of the board/camera area
const ringPos = (rMin, rMax) => {
  const a = Math.random() * Math.PI * 2;
  const r = rand(rMin, rMax);
  return [Math.cos(a) * r, Math.sin(a) * r];
};

function grassTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4f9a37';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const g = 150 + Math.random() * 70;
    ctx.fillStyle = `rgba(${40 + Math.random() * 40},${g - 30},${30 + Math.random() * 30},${0.3 + Math.random() * 0.3})`;
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.fillRect(x, y, 2 + Math.random() * 3, 6 + Math.random() * 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(36, 36);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function deckTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const ctx = c.getContext('2d');
  const planks = 16;
  const w = 1024 / planks;
  for (let i = 0; i < planks; i++) {
    const l = 26 + Math.random() * 8;
    ctx.fillStyle = `hsl(25, 42%, ${l}%)`;
    ctx.fillRect(i * w, 0, w, 1024);
    for (let k = 0; k < 40; k++) {
      ctx.strokeStyle = `rgba(30,15,5,${0.08 + Math.random() * 0.12})`;
      ctx.lineWidth = 1 + Math.random() * 2;
      const x = i * w + Math.random() * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + 6, 300, x - 6, 700, x + 3, 1024);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(15,8,2,.55)';
    ctx.fillRect(i * w, 0, 3, 1024);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildScenery(scene) {
  const updaters = [];

  // sky dome with a soft gradient
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(160, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color('#2f86e8') },
        mid: { value: new THREE.Color('#a9d6ff') },
        bottom: { value: new THREE.Color('#fbe8cc') },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;
        void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.55, h)) : mix(mid, bottom, smoothstep(0.0, -0.25, h));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
    }),
  );
  scene.add(sky);
  scene.fog = new THREE.Fog('#b9dcff', 50, 150);

  // ground + wooden deck under the board
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(160, 64),
    new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = GROUND_Y - 0.01;
  ground.receiveShadow = true;
  scene.add(ground);
  const deck = new THREE.Mesh(
    new THREE.CylinderGeometry(12.5, 12.8, DECK_TOP - GROUND_Y, 64),
    [
      new THREE.MeshStandardMaterial({ color: '#5a3820', roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ map: deckTexture(), roughness: 0.75 }),
      new THREE.MeshStandardMaterial({ color: '#3a2414' }),
    ],
  );
  deck.position.y = (DECK_TOP + GROUND_Y) / 2;
  deck.receiveShadow = true;
  scene.add(deck);

  // distant rolling hills
  const hillMat = new THREE.MeshStandardMaterial({ color: '#7cc36a', roughness: 1, flatShading: true });
  for (let i = 0; i < 14; i++) {
    const [x, z] = ringPos(95, 130);
    const h = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(14, 26), 1), hillMat);
    h.scale.y = rand(0.35, 0.6);
    h.position.set(x, GROUND_Y - 4, z);
    scene.add(h);
  }

  // trees
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#8a5a33', roughness: 0.9 });
  const leafMats = ['#4fae4a', '#67c158', '#3f9a4a', '#86d16a'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true }));
  const pineMat = new THREE.MeshStandardMaterial({ color: '#2f8a52', roughness: 0.8, flatShading: true });
  const blossom = new THREE.MeshStandardMaterial({ color: '#ffb7d0', roughness: 0.8, flatShading: true });
  const trees = [];
  for (let i = 0; i < 34; i++) {
    const [x, z] = ringPos(20, 60);
    const t = new THREE.Group();
    const s = rand(0.8, 1.6);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 2.4, 7), trunkMat);
    trunk.position.y = 1.2;
    t.add(trunk);
    if (Math.random() < 0.35) {
      for (let k = 0; k < 3; k++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.8 - k * 0.45, 2.2, 8), pineMat);
        cone.position.y = 2.6 + k * 1.1;
        t.add(cone);
      }
    } else {
      const m = Math.random() < 0.2 ? blossom : pick(leafMats);
      [[0, 3.3, 0, 1.7], [0.9, 2.8, 0.3, 1.2], [-0.8, 2.9, -0.2, 1.25], [0.1, 4.3, 0.1, 1.1]].forEach(([dx, dy, dz, r]) => {
        const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), m);
        ball.position.set(dx, dy, dz);
        t.add(ball);
      });
    }
    t.scale.setScalar(s);
    t.position.set(x, GROUND_Y, z);
    t.rotation.y = Math.random() * Math.PI;
    t.userData.sway = Math.random() * 6;
    scene.add(t);
    trees.push(t);
  }
  updaters.push((time) => {
    for (const t of trees) t.rotation.z = Math.sin(time * 0.8 + t.userData.sway) * 0.015;
  });

  // bushes and rocks around the deck
  const bushMat = new THREE.MeshStandardMaterial({ color: '#5cb85a', roughness: 0.9, flatShading: true });
  for (let i = 0; i < 18; i++) {
    const [x, z] = ringPos(14.5, 22);
    const b = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.6, 1.1), 1), bushMat);
      ball.position.set(rand(-0.8, 0.8), rand(0.2, 0.6), rand(-0.8, 0.8));
      b.add(ball);
    }
    b.position.set(x, GROUND_Y, z);
    scene.add(b);
  }
  const rockMat = new THREE.MeshStandardMaterial({ color: '#a7a3a0', roughness: 0.9, flatShading: true });
  for (let i = 0; i < 14; i++) {
    const [x, z] = ringPos(14, 30);
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.3, 0.9)), rockMat);
    r.scale.y = rand(0.5, 0.8);
    r.position.set(x, GROUND_Y + 0.1, z);
    r.rotation.set(Math.random(), Math.random(), Math.random());
    scene.add(r);
  }

  // mushrooms
  const capMat = new THREE.MeshStandardMaterial({ color: '#e84a4a', roughness: 0.5 });
  const stemMat = new THREE.MeshStandardMaterial({ color: '#fff3e0', roughness: 0.7 });
  const dotMat = new THREE.MeshStandardMaterial({ color: '#ffffff' });
  for (let i = 0; i < 10; i++) {
    const [x, z] = ringPos(13.6, 18);
    const m = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.45, 10), stemMat);
    stem.position.y = 0.22;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
    cap.position.y = 0.42;
    m.add(stem, cap);
    for (let k = 0; k < 5; k++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), dotMat);
      const a = (k / 5) * Math.PI * 2;
      d.position.set(Math.cos(a) * 0.24, 0.66, Math.sin(a) * 0.24);
      m.add(d);
    }
    m.scale.setScalar(rand(0.7, 1.4));
    m.position.set(x, GROUND_Y, z);
    scene.add(m);
  }

  // flowers (instanced)
  const N = 320;
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 5), new THREE.MeshStandardMaterial({ color: '#3f8f3a' }), N);
  const heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.12, 0), new THREE.MeshStandardMaterial({ roughness: 0.6, flatShading: true }), N);
  const petals = ['#ff6b8b', '#ffd166', '#ffffff', '#b38cff', '#ff9f43', '#6ec6ff'];
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const [x, z] = ringPos(13.4, 34);
    const s = rand(0.7, 1.3);
    m4.makeScale(s, s, s).setPosition(x, GROUND_Y + 0.2 * s, z);
    stems.setMatrixAt(i, m4);
    m4.makeScale(s, s, s).setPosition(x, GROUND_Y + 0.42 * s, z);
    heads.setMatrixAt(i, m4);
    heads.setColorAt(i, col.set(pick(petals)));
  }
  scene.add(stems, heads);

  // fluffy clouds drifting around
  const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.25 });
  const clouds = [];
  for (let i = 0; i < 10; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const p = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(2, 3.6), 2), cloudMat);
      p.position.set((k - 2) * 2.4 + rand(-0.5, 0.5), rand(-0.6, 0.8), rand(-1, 1));
      p.scale.y = 0.7;
      c.add(p);
    }
    const a = Math.random() * Math.PI * 2;
    c.userData = { a, r: rand(45, 85), h: rand(24, 38), speed: rand(0.006, 0.014) };
    c.scale.setScalar(rand(0.8, 1.5));
    scene.add(c);
    clouds.push(c);
  }
  updaters.push((time) => {
    for (const c of clouds) {
      const a = c.userData.a + time * c.userData.speed;
      c.position.set(Math.cos(a) * c.userData.r, c.userData.h, Math.sin(a) * c.userData.r);
      c.rotation.y = -a;
    }
  });

  // butterflies fluttering around the table
  const wingGeo = new THREE.CircleGeometry(0.22, 12);
  wingGeo.translate(0.2, 0, 0);
  const flies = [];
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: pick(['#ff7ab6', '#ffd166', '#8bd3ff', '#c3a6ff', '#ff9f43']), side: THREE.DoubleSide, roughness: 0.6 });
    const l = new THREE.Mesh(wingGeo, m);
    const r = new THREE.Mesh(wingGeo, m);
    r.scale.x = -1;
    const bodyM = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.18, 4, 8), new THREE.MeshStandardMaterial({ color: '#3a2a2a' }));
    bodyM.rotation.x = Math.PI / 2;
    g.add(l, r, bodyM);
    g.userData = { l, r, a: Math.random() * 6, rad: rand(10.5, 15), h: rand(0.8, 3), sp: rand(0.15, 0.3) * (Math.random() < 0.5 ? -1 : 1), ph: Math.random() * 6 };
    scene.add(g);
    flies.push(g);
  }
  updaters.push((time) => {
    for (const f of flies) {
      const u = f.userData;
      const a = u.a + time * u.sp;
      const rr = u.rad + Math.sin(time * 0.7 + u.ph) * 1.5;
      f.position.set(Math.cos(a) * rr, u.h + Math.sin(time * 1.3 + u.ph) * 0.6, Math.sin(a) * rr);
      f.rotation.y = -a + (u.sp > 0 ? 0 : Math.PI);
      const flap = Math.sin(time * 18 + u.ph) * 1.1;
      u.l.rotation.y = flap;
      u.r.rotation.y = -flap;
    }
  });

  // ---------------------------------------------------------------- night extras
  const glowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();

  // stars
  const starCount = 900;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const u = Math.random() * Math.PI * 2;
    const v = Math.acos(rand(0.08, 1));
    starPos.set([Math.sin(v) * Math.cos(u) * 150, Math.cos(v) * 150, Math.sin(v) * Math.sin(u) * 150], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    size: 1.6, map: glowTex, color: '#fffbe8', transparent: true, opacity: 0, depthWrite: false, fog: false,
  }));
  scene.add(stars);

  // moon
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(7, 32, 16),
    new THREE.MeshBasicMaterial({ color: '#fff4d6', transparent: true, opacity: 0, fog: false }),
  );
  moon.position.set(-70, 75, -95);
  const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffe9b0', transparent: true, opacity: 0, fog: false, depthWrite: false }));
  moonGlow.scale.set(60, 60, 1);
  moonGlow.position.copy(moon.position);
  scene.add(moon, moonGlow);

  // paper lanterns on poles around the deck + string lights between them
  const LANTERN_COLORS = ['#ff6b4a', '#ffb347', '#ffd54f', '#ff7aa8', '#ff8a3d', '#ffc65c', '#ff5e7a', '#ffa94d'];
  const poleMat = new THREE.MeshStandardMaterial({ color: '#3b2614', roughness: 0.8 });
  const lanternCapMat = new THREE.MeshStandardMaterial({ color: '#2a1a0e', roughness: 0.6 });
  const POLES = 8;
  const poleR = 13.4;
  const tops = [];
  const lanternMats = [];
  const lanternGlows = [];
  for (let i = 0; i < POLES; i++) {
    const a = (i / POLES) * Math.PI * 2 + Math.PI / 8;
    const x = Math.cos(a) * poleR;
    const z = Math.sin(a) * poleR;
    const h = 4.2;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, h, 8), poleMat);
    pole.position.set(x, GROUND_Y + h / 2, z);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), poleMat);
    arm.rotation.z = Math.PI / 2;
    arm.rotation.y = -a;
    const inward = new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a));
    arm.position.set(x + inward.x * 0.45, GROUND_Y + h - 0.1, z + inward.z * 0.45);
    scene.add(pole, arm);
    const lx = x + inward.x * 0.85;
    const lz = z + inward.z * 0.85;
    const color = LANTERN_COLORS[i % LANTERN_COLORS.length];
    const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.6, transparent: true, opacity: 0.95 });
    lanternMats.push(m);
    const lantern = new THREE.Group();
    const paper = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), m);
    paper.scale.y = 1.2;
    const capT = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.08, 12), lanternCapMat);
    capT.position.y = 0.5;
    const capB = capT.clone();
    capB.position.y = -0.5;
    const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.3, 6), new THREE.MeshStandardMaterial({ color: '#c21f3a' }));
    tassel.position.y = -0.7;
    lantern.add(paper, capT, capB, tassel);
    lantern.position.set(lx, GROUND_Y + h - 0.85, lz);
    lantern.userData.sway = Math.random() * 6;
    scene.add(lantern);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(3.2, 3.2, 1);
    lantern.add(glow);
    lanternGlows.push(glow);
    tops.push(new THREE.Vector3(x, GROUND_Y + h, z));
    updaters.push((time) => {
      lantern.rotation.z = Math.sin(time * 1.3 + lantern.userData.sway) * 0.06;
      lantern.rotation.x = Math.cos(time * 1.1 + lantern.userData.sway) * 0.05;
    });
  }
  const bulbsPer = 14;
  const bulbs = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.07, 8, 6),
    new THREE.MeshBasicMaterial({ color: '#d8d2c0' }),
    POLES * bulbsPer,
  );
  const wireMat = new THREE.LineBasicMaterial({ color: '#2a1a0e' });
  const m4b = new THREE.Matrix4();
  for (let i = 0; i < POLES; i++) {
    const a = tops[i];
    const b = tops[(i + 1) % POLES];
    const pts = [];
    for (let k = 0; k <= 24; k++) {
      const f = k / 24;
      const p = a.clone().lerp(b, f);
      p.y -= Math.sin(f * Math.PI) * 1.1; // sagging wire
      pts.push(p);
    }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
    for (let k = 0; k < bulbsPer; k++) {
      const f = (k + 0.5) / bulbsPer;
      const p = a.clone().lerp(b, f);
      p.y -= Math.sin(f * Math.PI) * 1.1 + 0.1;
      bulbs.setMatrixAt(i * bulbsPer + k, m4b.makeTranslation(p.x, p.y, p.z));
    }
  }
  scene.add(bulbs);

  // warm light pools from a few lanterns (no shadows, cheap)
  const lanternLights = [0, 2, 4, 6].map((i) => {
    const l = new THREE.PointLight('#ffb35c', 0, 26, 1.2);
    l.position.copy(tops[i]).add(new THREE.Vector3(0, -1, 0));
    scene.add(l);
    return l;
  });

  // fireflies
  const FF = 140;
  const ffPos = new Float32Array(FF * 3);
  const ffSeed = [];
  for (let i = 0; i < FF; i++) {
    const [x, z] = ringPos(12.8, 32);
    ffSeed.push({ x, z, h: rand(0.2, 3), p: Math.random() * 6, s: rand(0.3, 0.8) });
  }
  const ffGeo = new THREE.BufferGeometry();
  ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
  const fireflies = new THREE.Points(ffGeo, new THREE.PointsMaterial({
    size: 0.35, map: glowTex, color: '#f6ff8a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  fireflies.frustumCulled = false;
  scene.add(fireflies);

  let night = 0;
  updaters.push((time) => {
    if (night <= 0.01) return;
    ffSeed.forEach((f, i) => {
      ffPos[i * 3] = f.x + Math.sin(time * f.s + f.p) * 1.2;
      ffPos[i * 3 + 1] = GROUND_Y + f.h + Math.sin(time * f.s * 1.7 + f.p) * 0.5;
      ffPos[i * 3 + 2] = f.z + Math.cos(time * f.s * 0.8 + f.p) * 1.2;
    });
    ffGeo.attributes.position.needsUpdate = true;
    fireflies.material.opacity = night * (0.75 + 0.25 * Math.sin(time * 3));
    stars.material.opacity = night * (0.85 + 0.15 * Math.sin(time * 0.7));
    lanternLights.forEach((l, i) => { l.intensity = night * (11 + Math.sin(time * 7 + i * 2) * 0.8); });
  });

  const DAY = { top: '#2f86e8', mid: '#a9d6ff', bottom: '#fbe8cc', fog: '#b9dcff', cloud: '#ffffff' };
  const NIGHT = { top: '#070b24', mid: '#1b2552', bottom: '#2a2140', fog: '#121833', cloud: '#3b4370' };
  const lerpC = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k);
  function setNight(k) {
    night = k;
    const u = sky.material.uniforms;
    u.top.value.copy(lerpC(DAY.top, NIGHT.top, k));
    u.mid.value.copy(lerpC(DAY.mid, NIGHT.mid, k));
    u.bottom.value.copy(lerpC(DAY.bottom, NIGHT.bottom, k));
    scene.fog.color.copy(lerpC(DAY.fog, NIGHT.fog, k));
    cloudMat.color.copy(lerpC(DAY.cloud, NIGHT.cloud, k));
    cloudMat.emissiveIntensity = 0.25 * (1 - k);
    stars.material.opacity = k;
    moon.material.opacity = k;
    moonGlow.material.opacity = k * 0.35;
    lanternMats.forEach((m) => { m.emissiveIntensity = 0.15 + k * 1.6; });
    lanternGlows.forEach((g) => { g.material.opacity = k * 0.8; });
    bulbs.material.color.copy(lerpC('#d8d2c0', '#ffd27a', k));
    lanternLights.forEach((l) => { l.intensity = k * 11; });
    fireflies.material.opacity = k;
  }

  return { update: (time) => updaters.forEach((fn) => fn(time)), setNight };
}
