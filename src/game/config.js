// NINJA RUN: everything you may want to change lives here (asset paths, clip names, portfolio links, tuning).
//
// Assets: in the dev page they load from the URLs below. The single-file build (tools/build.mjs) embeds them as
// base64 globals instead (window.__GAME_GLB__, window.__KATANA_GLB__, window.__LOADER_TEX__), so nothing is fetched.

export const ASSETS = {
  // the rigged ninja (same rig, mesh and textures as the loader ninja), with the game's animation clips
  ninja: { url: 'assets/game/ninja-game.glb', embedded: () => window.__GAME_GLB__ },
  // the ninja's colour / normal / metal-rough maps (shared with the loader ninja)
  ninjaTextures: {
    urls: { base: 'assets/loader/tex-base.webp', normal: 'assets/loader/tex-normal.webp', mr: 'assets/loader/tex-mr.webp' },
    embedded: () => window.__LOADER_TEX__,
  },
  // the painted backdrop behind the level (sky, sun, mountains, temples)
  background: { url: 'assets/game/background.webp', embedded: () => window.__GAME_BG__,
    horizon: 0.78 },             // how far down the image (0 top .. 1 bottom) its stone floor starts: lined up with the level's ground
  // the katana (separate model, textures embedded)
  katana: { url: 'assets/game/katana.glb', embedded: () => window.__KATANA_GLB__ },
};

// Animation clips are found by name, case-insensitively: the first clip whose name contains one of the words wins.
// If a state has no clip, the controller falls back to another clip plus simple procedural motion.
export const CLIPS = {
  idle: ['alert', 'idle', 'breath'],
  run: ['running', 'run', 'sprint'],
  jump: ['jump'],
  attack: ['combo', 'attack', 'slash', 'sword'],
  victory: ['agree', 'victory', 'cheer', 'dance'],
  hit: ['hit', 'react', 'damage'],
  fall: ['fall'],
};

// Which part of the longer clips is used (seconds of clip time). Measured from the current GLB.
export const CLIP_WINDOWS = {
  jump: { takeoff: 0.32, air: 0.5, land: 1.8, end: 2.15 },     // crouch -> airborne spin -> touch down -> stand
  attack: { from: 0.26, to: 0.95, rate: 1.65, hitFrom: 0.46, hitTo: 0.84 },   // the first slash of the combo
  victory: { from: 4.6, loopTo: 9.0 },                        // sword raised
};

export const CHARACTER = {
  height: 1.8,                 // metres, standing
  facing: Math.PI / 2,         // the model faces +Z; turn it to face the running direction (+X)
  bones: { hand: /RightHand$/, hips: /Hips$/, foot: /LeftFoot$/ },
  katana: {
    handleCentre: 0.64,        // along the model's X axis (the blade points to -X in the GLB)
    modelLength: 1.9,          // tip to pommel in GLB units
    lengthOfHeight: 0.57,      // sword length as a fraction of the grip reference height
    // grip relative to the hand bone (same calibration as the loader katana): offset in the bone's axes
    // (fractions of the reference height) and orientation
    gripPos: [-0.002, 0.079, -0.008],
    gripEuler: [40, 0, 90],    // degrees
  },
};

// Portfolio scrolls. `action` says where VIEW DETAILS goes:
//   { type: 'hero' }               the introduction at the top of the page
//   { type: 'work' }               My Projects
//   { type: 'case', slug: '...' }  a case study (sony-live, vodafone-idea, sids-farm, act)
//   { type: 'contact' }            the Connect me mail link
//   { type: 'url', href: '...' }   any other link
// TODO(Najah): "About me" and "Skills" point to the introduction until those sections exist on the page.
export const SECTIONS = [
  { id: 'about', title: 'About me', note: 'Who I am and how I work', action: { type: 'hero' } },
  { id: 'skills', title: 'Skills', note: 'What I bring to a team', action: { type: 'hero' } },
  { id: 'projects', title: 'Projects', note: 'Selected product work', action: { type: 'work' } },
  { id: 'case', title: 'Featured case study', note: 'Sony LIV', action: { type: 'case', slug: 'sony-live' } },
  { id: 'contact', title: 'Contact', note: 'Say hello', action: { type: 'contact' } },
];

export const TUNING = {
  speed: 7,                    // m/s, forward
  gravity: 30,
  jumpVelocity: 11.6,          // about 2.2 m high, 0.77 s in the air
  doubleJumpVelocity: 9.5,
  coyoteTime: 0.1,             // a jump still counts just after running off an edge
  jumpBuffer: 0.13,            // a jump pressed just before landing still counts
  attackCooldown: 0.42,
  invulnerable: 1.3,           // seconds after a hit
  health: 3,
  fallLimit: -5,               // below this the ninja has fallen into a gap
  coinValue: 10, scrollValue: 250, dummyValue: 100,
};
