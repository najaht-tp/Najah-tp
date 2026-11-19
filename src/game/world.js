// The world around the lane: dusk sky, sun, mountains, clouds, bamboo forest, torii gates, pagodas, lanterns and
// cherry blossom petals. Everything is built once from reusable geometry; repeated things are instanced.
// Depth does the parallax: far layers sit far behind the lane, so a perspective camera moves them more slowly.
import * as THREE from 'three';
import { glowTexture, makeTorii } from './level.js';
import { ASSETS } from './config.js';

const rand = (() => { let s = 1234567; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();   // repeatable layout

function skyTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 512; const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, '#120c22'); grd.addColorStop(0.3, '#3a1838'); grd.addColorStop(0.55, '#8a3445'); grd.addColorStop(0.75, '#d9694e'); grd.addColorStop(0.9, '#f2a56c'); grd.addColorStop(1, '#f7c890');
  g.fillStyle = grd; g.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function ridge(width, height, seed, steps = 140) {
  const shape = new THREE.Shape(); shape.moveTo(-width / 2, -40);
  let y = 0;
  for (let i = 0; i <= steps; i++) {
    const x = -width / 2 + (i / steps) * width, u = i / steps;
    y = height * (0.55 + 0.3 * Math.sin(u * 9 + seed) + 0.18 * Math.sin(u * 23 + seed * 2) + 0.08 * Math.sin(u * 61 + seed * 3));
    shape.lineTo(x, Math.max(2, y));
  }
  shape.lineTo(width / 2, -40); shape.lineTo(-width / 2, -40);
  return new THREE.ShapeGeometry(shape);
}

function bambooTexture() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 256; const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 32, 0); grd.addColorStop(0, '#1c1416'); grd.addColorStop(0.45, '#4a3236'); grd.addColorStop(1, '#140e10');
  g.fillStyle = grd; g.fillRect(0, 0, 32, 256);
  for (let y = 18; y < 256; y += 46) { g.fillStyle = 'rgba(8,4,6,.8)'; g.fillRect(0, y, 32, 3); g.fillStyle = 'rgba(200,90,90,.35)'; g.fillRect(0, y + 3, 32, 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapT = THREE.RepeatWrapping; return t;
}

function leafTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  for (let i = 0; i < 22; i++) {
    const a = rand() * Math.PI * 2, r = 20 + rand() * 30, x = 64 + Math.cos(a) * r * 0.6, y = 64 + Math.sin(a) * r * 0.45;
    g.save(); g.translate(x, y); g.rotate(a + 0.6); g.fillStyle = rand() > 0.5 ? '#d8202c' : '#9a1420';
    g.beginPath(); g.ellipse(0, 0, 20, 4.5, 0, 0, Math.PI * 2); g.fill(); g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function petalTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
  g.fillStyle = '#e0303a'; g.beginPath(); g.ellipse(16, 16, 12, 6, 0.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ff7a6a'; g.beginPath(); g.ellipse(18, 17, 6, 3, 0.5, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function cloudTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96; const g = c.getContext('2d');
  for (let i = 0; i < 9; i++) {
    const x = 40 + rand() * 176, y = 50 + (rand() - 0.5) * 24, r = 22 + rand() * 26;
    const grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, 'rgba(255,214,200,.55)'); grd.addColorStop(1, 'rgba(255,214,200,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createWorld(scene, { from = -60, to = 560, mobile = false, background = null, camera = null } = {}) {
  const group = new THREE.Group(); scene.add(group);
  const tex = []; const keep = (t) => (tex.push(t), t);
  scene.background = keep(skyTexture());
  scene.fog = new THREE.Fog(background ? '#c9605a' : '#a8504f', 34, 150);
  // painted backdrop: a plane fixed in front of the camera, far away, sized to cover the view ("cover" fit),
  // and slid up or down so the painting's stone floor lines up with the level's ground on every screen shape
  let backdrop = null;
  if (background && camera) {
    scene.background = new THREE.Color('#2a1418');
    backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: background, fog: false, depthWrite: false, toneMapped: false }));
    backdrop.renderOrder = -10; backdrop.frustumCulled = false;
    camera.add(backdrop); tex.push(background);
  }
  const imgAspect = background && background.image ? background.image.width / background.image.height : 16 / 9;
  const edge = new THREE.Vector3();
  const fitBackdrop = (cam, focusX) => {
    const d = 320, h = 2 * d * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    edge.set(focusX, 0, -3).project(cam);
    const sGround = THREE.MathUtils.clamp((1 - edge.y) / 2, 0.3, 0.8);      // where the ground's far edge is, from the top of the screen
    const hz = ASSETS.background.horizon;
    const k = Math.max(1, cam.aspect / imgAspect, sGround / hz);             // image height in screen heights
    const top = Math.min(0, sGround - hz * k);
    backdrop.scale.set(k * h * imgAspect, k * h, 1);
    backdrop.position.set(0, (1 - 2 * (top + k / 2)) * (h / 2), -d);
  };
  const len = to - from, mid = (from + to) / 2;

  // light: warm low sun, soft ambient
  const hemi = new THREE.HemisphereLight('#ffe6d6', '#3a2a24', 2.1); scene.add(hemi);
  // rim light from behind, so the black costume reads against the forest
  const rim = new THREE.DirectionalLight('#ff9aa8', 2.4); rim.position.set(6, 6, -10); scene.add(rim, rim.target);
  const sun = new THREE.DirectionalLight('#ffd9b0', 3.1);
  sun.position.set(-8, 14, 10); sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 512 : 1024, mobile ? 512 : 1024);
  Object.assign(sun.shadow.camera, { left: -10, right: 14, top: 10, bottom: -4, near: 1, far: 40 });
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  // sun disc, low over the mountains (follows the camera: it is "at infinity")
  const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: keep(glowTexture()), color: '#ffb07a', transparent: true, depthWrite: false, fog: false }));
  sunDisc.scale.set(80, 80, 1); sunDisc.position.set(0, 22, -190); group.add(sunDisc);
  const sunCore = new THREE.Mesh(new THREE.CircleGeometry(9, 40), new THREE.MeshBasicMaterial({ color: '#ffd9a8', fog: false }));
  sunCore.position.set(0, 22, -189); group.add(sunCore);
  if (backdrop) { sunDisc.visible = false; sunCore.visible = false; }

  // mountains: three ridges, each farther, paler and wider
  const layers = [
    { z: -170, h: 20, color: '#b45a5c', seed: 1.3, w: len * 1.9 },
    { z: -120, h: 13, color: '#7a3444', seed: 4.1, w: len * 1.6 },
    { z: -80, h: 8, color: '#4a2232', seed: 7.7, w: len * 1.4 },
  ];
  for (const L of layers) {
    const m = new THREE.Mesh(ridge(L.w, L.h, L.seed), new THREE.MeshBasicMaterial({ color: L.color, fog: false }));
    m.position.set(mid, -4, L.z); m.visible = !backdrop; group.add(m);
  }

  // drifting clouds
  const cloudTex = keep(cloudTexture());
  const clouds = [];
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.55 + rand() * 0.3, fog: false }));
    const w = 40 + rand() * 40; s.scale.set(w, w * 0.375, 1);
    s.position.set(from + rand() * len, 22 + rand() * 18, -140 - rand() * 20); s.visible = !backdrop; group.add(s); clouds.push(s);
  }

  // distant pagodas with lit windows
  const pagodaMat = new THREE.MeshStandardMaterial({ color: '#1b1114', roughness: 1 });
  const windowMat = new THREE.MeshBasicMaterial({ color: '#ff9a4a' });
  for (let x = from + 40; x < to; x += 120 + rand() * 30) {
    const g = new THREE.Group();
    const tiers = 3 + Math.floor(rand() * 2);
    for (let i = 0; i < tiers; i++) {
      const w = 7 - i * 1.4, y = i * 3.2;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 2.4, w * 0.7), pagodaMat); wall.position.y = y + 1.2; g.add(wall);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.2, w * 0.82, 1.1, 4), pagodaMat); roof.rotation.y = Math.PI / 4; roof.position.y = y + 2.75; g.add(roof);
      const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.25, 0.7), windowMat); win.position.set(0, y + 1.2, w * 0.351); g.add(win);
    }
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 3, 6), pagodaMat); spire.position.y = tiers * 3.2 + 1.2; g.add(spire);
    g.position.set(x, -1.5, -48 - rand() * 10); g.scale.setScalar(1.1 + rand() * 0.4); g.visible = !backdrop; group.add(g);
  }

  // torii gates in the middle distance
  const M = { red: new THREE.MeshStandardMaterial({ color: '#a51d29', roughness: 0.6 }), black: new THREE.MeshStandardMaterial({ color: '#141014', roughness: 0.8 }) };
  if (!backdrop) for (const x of [14, 122, 214, 352, 430]) { const t = makeTorii(M, 5, 5.6, false); t.position.set(x, 0, -9); group.add(t); }

  // bamboo forest: one instanced mesh of stalks, one of leaf clusters
  const bTex = keep(bambooTexture()); bTex.repeat.set(1, 4);
  const stalkMat = new THREE.MeshStandardMaterial({ map: bTex, roughness: 0.8 });
  const stalkGeo = new THREE.CylinderGeometry(1, 1, 1, 7, 1, true); stalkGeo.translate(0, 0.5, 0);
  const back = Math.round(len * (mobile ? 0.55 : 0.85));
  const stalks = new THREE.InstancedMesh(stalkGeo, stalkMat, back);
  const leafTex = keep(leafTexture());
  const leafMat = new THREE.MeshStandardMaterial({ map: leafTex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.9 });
  const leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), leafMat, back);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  for (let i = 0; i < back; i++) {
    const x = from + rand() * len, z = -8 - rand() * 22, h = 9 + rand() * 9, r = 0.09 + rand() * 0.07, lean = (rand() - 0.5) * 0.12;
    q.setFromEuler(e.set(0, 0, lean)); m4.compose(p.set(x, -0.3, z), q, s.set(r, h, r)); stalks.setMatrixAt(i, m4);
    const lw = 3 + rand() * 3;
    q.setFromEuler(e.set(0, 0, rand() * Math.PI)); m4.compose(p.set(x - Math.sin(lean) * h, h - 0.5 - rand() * 2, z + 0.2), q, s.set(lw, lw, 1)); leaves.setMatrixAt(i, m4);
  }
  group.add(stalks, leaves);
  // with the painted backdrop the 3D bamboo would stand beyond the ground's edge and look like it floats: the painting has its own
  if (backdrop) { stalks.visible = false; leaves.visible = false; }
  // a few dark stalks in front of the lane, for depth
  const frontGeo = stalkGeo.clone();
  const front = new THREE.InstancedMesh(frontGeo, new THREE.MeshStandardMaterial({ color: '#1d2618', roughness: 1 }), Math.round(len / 48));
  for (let i = 0; i < front.count; i++) { m4.compose(p.set(from + rand() * len, -1, 4.2 + rand() * 1.6), q.identity(), s.set(0.07, 16, 0.07)); front.setMatrixAt(i, m4); }
  group.add(front);
  if (backdrop) front.visible = false;

  // paper lanterns along the path
  const glow = keep(glowTexture());
  const lanternMat = new THREE.MeshStandardMaterial({ color: '#c42a2a', emissive: '#ff5a2a', emissiveIntensity: 0.85, roughness: 0.6 });
  const postMat = new THREE.MeshStandardMaterial({ color: '#3a2416', roughness: 0.9 });
  const lanternGeo = new THREE.SphereGeometry(0.28, 12, 10), postGeo = new THREE.CylinderGeometry(0.05, 0.06, 2.4, 6), armGeo = new THREE.BoxGeometry(0.5, 0.05, 0.05);
  const glowMat = new THREE.SpriteMaterial({ map: glow, color: '#ff7a3a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 });
  const lanterns = [];
  for (let x = from + 20; x < to; x += 16) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(postGeo, postMat); post.position.y = 1.2;
    const arm = new THREE.Mesh(armGeo, postMat); arm.position.set(0.22, 2.35, 0);
    const lamp = new THREE.Mesh(lanternGeo, lanternMat); lamp.scale.y = 1.3; lamp.position.set(0.45, 1.95, 0);
    const halo = new THREE.Sprite(glowMat); halo.scale.set(1.6, 1.6, 1); halo.position.copy(lamp.position);
    g.add(post, arm, lamp, halo); g.position.set(x, 0, -2.2); group.add(g); lanterns.push(g);
  }

  // cherry blossom petals around the camera (recycled)
  const N = mobile ? 90 : 180;
  const petalGeo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), vel = [];
  for (let i = 0; i < N; i++) { pos[i * 3] = (rand() - 0.5) * 50; pos[i * 3 + 1] = rand() * 16; pos[i * 3 + 2] = -6 + rand() * 12; vel.push({ s: 0.4 + rand() * 0.8, ph: rand() * 10 }); }
  petalGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const petals = new THREE.Points(petalGeo, new THREE.PointsMaterial({ map: keep(petalTexture()), size: 0.32, transparent: true, depthWrite: false, alphaTest: 0.1 }));
  petals.frustumCulled = false; group.add(petals);

  let t = 0;
  const update = (dt, camX, focusX, cam) => {
    t += dt;
    if (backdrop && cam) fitBackdrop(cam, focusX);
    sunDisc.position.x = camX; sunCore.position.x = camX;
    for (const c of clouds) { c.position.x += dt * 0.8; if (c.position.x < camX - 140) c.position.x += 280; if (c.position.x > camX + 140) c.position.x -= 280; }
    // light and shadow follow the ninja
    sun.position.set(focusX - 8, 14, 10); sun.target.position.set(focusX + 2, 0, 0); sun.target.updateMatrixWorld();
    rim.position.set(focusX + 6, 6, -10); rim.target.position.set(focusX, 1, 0); rim.target.updateMatrixWorld();
    // petals drift down and to the left, wrapping around the camera
    const a = petalGeo.attributes.position;
    for (let i = 0; i < N; i++) {
      const v = vel[i]; let x = a.getX(i), y = a.getY(i);
      y -= v.s * dt; x += (Math.sin(t * 1.3 + v.ph) * 0.6 - 0.9) * dt;
      if (y < -0.5) { y = 14 + Math.random() * 3; x = camX - 25 + Math.random() * 50; }
      if (x < camX - 26) x += 52; if (x > camX + 26) x -= 52;
      a.setX(i, x); a.setY(i, y);
    }
    a.needsUpdate = true;
  };

  return {
    group, update,
    dispose() {
      group.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => m.dispose()); });
      tex.forEach((t) => t.dispose()); scene.remove(group, hemi, sun, sun.target, rim, rim.target); if (backdrop) { backdrop.parent?.remove(backdrop); backdrop.geometry.dispose(); backdrop.material.dispose(); } scene.background = null; scene.fog = null;
    },
  };
}
