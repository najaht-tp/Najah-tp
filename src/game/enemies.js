// Sky enemies: fanged bats and shadow-ninja orbs (with orbiting shuriken) that swoop down at the ninja from ahead.
// Strike one with the katana and it bursts into coins that fly to the ninja. Touch one and you lose a heart.
import * as THREE from 'three';
import { glowTexture } from './level.js';

// where each enemy reaches the bottom of its dive (on solid ground, clear of obstacles, gaps and scrolls)
const DIVES = [50, 94, 137, 202, 267, 300, 400, 444, 482];
const COINS_EACH = 5;
const SPAN = 9;          // metres it travels ahead of / past the dive point
const DROP = 8;          // metres it falls during the dive
const DUR = 2.0;         // seconds from appearing to the bottom of the dive
const SIZE = 1.15;       // enemy scale

// Both enemies are modelled facing the camera (+Z), then turned a little toward the ninja (-X), like the reference art.
const FACE_TURN = -0.6;

// ── bat: dark purple body, red wings on purple bones, glowing red eyes, fangs ──
function makeBat(M, glow) {
  const g = new THREE.Group(), root = new THREE.Group(); root.rotation.y = FACE_TURN * 0.35; g.add(root);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), M.batBody); body.scale.set(1, 1.05, 0.9); root.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), M.batBody); belly.position.set(0, -0.28, 0.02); belly.scale.set(0.9, 1, 0.8); root.add(belly);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 4), M.batBody); ear.position.set(sx * 0.17, 0.32, -0.02); ear.rotation.z = -sx * 0.35; root.add(ear);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 4), M.wingRed); inner.position.set(sx * 0.17, 0.31, 0.04); inner.rotation.z = -sx * 0.35; root.add(inner);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), M.redEye); eye.scale.set(1, 0.75, 0.5); eye.position.set(sx * 0.11, 0.06, 0.26); eye.rotation.z = sx * 0.35; root.add(eye);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.04, 0.05), M.batDark); brow.position.set(sx * 0.11, 0.14, 0.27); brow.rotation.z = sx * 0.45; root.add(brow);
    const fang = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.08, 6), M.fang); fang.rotation.z = Math.PI; fang.position.set(sx * 0.05, -0.1, 0.27); root.add(fang);
    for (const cx of [-0.035, 0.035]) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.1, 5), M.fang); claw.rotation.z = Math.PI; claw.position.set(sx * 0.1 + cx, -0.5, 0.06); root.add(claw); }
  }
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), M.mouth); mouth.scale.set(1.2, 0.6, 0.4); mouth.position.set(0, -0.08, 0.255); root.add(mouth);
  const wings = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(side * 0.24, 0.08, -0.02);
    const red = new THREE.Mesh(M.batWingGeo, M.wingRed); red.scale.x = side;
    const bone = new THREE.Mesh(M.batBoneGeo, M.wingBone); bone.scale.x = side; bone.position.z = -0.01;
    pivot.add(bone, red); root.add(pivot); wings.push({ pivot, side });
  }
  const halo = new THREE.Sprite(glow.red); halo.scale.set(2.4, 2.4, 1); g.add(halo);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.visible = false;
  const animate = (t, e) => { for (const w of wings) { w.pivot.rotation.z = w.side * Math.sin(t * 14 + e.tx) * 0.55; w.pivot.rotation.y = -w.side * 0.25; } root.position.y = Math.sin(t * 16 + e.tx) * 0.05; };
  return { g, animate };
}

// ── shadow-ninja orb: black ball, red headband with tails, angry eyes, orbiting shuriken, purple swirl ──
function makeOrb(M, glow) {
  const g = new THREE.Group(), root = new THREE.Group(); root.rotation.y = FACE_TURN; g.add(root);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.4, 22, 16), M.orb); root.add(ball);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.07, 8, 32), M.band); band.rotation.x = Math.PI / 2 - 0.12; band.position.y = 0.12; band.scale.set(1.02, 1.02, 1.3); root.add(band);
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), M.band); knot.position.set(0.3, 0.14, -0.27); root.add(knot);
  const tails = [];
  for (const [i, len] of [[0, 0.62], [1, 0.48]]) {
    const geo = new THREE.PlaneGeometry(len, 0.11, 6, 1); geo.translate(len / 2, 0, 0);
    const tail = new THREE.Mesh(geo, M.bandSide); tail.position.set(0.34, 0.16 - i * 0.08, -0.3); tail.rotation.set(0, -0.9, -0.15 - i * 0.35); root.add(tail); tails.push({ tail, i, base: tail.rotation.z, pos: geo.attributes.position, x0: Float32Array.from(geo.attributes.position.array) });
  }
  for (const sx of [-1, 1]) {
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), M.eyeWhite); white.scale.set(1.35, 0.75, 0.4); white.position.set(sx * 0.14, -0.03, 0.37); white.rotation.z = sx * 0.4; root.add(white);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), M.redEye); iris.position.set(sx * 0.12, -0.045, 0.41); root.add(iris);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.045, 0.05), M.orbDark); brow.position.set(sx * 0.13, 0.04, 0.39); brow.rotation.z = sx * 0.5; root.add(brow);
  }
  const mask = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.012, 4, 24, Math.PI * 0.6), M.orbDark); mask.rotation.z = Math.PI * 1.2; mask.position.set(0, -0.02, 0.2); root.add(mask);
  // three shuriken orbit the ball
  const stars = [];
  for (let i = 0; i < 3; i++) { const st = new THREE.Mesh(M.starGeo, M.steel); st.scale.setScalar(1.3); root.add(st); stars.push(st); }
  // purple swirl underneath
  const swirl = [];
  for (let i = 0; i < 7; i++) { const sp = new THREE.Sprite(glow.purple); sp.scale.setScalar(0.5 - i * 0.04); root.add(sp); swirl.push(sp); }
  const halo = new THREE.Sprite(glow.purpleSoft); halo.scale.set(2.2, 2.2, 1); g.add(halo);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.visible = false;
  const animate = (t, e) => {
    for (let i = 0; i < 3; i++) { const a = t * 3.2 + (i * Math.PI * 2) / 3; stars[i].position.set(Math.cos(a) * 0.68, 0.05 + Math.sin(a * 2) * 0.08, Math.sin(a) * 0.68); stars[i].rotation.set(0.3, -FACE_TURN, t * 14 + i); }
    for (let i = 0; i < swirl.length; i++) { const a = t * 7 - i * 0.7, r = 0.12 + i * 0.035; swirl[i].position.set(Math.cos(a) * r, -0.45 - i * 0.07, Math.sin(a) * r); }
    for (const tl of tails) { const p = tl.pos; for (let k = 0; k < p.count; k++) { const x = tl.x0[k * 3]; p.setZ(k, Math.sin(t * 12 - x * 9 + tl.i) * 0.06 * x * 2); } p.needsUpdate = true; }
  };
  return { g, animate };
}

function makeShuriken() {
  const s = new THREE.Shape(), R = 0.2, r = 0.06;
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 4, d = i % 2 ? r : R; i ? s.lineTo(Math.cos(a) * d, Math.sin(a) * d) : s.moveTo(Math.cos(a) * d, Math.sin(a) * d); }
  const hole = new THREE.Path(); hole.absarc(0, 0, 0.035, 0, Math.PI * 2, true); s.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1 }); geo.center(); return geo;
}

function makeBatWing() {
  // a scalloped membrane from the body out to the tip, and the bones along its top edge and fingers
  const w = new THREE.Shape(); w.moveTo(0, 0.12); w.lineTo(0.5, 0.42); w.lineTo(1.05, 0.5); w.quadraticCurveTo(0.95, 0.05, 1.08, -0.18);
  w.quadraticCurveTo(0.85, -0.05, 0.72, -0.25); w.quadraticCurveTo(0.55, -0.08, 0.38, -0.25); w.quadraticCurveTo(0.22, -0.1, 0, -0.12); w.lineTo(0, 0.12);
  const membrane = new THREE.ShapeGeometry(w);
  const bone = new THREE.Shape(); bone.moveTo(0, 0.08); bone.lineTo(0.5, 0.36); bone.lineTo(1.1, 0.46); bone.lineTo(1.12, 0.58); bone.lineTo(0.48, 0.5); bone.lineTo(0, 0.2); bone.lineTo(0, 0.08);
  return { membrane, bone: new THREE.ShapeGeometry(bone) };
}

export function createEnemies(scene, coinParts) {
  const group = new THREE.Group(); scene.add(group);
  const wing = makeBatWing();
  const glowTex = glowTexture();
  const M = {
    batBody: new THREE.MeshStandardMaterial({ color: '#3a2a4a', roughness: 0.55, emissive: '#1a0a24', emissiveIntensity: 0.6 }),
    batDark: new THREE.MeshStandardMaterial({ color: '#1a1222', roughness: 0.6 }),
    wingRed: new THREE.MeshStandardMaterial({ color: '#e0242e', roughness: 0.5, side: THREE.DoubleSide, emissive: '#7a0a12', emissiveIntensity: 0.5 }),
    wingBone: new THREE.MeshStandardMaterial({ color: '#8a5ad0', roughness: 0.45, side: THREE.DoubleSide, emissive: '#3a1a6a', emissiveIntensity: 0.5 }),
    redEye: new THREE.MeshBasicMaterial({ color: '#ff2a2a' }),
    fang: new THREE.MeshStandardMaterial({ color: '#f2ece4', roughness: 0.3 }),
    mouth: new THREE.MeshBasicMaterial({ color: '#7a0a14' }),
    orb: new THREE.MeshStandardMaterial({ color: '#15121c', roughness: 0.35, metalness: 0.1, emissive: '#10061c', emissiveIntensity: 0.5 }),
    orbDark: new THREE.MeshBasicMaterial({ color: '#050407' }),
    band: new THREE.MeshStandardMaterial({ color: '#e0202c', roughness: 0.55 }),
    bandSide: new THREE.MeshStandardMaterial({ color: '#e0202c', roughness: 0.55, side: THREE.DoubleSide }),
    eyeWhite: new THREE.MeshBasicMaterial({ color: '#f4f0f4' }),
    steel: new THREE.MeshStandardMaterial({ color: '#c8ccd8', metalness: 0.8, roughness: 0.25, emissive: '#2a2040', emissiveIntensity: 0.3 }),
    batWingGeo: wing.membrane, batBoneGeo: wing.bone, starGeo: makeShuriken(),
  };
  const sprite = (color, opacity) => new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity });
  const glow = { red: sprite('#ff2a3a', 0.55), purple: sprite('#9a4dff', 0.9), purpleSoft: sprite('#8a3dff', 0.6) };

  const list = DIVES.map((tx, i) => ({ tx, kind: i % 2 ? 'orb' : 'bat', state: 'wait', t: 0, pos: new THREE.Vector3(), ...(i % 2 ? makeOrb(M, glow) : makeBat(M, glow)) }));
  for (const e of list) group.add(e.g);

  // coins that burst out of a struck enemy and fly into the ninja
  const drops = Array.from({ length: COINS_EACH * 3 }, () => {
    const m = new THREE.Mesh(coinParts.geometry, coinParts.materials); m.visible = false; m.scale.setScalar(0.8); group.add(m);
    return { m, t: 1, v: new THREE.Vector3() };
  });

  const place = (e) => {
    const s = e.t / DUR;
    const x = e.tx + SPAN * (1 - s), y = 1.15 + DROP * (1 - s) * (1 - s);
    e.pos.set(x, y, 0);
    e.g.position.copy(e.pos);
    // nose follows the path: down while diving, up after
    e.g.rotation.z = (s < 1 ? -0.35 * (1 - s) : 0.3 * Math.min(1, s - 1)) * (e.kind === 'bat' ? 1 : 0.3);
  };

  let time = 0;
  return {
    total: DIVES.length * COINS_EACH,
    coinsEach: COINS_EACH,
    // returns events for the game: { hit: enemy } when one touches the ninja
    update(dt, P, playerX, cutting, onKill, onTouch) {
      time += dt;
      for (const e of list) {
        if (e.state === 'wait') {
          // appear when the ninja is about DUR seconds away from the dive point
          if (playerX > e.tx - DUR * 7 - 0.5 && playerX < e.tx) { e.state = 'fly'; e.t = 0; e.g.visible = true; e.g.scale.setScalar(SIZE); }
          continue;
        }
        if (e.state === 'fly') {
          e.t += dt; place(e);
          e.animate(time, e);
          const dx = e.pos.x - P.x, dy = e.pos.y - (P.y + 1.0);
          // katana: in front of the ninja, within reach, while the blade is cutting
          if (cutting && dx > -0.5 && dx < 2.7 && e.pos.y > P.y - 0.2 && e.pos.y < P.y + 3.2) {
            e.state = 'dead'; e.killed = true; e.t = 0; onKill(e.pos.clone());
            let k = 0; for (const d of drops) { if (k >= COINS_EACH) break; if (d.t < 1) continue; k++; d.t = 0; d.m.visible = true; d.m.position.copy(e.pos); d.v.set(-1 + Math.random() * 4, 4 + Math.random() * 3, (Math.random() - 0.5) * 2); }
            continue;
          }
          if (Math.hypot(dx, dy) < 0.8) onTouch(e);
          if (e.t > DUR * 2) { e.state = 'gone'; e.g.visible = false; }
        }
        if (e.state === 'dead') {
          e.t += dt; const k = Math.min(1, e.t / 0.35);
          e.g.scale.setScalar(Math.max(0.001, (1 - k) * SIZE)); e.g.rotation.z += dt * 14;
          if (k >= 1) { e.g.visible = false; e.state = 'gone'; }
        }
      }
      // flying coins: pop up, then home in on the ninja
      for (const d of drops) {
        if (d.t >= 1) continue;
        d.t += dt / 0.8;
        if (d.t < 0.4) { d.v.y -= 14 * dt; d.m.position.addScaledVector(d.v, dt); }
        else { const target = new THREE.Vector3(P.x + 0.2, P.y + 1.1, 0); d.m.position.lerp(target, Math.min(1, dt * 9)); }
        d.m.rotation.y += dt * 9;
        if (d.t >= 1) d.m.visible = false;
      }
    },
    // after a respawn: enemies still ahead that were not struck can come again
    rewind(x) { for (const e of list) if (!e.killed && e.tx > x && e.state !== 'wait') { e.state = 'wait'; e.g.visible = false; } },
    reset() { for (const e of list) { e.state = 'wait'; e.t = 0; e.g.visible = false; e.killed = false; } for (const d of drops) { d.t = 1; d.m.visible = false; } },
    get list() { return list; },
    dispose() { group.traverse((o) => { if (o.isMesh && o.geometry !== coinParts.geometry) o.geometry.dispose(); }); Object.values(M).forEach((m) => m.dispose?.()); Object.values(glow).forEach((m) => m.dispose()); glowTex.dispose(); scene.remove(group); },
  };
}
