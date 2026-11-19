# Build tools (saved 2026-11-14)

`index.src.html` is the file to edit. It loads the `assets/` folder and works over a local server.
`index.html` is generated from it as one self-contained file (images, fonts, three.js and the ninja model all embedded).

Setup (once): `npm install` in the project root (see package.json). `npm run build` regenerates index.html; `npm run dev` serves the folder.
The model scripts below additionally need `npm i -D @gltf-transform/cli @gltf-transform/core` and contain absolute paths from the original session: edit them first.

Scripts (they contain absolute paths from the original session; edit `R`, `S` and the input paths first):

- `build.mjs`   builds `index.html` from `index.src.html` and `assets/`.
- `two.mjs`     builds the model with the gesture and dance clips (hips drift locked, gentle legs on the gesture),
                then compress it with `gltf-transform meshopt notex-two.glb assets/ninja-clap.min.glb --level high`.
- `extract.mjs` splits the three textures out of the original model into `assets/tex-*.webp`.
- `recv.mjs` + `comp.mjs`  regenerate the transparent placeholder `assets/ninja-still.webp`:
                open `index.src.html#snap` in a browser, run `window.__ninjaSnapshot()` and POST the result to `recv.mjs`.

Preview server: `python3 -m http.server 5179` from the project folder.
Published copy: https://claude.ai/artifact/Uwx55JRjxXDQAdcZkPmHYC (private).

## Source layout (added with the loader)

    index.src.html            markup + styles for the page (edit this)
    src/main.js               entry: readiness tracking, loader, hero ninja
    src/shared/assets.js      model / texture loading helpers, contact shadow
    src/hero/ninja.js         the hero ninja (gesture -> dance -> rest loop), waits for the loader's reveal
    src/loader/progress.js    weighted, monotonic readiness tracker
    src/loader/loader.js      GSAP master timeline: jump, katana, 0-100%, slash, reveal
    src/loader/ninja-stage.js the loader's 3D ninja (jump + combo clips)
    src/loader/katana3d.js    the katana as a 3D object rigidly attached to the hand bone (grip calibrated to the combo poses)
    src/loader/trail3d.js     one continuous GPU ribbon trail (spline-smoothed, shader-faded; no stacked layers)
    src/loader/fx.js          speed lines, landing shockwave, screen shake
    src/loader/loader.css     loader styles
    assets/loader/            loader model + textures (tools/loadermodel.mjs builds these)

Dev: serve the folder and open index.src.html (three and gsap load from jsDelivr).
Debug switches (URL hash): #loaderdebug (paused, window.__loader.seek(t) / run(t0, t1)), #loaderslow=6 (fake 6 s task),
#loadersimple (the reduced-motion path), #loaderperf (frame timings in window.__loaderPerf), #debug (hero ninja stepper), #snap (placeholder still capture).
Build: `npm run build` (tools/build.mjs resolves its paths from the project root).

## Ninja Run (the game behind "Play game")

    src/game/config.js   asset paths, clip names, portfolio scroll links, tuning: edit this first
    src/game/index.js    entry, loaded lazily by main.js on "Play game"; maps scroll links onto the page's navigation
    src/game/game.js     state, physics, collisions, camera, loop
    src/game/player.js   ninja + katana, animation blending, root-motion removal
    src/game/level.js    the level layout (ground, gaps, platforms, obstacles, coins, scrolls, checkpoint, goal)
    src/game/world.js    sky, mountains, bamboo, lanterns, petals
    src/game/fx.js, audio.js, ui.js
    assets/game/ninja-game.glb  the Meshy ninja rig with 5 clips (Running, Alert, jump, combo, Agree), hips travel locked
    assets/game/katana.glb      Ninja-2.0/Katana.glb, simplified to ~5k triangles, 512px WebP textures

Rebuild the two GLBs with gltf-transform (core, functions, extensions) + meshoptimizer + sharp:
read the source GLB, keep the clips listed in config.js, drop the textures (the loader's tex-*.webp are reused),
lock the Hips X/Z translation, `prune({ keepAttributes: true })` (keeps tangents and UVs), `meshopt()`.
Play-test hook: open the page with `#gamedebug` to get `window.__shinobi`.
