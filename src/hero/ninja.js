// Hero ninja: real-time 3D, plays the gesture clip, blends into the dance, settles, rests, repeats.
// The transparent still image (same standing pose) covers the load, then crossfades to the canvas.
// It reports its readiness to the loader and waits for the loader's reveal before the sequence starts.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createGripMorph } from '../loader/grip-morph.js';
import { loadModel, loadTextures, applyTextures, createContactShadow, idle, precompile } from '../shared/assets.js';

const CLIP   = 'Agree_Gesture';   // plays first, until CLAP_UNTIL
const DANCE  = 'All_Night_Dance'; // then blends into this one, plays through once, then settles
const CLAP_UNTIL = 5.5;          // clip time (s) at which the gesture hands over to the dance
// chibi ninja, in this order, over and over: dive down from the sky and land, a Hip Hop dance, a jog on the spot, a flying-kick fight, then the dive again
const FIGHT_RATE = 1, FIGHT_IN = 0.5;
const REST_HOLD = 2.4, REST_BLEND = 0.9, REST_AT = 0;   // the rest pose is the model's default stance (frame 0 of Rest_Pose), held with a soft breathing sway   // after every move he settles into a standing pose, waits REST_HOLD seconds, then the next move starts
const RUN_FOR = 4, RUN_RATE = 0.75, DANCE_RATE = 0.85, DIVE_RATE = 1, SOFT = 1.5, DIVE_IN = 0.35;   // seconds / playback speeds / blend lengths
const REST_FOR = 3;              // after the dance the ninja settles into a standing pose and holds it this long (s), then the whole sequence restarts
const FADE_TO_DANCE = 0.9, FADE_TO_STAND = 1.2;  // blend lengths (s)
const SOLE_OFFSET = 0.008;       // how far below the lowest bone the soles (and shadow) sit, as a fraction of body height

export async function initHeroNinja({ progress, gate = Promise.resolve() }) {
  const host   = document.getElementById('ninja');
  const canvas = document.getElementById('ninja-canvas');
  if (!host || !canvas) return;
  // preview switch: the chibi ninja (assets/hero-v3) is shown; ?ninja=old brings back the previous model
  const V3 = new URLSearchParams(location.search).get('ninja') !== 'old';
  const snap   = location.hash === '#snap';   // dev only: freeze on frame 0 and expose a PNG grab for the placeholder
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || snap;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(snap ? 2 : Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = V3 ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = V3 ? 1.0 : 1.05;

  const scene = new THREE.Scene();
  if (V3) {   // the chibi ninja is lit like a soft studio: even, light and flat, with only a faint rim
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.5;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 0.35));
    const key = new THREE.DirectionalLight(0xffffff, 1.0); key.position.set(2.5, 4, 5); scene.add(key);
    const rim = new THREE.DirectionalLight(0xff1a24, 0.6); rim.position.set(-4, 2, -3); scene.add(rim);
  } else {
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a2024, 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(2.5, 4, 5); scene.add(key);
    const rim = new THREE.DirectionalLight(0xff2a36, 2.6); rim.position.set(-4, 2, -3); scene.add(rim);
  }

  const camera = new THREE.PerspectiveCamera(28, 4 / 5, 0.01, 50);

  let fallExtra = 0;    // extra height (metres) added to the start of the dive when the canvas is taller than his box
  let framing = null;   // { size, mid } measured over every pose of every clip
  const frame = () => {
    if (!framing) return;
    const { size, mid } = framing;
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const par = canvas.parentElement, ext = par && par.clientHeight ? Math.max(0, canvas.clientHeight / par.clientHeight - 1) : 0;
    const distV = (size.y / 2) / t;
    const distH = (size.x / 2) / (t * camera.aspect * (1 + ext));   // judge the width against his own box, not the taller canvas
    const dist0 = Math.max(distV, distH) + size.z / 2;
    // when the canvas reaches up above his box (phones), keep him the same size and place and just show more room above him
    const dist = dist0 * (1 + ext), up = ext * dist0 * t;
    camera.position.set(mid.x, mid.y + up, mid.z + dist);
    camera.lookAt(mid.x, mid.y + up, mid.z);
    camera.near = dist / 50; camera.far = dist * 20;
    camera.updateProjectionMatrix();
  };
  const fit = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    frame();
  };
  new ResizeObserver(fit).observe(canvas);

  const DIR = V3 ? 'assets/hero-v3/' : 'assets/';
  const TEX = window.__NINJA_TEX__ || { base: DIR + (V3 ? 'tex-red.webp' : 'tex-base.webp'), normal: DIR + 'tex-normal.webp', mr: DIR + 'tex-mr.webp' };
  let gltf, textures;
  try {
    gltf = await loadModel({ embedded: window.__NINJA_GLB__, url: V3 ? DIR + 'ninja-loop3.glb' : 'assets/ninja-clap.min.glb' });
    progress?.done('hero-model');
    let loaded = 0;
    textures = await loadTextures(TEX, () => progress?.set('hero-tex', ++loaded / 3 * 0.95));
    applyTextures(gltf.scene, textures);
    progress?.done('hero-tex');
  } catch (err) {
    console.warn('Ninja model failed to load; keeping the still.', err);
    progress?.done('hero-model'); progress?.done('hero-tex'); progress?.done('hero-frame');
    return;
  }

  const model = gltf.scene;
  scene.add(model);
  // the right hand closes into a fist for the salute (the same finger-curl the intro uses on the katana hand); its strength follows the salute pose's blend weight
  let fist = null;
  if (V3) {
    let sk = null, hb = null; model.traverse((o) => { if (o.isSkinnedMesh) sk = o; if (o.isBone && /RightHand$/.test(o.name)) hb = o; });
    if (sk && hb) { fist = createGripMorph(sk, hb); fist.build({ y0: 0.12, length: 0.1, angle: 3.3, fold: new THREE.Vector3(-1, 0, 0) }); }
  }
  const clip = THREE.AnimationClip.findByName(gltf.animations, V3 ? 'Running' : CLIP);
  const danceClip = THREE.AnimationClip.findByName(gltf.animations, V3 ? 'Hip_Hop_Dance' : DANCE);
  const mixer = new THREE.AnimationMixer(model);
  const clapAct = mixer.clipAction(clip);
  const danceAct = danceClip && mixer.clipAction(danceClip);
  const standAct = V3 ? mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, 'Rest_Pose')) : null;   // the model's own default stance (feet apart, arms angled out, fingers open)
  const diveClip = V3 ? THREE.AnimationClip.findByName(gltf.animations, 'Dive_Down_Land') : null;
  const fightClip = V3 ? THREE.AnimationClip.findByName(gltf.animations, 'Flying_Fist_Kick') : null;
  const fightAct = V3 ? mixer.clipAction(fightClip) : null;
  if (V3) { fightAct.timeScale = FIGHT_RATE; fightAct.setLoop(THREE.LoopOnce, 1); fightAct.clampWhenFinished = true; }
  const diveAct = V3 ? mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, 'Dive_Down_Land')) : null;
  const foldAct = V3 ? mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, 'Rest_Salute')) : null;   // fist-and-palm salute: right fist held in the open left palm, in front of the chest
  if (V3) { clapAct.timeScale = RUN_RATE; if (danceAct) danceAct.timeScale = DANCE_RATE; diveAct.timeScale = DIVE_RATE; diveAct.setLoop(THREE.LoopOnce, 1); diveAct.clampWhenFinished = true; }

  // Measure every pose of every clip (skinned-mesh bounds are unreliable, so use the bones)
  // and frame the camera on the union, so head and feet are never cropped mid-move.
  const measure = (action, seconds, into) => {
    action.reset().play();
    const v = new THREE.Vector3();
    for (let i = 0; i <= 60; i++) {
      mixer.setTime(seconds * i / 60);
      model.updateMatrixWorld(true);
      model.traverse((o) => o.isBone && into.expandByPoint(v.setFromMatrixPosition(o.matrixWorld)));
    }
    action.stop();
  };
  const box = new THREE.Box3();
  measure(clapAct, clip.duration, box);              // the clap pose sets the floor level and the shadow
  const h0 = box.max.y - box.min.y;
  const feetY = box.min.y, footCx = (box.min.x + box.max.x) / 2, footCz = (box.min.z + box.max.z) / 2;

  const shadow = createContactShadow(h0 * 0.62);
  shadow.position.set(footCx, feetY - h0 * SOLE_OFFSET, footCz);
  scene.add(shadow);

  // The shadow tracks the feet every frame: it slides under them while dancing and
  // shrinks and fades a little when the lowest foot lifts off the floor.
  const footBones = [];
  model.traverse((o) => { if (o.isBone && /(Left|Right)(Foot|ToeBase)$/.test(o.name)) footBones.push(o); });
  const fv = new THREE.Vector3();
  let restLow = null;
  const updateShadow = () => {
    if (!footBones.length) return;
    model.updateMatrixWorld(true);
    let cx = 0, cz = 0, low = Infinity;
    for (const b of footBones) { fv.setFromMatrixPosition(b.matrixWorld); cx += fv.x; cz += fv.z; low = Math.min(low, fv.y); }
    if (restLow === null) restLow = low;                       // first call happens on frame 0, feet planted
    const k = Math.min(1, Math.max(0, 1 - (low - restLow) / (h0 * 0.1)));
    shadow.position.x = cx / footBones.length;
    shadow.position.z = cz / footBones.length;
    shadow.material.opacity = 0.3 + 0.7 * k;
    shadow.scale.setScalar(0.75 + 0.25 * k);
  };
  const frameBox = box.clone();
  if (danceAct) measure(danceAct, danceClip.duration, frameBox);
  box.copy(frameBox);
  box.min.y -= h0 * 0.04;                       // soles sit below the ankle bones
  box.max.y += h0 * 0.07;                       // head top sits above the head bone
  box.expandByVector(new THREE.Vector3(h0 * 0.06, 0, 0));
  framing = { size: box.getSize(new THREE.Vector3()), mid: box.getCenter(new THREE.Vector3()) };
  fit();

  // start state: gesture clip from t = 0 (this is also the still we show before the model loads)
  if (V3) {   // the floor level for the shadow comes from the standing pose; the show then starts with him still up in the sky, above the frame
    standAct.reset().play(); mixer.setTime(0); updateShadow(); standAct.stop();
    diveAct.reset().play(); mixer.setTime(0);
    if (reduce) { diveAct.stop(); standAct.reset().play(); mixer.setTime(0); }   // reduced motion: a still standing pose
  } else {
    clapAct.reset().play();
    mixer.setTime(0);   // applies frame 0 right away, even when the clip is not being advanced
  }
  updateShadow();
  if (danceAct) { if (V3) danceAct.setLoop(THREE.LoopRepeat, Infinity); else { danceAct.setLoop(THREE.LoopOnce, 1); danceAct.clampWhenFinished = true; } }

  // Blends are driven by hand with an ease-in-out curve (smootherstep) so neither clip lurches in or out.
  let phase = V3 ? 'dive' : 'clap', fade = null, restT = 0, runT = 0, danceT = 0, diveT = 0, fightT = 0, breathT = 0, breathW = 0;
  const ease = (x) => x * x * x * (x * (x * 6 - 15) + 10);
  const startFade = (from, to, dur, toPhase) => { to.enabled = true; to.setEffectiveWeight(0); fade = { from, to, dur, t: 0 }; phase = toPhase; };
  let toDance = () => { danceT = 0; danceAct.reset().play(); danceAct.setEffectiveWeight(0); startFade(clapAct, danceAct, FADE_TO_DANCE, 'dance'); };
  // back to the standing pose (frame 0 of the gesture clip), held still while paused, then the sequence restarts
  let toRun = null;
  let toStand = () => { if (V3) { runT = 0; clapAct.reset().play(); clapAct.setEffectiveWeight(0); startFade(danceAct, clapAct, FADE_TO_DANCE, 'clap'); return; } clapAct.reset().play(); clapAct.time = 0; clapAct.paused = true; clapAct.setEffectiveWeight(0); startFade(danceAct, clapAct, FADE_TO_STAND, 'rest'); };
  let toDive = null, toFight = null, toRest = null, restGo = null;
  if (V3) {
    // every move starts from the standing pose and ends back in it (the standing pose is frame 0 of the gesture clip)
    // the pauses alternate: fist-and-palm salute, steady, salute, steady
    const REST_ORDER = [standAct]; let restI = 0, restAct = standAct, restNext = null;
    toRest = (from, next) => { restNext = next; restT = 0; restAct = REST_ORDER[restI++ % REST_ORDER.length]; restAct.reset().play(); restAct.time = REST_AT; restAct.paused = true; restAct.setEffectiveWeight(0); startFade(from, restAct, REST_BLEND, 'rest'); };
    toDance = () => { danceT = 0; danceAct.reset().play(); danceAct.timeScale = DANCE_RATE; danceAct.setEffectiveWeight(0); startFade(restAct, danceAct, 0.8, 'dance'); };
    toRun = () => { runT = 0; clapAct.reset().play(); clapAct.timeScale = RUN_RATE; clapAct.setEffectiveWeight(0); startFade(restAct, clapAct, 0.8, 'clap'); };
    toFight = () => { fightT = 0; fightAct.reset().play(); fightAct.timeScale = FIGHT_RATE; fightAct.setEffectiveWeight(0); startFade(restAct, fightAct, FIGHT_IN, 'fight'); };
    toDive = () => { diveT = 0; diveAct.reset().play(); diveAct.timeScale = DIVE_RATE; diveAct.setEffectiveWeight(0); startFade(restAct, diveAct, DIVE_IN, 'dive'); };
    restGo = () => restNext && restNext();
  }

  const clock = new THREE.Clock();
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(host);

  const step = (dt) => {
    if (fade) {
      fade.t += dt;
      const k = Math.min(1, fade.t / fade.dur), w = ease(k);
      fade.to.setEffectiveWeight(w);
      fade.from.setEffectiveWeight(1 - w);
      if (k >= 1) { fade.from.enabled = false; fade.to.setEffectiveWeight(1); fade = null; restT = 0; }
    }
    mixer.update(dt);
    if (fist && foldAct) fist.influence = 0;
    if (V3) {   // a slow breath while he waits: a hair of chest rise and fall, eased in and out so it never pops
      breathT += dt; breathW += (((phase === 'rest' && !fade) ? 1 : 0) - breathW) * Math.min(1, dt * 2.5);
      model.scale.y = 1 + breathW * 0.009 * Math.sin(breathT * 2.1); model.scale.x = model.scale.z = 1 - breathW * 0.004 * Math.sin(breathT * 2.1);
    }
    if (V3) { const dw = diveAct.getEffectiveWeight(); model.position.y = fallExtra && dw > 0 ? fallExtra * dw * Math.pow(Math.max(0, 1 - diveAct.time / 0.8), 1.4) : 0; model.updateMatrixWorld(true); }
    updateShadow();
    if (danceAct && !fade) {
      if (V3) {
        if (phase === 'dive' && (diveT += dt) >= diveClip.duration / DIVE_RATE - REST_BLEND) toRest(diveAct, toDance);
        else if (phase === 'dance' && (danceT += dt) >= danceClip.duration / DANCE_RATE - REST_BLEND) toRest(danceAct, toRun);
        else if (phase === 'clap' && (runT += dt) >= RUN_FOR) toRest(clapAct, toFight);
        else if (phase === 'fight' && (fightT += dt) >= fightClip.duration / FIGHT_RATE - REST_BLEND) toRest(fightAct, toDive);
        else if (phase === 'rest' && (restT += dt) >= REST_HOLD) restGo();
      }
      else if (phase === 'clap' && clapAct.time >= CLAP_UNTIL) toDance();
      else if (phase === 'dance' && danceAct.time >= danceClip.duration - FADE_TO_STAND) toStand();
      else if (phase === 'rest') {
        restT += dt;
        if (restT >= REST_FOR) { clapAct.paused = false; phase = 'clap'; }
      }
    }
  };
  if (location.hash === '#debug') window.__ninjaDebug = { scene, step, model, mixer, clapAct, danceAct, get framing() { return framing; }, camera, get phase() { return phase; } };

  // One-off GPU work (texture upload, shader compile) in idle slices, so it never stalls the loader's animation
  for (const t of Object.values(textures)) { await idle(); renderer.initTexture(t); }
  await idle();
  await precompile(renderer, scene, camera);
  await idle();

  // first frame is ready (under the loader); tell the loader, then wait for its reveal before animating
  renderer.render(scene, camera);
  host.classList.add('is-live');
  if (snap) window.__ninjaSnapshot = () => { renderer.render(scene, camera); return canvas.toDataURL('image/webp', 0.92); };
  progress?.done('hero-frame');

  await gate;
  clock.getDelta();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!visible || document.hidden || document.documentElement.classList.contains('is-game')) return;
    if (!reduce && !(window.__ninjaDebug && window.__ninjaDebug.manual)) step(dt);
    renderer.render(scene, camera);
  });
}
