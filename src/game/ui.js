// The game's interface, in plain DOM over the canvas: loading, start, HUD, touch buttons, unlock cards, pause,
// victory, and a message when WebGL is not available. It knows nothing about the game rules; game.js drives it.
const CSS = `
.sr { position: fixed; inset: 0; z-index: 3000; background: #07090d; color: #f7f7f4; font-family: "Manrope", system-ui, sans-serif;
  overflow: hidden; user-select: none; -webkit-user-select: none; touch-action: none; opacity: 0; transition: opacity .35s ease; }
.sr.is-in { opacity: 1; }
.sr canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.sr button { font: inherit; color: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.sr-layer { position: absolute; inset: 0; display: grid; place-items: center; padding: 24px; pointer-events: none; }
.sr-layer[hidden] { display: none; }
.sr-layer > * { pointer-events: auto; }
.sr-title { margin: 0; font-family: "Yoru Kaze", serif; font-weight: 400; font-size: clamp(54px, 10vw, 120px); line-height: 1; letter-spacing: 1px; text-align: center; text-shadow: 0 6px 40px rgba(195, 24, 38, .45); }
.sr-title b { color: #ff3b4d; font-weight: 400; }
.sr-sub { margin: 14px 0 0; font-size: clamp(14px, 1.4vw, 17px); color: #c9ced2; text-align: center; }
.sr-btn { display: inline-flex; align-items: center; justify-content: center; gap: 10px; height: 52px; padding: 0 30px; border: 0; border-radius: 999px; background: #c31826; color: #fff;
  font-size: 15px; font-weight: 600; letter-spacing: .3px; box-shadow: 0 10px 30px rgba(195, 24, 38, .35); transition: transform .16s cubic-bezier(.23,1,.32,1), background-color .2s ease; }
.sr-btn:active { transform: scale(.97); }
.sr-btn--ghost { background: rgba(255, 255, 255, .08); box-shadow: none; border: 1px solid rgba(255, 255, 255, .22); }
@media (hover: hover) { .sr-btn:hover { background: #d81c2c; } .sr-btn--ghost:hover { background: rgba(255, 255, 255, .16); } }
.sr-icon { width: 44px; height: 44px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, .22); background: rgba(10, 12, 16, .55); display: grid; place-items: center; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.sr-icon svg { width: 18px; height: 18px; }
.sr-exit { position: absolute; top: max(16px, env(safe-area-inset-top)); right: max(16px, env(safe-area-inset-right)); z-index: 5; }

/* loading */
.sr-load { display: grid; justify-items: center; gap: 28px; }
.sr-bar { width: min(320px, 70vw); height: 3px; border-radius: 3px; background: rgba(255, 255, 255, .12); overflow: hidden; }
.sr-bar i { display: block; height: 100%; width: 100%; transform-origin: 0 50%; transform: scaleX(0); background: linear-gradient(90deg, #8e0f1c, #ff2d55); transition: transform .2s linear; }
.sr-pct { font-family: "Space Grotesk", system-ui, sans-serif; font-size: 14px; color: #a7b4be; letter-spacing: .5px; }

/* start */
.sr-start { display: grid; justify-items: center; align-content: end; gap: 0; height: 100%; padding-bottom: max(40px, 7vh); text-align: center; }
@media (min-aspect-ratio: 11/10) {
  .sr-layer[data-l="start"] { place-items: center start; padding-left: clamp(24px, 8vw, 140px); }
  .sr-start { justify-items: start; align-content: center; text-align: left; padding-bottom: 0; max-width: min(520px, 46vw); }
  .sr-start .sr-title, .sr-start .sr-sub { text-align: left; }
  .sr-start .sr-keys { justify-content: flex-start; }
  .sr-layer[data-l="start"]::before { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(7, 9, 13, .78), rgba(7, 9, 13, .35) 45%, rgba(7, 9, 13, 0) 70%); pointer-events: none; }
  .sr-start { position: relative; }
}
@media (max-aspect-ratio: 11/10) { .sr-layer[data-l="start"]::before { content: ""; position: absolute; inset: 0; background: linear-gradient(0deg, rgba(7, 9, 13, .85), rgba(7, 9, 13, 0) 50%); pointer-events: none; } .sr-start { position: relative; } }
.sr-start .sr-title { margin-bottom: 2px; }
.sr-start .sr-btn { margin-top: 26px; height: 56px; padding: 0 38px; font-size: 16px; }
.sr-keys { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px 18px; margin-top: 22px; font-size: 13px; color: #a7b4be; }
.sr-keys kbd { display: inline-block; min-width: 26px; padding: 3px 8px; margin-right: 6px; border: 1px solid rgba(255, 255, 255, .25); border-bottom-width: 2px; border-radius: 6px; font: 600 12px "Space Grotesk", system-ui, sans-serif; color: #fff; }
.sr-touch-only { display: none; }
.sr.is-touch .sr-touch-only { display: inline; } .sr.is-touch .sr-key-only { display: none; }
.sr-sound { position: absolute; top: max(16px, env(safe-area-inset-top)); left: max(16px, env(safe-area-inset-left)); display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 16px 0 12px;
  border: 1px solid rgba(255, 255, 255, .22); border-radius: 999px; background: rgba(10, 12, 16, .55); font-size: 13px; z-index: 5; }
.sr-sound svg { width: 18px; height: 18px; }
.sr.is-playing .sr-sound { display: none; }
.sr-sound i { width: 32px; height: 18px; border-radius: 9px; background: rgba(255, 255, 255, .2); position: relative; transition: background-color .2s ease; }
.sr-sound i::after { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform .2s cubic-bezier(.23,1,.32,1); }
.sr-sound[aria-pressed="true"] i { background: #c31826; } .sr-sound[aria-pressed="true"] i::after { transform: translateX(14px); }

/* HUD */
.sr-hud { position: absolute; top: 0; left: 0; right: 0; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px;
  padding: max(16px, env(safe-area-inset-top)) max(76px, calc(env(safe-area-inset-right) + 76px)) 0 max(16px, env(safe-area-inset-left)); pointer-events: none; }
.sr-hud[hidden] { display: none; }
.sr-stats { display: flex; gap: 8px; flex-wrap: wrap; }
.sr-chip { display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 14px; border-radius: 999px; background: rgba(10, 12, 16, .6); border: 1px solid rgba(255, 255, 255, .14);
  font: 600 14px "Space Grotesk", system-ui, sans-serif; font-variant-numeric: tabular-nums; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.sr-chip small { font: 500 11px "Manrope", system-ui, sans-serif; color: #a7b4be; letter-spacing: .4px; text-transform: uppercase; }
.sr-coin { width: 14px; height: 14px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #ffe9a0, #f3b21b 60%, #a86b00); }
.sr-scr { width: 16px; height: 10px; border-radius: 3px; background: #f1e3c4; box-shadow: inset 3px 0 0 #c31826, inset -3px 0 0 #c31826; }
.sr-chip.is-pop { animation: sr-pop .35s cubic-bezier(.23,1,.32,1); }
@keyframes sr-pop { 40% { transform: scale(1.12); } }
.sr-progress { width: min(34vw, 360px); height: 6px; border-radius: 6px; background: rgba(255, 255, 255, .14); position: relative; }
.sr-progress i { position: absolute; inset: 0; border-radius: inherit; transform-origin: 0 50%; transform: scaleX(0); background: linear-gradient(90deg, #8e0f1c, #ff3b4d); }
.sr-progress b { position: absolute; top: 50%; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; background: #f7f7f4; box-shadow: 0 0 0 3px rgba(195, 24, 38, .6); left: 0; }
.sr-progress em { position: absolute; right: -6px; top: -7px; width: 18px; height: 18px; border-radius: 3px; font-style: normal; }
.sr-progress em::before { content: ""; position: absolute; left: 1px; right: 1px; top: 2px; height: 3px; background: #c31826; border-radius: 2px; }
.sr-progress em::after { content: ""; position: absolute; left: 4px; right: 4px; top: 4px; bottom: 0; border-left: 2px solid #c31826; border-right: 2px solid #c31826; }
.sr-right { display: flex; justify-content: flex-end; align-items: center; gap: 10px; pointer-events: auto; }
.sr-hearts { display: flex; gap: 6px; }
.sr-hearts span { width: 22px; height: 20px; background: #ff3b4d; clip-path: path("M11 19 C4 13 0 10 0 5.5 0 2.4 2.4 0 5.4 0 7.5 0 9.6 1.2 11 3.2 12.4 1.2 14.5 0 16.6 0 19.6 0 22 2.4 22 5.5 22 10 18 13 11 19Z"); transition: opacity .3s ease, transform .3s ease; }
.sr-hearts span.is-off { opacity: .2; transform: scale(.85); }
.sr-hearts.is-hurt { animation: sr-shake .4s ease; }
@keyframes sr-shake { 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
@media (max-width: 700px) {
  .sr-hud { grid-template-columns: 1fr auto; padding-right: max(70px, calc(env(safe-area-inset-right) + 70px)); }
  .sr-progress { grid-column: 1 / -1; grid-row: 2; width: 100%; margin-top: 4px; }
  .sr-chip { height: 32px; padding: 0 11px; font-size: 13px; } .sr-chip small { display: none; }
}

/* touch controls */
.sr-touch { position: absolute; left: 0; right: 0; bottom: 0; display: none; justify-content: space-between; padding: 0 max(22px, env(safe-area-inset-right)) max(26px, env(safe-area-inset-bottom)) max(22px, env(safe-area-inset-left)); pointer-events: none; }
.sr.is-touch .sr-touch.is-on { display: flex; }
.sr-pad { pointer-events: auto; width: 92px; height: 92px; border-radius: 50%; border: 1.5px solid rgba(255, 255, 255, .35); background: rgba(10, 12, 16, .45); display: grid; place-items: center; align-content: center; gap: 2px;
  font-size: 11px; font-weight: 700; letter-spacing: 1px; color: #fff; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); touch-action: none; }
.sr-pad svg { width: 30px; height: 30px; }
.sr-pad.is-down { transform: scale(.94); background: rgba(195, 24, 38, .55); border-color: rgba(255, 110, 135, .7); }
.sr-pad--atk { background: rgba(195, 24, 38, .38); border-color: rgba(255, 110, 135, .55); }

/* hint */
.sr-hint { position: absolute; left: 50%; top: 22%; transform: translateX(-50%); padding: 12px 20px; border-radius: 999px; background: rgba(10, 12, 16, .6); border: 1px solid rgba(255, 255, 255, .16);
  font-size: 14px; white-space: nowrap; opacity: 0; transition: opacity .3s ease, transform .3s cubic-bezier(.23,1,.32,1); pointer-events: none; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.sr-hint.is-on { opacity: 1; transform: translateX(-50%) translateY(-4px); }
.sr-hint kbd { padding: 2px 7px; margin: 0 3px; border: 1px solid rgba(255, 255, 255, .3); border-radius: 5px; font: 600 12px "Space Grotesk", system-ui, sans-serif; }

/* unlock card */
.sr-cards { position: absolute; right: max(16px, env(safe-area-inset-right)); top: 84px; display: grid; gap: 10px; width: min(320px, calc(100vw - 32px)); pointer-events: none; }
.sr-card { pointer-events: auto; display: grid; grid-template-columns: auto 1fr; gap: 4px 14px; align-items: center; padding: 14px 16px; border-radius: 18px;
  background: linear-gradient(135deg, rgba(40, 10, 16, .92), rgba(12, 12, 18, .92)); border: 1px solid rgba(255, 90, 110, .4); box-shadow: 0 18px 40px rgba(0, 0, 0, .45);
  transform: translateX(calc(100% + 30px)); opacity: 0; transition: transform .5s cubic-bezier(.23,1,.32,1), opacity .35s ease; }
.sr-card.is-in { transform: none; opacity: 1; }
.sr-card .sr-seal { grid-row: span 3; width: 46px; height: 46px; border-radius: 12px; background: radial-gradient(circle at 50% 40%, #ff5a6a, #8e0f1c); display: grid; place-items: center; font: 400 20px "Yoru Kaze", serif; }
.sr-card small { font-size: 11px; letter-spacing: 1.2px; text-transform: uppercase; color: #ff8a98; font-weight: 700; }
.sr-card strong { font-size: 17px; font-weight: 700; letter-spacing: -.2px; }
.sr-card button { justify-self: start; margin-top: 4px; padding: 0; border: 0; background: none; font-size: 13px; font-weight: 600; color: #fff; text-decoration: underline; text-underline-offset: 4px; text-decoration-color: rgba(255, 255, 255, .4); }
@media (max-width: 700px) { .sr-cards { top: auto; bottom: 140px; left: 16px; right: 16px; width: auto; } .sr-card { transform: translateY(30px); } }

/* panels: pause, victory, error */
.sr-panel { width: min(460px, 100%); padding: clamp(26px, 4vw, 40px); border-radius: 28px; background: rgba(12, 14, 20, .82); border: 1px solid rgba(255, 255, 255, .12); text-align: center;
  box-shadow: 0 30px 80px rgba(0, 0, 0, .5); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); transform: translateY(14px) scale(.98); opacity: 0; transition: transform .45s cubic-bezier(.23,1,.32,1), opacity .3s ease; }
.sr-layer.is-in .sr-panel { transform: none; opacity: 1; }
.sr-panel h2 { margin: 0; font-family: "Yoru Kaze", serif; font-weight: 400; font-size: clamp(38px, 6vw, 56px); line-height: 1.05; }
.sr-panel p { margin: 10px 0 0; color: #c9ced2; font-size: 15px; line-height: 1.5; }
.sr-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 24px; }
.sr-score { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 22px; }
.sr-score div { padding: 14px 8px; border-radius: 16px; background: rgba(255, 255, 255, .05); border: 1px solid rgba(255, 255, 255, .1); }
.sr-score b { display: block; font: 600 24px "Space Grotesk", system-ui, sans-serif; font-variant-numeric: tabular-nums; }
.sr-score small { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #a7b4be; }
.sr-found { list-style: none; margin: 18px 0 0; padding: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.sr-found li button { height: 34px; padding: 0 14px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, .2); background: rgba(255, 255, 255, .05); font-size: 13px; color: #c9ced2; }
.sr-found li.is-got button { border-color: rgba(255, 90, 110, .6); background: rgba(195, 24, 38, .22); color: #fff; }
.sr-found li:not(.is-got) button { opacity: .55; cursor: default; }
.sr-victory { align-content: end; padding-bottom: max(28px, 5vh); }
@media (max-height: 560px) { .sr-score { margin-top: 12px; } .sr-panel { padding: 20px; } .sr-found { margin-top: 10px; } }
@media (prefers-reduced-motion: reduce) { .sr, .sr-card, .sr-panel, .sr-hint, .sr-bar i { transition: none; } .sr-chip.is-pop, .sr-hearts.is-hurt { animation: none; } }
`;

const svg = {
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V6M6 11l6-6 6 6"/></svg>',
  sword: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 4l-9.5 9.5M20 4l-1 4.5L10.5 17M20 4l-4.5 1M7 14l3 3M5.5 15.5l3 3M4 20l2.5-2.5"/></svg>',
};

export function createUI({ onPlay, onExit, onPause, onResume, onRestart, onSound, onView, onJump, onAttack, soundOn, touch }) {
  if (!document.getElementById('sr-css')) { const st = document.createElement('style'); st.id = 'sr-css'; st.textContent = CSS; document.head.appendChild(st); }
  const el = document.createElement('div');
  el.className = 'sr' + (touch ? ' is-touch' : '');
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Ninja Run, a ninja game');
  el.innerHTML = `
    <div class="sr-layer" data-l="load"><div class="sr-load"><h1 class="sr-title">Ninja <b>Run</b></h1><div class="sr-bar"><i></i></div><div class="sr-pct" aria-live="polite">Loading 0%</div></div></div>
    <div class="sr-layer" data-l="start" hidden><div class="sr-start">
      <h1 class="sr-title">Ninja <b>Run</b></h1>
      <p class="sr-sub">Run through the bamboo forest, collect the scrolls and discover my work.</p>
      <button class="sr-btn" data-a="play" type="button">Play game</button>
      <div class="sr-keys">
        <span class="sr-key-only"><kbd>Space</kbd>jump</span><span class="sr-key-only"><kbd>J</kbd>strike</span><span class="sr-key-only"><kbd>Esc</kbd>pause</span>
        <span class="sr-touch-only">Tap <b>Jump</b> to jump, twice for a double jump · Tap <b>Strike</b> to swing the katana</span>
      </div>
    </div></div>
    <div class="sr-hud" hidden>
      <div class="sr-stats"><span class="sr-chip" data-s="score"><small>Score</small><span>0</span></span><span class="sr-chip" data-s="coins"><i class="sr-coin"></i><span>0</span></span><span class="sr-chip" data-s="scrolls"><i class="sr-scr"></i><span>0/5</span></span></div>
      <div class="sr-progress" role="progressbar" aria-label="Level progress" aria-valuemin="0" aria-valuemax="100"><i></i><b></b><em></em></div>
      <div class="sr-right"><div class="sr-hearts" aria-label="Health"></div><button class="sr-icon" data-a="pause" type="button" aria-label="Pause">${svg.pause}</button></div>
    </div>
    <div class="sr-touch"><button class="sr-pad" data-a="jump" type="button" aria-label="Jump">${svg.up}<span>JUMP</span></button><button class="sr-pad sr-pad--atk" data-a="attack" type="button" aria-label="Strike">${svg.sword}<span>STRIKE</span></button></div>
    <div class="sr-hint" aria-live="polite"></div>
    <div class="sr-cards" aria-live="polite"></div>
    <div class="sr-layer" data-l="pause" hidden><div class="sr-panel"><h2>Paused</h2><p>Take a breath, shinobi.</p><div class="sr-actions"><button class="sr-btn" data-a="resume" type="button">Resume</button><button class="sr-btn sr-btn--ghost" data-a="restart" type="button">Restart</button><button class="sr-btn sr-btn--ghost" data-a="exit" type="button">Exit game</button></div></div></div>
    <div class="sr-layer sr-victory" data-l="victory" hidden><div class="sr-panel">
      <h2>Level complete</h2><p class="sr-v-line">You reached the shrine.</p>
      <div class="sr-score"><div><b data-v="score">0</b><small>Score</small></div><div><b data-v="coins">0</b><small>Coins</small></div><div><b data-v="scrolls">0</b><small>Scrolls</small></div></div>
      <ul class="sr-found"></ul>
      <div class="sr-actions"><button class="sr-btn" data-a="portfolio" type="button">View my portfolio</button><button class="sr-btn sr-btn--ghost" data-a="again" type="button">Play again</button></div>
    </div></div>
    <div class="sr-layer" data-l="error" hidden><div class="sr-panel"><h2>Can’t start</h2><p class="sr-err">This browser cannot run the 3D game.</p><div class="sr-actions"><button class="sr-btn" data-a="exit" type="button">Back to portfolio</button></div></div></div>
    <button class="sr-sound" data-a="sound" type="button" aria-pressed="${soundOn}" aria-label="Sound">${svg.sound}<span>Sound</span><i></i></button>
    <button class="sr-icon sr-exit" data-a="exit" type="button" aria-label="Exit game">${svg.close}</button>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-in'));

  const $ = (s) => el.querySelector(s);
  const layers = Object.fromEntries([...el.querySelectorAll('[data-l]')].map((n) => [n.dataset.l, n]));
  const show = (name) => {
    for (const [k, n] of Object.entries(layers)) { const on = k === name; n.hidden = !on; if (on) requestAnimationFrame(() => n.classList.add('is-in')); else n.classList.remove('is-in'); }
  };
  const hud = $('.sr-hud'), touchBar = $('.sr-touch'), sound = $('.sr-sound');
  const chip = (k) => $(`[data-s="${k}"]`);
  const val = (k) => chip(k).querySelector('span');
  const hearts = $('.sr-hearts');
  const prog = $('.sr-progress i'), dot = $('.sr-progress b');

  // buttons
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'play') onPlay(); else if (a === 'exit') onExit(); else if (a === 'pause') onPause(); else if (a === 'resume') onResume();
    else if (a === 'restart' || a === 'again') onRestart(); else if (a === 'portfolio') onView({ type: 'work' });
    else if (a === 'sound') { const on = sound.getAttribute('aria-pressed') !== 'true'; sound.setAttribute('aria-pressed', on); onSound(on); }
  });
  // touch pads fire on press, not on release, so a jump feels instant
  for (const [sel, fn] of [['[data-a="jump"]', onJump], ['[data-a="attack"]', onAttack]]) {
    const pad = $(sel);
    pad.addEventListener('pointerdown', (e) => { e.preventDefault(); pad.classList.add('is-down'); fn(); });
    const up = () => pad.classList.remove('is-down');
    pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up); pad.addEventListener('pointerleave', up);
    pad.addEventListener('click', (e) => e.stopPropagation(), true);
  }

  let hintTimer = 0;
  const api = {
    el, show,
    progress(p) { $('.sr-bar i').style.transform = `scaleX(${p})`; $('.sr-pct').textContent = `Loading ${Math.round(p * 100)}%`; },
    playing(on) { hud.hidden = !on; el.classList.toggle('is-playing', on); touchBar.classList.toggle('is-on', on); if (on) show(null); },
    setHealth(n, max, hurt) {
      if (hearts.children.length !== max) hearts.innerHTML = '<span></span>'.repeat(max);
      [...hearts.children].forEach((h, i) => h.classList.toggle('is-off', i >= n));
      hearts.setAttribute('aria-label', `Health ${n} of ${max}`);
      if (hurt) { hearts.classList.remove('is-hurt'); void hearts.offsetWidth; hearts.classList.add('is-hurt'); }
    },
    setStats({ score, coins, scrolls, totalScrolls }, popKey) {
      val('score').textContent = score; val('coins').textContent = coins; val('scrolls').textContent = `${scrolls}/${totalScrolls}`;
      if (popKey) { const c = chip(popKey); c.classList.remove('is-pop'); void c.offsetWidth; c.classList.add('is-pop'); }
    },
    setProgress(p) { prog.style.transform = `scaleX(${p})`; dot.style.left = `${p * 100}%`; },
    hint(html, ms = 2600) { const h = $('.sr-hint'); h.innerHTML = html; h.classList.add('is-on'); clearTimeout(hintTimer); hintTimer = setTimeout(() => h.classList.remove('is-on'), ms); },
    unlock(section) {
      const card = document.createElement('div'); card.className = 'sr-card';
      card.innerHTML = `<span class="sr-seal" aria-hidden="true">巻</span><small>Scroll unlocked</small><strong></strong><button type="button">View details</button>`;
      card.querySelector('strong').textContent = section.title + (section.note ? ` · ${section.note}` : '');
      card.querySelector('button').addEventListener('click', () => onView(section.action));
      $('.sr-cards').appendChild(card);
      requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('is-in')));
      setTimeout(() => { card.classList.remove('is-in'); setTimeout(() => card.remove(), 500); }, 5200);
    },
    victory({ score, coins, totalCoins, found, sections }) {
      layers.victory.querySelector('[data-v="score"]').textContent = score;
      layers.victory.querySelector('[data-v="coins"]').textContent = `${coins}/${totalCoins}`;
      layers.victory.querySelector('[data-v="scrolls"]').textContent = `${found.size}/${sections.length}`;
      layers.victory.querySelector('.sr-v-line').textContent = found.size === sections.length ? 'Every scroll found. You know your way around my work now.' : 'Tap a scroll you found to open that part of my portfolio.';
      const ul = layers.victory.querySelector('.sr-found'); ul.innerHTML = '';
      for (const s of sections) {
        const li = document.createElement('li'); if (found.has(s.id)) li.className = 'is-got';
        const b = document.createElement('button'); b.type = 'button'; b.textContent = s.title; b.disabled = !found.has(s.id);
        b.addEventListener('click', () => onView(s.action)); li.appendChild(b); ul.appendChild(li);
      }
      api.playing(false); show('victory');
      setTimeout(() => layers.victory.querySelector('[data-a="portfolio"]').focus({ preventScroll: true }), 300);
    },
    error(msg) { if (msg) $('.sr-err').textContent = msg; show('error'); },
    close() { el.classList.remove('is-in'); return new Promise((r) => setTimeout(() => { el.remove(); r(); }, 360)); },
  };
  return api;
}
