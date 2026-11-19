// The one level of NINJA RUN: layout data plus the meshes that make it playable.
// Everything runs along +X; the ninja's lane is z = 0. Ground tops are at y = 0 unless stated.
import * as THREE from 'three';
import { SECTIONS } from './config.js';

// ── layout ──
// ground: [x0, x1, kind]   kind: 'earth' | 'bridge'
const GROUND = [
  [-40, 40, 'earth'], [44, 92, 'earth'], [92, 128, 'bridge'], [132, 168, 'earth'],
  [195, 236, 'earth'], [236, 262, 'bridge'], [266, 300, 'earth'], [300, 330, 'bridge'],
  [334, 372, 'earth'], [397, 440, 'earth'], [444, 520, 'earth'],
];
// floating stone platforms over the two pits: [x0, x1, top, move]  move = vertical travel (m) for a slow bob
const PLATFORMS = [
  [171, 175, 1.2, 0], [178.5, 182.5, 2.2, 0], [186, 190, 1.3, 0],
  [375.5, 379.5, 1.1, 0.7], [383.5, 387.5, 2.0, 0], [391, 394.5, 1.0, 0],
];
// obstacles: [x, kind]   barrier: wooden fence · stone: block you can also land on · spikes · dummy: break it with the katana
const OBSTACLES = [
  [24, 'barrier'], [58, 'stone'], [72, 'dummy'], [84, 'spikes'], [104, 'barrier'], [116, 'dummy'], [146, 'spikes'], [158, 'dummy'],
  [208, 'stone'], [218, 'barrier'], [228, 'dummy'], [248, 'dummy'], [256, 'spikes'], [290, 'barrier'], [312, 'dummy'], [322, 'stone'],
  [346, 'spikes'], [354, 'dummy'], [364, 'barrier'], [410, 'dummy'], [418, 'stone'], [428, 'spikes'], [452, 'dummy'], [462, 'barrier'], [472, 'dummy'],
];
const SIZE = { barrier: [0.36, 1.0], stone: [1.1, 0.85], spikes: [1.5, 0.42], dummy: [0.7, 1.8] };
// portfolio scrolls: [x, height above ground or platform]
const SCROLLS = [[64, 2.5], [180.5, 2.7], [242, 2.5], [339, 2.6], [436, 2.5]];
export const CHECKPOINT_X = 280, GOAL_X = 492, START_X = 0;

function coinLayout() {
  const out = [];
  const line = (x0, n, y = 0.9, dx = 1.2) => { for (let i = 0; i < n; i++) out.push([x0 + i * dx, y]); };
  const arc = (xc, n = 5, peak = 2.4, w = 4.2) => { for (let i = 0; i < n; i++) { const u = i / (n - 1); out.push([xc - w / 2 + u * w, 0.9 + Math.sin(u * Math.PI) * (peak - 0.9)]); } };
  line(6, 6); line(30, 5);
  for (const [x, k] of OBSTACLES) if (k !== 'dummy') arc(x);
  line(46, 4); line(94, 6); line(122, 3); arc(42, 4, 2.2, 3.4); arc(130, 4, 2.4, 3.6);
  for (const [x0, x1, top] of PLATFORMS) line(x0 + 0.8, 3, top + 0.9, (x1 - x0 - 1.6) / 2);
  line(198, 5); line(238, 4); arc(264, 4, 2.3, 3.4); line(268, 5); line(302, 6); arc(332, 4, 2.3, 3.4); line(336, 4); line(400, 5); arc(442, 4, 2.3, 3.4); line(476, 8);
  return out;
}

// stretch a box's UVs so a shared tiling texture keeps the same scale on every segment
const tile = (geo, u, v) => { const a = geo.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * u, a.getY(i) * v); return geo; };

// ── materials (shared) ──
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o });
function grassTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#7d8f52'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 26; i++) { const x = Math.random() * 128, y = Math.random() * 128, r = 10 + Math.random() * 18; const grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, Math.random() > 0.5 ? 'rgba(150,165,95,.45)' : 'rgba(85,100,52,.45)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2); }
  for (let i = 0; i < 520; i++) { const x = Math.random() * 128, y = Math.random() * 128; g.strokeStyle = Math.random() > 0.5 ? 'rgba(60,78,36,.55)' : 'rgba(170,185,110,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 3, y - 2 - Math.random() * 4); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
function earthTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#4e3528'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(${60 + Math.random() * 40},${40 + Math.random() * 25},${30},${0.35})`; g.beginPath(); g.ellipse(Math.random() * 128, Math.random() * 128, 3 + Math.random() * 7, 2 + Math.random() * 4, 0, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

export function createLevel(scene) {
  const group = new THREE.Group(); scene.add(group);
  const disposables = [];
  const grass = grassTexture(), earth = earthTexture();
  const M = {
    grass: mat('#ffffff', { map: grass }), earth: mat('#b08f7c', { map: earth, roughness: 1 }),
    plank: mat('#8a5a35', { roughness: 0.75 }), plankDark: mat('#5a3a24'), rope: mat('#c9a77a'),
    stone: mat('#6b6e66', { roughness: 0.95, flatShading: true }), moss: mat('#55663f', { flatShading: true }),
    wood: mat('#7a4e2c'), woodDark: mat('#4a2f1c'), metal: mat('#9aa1a8', { metalness: 0.6, roughness: 0.35 }),
    straw: mat('#c9a35b', { roughness: 1 }), red: mat('#b3202c', { roughness: 0.55 }), black: mat('#16120f'),
    gold: mat('#ffc53d', { metalness: 0.75, roughness: 0.28, emissive: '#8a5a00', emissiveIntensity: 0.35 }),
  };

  // ── ground ──
  const ground = [];      // { x0, x1, top }
  for (const [x0, x1, kind] of GROUND) {
    const w = x1 - x0;
    if (kind === 'earth') {
      // the grass runs well toward the camera, so the foreground reads as a meadow, not a cliff face
      const top = new THREE.Mesh(tile(new THREE.BoxGeometry(w, 0.28, 20), w / 2.5, 20 / 2.5), M.grass);
      top.position.set(x0 + w / 2, -0.14, 7); top.receiveShadow = true;
      const body = new THREE.Mesh(tile(new THREE.BoxGeometry(w, 7, 19.8), w / 3, 7 / 3), M.earth);
      body.position.set(x0 + w / 2, -3.78, 7);
      group.add(top, body);
      // a few rocks along the front edge
      for (let x = x0 + 1; x < x1 - 1; x += 5 + Math.random() * 6) {
        const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 + Math.random() * 0.2, 0), M.stone);
        r.position.set(x, -0.02, 2.2 + Math.random() * 3.5); r.scale.y = 0.7; group.add(r);
      }
    } else {
      // wooden bridge: planks across, two rails with rope
      const n = Math.ceil(w / 0.55);
      const plank = new THREE.InstancedMesh(new THREE.BoxGeometry(0.48, 0.14, 2.6), M.plank, n);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < n; i++) { m4.makeRotationY((Math.random() - 0.5) * 0.04); m4.setPosition(x0 + 0.27 + i * 0.55, -0.07, 0); plank.setMatrixAt(i, m4); }
      plank.receiveShadow = true; group.add(plank);
      const beam = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, 0.22), M.plankDark);
      for (const z of [-1.2, 1.2]) { const b = beam.clone(); b.position.set(x0 + w / 2, -0.24, z); group.add(b); }
      const postGeo = new THREE.CylinderGeometry(0.06, 0.07, 1.1, 6);
      for (let x = x0; x <= x1 + 0.01; x += 4) for (const z of [-1.25]) { const p = new THREE.Mesh(postGeo, M.plankDark); p.position.set(x, 0.45, z); group.add(p); }
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, w, 4), M.rope); rope.rotation.z = Math.PI / 2; rope.position.set(x0 + w / 2, 0.85, -1.25); group.add(rope);
    }
    ground.push({ x0, x1, top: 0 });
  }
  // merge touching segments so the ninja never trips on a seam
  ground.sort((a, b) => a.x0 - b.x0);
  for (let i = ground.length - 1; i > 0; i--) if (Math.abs(ground[i].x0 - ground[i - 1].x1) < 0.01) { ground[i - 1].x1 = ground[i].x1; ground.splice(i, 1); }

  // mist far below the gaps, so a pit reads as deep, not as a hole in the world
  // (a dark floor far below, plus a back wall under the horizon, so no sky ever shows through a gap)
  const abyssMat = new THREE.MeshBasicMaterial({ color: '#3a1522' });
  const mist = new THREE.Mesh(new THREE.PlaneGeometry(900, 120), abyssMat);
  mist.rotation.x = -Math.PI / 2; mist.position.set(240, -6, 0); group.add(mist);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(900, 40), abyssMat); wall.position.set(240, -24, -40); group.add(wall);

  // ── floating stone platforms ──
  const platforms = [];
  for (const [x0, x1, top, move] of PLATFORMS) {
    const w = x1 - x0;
    const g = new THREE.Group();
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), M.stone);
    rock.scale.set(w / 2 * 1.02, 0.9, 1.3); rock.position.y = -0.62; rock.castShadow = true; rock.receiveShadow = true;
    const capGeo = new THREE.CylinderGeometry(1, 1, 0.22, 10); const cap = new THREE.Mesh(capGeo, M.moss);
    cap.scale.set(w / 2, 1, 1.2); cap.position.y = -0.11; cap.receiveShadow = true;
    g.add(rock, cap); g.position.set(x0 + w / 2, top, 0); group.add(g);
    platforms.push({ x0, x1, top, base: top, move, mesh: g, phase: x0 * 0.7 });
  }

  // ── obstacles ──
  const obstacles = [];
  const dummyParts = [];
  for (const [x, kind] of OBSTACLES) {
    const [w, h] = SIZE[kind];
    const g = new THREE.Group(); g.position.set(x, 0, 0);
    if (kind === 'barrier') {
      for (const dz of [-0.8, 0, 0.8]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, h, 0.16), M.woodDark); post.position.set(0, h / 2, dz); post.castShadow = true; g.add(post); }
      for (const y of [0.35, 0.8]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 1.9), M.wood); rail.position.set(0, y, 0); rail.castShadow = true; g.add(rail); }
      const rope = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 1.9), M.red); rope.position.y = 0.6; g.add(rope);
    } else if (kind === 'stone') {
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.62, 0), M.stone); s.scale.set(0.95, 0.75, 1.1); s.position.y = h / 2; s.castShadow = true; s.receiveShadow = true; g.add(s);
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), M.moss); m.scale.set(0.9, 0.25, 1); m.position.y = h - 0.05; g.add(m);
    } else if (kind === 'spikes') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, 1.6), M.woodDark); base.position.y = 0.04; g.add(base);
      const cone = new THREE.ConeGeometry(0.12, h, 5);
      for (let i = 0; i < 5; i++) for (const dz of [-0.45, 0.1, 0.6]) { const c = new THREE.Mesh(cone, M.metal); c.position.set(-w / 2 + 0.15 + i * (w - 0.3) / 4, h / 2, dz); c.castShadow = true; g.add(c); }
    } else if (kind === 'dummy') {
      const parts = [];
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.75, 8), M.wood); post.position.y = 0.875; parts.push(post);
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.75, 10), M.straw); torso.position.y = 1.08; parts.push(torso);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.09, 10), M.red); band.position.y = 1.2; parts.push(band);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), M.straw); head.position.y = 1.62; parts.push(head);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), M.woodDark); arm.rotation.x = Math.PI / 2; arm.position.y = 1.3; parts.push(arm);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.1, 10), M.woodDark); foot.position.y = 0.05; parts.push(foot);
      for (const p of parts) { p.castShadow = true; g.add(p); }
      dummyParts.push(...parts);
    }
    group.add(g);
    obstacles.push({ x, kind, w, h, mesh: g, alive: true, landable: kind === 'stone',  breakable: kind === 'dummy', debris: null });
  }

  // ── coins (one instanced mesh) ──
  const coinPos = coinLayout();
  const coinParts = makeCoin();
  const coins = new THREE.InstancedMesh(coinParts.geometry, coinParts.materials, coinPos.length);
  coins.castShadow = false;
  const coinState = coinPos.map(([x, y]) => ({ x, y: y + groundTopAt(x, ground, platforms), taken: false, pop: 0 }));
  group.add(coins);

  // ── portfolio scrolls ──
  const scrolls = [];
  const halo = glowTexture('#ff3b4d');
  for (let i = 0; i < SCROLLS.length && i < SECTIONS.length; i++) {
    const [x, hy] = SCROLLS[i];
    const g = new THREE.Group();
    const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.62, 14), new THREE.MeshStandardMaterial({ color: '#f1e3c4', roughness: 0.8, emissive: '#ff4a3a', emissiveIntensity: 0.25 }));
    paper.rotation.z = Math.PI / 2;
    const rodGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.8, 8);
    const rod = new THREE.Mesh(rodGeo, M.red); rod.rotation.z = Math.PI / 2;
    const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 6, 16), M.red); ribbon.rotation.y = Math.PI / 2;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, color: '#ff4458', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }));
    glow.scale.set(2.2, 2.2, 1);
    g.add(glow, paper, rod, ribbon);
    const y = hy + groundTopAt(x, ground, platforms);
    g.position.set(x, y, 0); group.add(g);
    scrolls.push({ x, y, section: SECTIONS[i], mesh: g, taken: false });
  }

  // ── checkpoint and goal gates (on the lane, the ninja runs through them) ──
  const checkpoint = { x: CHECKPOINT_X, reached: false, gate: makeTorii(M, 4.6, 5.2, false) };
  checkpoint.gate.position.set(CHECKPOINT_X, 0, -1.5); group.add(checkpoint.gate);
  const cpLamp = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 12), new THREE.MeshStandardMaterial({ color: '#552', emissive: '#ff6a2a', emissiveIntensity: 0.15 }));
  cpLamp.scale.y = 1.25; cpLamp.position.set(CHECKPOINT_X, 4.1, -1.2); group.add(cpLamp); checkpoint.lamp = cpLamp;
  const goalGate = makeTorii(M, 6.4, 7.2, true); goalGate.position.set(GOAL_X, 0, -1.6); group.add(goalGate);
  const shrine = makeShrine(M); shrine.position.set(GOAL_X + 9, 0, -2.5); group.add(shrine);

  // ── per frame: coins spin, platforms bob, scrolls float, debris flies ──
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let t = 0;
  const update = (dt, camX) => {
    t += dt;
    const spin = q.setFromAxisAngle(up, Math.sin(t * 2.2) * 0.55);   // rock, so the $ stays readable
    for (let i = 0; i < coinState.length; i++) {
      const c = coinState[i];
      if (Math.abs(c.x - camX) > 40 && !c.pop) continue;
      let k = 1;
      if (c.taken) { c.pop = Math.min(1, c.pop + dt * 5); k = 1 - c.pop; }
      p.set(c.x, c.y + (c.taken ? c.pop * 0.9 : Math.sin(t * 3 + c.x) * 0.06), 0);
      s.setScalar(Math.max(0.0001, k * (1 + (c.taken ? c.pop * 0.6 : 0))));
      m4.compose(p, spin, s); coins.setMatrixAt(i, m4);
    }
    coins.instanceMatrix.needsUpdate = true;
    for (const pl of platforms) if (pl.move) { pl.top = pl.base + Math.sin(t * 1.3 + pl.phase) * pl.move * 0.5; pl.mesh.position.y = pl.top; }
    for (const sc of scrolls) if (!sc.taken) { sc.mesh.position.y = sc.y + Math.sin(t * 2 + sc.x) * 0.12; sc.mesh.rotation.y = Math.sin(t * 1.4) * 0.5; }
    for (const o of obstacles) if (o.debris) {
      o.debris.t += dt;
      for (const d of o.debris.parts) { d.v.y -= 18 * dt; d.m.position.addScaledVector(d.v, dt); d.m.rotation.x += d.w.x * dt; d.m.rotation.z += d.w.z * dt; }
      if (o.debris.t > 1.4) { o.mesh.visible = false; o.debris = null; }
    }
  };
  // initial coin matrices
  update(0, 0);
  for (let i = 0; i < coinState.length; i++) { const c = coinState[i]; m4.compose(p.set(c.x, c.y, 0), q.identity(), s.setScalar(1)); coins.setMatrixAt(i, m4); }
  coins.instanceMatrix.needsUpdate = true;

  const breakDummy = (o, dir = 1) => {
    o.alive = false;
    const parts = o.mesh.children.map((m) => ({ m, v: new THREE.Vector3(dir * (3 + Math.random() * 5), 3 + Math.random() * 5, (Math.random() - 0.5) * 4), w: new THREE.Vector3((Math.random() - 0.5) * 14, 0, (Math.random() - 0.5) * 14) }));
    o.debris = { t: 0, parts };
  };

  const reset = () => {
    for (const c of coinState) { c.taken = false; c.pop = 0; }
    for (const sc of scrolls) { sc.taken = false; sc.mesh.visible = true; }
    for (const o of obstacles) if (o.breakable) {
      o.alive = true; o.debris = null; o.mesh.visible = true;
      o.mesh.children.forEach((m, i) => { m.position.set(0, m.userData.y0 ?? m.position.y, 0); m.rotation.set(m.userData.rx0 ?? m.rotation.x, 0, 0); });
    }
    checkpoint.reached = false; cpLamp.material.emissiveIntensity = 0.15;
    update(0, 0);
  };
  // remember each dummy part's rest pose for a restart
  for (const o of obstacles) if (o.breakable) for (const m of o.mesh.children) { m.userData.y0 = m.position.y; m.userData.rx0 = m.rotation.x; }

  return {
    group, ground, platforms, obstacles, coins: coinState, scrolls, checkpoint, goalX: GOAL_X, startX: START_X,
    totalCoins: coinState.length, update, breakDummy, reset, materials: M, coinParts, abyss: [mist, wall],
    dispose() { group.traverse((o) => { o.geometry?.dispose?.(); }); Object.values(M).forEach((m) => m.dispose()); coinParts.dispose(); grass.dispose(); earth.dispose(); halo.dispose(); scene.remove(group); },
  };
}

// height of whatever stands under x (ground 0, a platform top, or the top of a stone block)
export function groundTopAt(x, ground, platforms) {
  for (const p of platforms) if (x >= p.x0 && x <= p.x1) return p.top;
  for (const g of ground) if (x >= g.x0 && x <= g.x1) return 0;
  return 0;
}

export function glowTexture(color = '#ffffff') {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// a red torii gate; width is between the posts
export function makeTorii(M, width, height, big) {
  // front-on: posts left and right along X, beams across; stand it just behind the lane so the ninja runs past it
  const g = new THREE.Group();
  const r = big ? 0.3 : 0.22;
  const postGeo = new THREE.CylinderGeometry(r, r * 1.15, height, 12);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(postGeo, M.red); p.position.set(s * width / 2, height / 2, 0); p.castShadow = true; g.add(p);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.4, r * 1.5, 0.35, 12), M.black); foot.position.set(s * width / 2, 0.17, 0); g.add(foot);
  }
  const kasagi = new THREE.Mesh(new THREE.BoxGeometry(width + 2.2, 0.32, 0.5), M.black); kasagi.position.y = height + 0.25; g.add(kasagi);
  for (const s of [-1, 1]) { const tipM = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.5), M.black); tipM.position.set(s * (width / 2 + 1.25), height + 0.36, 0); tipM.rotation.z = s * 0.18; g.add(tipM); }
  const shimaki = new THREE.Mesh(new THREE.BoxGeometry(width + 1.8, 0.34, 0.46), M.red); shimaki.position.y = height - 0.06; g.add(shimaki);
  const nuki = new THREE.Mesh(new THREE.BoxGeometry(width + 1, 0.26, 0.3), M.red); nuki.position.y = height * 0.74; g.add(nuki);
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.6, 0.32), M.black); plaque.position.y = height * 0.87; g.add(plaque);
  return g;
}

function makeShrine(M) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(6, 0.6, 5), M.stone); base.position.y = 0.3; g.add(base);
  const hall = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.8, 3.6), M.woodDark); hall.position.y = 2; g.add(hall);
  for (const x of [-2, -0.7, 0.7, 2]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.8, 8), M.red); c.position.set(x, 2, 1.9); g.add(c); }
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 4.6, 1.8, 4, 1), M.black); roof.rotation.y = Math.PI / 4; roof.scale.set(1.35, 1, 1.05); roof.position.y = 4.3; g.add(roof);
  const roof2 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 2.6, 1.2, 4, 1), M.black); roof2.rotation.y = Math.PI / 4; roof2.position.y = 5.7; g.add(roof2);
  return g;
}

// The coin: a flat cartoon gold coin with a $ (face texture on both caps, a darker gold edge).
export function makeCoin(radius = 0.34) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const C = 128;
  g.fillStyle = '#f6d264'; g.beginPath(); g.arc(C, C, 126, 0, Math.PI * 2); g.fill();                    // outer rim
  g.fillStyle = '#d89a1e'; g.beginPath(); g.arc(C - 6, C + 4, 100, 0, Math.PI * 2); g.fill();            // inner bevel shadow
  g.fillStyle = '#f2bd3a'; g.beginPath(); g.arc(C + 4, C - 2, 98, 0, Math.PI * 2); g.fill();             // face
  // diagonal shine bands
  g.save(); g.beginPath(); g.arc(C, C, 124, 0, Math.PI * 2); g.clip();
  g.translate(C, C); g.rotate(-Math.PI / 4); g.fillStyle = 'rgba(255,240,170,.45)';
  g.fillRect(-160, -64, 320, 26); g.fillRect(-160, -26, 320, 10); g.fillRect(-160, 40, 320, 18);
  g.restore();
  // $ with a darker drop shadow
  g.font = '700 150px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#c98a14'; g.fillText('$', C + 9, C + 12);
  g.fillStyle = '#fde68a'; g.fillText('$', C + 2, C + 6);
  // sparkles
  const star = (x, y, r) => { g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(x, y - r); g.quadraticCurveTo(x, y, x + r, y); g.quadraticCurveTo(x, y, x, y + r); g.quadraticCurveTo(x, y, x - r, y); g.quadraticCurveTo(x, y, x, y - r); g.fill(); };
  star(52, 70, 18); star(76, 44, 9); star(204, 196, 16);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const geometry = new THREE.CylinderGeometry(radius, radius, radius * 0.24, 28);
  geometry.rotateX(Math.PI / 2);                     // caps face the camera
  const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.15, emissive: '#5a3a00', emissiveIntensity: 0.25 });
  const edge = new THREE.MeshStandardMaterial({ color: '#c97d10', roughness: 0.5, metalness: 0.3 });
  return { geometry, materials: [edge, face, face], dispose() { geometry.dispose(); tex.dispose(); face.dispose(); edge.dispose(); } };
}
