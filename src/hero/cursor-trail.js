// A red comet behind the mouse over the hero and the top bar: a glowing dot at the pointer with a smooth, tapering tail that curves with the hand and fades to nothing.
// The head chases the pointer with a little lag, so the tail bends naturally; the tail is drawn as one smooth curve whose width and strength run down to zero,
// so it never ends in a hard cut. Mouse / trackpad only; off for touch and reduced motion; completely idle when the pointer rests.
export function initCursorTrail() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const hero = document.getElementById('hero'), root = document.documentElement;
  if (!hero) return;
  const cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:3500;pointer-events:none';
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  const size = () => { dpr = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  size(); addEventListener('resize', size);

  const LIFE = 620, MAXPTS = 60;                          // ms a point of the tail lives
  const pts = [];
  let px = 0, py = 0, fx = 0, fy = 0, have = false, active = false, lastMove = 0, raf = 0, lastT = 0, energy = 0;
  const live = () => !root.classList.contains('is-work') && !root.classList.contains('is-case') && !root.classList.contains('is-loading') && !document.querySelector('.sr');
  const bar = document.querySelector('header.nav, .nav');
  const inside = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  const inHero = (x, y) => inside(hero.getBoundingClientRect(), x, y) || (bar && inside(bar.getBoundingClientRect(), x, y));   // the hero and the top bar

  addEventListener('pointermove', (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    px = e.clientX; py = e.clientY;
    if (!have) { fx = px; fy = py; have = true; }
    active = live() && inHero(px, py); lastMove = performance.now();
    if (active && !raf) { lastT = performance.now(); raf = requestAnimationFrame(frame); }
  }, { passive: true });
  document.addEventListener('mouseleave', () => { active = false; });

  function frame(now) {
    raf = 0;
    const dt = Math.min(48, now - lastT); lastT = now;
    if (active && now - lastMove < 100) {
      const k = 1 - Math.pow(0.003, dt / 1000);           // the head chases the pointer with a little lag
      const ox = fx, oy = fy; fx += (px - fx) * k; fy += (py - fy) * k;
      const sp = Math.hypot(fx - ox, fy - oy) / Math.max(1, dt);                  // px per ms
      energy += (Math.min(1, sp / 0.7) - energy) * Math.min(1, dt / 110);          // the tail's strength follows how briskly the hand moves
      pts.push({ x: fx, y: fy, t: now }); if (pts.length > MAXPTS) pts.shift();
    } else energy += (0 - energy) * Math.min(1, dt / 200);
    while (pts.length && now - pts[0].t > LIFE) pts.shift();

    ctx.clearRect(0, 0, W, H);
    const n = pts.length;
    if (n > 2) {
      ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(255, 30, 60, .7)'; ctx.shadowBlur = 9;
      // one smooth curve through the points (quadratic through the midpoints), drawn from the tail to the head in short runs so width and colour can change
      for (let i = 1; i < n - 1; i++) {
        const a = pts[i - 1], b = pts[i], c = pts[i + 1];
        const age = Math.min(1, (now - b.t) / LIFE), life = 1 - age;
        const alpha = Math.pow(life, 1.3) * (0.35 + 0.65 * energy);
        if (alpha < 0.01) continue;
        const r = 255 - 105 * age, g = 70 - 60 * age, bl = 80 - 50 * age;              // red-hot at the head, deep crimson at the tail (no pink or white)
        ctx.strokeStyle = `rgba(${r | 0},${Math.max(0, g) | 0},${Math.max(0, bl) | 0},${alpha.toFixed(3)})`;
        ctx.lineWidth = Math.max(0.4, (0.6 + 4.2 * Math.pow(life, 1.1)) * (0.5 + 0.5 * energy));
        ctx.beginPath(); ctx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2); ctx.quadraticCurveTo(b.x, b.y, (b.x + c.x) / 2, (b.y + c.y) / 2); ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }
    // the dot at the head
    if (n && energy > 0.02) {
      const h = pts[n - 1], r = 11 + 4 * energy, g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, r);
      g.addColorStop(0, `rgba(255,120,130,${(0.9 * energy).toFixed(3)})`); g.addColorStop(0.35, `rgba(255,40,65,${(0.5 * energy).toFixed(3)})`); g.addColorStop(1, 'rgba(220,20,50,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(h.x, h.y, r, 0, 6.283); ctx.fill();
      ctx.fillStyle = `rgba(255,150,155,${(0.95 * energy).toFixed(3)})`; ctx.beginPath(); ctx.arc(h.x, h.y, 1.9, 0, 6.283); ctx.fill();
    }
    if (pts.length || active) raf = requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, W, H);
  }
}
