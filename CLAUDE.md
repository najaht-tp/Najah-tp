# Najah's portfolio

Designer portfolio for Najah (Product / Graphic / UI / UX designer, based in India). Dark, cinematic, ninja-themed.
Source design: Figma file `dzGM7qCBD5fzzGAFxYU8Ea` (hero = node 3:2, loader = node 0:1). Reference feel: manayerbamate.com.

## Run and build

    npm install            # once
    npm run dev            # serves the folder at http://127.0.0.1:5179  (open /index.src.html)
    npm run build          # regenerates index.html (one self-contained file, ~5 MB) from index.src.html + src/ + assets/

- **Edit `index.src.html` and `src/`. Never edit `index.html`** (it is generated).
- Dev page loads three/gsap from jsDelivr via an import map; the build bundles them with esbuild and embeds every asset.
- Debug URL hashes: `#loaderdebug` (paused loader, `window.__loader.seek(t)` / `.run(t0, t1, fps)`), `#loaderslow=6`,
  `#loadersimple`, `#loaderperf`, `#debug` (hero stepper), `#snap` (placeholder still capture).
- Screenshots from a headless/embedded browser lag one frame behind: take two. Hidden tabs stall animation.

## Layout of the code

    index.src.html            page markup + styles
    src/main.js               entry: readiness tracking, loader, hero ninja
    src/hero/ninja.js         hero ninja (3D, gesture -> dance -> rest loop), waits for the loader's reveal
    src/loader/               ninja loader: loader.js (GSAP master timeline), ninja-stage.js (3D), katana3d.js, trail3d.js,
                              grip-morph.js (finger curl), fx.js, progress.js (real readiness), loader.css
    src/shared/assets.js      model/texture loading, contact shadow
    assets/                   fonts, images, models (hero: ninja-clap.min.glb; loader: assets/loader/)
    tools/                    build.mjs + model/texture scripts (see tools/README.md)

## Loader (important behaviours; keep them)

- Real progress: shown % = min(real readiness, choreography). Readiness = fonts + first-screen images + the loader's own model/textures only
  (lazy / hidden-page images and the hero's 3D ninja are NOT gating: a still image covers the hero until the 3D version is live).
  If something is still loading when the show ends it waits at most `HOLD_MAX_MS` (1.2 s) at 99%, then carries on. Never hold longer.
- Timeline: ninja jumps in -> draws katana -> combo -> final slash (arm/torso driven) -> hand-over to the hero.
- Hand-over: the loader glow is a clone of the hero's `.atmosphere` image; the two blend with constant combined strength,
  then the page content fades in. Never let a red layer sit in front of the portrait; never slide the backdrop halves
  (they exposed the hero glow and made a wedge). Stop rendering the loader scene before the hero scene starts.
- Plays slower on first visit (timeScale 0.72); quicker for returning visitors (sessionStorage); reduced-motion / no WebGL
  gets a simple percentage loader.
- Bone rotations added after `mixer.update(0)` accumulate when the clip time is held: restore the clean pose every frame.
- The loader ninja uses its own model (`assets/loader/`); clips cannot be retargeted from the hero model (different rig).

## Design preferences (from the owner)

- Smooth, Apple-style motion; GPU-friendly (transform/opacity only); respect `prefers-reduced-motion`.
- Generous spacing; centre-align content at <= 900px; compact hamburger popover for nav actions on small screens.
- Hero: "Product designer, based in India" eyebrow, rotating role line (Graphic / UI / UX designer), sword cursor on actionable
  elements, soft siri-style voice on CTA hover (on/off switch with small volume icon), "Connect me" opens mail.
- Yoru Kaze font renders a studio logo for digits: never use it for numbers (use Space Grotesk).
- Keep the ninja's character design and palette (black + crimson).
- The owner views the page in restrictive viewers: everything is embedded in `index.html` (no relative assets, no fetch).
- Report only what was verified; say when something was checked only in stepped frames and not at full speed.

## Still to build

The rest of the portfolio below the hero (work, about, contact, footer sections). Plan it first, then build section by section
in `index.src.html` + `src/`, reusing the existing design tokens (`--bg`, `--ink`, `--muted`, crimson accent, `--u` scale unit).
