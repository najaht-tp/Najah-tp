// NINJA RUN: game state, physics, collisions, camera and the loop. Builds the scene from world.js, level.js,
// player.js and fx.js, and drives the DOM interface in ui.js.
import * as THREE from 'three';
import { TUNING as T, SECTIONS } from './config.js';
import { loadGameAssets } from './load.js';
import { createWorld } from './world.js';
import { createLevel, CHECKPOINT_X } from './level.js';
import { createPlayer } from './player.js';
import { createFx } from './fx.js';
import { createEnemies } from './enemies.js';
import { createUI } from './ui.js';
import { createAudio } from './audio.js';

const hasWebGL = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } };

export function startGame({ onClose, navigate }) {
  const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const audio = createAudio();
  let mode = 'loading';            // loading | start | playing | paused | won | error | closed
  let resumeTo = 'playing';
  let renderer = null, scene = null, camera = null, world = null, level = null, player = null, fx = null, enemies = null;

  const ui = createUI({
    soundOn: audio.on, touch,
    onPlay: () => play(), onExit: () => close(), onPause: () => pause(), onResume: () => resume(),
    onRestart: () => restart(), onSound: (on) => audio.set(on),
    onView: (action) => close().then(() => navigate(action)),
    onJump: () => input.jump(), onAttack: () => input.attack(),
  });
  document.documentElement.classList.add('is-game');
  const prevOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';

  if (!hasWebGL()) { mode = 'error'; ui.error('This browser cannot run the 3D game. You can keep exploring the portfolio.'); return { close }; }

  // ── state ──
  const P = { x: 0, y: 0, vy: 0, grounded: true, support: null, jumps: 0, coyote: 0, buffer: 0, cool: 0, invuln: 0, hp: T.health,
    lastSafe: 0, speed: 0, tip: null, hurtSlow: 0, landT: 0 };
  const G = { score: 0, coins: 0, scrolls: new Set(), dummies: 0, hinted: new Set(), time: 0, wonT: 0, startCam: 1 };

  // ── input ──
  const input = {
    jump() { if (mode === 'playing') P.buffer = T.jumpBuffer; else if (mode === 'start') play(); },
    attack() { if (mode !== 'playing' || P.cool > 0 || !player) return; P.cool = T.attackCooldown; player.attack(); audio.slash(); G.slashPending = true; },
  };
  const onKey = (e) => {
    if (mode === 'closed') return;
    const k = e.key;
    if (k === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (mode === 'playing') pause(); else if (mode === 'paused') resume(); else if (mode !== 'loading') close(); return; }
    if (e.repeat) return;
    if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') { e.preventDefault(); if (mode === 'start' && document.activeElement?.closest?.('.sr-sound, .sr-exit')) return; input.jump(); }
    else if (k === 'j' || k === 'J' || k === 'k' || k === 'K' || k === 'x' || k === 'X') { e.preventDefault(); input.attack(); }
    else if (k === 'p' || k === 'P') { if (mode === 'playing') pause(); else if (mode === 'paused') resume(); }
  };
  window.addEventListener('keydown', onKey, true);
  const onVis = () => { if (document.hidden && mode === 'playing') pause(); };
  document.addEventListener('visibilitychange', onVis);
  // tapping the open field on a phone also jumps (the pads are the main control)
  const onFieldTap = (e) => { if (mode === 'playing' && touch && e.target === renderer?.domElement) input.jump(); };

  // ── load ──
  loadGameAssets((p) => ui.progress(p)).then(build).catch((err) => {
    console.warn('Ninja Run: could not load the game assets', err);
    mode = 'error'; ui.error('The game could not load. Please try again later.');
  });

  function build(assets) {
    if (mode === 'closed') return;
    renderer = new THREE.WebGLRenderer({ antialias: !touch, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, touch ? 1.5 : 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    ui.el.prepend(renderer.domElement);
    renderer.domElement.addEventListener('pointerdown', onFieldTap);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
    scene.add(camera);
    world = createWorld(scene, { from: -60, to: 580, mobile: touch, background: assets.background, camera });
    level = createLevel(scene);
    if (assets.background) level.abyss.forEach((m) => { m.visible = false; });   // the painted backdrop shows through the gaps instead
    player = createPlayer(scene, assets);
    fx = createFx(scene);
    enemies = createEnemies(scene, level.coinParts);
    onResize(); addEventListener('resize', onResize);
    ui.setHealth(P.hp, T.health); ui.setStats(stats());
    // compile shaders once, before the first frame is seen
    renderer.compile(scene, camera);
    mode = 'start'; ui.show('start');
    setTimeout(() => ui.el.querySelector('[data-a="play"]')?.focus({ preventScroll: true }), 50);
    clock.getDelta();
    renderer.setAnimationLoop(frame);
  }

  const stats = () => ({ score: G.score, coins: G.coins, scrolls: G.scrolls.size, totalScrolls: Math.min(SECTIONS.length, level ? level.scrolls.length : SECTIONS.length) });

  // ── camera ──
  const cam = { x: 0, y: 2, look: new THREE.Vector3(), dist: 13, lead: 3, introLead: 0 };
  function onResize() {
    if (!renderer) return;
    const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    cam.dist = THREE.MathUtils.clamp(7.2 / (halfTan * camera.aspect), 8.5, 17);       // about 14 m of the lane visible across
    cam.lead = Math.min(cam.dist * halfTan * camera.aspect * 0.42, 4.6);           // ninja sits left of centre
    cam.introLead = camera.aspect > 1.1 ? -1.7 : 0;                                   // start screen: ninja on the right, text on the left
  }
  function placeCamera(dt, intro) {
    const targetY = Math.max(P.y * 0.55, -1) + 1.5;
    cam.y += (targetY - cam.y) * Math.min(1, dt * 4);
    // start screen: close on the ninja; playing: side-on with room ahead
    const k = intro;
    const dist = THREE.MathUtils.lerp(cam.dist, camera.aspect > 1.1 ? 6.4 : 7.4, k), lead = THREE.MathUtils.lerp(cam.lead, cam.introLead, k), lift = THREE.MathUtils.lerp(1.1, 0.15, k);
    const fx_ = P.x + lead;
    const portraitLift = camera.aspect < 1.1 ? 1.25 * k : 0;                     // start screen on a phone: ninja in the upper half, text below
    camera.position.set(fx_, cam.y + lift + 0.9 * (1 - k) - portraitLift, dist);
    cam.look.set(fx_, cam.y + 0.55 * (1 - k) - 0.2 + k * 0.1 - portraitLift, 0);
    camera.lookAt(cam.look);
  }

  // ── rules ──
  const supportsAt = (x) => {
    const list = [];
    for (const g of level.ground) if (x >= g.x0 - 0.25 && x <= g.x1 + 0.25) list.push({ top: 0, ref: g, stable: true, x0: g.x0, x1: g.x1 });
    for (const p of level.platforms) if (x >= p.x0 - 0.3 && x <= p.x1 + 0.3) list.push({ top: p.top, ref: p, stable: !p.move, x0: p.x0, x1: p.x1 });
    for (const o of level.obstacles) if (o.landable && Math.abs(x - o.x) <= o.w / 2 + 0.15) list.push({ top: o.h, ref: o, stable: false, x0: o.x - o.w / 2, x1: o.x + o.w / 2 });
    return list;
  };
  const hurt = (fromFall) => {
    if (!fromFall && P.invuln > 0) return;
    P.hp -= 1; P.invuln = T.invulnerable; player.hit(); audio.hit(); ui.setHealth(Math.max(0, P.hp), T.health, true);
    fx.hit(new THREE.Vector3(P.x, P.y + 1, 0.3));
    if (P.hp <= 0) {
      P.hp = T.health; ui.setHealth(P.hp, T.health);
      const back = level.checkpoint.reached ? CHECKPOINT_X + 1 : level.startX;
      respawn(back); ui.hint(level.checkpoint.reached ? 'Back to the checkpoint. You keep your coins.' : 'Try again. You keep your coins.', 2600);
    } else if (fromFall) { respawn(P.lastSafe); }
    else { P.vy = Math.max(P.vy, 6.5); P.grounded = false; P.hurtSlow = 0.35; }
  };
  const respawn = (x) => { enemies?.rewind(x); P.x = x; P.y = 0.01; P.vy = 0; P.grounded = true; P.jumps = 0; P.invuln = T.invulnerable; P.support = null; };

  const collect = () => {
    const cx = P.x, cy = P.y + 0.95;
    for (const c of level.coins) {
      if (c.taken || Math.abs(c.x - cx) > 1) continue;
      if (Math.hypot(c.x - cx, c.y - cy) < 0.9) { c.taken = true; G.coins++; G.score += T.coinValue; audio.coin(); fx.coin(new THREE.Vector3(c.x, c.y, 0)); ui.setStats(stats(), 'coins'); }
    }
    for (const s of level.scrolls) {
      if (s.taken || Math.abs(s.x - cx) > 1.5) continue;
      if (Math.hypot(s.x - cx, s.mesh.position.y - cy) < 1.15) {
        s.taken = true; s.mesh.visible = false; G.scrolls.add(s.section.id); G.score += T.scrollValue;
        audio.scroll(); fx.scroll(s.mesh.position.clone()); ui.setStats(stats(), 'scrolls'); ui.unlock(s.section);
      }
    }
  };

  const obstaclesHit = () => {
    const x0 = P.x - 0.26, x1 = P.x + 0.26, y0 = P.y, y1 = P.y + 1.6;
    for (const o of level.obstacles) {
      if (!o.alive || Math.abs(o.x - P.x) > 3) continue;
      // the katana: anything breakable in front of the ninja while the blade is in its arc
      if (o.breakable && player.cutting && o.x - P.x > -0.4 && o.x - P.x < 2.4 && y0 < o.h) {
        level.breakDummy(o, 1); G.dummies++; G.score += T.dummyValue; audio.wood(); fx.wood(new THREE.Vector3(o.x, 1.1, 0.3)); ui.setStats(stats(), 'score'); continue;
      }
      const ox0 = o.x - o.w / 2, ox1 = o.x + o.w / 2, oy1 = o.kind === 'spikes' ? o.h * 0.75 : o.h;
      if (x1 < ox0 || x0 > ox1 || y1 < 0 || y0 > oy1 - 0.02) continue;
      if (o.landable && P.y >= o.h - 0.12) continue;                 // standing on the stone
      if (o.breakable) { level.breakDummy(o, 1); audio.wood(); }
      hurt(false);
    }
  };

  const hints = () => {
    const once = (id, x, html, ms) => { if (!G.hinted.has(id) && P.x > x) { G.hinted.add(id); ui.hint(html, ms); } };
    const jump = touch ? 'Tap <b>Jump</b>' : 'Press <kbd>Space</kbd>';
    once('jump', 8, `${jump} to leap over the fence`, 2800);
    once('gap', 33, 'Mind the gap. Jump!', 1800);
    once('strike', 61, touch ? 'Tap <b>Strike</b> to break the training dummy' : 'Press <kbd>J</kbd> to strike the training dummy', 2800);
    once('scroll', 55, 'A glowing scroll ahead. Jump to grab it', 2400);
    once('crow', 45, touch ? 'Bats and shadow ninjas dive from the sky. Tap <b>Strike</b> to cut one for 5 coins' : 'Bats and shadow ninjas dive from the sky. Press <kbd>J</kbd> to cut one for 5 coins', 3200);
    once('double', 163, touch ? 'Tap <b>Jump</b> again in the air for a double jump' : 'Press <kbd>Space</kbd> again in the air for a double jump', 3000);
  };

  // ── step ──
  const clock = new THREE.Clock();
  function step(dt) {
    G.time += dt;
    P.cool = Math.max(0, P.cool - dt); P.invuln = Math.max(0, P.invuln - dt); P.buffer = Math.max(0, P.buffer - dt); P.coyote = Math.max(0, P.coyote - dt); P.hurtSlow = Math.max(0, P.hurtSlow - dt);
    // forward speed eases in at the start and after a hit
    const targetSpeed = mode === 'won' ? 0 : T.speed * (P.hurtSlow > 0 ? 0.6 : 1);
    P.speed += (targetSpeed - P.speed) * Math.min(1, dt * (mode === 'won' ? 2.2 : 3));
    // jump: buffered press, coyote time, one extra jump in the air
    if (P.buffer > 0 && mode === 'playing') {
      if (P.grounded || P.coyote > 0) { P.vy = T.jumpVelocity; P.grounded = false; P.coyote = 0; P.jumps = 1; P.buffer = 0; audio.jump(); player.setState('air'); }
      else if (P.jumps < 2) { P.vy = T.doubleJumpVelocity; P.jumps = 2; P.buffer = 0; audio.jump(); player.doubleJump(); fx.coin(new THREE.Vector3(P.x, P.y + 0.2, 0)); }
    }
    const prevY = P.y;
    P.vy -= T.gravity * dt;
    P.y += P.vy * dt;
    P.x += P.speed * dt;
    // landing / standing: the highest support under the feet that the ninja was above a moment ago
    let best = null;
    for (const s of supportsAt(P.x)) if (s.top <= prevY + 0.06 + (P.grounded ? 0.3 : 0) && (!best || s.top > best.top)) best = s;
    const wasGrounded = P.grounded;
    if (best && P.vy <= 0 && P.y <= best.top + (wasGrounded ? 0.3 : 0)) {
      P.y = best.top; P.vy = 0; P.grounded = true; P.jumps = 0; P.support = best;
      if (!wasGrounded) { player.setState('land'); P.landT = 0; }
      if (best.stable && P.x - best.x0 > 1 && best.x1 - P.x > 2.5) P.lastSafe = P.x - 1.5;
    } else {
      if (wasGrounded && P.vy <= 0) { P.coyote = T.coyoteTime; P.vy = Math.min(P.vy, 0); }
      P.grounded = false;
    }
    if (P.y < T.fallLimit) { audio.hit(); hurt(true); }

    // animation state
    if (mode === 'won') { if (P.speed < 1.2 && player.state !== 'victory') player.setState('victory'); }
    else if (P.grounded) {
      if (player.state === 'land') { P.landT += dt; if (P.landT > 0.16) player.setState(P.speed > 0.5 ? 'run' : 'idle'); }
      else player.setState(P.speed > 0.5 ? 'run' : 'idle');
    } else player.setState(P.vy > 0 || P.jumps > 0 ? 'air' : 'fall');

    player.root.position.set(P.x, P.y, 0);
    player.update(dt, P);
    // the blade's arc: slash effect when it starts cutting
    if (player.cutting && G.slashPending) { G.slashPending = false; fx.slash(new THREE.Vector3(P.x + 0.9, P.y + 1.15, 0.4), 1); }
    // invulnerability blink
    player.flash(P.invuln <= 0 || Math.floor(P.invuln * 12) % 2 === 0);

    if (mode === 'playing') {
      collect(); obstaclesHit(); hints();
      enemies.update(dt, P, P.x, player.cutting,
        (at) => { G.coins += enemies.coinsEach; G.kills = (G.kills || 0) + 1; G.score += T.dummyValue + enemies.coinsEach * T.coinValue; audio.wood(); audio.coin(); fx.hit(at); fx.coin(at); ui.setStats(stats(), 'coins'); },
        () => hurt(false));
      if (!level.checkpoint.reached && P.x >= CHECKPOINT_X) { level.checkpoint.reached = true; level.checkpoint.lamp.material.emissiveIntensity = 1.6; audio.checkpoint(); ui.hint('Checkpoint reached', 2000); }
      ui.setProgress(THREE.MathUtils.clamp((P.x - level.startX) / (level.goalX - level.startX), 0, 1));
      if (P.x >= level.goalX) win();
    }
    if (mode === 'won') { enemies.update(dt, P, -1e9, false, () => {}, () => {}); G.wonT += dt; if (G.wonT > 1.6 && !G.shown) { G.shown = true; ui.victory({ score: G.score, coins: G.coins, totalCoins: level.totalCoins + enemies.total, found: G.scrolls, sections: SECTIONS }); } }
  }

  function frame() {
    let dt = Math.min(clock.getDelta(), 1 / 20);
    if (mode === 'closed') return;
    if (mode === 'paused' || mode === 'error') { if (G.redraw) { G.redraw = false; renderer.render(scene, camera); } return; }
    if (reduce) dt = Math.min(dt, 1 / 30);
    if (mode === 'start') {
      player.root.position.set(P.x, 0, 0); player.setState('idle'); player.update(dt, P);
      G.startCam = Math.min(1, G.startCam);
    } else {
      // two sub-steps when frames are long, so fast moves never tunnel through a platform edge
      const n = dt > 1 / 50 ? 2 : 1;
      for (let i = 0; i < n; i++) step(dt / n);
      G.startCam = Math.max(0, G.startCam - dt * 1.6);
    }
    const intro = G.startCam * G.startCam * (3 - 2 * G.startCam);
    placeCamera(dt, intro);
    level.update(dt, P.x);
    world.update(dt, camera.position.x, P.x, camera);
    fx.update(dt);
    renderer.render(scene, camera);
  }

  // ── flow ──
  function play() {
    if (mode !== 'start') return;
    mode = 'playing'; ui.playing(true); P.speed = 0;
    audio.set(audio.on);                          // first user gesture: lets the audio context start
    renderer.domElement.focus?.();
  }
  function pause() { if (mode !== 'playing') return; mode = 'paused'; G.redraw = true; ui.show('pause'); ui.playing(false); ui.el.querySelector('[data-l="pause"] [data-a="resume"]').focus({ preventScroll: true }); }
  function resume() { if (mode !== 'paused') return; mode = 'playing'; ui.playing(true); clock.getDelta(); }
  function win() { mode = 'won'; G.wonT = 0; audio.win(); ui.playing(false); }
  function restart() {
    if (!level) return;
    level.reset(); enemies.reset();
    Object.assign(P, { x: 0, y: 0, vy: 0, grounded: true, support: null, jumps: 0, coyote: 0, buffer: 0, cool: 0, invuln: 0, hp: T.health, lastSafe: 0, speed: 0, hurtSlow: 0 });
    Object.assign(G, { score: 0, coins: 0, dummies: 0, time: 0, wonT: 0, shown: false, startCam: 0 });
    G.scrolls = new Set(); G.hinted = new Set();
    ui.setHealth(P.hp, T.health); ui.setStats(stats()); ui.setProgress(0);
    player.setState('run'); mode = 'playing'; ui.playing(true); clock.getDelta();
  }
  let closing = null;
  function close() {
    if (closing) return closing;
    mode = 'closed';
    window.removeEventListener('keydown', onKey, true);
    document.removeEventListener('visibilitychange', onVis);
    removeEventListener('resize', onResize);
    closing = ui.close().then(() => {
      if (renderer) {
        renderer.setAnimationLoop(null);
        player?.dispose(); enemies?.dispose(); level?.dispose(); world?.dispose(); fx?.dispose();
        renderer.dispose(); renderer.forceContextLoss?.();
      }
      audio.dispose();
      document.documentElement.classList.remove('is-game');
      document.documentElement.style.overflow = prevOverflow;
      onClose?.();
    });
    return closing;
  }
  if (/gamedebug/.test(location.hash)) window.__shinobi = { P, G, get level() { return level; }, get enemies() { return enemies; }, input, get mode() { return mode; }, get player() { return player; } };
  return { close };
}
