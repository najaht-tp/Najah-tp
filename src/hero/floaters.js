// Ninja tools that drift through the hero, one at a time, now and then: a shuriken, a kunai, a smoke bomb, a scroll, a grappling hook and a pouch.
// Each takes its own path (left to right, right to left, top to bottom, bottom to top, or a slow circle round the ninja), bobbing and turning gently.
// Touch one with the pointer (or tap it) and it is kicked away in the direction of the hit: it spins off, a small red burst marks the spot, and it flies out
// of the hero. Pictures only on one transparent canvas that lives inside the hero (so it scrolls with it and clips at its edges); never blocks a click.
export function initFloaters({ gate } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const hero = document.getElementById('hero'), root = document.documentElement;
  if (!hero) return;
  const cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:7;pointer-events:none';
  hero.appendChild(cv);
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  const size = () => { const r = hero.getBoundingClientRect(); dpr = Math.min(devicePixelRatio || 1, 2); W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  size(); addEventListener('resize', size);
  if (window.ResizeObserver) new ResizeObserver(size).observe(hero);

  const sheet = new Image(); let ok = false; const CELL = 160;
  sheet.onload = () => { ok = true; }; sheet.src = window.__TOOLS__ || 'assets/hero-v3/tools.webp';

  const items = [], bursts = [];
  let order = [], raf = 0, lastT = 0, nextSpawn = 0, started = false;
  const phone = () => W < 700;
  const SZ = () => (phone() ? 50 : 64);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ease = (t) => t * t * (3 - 2 * t);
  const visible = () => !root.classList.contains('is-work') && !root.classList.contains('is-case') && !root.classList.contains('is-loading') && !document.querySelector('.sr') && hero.getBoundingClientRect().bottom > 0 && hero.getBoundingClientRect().top < innerHeight;

  // ---- paths: each returns the item's centre at time t (ms since it appeared) ----
  const PATHS = {
    ltr: () => { const y0 = rnd(0.22, 0.72) * H, v = W / rnd(11000, 14000), a = rnd(16, 30), f = rnd(0.0007, 0.0011); return (t) => [-40 + v * t, y0 + Math.sin(t * f) * a + t * 0.004]; },
    rtl: () => { const y0 = rnd(0.22, 0.72) * H, v = W / rnd(11000, 14000), a = rnd(16, 30), f = rnd(0.0007, 0.0011); return (t) => [W + 40 - v * t, y0 + Math.sin(t * f) * a - t * 0.004]; },
    ttb: () => { const x0 = rnd(0.12, 0.88) * W, v = H / rnd(9000, 11500), a = rnd(26, 46), f = rnd(0.0006, 0.0009); return (t) => [x0 + Math.sin(t * f) * a, -40 + v * t]; },
    btt: () => { const x0 = rnd(0.12, 0.88) * W, v = H / rnd(9000, 11500), a = rnd(26, 46), f = rnd(0.0006, 0.0009); return (t) => [x0 + Math.sin(t * f) * a, H + 40 - v * t]; },
    circle: () => {                                        // a slow orbit round the ninja that spirals in, loops, then spirals out
      const cx = W * 0.5, cy = H * 0.5, R = Math.min(W, H) * (phone() ? 0.2 : 0.26), dir = Math.random() < 0.5 ? 1 : -1, a0 = rnd(0, 6.283), om = rnd(0.00085, 0.0011);
      return (t) => { const inn = ease(Math.min(1, t / 1800)), out = Math.max(0, (t - 7600) / 2600), r = R * (2.4 - 1.4 * inn) + out * out * Math.max(W, H) * 0.7; const a = a0 + dir * om * t; return [cx + Math.cos(a) * r * 1.25, cy + Math.sin(a) * r * 0.85]; };
    },
  };
  const KINDS = ['ltr', 'ttb', 'circle', 'rtl', 'btt'];
  let kindI = 0;

  function spawn(now) {
    if (!ok || items.length >= 2) return;
    if (!order.length) order = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);
    const kind = order.pop(), type = KINDS[kindI++ % KINDS.length];
    items.push({ kind, age: 0, path: PATHS[type](), born: now, x: -999, y: -999, vx: 0, vy: 0, hit: false, rot: rnd(-0.5, 0.5), spin: rnd(-0.0006, 0.0006), hover: 0, s: SZ() });
  }

  // ---- the pointer: touching an item kicks it ----
  let px = -1, py = -1, pvx = 0, pvy = 0, pt = 0;
  const local = (e) => { const r = hero.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const touch = (x, y, vx, vy, force) => {
    for (const it of items) {
      if (it.hit || it.age < 350) continue;
      const dx = x - it.x, dy = y - it.y, rr = it.s * 0.56;
      if (dx * dx + dy * dy > rr * rr) continue;
      let sp = Math.hypot(vx, vy), dirx, diry;
      if (sp > 0.05) { dirx = vx / sp; diry = vy / sp; } else { const d = Math.hypot(dx, dy) || 1; dirx = -dx / d; diry = -dy / d; }   // no motion: knock it away from the pointer
      const power = Math.max(1.1, Math.min(2.4, 1.0 + sp * 0.9 + (force ? 0.4 : 0)));
      it.hit = true; it.vx = dirx * power; it.vy = diry * power; it.spin = (Math.random() < 0.5 ? -1 : 1) * rnd(0.006, 0.012); it.hitAt = performance.now();
      bursts.push({ x: it.x, y: it.y, born: performance.now(), dx: dirx, dy: diry });
    }
  };
  addEventListener('pointermove', (e) => {
    if (!items.length) return;
    const [x, y] = local(e), now = performance.now(), dt = Math.max(1, now - pt);
    if (px >= 0 && dt < 200) { pvx = (x - px) / dt; pvy = (y - py) / dt; } else { pvx = pvy = 0; }
    // test along the segment so a quick swipe can't skip over an item
    if (px >= 0 && dt < 200) { const n = Math.max(1, Math.ceil(Math.hypot(x - px, y - py) / 16)); for (let i = 1; i <= n; i++) touch(px + (x - px) * i / n, py + (y - py) * i / n, pvx, pvy, false); } else touch(x, y, pvx, pvy, false);
    px = x; py = y; pt = now;
  }, { passive: true });
  addEventListener('pointerdown', (e) => { if (!items.length) return; const [x, y] = local(e); touch(x, y, 0, 0, true); }, { passive: true });
  document.addEventListener('mouseleave', () => { px = -1; });

  function frame(now) {
    raf = 0;
    const dt = Math.min(48, now - lastT); lastT = now;
    const show = visible();
    if (show && ok && now >= nextSpawn && items.length < 2) { spawn(now); nextSpawn = now + rnd(5200, 8200); }
    ctx.clearRect(0, 0, W, H);
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]; it.age = now - it.born;
      if (it.hit) { it.x += it.vx * dt; it.y += it.vy * dt; it.vx *= Math.pow(0.9992, dt); it.vy *= Math.pow(0.9992, dt); it.rot += it.spin * dt; }
      else { const [x, y] = it.path(it.age); it.x = x; it.y = y; it.rot += it.spin * dt; }
      const m = it.s * 1.5;
      if (it.x < -m || it.x > W + m || it.y < -m || it.y > H + m) { if (it.hit || it.age > 1500) { items.splice(i, 1); continue; } }
      // proximity cue: it perks up a little when the pointer is near
      const near = px >= 0 && !it.hit ? Math.max(0, 1 - Math.hypot(px - it.x, py - it.y) / (it.s * 2.2)) : 0;
      it.hover += (near - it.hover) * Math.min(1, dt / 120);
      const fadeIn = ease(Math.min(1, it.age / 700)), sc = (0.7 + 0.3 * fadeIn) * (1 + 0.1 * it.hover) * (it.hit ? 1 + Math.min(0.15, (now - it.hitAt) / 1500) : 1);
      const bob = it.hit ? 0 : Math.sin(it.age * 0.0021 + it.kind) * 2.5;
      ctx.save(); ctx.globalAlpha = fadeIn; ctx.translate(it.x, it.y + bob); ctx.rotate(it.rot + (it.hit ? 0 : Math.sin(it.age * 0.0013 + it.kind) * 0.12));
      ctx.shadowColor = `rgba(255, 50, 80, ${0.28 + 0.4 * it.hover})`; ctx.shadowBlur = 12 + 10 * it.hover;
      const s = it.s * sc; ctx.drawImage(sheet, it.kind * CELL, 0, CELL, CELL, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
    // the hit marks: a thin red ring and a few sparks along the direction of the kick
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i], k = (now - b.born) / 520; if (k >= 1) { bursts.splice(i, 1); continue; }
      const e = 1 - Math.pow(1 - k, 3);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,60,90,${(0.8 * (1 - k)).toFixed(3)})`; ctx.lineWidth = 2 * (1 - k) + 0.4;
      ctx.beginPath(); ctx.arc(b.x, b.y, 8 + 34 * e, 0, 6.283); ctx.stroke();
      for (let j = 0; j < 7; j++) { const a = Math.atan2(b.dy, b.dx) + (j - 3) * 0.5, d = 10 + 48 * e * (0.6 + 0.4 * ((j * 37) % 5) / 4); ctx.fillStyle = `rgba(255,${90 + j * 14},${100},${(0.9 * (1 - k)).toFixed(3)})`; ctx.beginPath(); ctx.arc(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d, 1.6 * (1 - k) + 0.4, 0, 6.283); ctx.fill(); }
      ctx.restore();
    }
    raf = requestAnimationFrame(frame);
  }
  if (location.hash === '#debug') window.__floaters = { items, bursts, spawn: () => spawn(performance.now()), local };
  const begin = () => { if (started) return; started = true; lastT = performance.now(); nextSpawn = lastT + 2200; raf = requestAnimationFrame(frame); };
  (gate ? gate.then(begin) : Promise.resolve().then(begin));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) lastT = performance.now(); });
}
