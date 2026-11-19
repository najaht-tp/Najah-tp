// Loader orchestrator.
//
//  Website opens -> ninja jumps in -> katana drawn and swung -> progress 0-100% -> katana slash -> hero revealed
//
// One master GSAP timeline is the single source of truth for the choreography. The percentage shown is
//   min(real readiness, scripted choreography progress)
// so it can never run ahead of what has actually loaded, and the final slash waits for real readiness.
//
// Performance rules: per-frame work touches only transforms and opacity (no CSS-variable changes that would repaint
// gradients), the sword and its trail live in the same WebGL scene as the ninja (no extra full-screen 2D canvas), and
// all one-off GPU work happens before the timeline starts.
import gsap from 'gsap';
import { createNinjaStage } from './ninja-stage.js';
import { createFx, createShake } from './fx.js';

const CUT = { left: 0.62, right: 0.38 };       // where the diagonal cut meets the left / right screen edge (fraction of height)
const JUMP_RATE = 1.24, JUMP_CLIP_END = 2.85;  // jump clip plays 1.24x, up to its standing pose
const COMBO_FROM = 0.2, COMBO_TO = 2.4, COMBO_RATE = 1.25;
const SAFETY_MS = 15000;                       // simple loader: never hold the visitor longer than this
const HOLD_MAX_MS = 1200;                      // cinematic loader: if something is still loading when the show ends, wait at most this long, then carry on
const sfx = () => window.najahSound;            // katana sounds live in index.html (they share the page's audio engine and the sound switch)

export async function createLoader({ progress, reduce, onReveal }) {
  const el = document.getElementById('loader');
  if (!el) { onReveal?.(); return null; }
  const q = (s) => el.querySelector(s);
  const halves = [q('.loader__half--a'), q('.loader__half--b')];
  const glow = q('.loader__glow'), stageEl = q('.loader__stage'), canvas = q('.loader__canvas');
  const fxHost = q('.loader__fx'), ring = q('.loader__ring'), slash = q('.loader__slash');
  const ui = q('.loader__ui'), pctBox = q('.loader__pct'), num = q('.loader__num'), bar = q('.loader__bar');
  const fill = q('.loader__fill'), spark = q('.loader__spark');
  const debug = location.hash.includes('loaderdebug');

  // The loader's glow is a copy of the hero's own atmosphere (same gradient, same rectangle), so the hand-over is a blend
  // between identical pictures rather than two different gradients swapping places.
  const matchAtmosphere = () => {
    const img = document.querySelector('.atmosphere img'); if (!img) return;
    if (!glow.firstChild) {                                            // the same picture, so there is nothing to mismatch
      const c = img.cloneNode(); c.removeAttribute('style'); c.className = '';
      Object.assign(c.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', transform: 'none', maxWidth: 'none' });
      glow.appendChild(c);
    }
    const r = img.getBoundingClientRect(); if (!r.width) return;
    Object.assign(glow.style, { inset: 'auto', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', background: 'none' });
  };
  matchAtmosphere();
  addEventListener('resize', matchAtmosphere);
  const atmo = document.querySelector('.atmosphere');
  const pageParts = [document.querySelector('.nav'), document.querySelector('main')];
  // everything on the page except the hero's background glow: it fades in after the glow hand-over, never beneath it
  const mainEl = document.querySelector('main');
  const content = [document.querySelector('.nav'), ...(mainEl ? [...mainEl.querySelectorAll('.hero > :not(.stage), .stage > :not(.atmosphere)'), ...[...mainEl.children].filter((c) => !c.classList.contains('hero'))] : [])].filter(Boolean);
  pageParts.forEach((p) => p && (p.inert = true));                     // keep keyboard focus out of the hidden page
  let revealed = false;
  const reveal = () => {
    if (revealed) return; revealed = true;
    pageParts.forEach((p) => p && (p.inert = false));
    onReveal?.();
  };

  // ── percentage UI: only transforms and opacity change per frame ──
  let glowLocked = false, stageDone = false;
  let barW = bar.clientWidth, lastTen = 0, lastShown = -1;
  const D = { v: 0 };                                                  // displayed percent
  const setPct = (v) => {
    const f = Math.min(1, Math.max(0, v / 100));
    fill.style.transform = `scaleX(${f.toFixed(4)})`;
    spark.style.transform = `translate3d(${(barW * f).toFixed(1)}px, 0, 0)`;
    if (!glowLocked) glow.style.opacity = (0.3 + 0.7 * f).toFixed(3);   // once the hand-over starts the timeline owns the glow
    const r = Math.min(100, Math.round(v));
    if (r !== lastShown) {
      lastShown = r; num.textContent = String(r);
      bar.setAttribute('aria-valuenow', String(r));
      const ten = Math.floor(r / 10);
      if (ten > lastTen) { lastTen = ten; gsap.fromTo(pctBox, { scale: 1.07 }, { scale: 1, duration: 0.38, ease: 'power2.out' }); }
    }
  };
  setPct(0);
  (document.fonts?.ready ?? Promise.resolve()).then(() => el.classList.add('is-ready'));
  setTimeout(() => el.classList.add('is-ready'), 500);

  // ── cut geometry (re-computed on resize) ──
  const cut = { len: 0, ang: 0, cy: 0 };
  const layout = () => {
    const W = innerWidth, H = innerHeight, yl = CUT.left * H, yr = CUT.right * H;
    halves[0].style.clipPath = `polygon(0 0, ${W}px 0, ${W}px ${yr}px, 0 ${yl}px)`;
    halves[1].style.clipPath = `polygon(0 ${yl}px, ${W}px ${yr}px, ${W}px ${H}px, 0 ${H}px)`;
    cut.len = Math.hypot(W, yl - yr) + 120; cut.ang = (Math.atan2(yr - yl, W) * 180) / Math.PI; cut.cy = (yl + yr) / 2 - H / 2;
    barW = bar.clientWidth;
    stage?.setReserve(ui.offsetHeight + (parseFloat(getComputedStyle(ui).bottom) || 0) + 44);   // keep the ninja clear of the percentage
  };

  let onFrame = null;                                               // the cinematic per-frame update (set below)

  // ── 3D stage + effects (skipped for reduced motion or when WebGL is unavailable) ──
  let stage = null, fx = null;
  const shake = createShake();
  if (!reduce) {
    try {
      let texN = 0;
      stage = await createNinjaStage({
        canvas,
        onProgress: (k) => { if (k === 'model') progress.done('loader-model'); else progress.set('loader-tex', ++texN / 3 * 0.97); },
      });
      progress.done('loader-tex');
      fx = createFx({ host: fxHost, ring });
    } catch (err) {
      console.warn('Loader ninja unavailable; using the simple loader.', err);
      stage = null; progress.done('loader-model'); progress.done('loader-tex');
    }
  }
  layout();
  addEventListener('resize', layout);

  // ── finish: remove everything ──
  let done = false;
  const finish = () => {
    if (done) return; done = true;
    if (onFrame) gsap.ticker.remove(onFrame);
    removeEventListener('resize', layout); removeEventListener('resize', matchAtmosphere);
    sfx()?.sword?.(0);
    stage?.dispose();
    try { sessionStorage.setItem('najah-loader-seen', '1'); } catch (e) {}
    gsap.set(content, { clearProps: 'opacity' });
    gsap.set(atmo, { clearProps: 'opacity' });
    el.remove();
  };

  // ── simple path: reduced motion / no WebGL — just the percentage, then a fade ──
  if (!stage) {
    gsap.set(stageEl, { display: 'none' });
    const onFrameSimple = (t, ms) => {
      const dt = Math.min(ms / 1000, 0.05);
      const target = Math.max(D.v, progress.value * 100);
      D.v += (target - D.v) * (1 - Math.exp(-dt * 10)); if (target - D.v < 0.2) D.v = target;
      setPct(D.v);
      if (progress.complete && D.v >= 99.8 && !revealed) {
        gsap.ticker.remove(onFrameSimple);
        gsap.timeline({ onComplete: finish })
          .to(ui, { opacity: 0, duration: 0.25 }, '+=0.2')
          .add(reveal, '<')
          .to(el, { opacity: 0, duration: reduce ? 0.35 : 0.5, ease: 'power1.out' }, '<0.05');
      }
    };
    gsap.ticker.add(onFrameSimple);
    setTimeout(() => { if (!revealed) { progress.tasks.forEach((_, k) => progress.done(k)); } }, SAFETY_MS);
    return { skip: () => { reveal(); finish(); } };
  }

  // ── cinematic path ──
  const heights = stage.halfWidthInHeights;
  const START_X = -(heights + 0.55);
  const S = { jumpT: 0, jumpW: 1, comboT: COMBO_FROM, comboW: 0, x: START_X, y: 0.06, pct: 0, breath: 0, trail: 1, twist: 0, lean: 0, crouch: 0, lunge: 0, zoom: 0 };
  const K = stage.katana.K;

  const perf = { frames: 0, slow: 0, max: 0, sum: 0 };               // frame-time bookkeeping (read in debug)
  if (location.hash.includes('loaderperf')) window.__loaderPerf = perf;
  onFrame = (time, ms) => {
    const dt = Math.min(ms / 1000, 0.05);
    perf.frames++; perf.sum += ms; if (ms > perf.max) perf.max = ms; if (ms > 25) perf.slow++;
    // shown percent = what is really loaded, paced by the choreography; it only moves forward
    const target = Math.max(D.v, Math.min(progress.value, S.pct) * 100);
    D.v += (target - D.v) * (1 - Math.exp(-dt * 9));
    if (target >= 99.9 && D.v > 99.5) D.v = 100;
    setPct(Math.max(D.v, 0));
    if (stageDone) { sfx()?.sword?.(0); return; }                        // the loader scene has faded out: stop spending GPU on it
    shake.tick(time);
    stage.pose({ jumpT: S.jumpT, jumpW: S.jumpW, comboT: S.comboT, comboW: S.comboW, x: S.x, y: S.y, crouch: S.crouch - Math.sin(time * 2.4) * 0.004 * S.breath, lunge: S.lunge, zoom: S.zoom, twist: S.twist + Math.sin(time * 1.3) * 0.012 * S.breath, lean: S.lean + Math.sin(time * 1.9) * 0.008 * S.breath, shakeX: shake.s.x, shakeY: shake.s.y, trail: S.trail }, dt);
    stage.render();
    sfx()?.sword?.(stage.trail.level);                                  // the swish follows the blade's speed, in step with the red trail
  };
  gsap.ticker.add(onFrame);

  const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' }, onComplete: finish });
  gsap.set(atmo, { opacity: 0 });                                       // the hero's own glow waits; the loader's identical glow stands in for it
  gsap.set(content, { opacity: 0 });                                   // the page's content waits behind the loader
  const T0 = 0.2;
  const jumpDur = JUMP_CLIP_END / JUMP_RATE;
  const tLeap = T0 + 0.45 / JUMP_RATE, tLand = T0 + 2.0 / JUMP_RATE;
  const tCombo = T0 + jumpDur - 0.3, comboDur = (COMBO_TO - COMBO_FROM) / COMBO_RATE, tEnd = tCombo + comboDur;
  const tDraw = tCombo + 0.1;                                          // the sword appears once the arms are already moving
  const W = () => innerWidth, H = () => innerHeight;

  // scene fades in; the ninja is off-screen while it crouches
  tl.fromTo(stageEl, { opacity: 0 }, { opacity: 1, duration: 0.45, ease: 'power1.out' }, 0);
  tl.fromTo(S, { jumpT: 0 }, { jumpT: JUMP_CLIP_END, duration: jumpDur }, T0);

  // the leap: in from the left, a low arc up and down, landing at centre
  tl.fromTo(S, { x: START_X }, { x: 0, duration: tLand - tLeap, ease: 'power1.out' }, tLeap);
  tl.fromTo(S, { y: 0.06 }, { y: 0.24, duration: 0.5, ease: 'power2.out' }, tLeap);
  tl.to(S, { y: 0, duration: tLand - tLeap - 0.5, ease: 'power2.in' }, tLeap + 0.5);
  tl.call(() => fx.streaks({ angleDeg: 24, count: 12, cx: W() * 0.28, cy: H() * 0.28, spread: H() * 0.34, length: W() * 0.28, travel: W() * 0.7, duration: 0.55 }), null, tLeap);
  tl.call(() => fx.streaks({ angleDeg: 30, count: 8, cx: W() * 0.34, cy: H() * 0.3, spread: H() * 0.3, length: W() * 0.22, travel: W() * 0.55, duration: 0.5, opacity: 0.55 }), null, tLeap + 0.22);

  // landing
  tl.call(() => {
    const f = stage.feetScreenAt(S.x, S.y);
    fx.shockwave(f.x, f.y, stage.view.standPx * 0.8);
    shake.hit(0.014, 0.5);
    gsap.to(S, { breath: 1, duration: 0.7, ease: 'sine.inOut' });          // the idle sway eases in rather than switching on
  }, null, tLand);

  // blend into the combo
  tl.fromTo(S, { jumpW: 1, comboW: 0 }, { jumpW: 0, comboW: 1, duration: 0.4, ease: 'power2.inOut' }, tCombo);
  tl.fromTo(S, { comboT: COMBO_FROM }, { comboT: COMBO_TO, duration: comboDur }, tCombo);

  // the katana is drawn out of the guard with a roll and a glint; from then on it is simply held by the hand
  tl.call(() => sfx()?.shing?.(), null, tDraw);                            // metallic draw
  tl.set(K, { visible: 1, reveal: 0.001, roll: -1.3, glint: 1, scale: 0.92 }, tDraw);
  tl.to(K, { reveal: 1, duration: 0.22, ease: 'power3.out' }, tDraw);
  tl.to(K, { roll: 0, scale: 1, duration: 0.4, ease: 'power3.out' }, tDraw);
  tl.to(K, { glint: 0, duration: 0.6, ease: 'power2.out' }, tDraw + 0.08);
  // the fingers close around the handle just as the blade appears, and stay closed for the rest of the scene
  tl.set(K, { grip: 0 }, 0);
  tl.to(K, { grip: 1, duration: 0.18, ease: 'power2.out' }, tDraw - 0.08);

  // percentage pacing
  tl.fromTo(S, { pct: 0 }, { pct: 0.5, duration: jumpDur, ease: 'power1.inOut' }, T0);
  tl.to(S, { pct: 1, duration: tEnd - tCombo, ease: 'power1.inOut' }, tCombo);

  // hold here until everything is really loaded
  tl.addLabel('hold', tEnd);
  let holdTimer = 0;
  tl.call(() => {
    if (progress.complete) return;
    tl.pause();
    const go = () => { clearTimeout(holdTimer); tl.resume(); };
    progress.whenComplete().then(go);
    holdTimer = setTimeout(() => { progress.tasks.forEach((_, k) => progress.done(k)); go(); }, HOLD_MAX_MS);
  }, null, 'hold');

  // the slash: an extra swing about the grip, layered on top of the hand's own pose, then the cut and the reveal
  const F = tEnd + 0.08;
  const WIND = -0.95, SWEEP = 2.55;                                    // radians about the camera axis: wind up to the upper right, then slash over the head to the lower left
  // the body leads the sword: weight sinks and the torso coils on the wind-up, then unwinds and drives forward through the cut
  tl.to(K, { swing: WIND, duration: 0.34, ease: 'sine.inOut' }, F);                                    // wind up
  tl.to(S, { crouch: -0.02, twist: -0.12, lean: 0.02, lunge: -0.008, duration: 0.34, ease: 'sine.inOut' }, F);
  tl.to(K, { swing: SWEEP, scale: 1.18, duration: 0.3, ease: 'power2.in' }, F + 0.34);                 // swing
  tl.to(S, { crouch: 0.006, twist: 0.16, lean: -0.04, lunge: 0.018, duration: 0.3, ease: 'power2.in' }, F + 0.3);
  tl.to(S, { crouch: 0, twist: 0.08, lean: -0.02, lunge: 0.012, duration: 0.3, ease: 'sine.out' }, F + 0.6);   // follow-through settles
  tl.to(S, { zoom: 0.1, duration: 0.9, ease: 'sine.inOut' }, F);                                      // the camera pushes in as the cut lands
  tl.call(() => {                                                                                       // hit
    gsap.set(slash, { x: 0, y: cut.cy, rotation: cut.ang, width: cut.len, xPercent: -50, yPercent: -50, scaleX: 0, opacity: 1 });
    gsap.to(slash, { scaleX: 1, duration: 0.14, ease: 'power4.out' });
    shake.hit(0.03, 0.6);
    sfx()?.slash?.();
    fx.streaks({ angleDeg: cut.ang, count: 16, cx: W() * 0.15, cy: H() / 2 + cut.cy, spread: 26, length: W() * 0.55, travel: W() * 1.1, duration: 0.5 });
  }, null, F + 0.64);
  // the hand-over: the loader's glow and the hero's own glow are the same picture, so they simply blend into each other
  // (weighted so their combined strength stays constant) while the loader parts; only then do the portrait, text and nav
  // fade in on top of the finished background
  tl.call(() => { glowLocked = true; glow.style.opacity = 1; }, null, F + 0.6);
  tl.to([stageEl, ui], { opacity: 0, duration: 0.45, ease: 'power2.inOut' }, F + 0.72);
  tl.call(() => { stageDone = true; }, null, F + 1.25);                 // nothing else renders while the glows blend and the hero starts
  const HO = { p: 0 }, A = 0.55;                                          // A = the glow's centre strength
  tl.to(HO, { p: 1, duration: 0.7, ease: 'sine.inOut', onUpdate() {
    const p = HO.p; atmo.style.opacity = p.toFixed(4);
    glow.style.opacity = Math.max(0, (1 - (1 - A) / (1 - A * p)) / A).toFixed(4);
  } }, F + 0.7);
  tl.call(reveal, null, F + 1.3);                                        // the hero's own 3D scene starts only after the loader's has stopped
  tl.to(content, { opacity: 1, duration: 1.0, ease: 'sine.out' }, F + 1.4);
  // the backdrop halves are flat page-colour, so they come off in one go before the blend: if they slid apart, the gap
  // between them would expose the hero's glow while the loader's glow is still on top, and the two would add into a wedge
  tl.set(halves, { autoAlpha: 0 }, F + 0.7);
  tl.to(slash, { opacity: 0, duration: 0.5, ease: 'power1.out' }, F + 0.88);
  tl.add(() => {}, F + 2.5);

  // returning visitors in the same session get a quicker version
  let seen = false; try { seen = sessionStorage.getItem('najah-loader-seen') === '1'; } catch (e) {}
  tl.timeScale(seen ? 1.5 : 0.72);                                      // first visit plays slower and gentler (about 6.5 s)

  if (debug) {
    window.__loader = {
      tl, S, K, progress, shake, stage, fx, cut, perf, timings: { T0, tLeap, tLand, tDraw, tCombo, tEnd, F },
      seek(t) { tl.pause(); tl.time(t); onFrame(t, 16); },
      run(t0, t1, fps = 60) { tl.pause(); for (let t = t0; t <= t1 + 1e-6; t += 1 / fps) { tl.time(t); onFrame(t, 1000 / fps); } },
    };
  } else {
    // let the browser settle (hero set-up finishes its idle slices) and draw one clean frame before motion starts
    onFrame(0, 16);
    tl.play(0);
  }
  return { skip: () => { reveal(); finish(); }, timeline: tl };
}
