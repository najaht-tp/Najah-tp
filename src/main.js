// Entry: wires the loader, the page's readiness tracking and the hero ninja together.
import { Progress } from './loader/progress.js';
import { createLoader } from './loader/loader.js';
import { initHeroNinja } from './hero/ninja.js';
import { initCursorTrail } from './hero/cursor-trail.js';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || location.hash.includes('loadersimple');   // the hash is a dev/test switch for the simple path
// The loader only waits for what the first screen truly needs. The hero's 3D ninja is NOT one of them: a still picture of it
// covers the hero until the 3D version is ready (its progress calls below are ignored), so its slow GPU warm-up never holds the loader.
const progress = new Progress().add('fonts', 0.08).add('images', 0.08);
if (!reduce) progress.add('loader-model', 0.12).add('loader-tex', 0.18);   // the loader's own ninja

// dev/test switch: #loaderslow=6 adds a fake task that takes 6 s, to check the loader waits for real readiness
const slow = /loaderslow=(\d+)/.exec(location.hash);
if (slow) {
  progress.add('simulated', 0.4);
  const t0 = performance.now(), ms = Number(slow[1]) * 1000;
  const iv = setInterval(() => { const k = Math.min(1, (performance.now() - t0) / ms); progress.set('simulated', k); if (k >= 1) clearInterval(iv); }, 100);
}

// real readiness: fonts, images, then the hero ninja reports its own tasks
const fonts = ['300 90px "Yoru Kaze"', '400 64px "Yoru Kaze"', '500 14px Manrope', '400 24px "Space Grotesk"'];
let fontsDone = 0;
fonts.forEach((f) => (document.fonts?.load(f) ?? Promise.resolve()).catch(() => {}).then(() => progress.set('fonts', ++fontsDone / fonts.length)));
// only the images the first screen needs: project pages (#work, #case) are hidden and their images are lazy, so they must never hold the loader
const imgs = [...document.images].filter((im) => im.loading !== 'lazy' && !im.closest('#work, #case'));
let imgsDone = 0;
if (!imgs.length) progress.done('images');
// "loaded" (not decode()): a background tab never decodes images, which would stall the loader until the tab is shown
imgs.forEach((im) => new Promise((r) => { if (im.complete) r(); else { im.addEventListener('load', r, { once: true }); im.addEventListener('error', r, { once: true }); } })
  .then(() => progress.set('images', ++imgsDone / imgs.length)));

// the hero waits for the reveal before its sequence starts
let openGate; const gate = new Promise((r) => { openGate = r; });
const open = () => { document.documentElement.classList.remove('is-loading'); openGate(); };

initHeroNinja({ progress, gate });
initCursorTrail();
createLoader({ progress, reduce, onReveal: open }).then((loader) => {
  // coming back from the back/forward cache: never replay the loader
  addEventListener('pageshow', (e) => { if (e.persisted) { loader?.skip(); open(); } });
});

// "Play game": the game is loaded only when someone asks for it, so it never slows the portfolio down
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-play-game]');
  if (!btn) return;
  e.preventDefault();
  const toggle = document.getElementById('nav-toggle');
  if (toggle && toggle.getAttribute('aria-expanded') === 'true') toggle.click();       // close the phone menu first
  import('./game/index.js').then((m) => m.openGame()).catch((err) => console.warn('Ninja Run could not start', err));
});
