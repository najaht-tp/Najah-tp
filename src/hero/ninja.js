// Hero ninja: real-time 3D, plays the gesture clip, blends into the dance, settles, rests, repeats.
// The transparent still image (same standing pose) covers the load, then crossfades to the canvas.
// It reports its readiness to the loader and waits for the loader's reveal before the sequence starts.
import * as THREE from 'three';
import { loadModel, loadTextures, applyTextures, createContactShadow, idle, precompile } from '../shared/assets.js';

const CLIP   = 'Agree_Gesture';   // plays first, until CLAP_UNTIL
const DANCE  = 'All_Night_Dance'; // then blends into this one, plays through once, then settles
const CLAP_UNTIL = 5.5;          // clip time (s) at which the gesture hands over to the dance
const REST_FOR = 3;              // after the dance the ninja settles into a standing pose and holds it this long (s), then the whole sequence restarts
const FADE_TO_DANCE = 0.9, FADE_TO_STAND = 1.2;  // blend lengths (s)
const SOLE_OFFSET = 0.008;       // how far below the lowest bone the soles (and shadow) sit, as a fraction of body height

export async function initHeroNinja({ progress, gate = Promise.resolve() }) {
  const host   = document.getElementById('ninja');
  const canvas = document.getElementById('ninja-canvas');
  if (!host || !canvas) return;
  const snap   = location.hash === '#snap';   // dev only: freeze on frame 0 and expose a PNG grab for the placeholder
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || snap;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(snap ? 2 : Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a2024, 1.7));
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(2.5, 4, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff2a36, 2.6); rim.position.set(-4, 2, -3); scene.add(rim);

  const camera = new THREE.PerspectiveCamera(28, 4 / 5, 0.01, 50);

  let framing = null;   // { size, mid } measured over every pose of every clip
  const frame = () => {
    if (!framing) return;
    const { size, mid } = framing;
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const distV = (size.y / 2) / t;
    const distH = (size.x / 2) / (t * camera.aspect);   // keep the full arm span in view on narrow canvases
    const dist = Math.max(distV, distH) + size.z / 2;
    camera.position.set(mid.x, mid.y, mid.z + dist);
    camera.lookAt(mid);
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

  const TEX = window.__NINJA_TEX__ || { base: 'assets/tex-base.webp', normal: 'assets/tex-normal.webp', mr: 'assets/tex-mr.webp' };
  let gltf, textures;
  try {
    gltf = await loadModel({ embedded: window.__NINJA_GLB__, url: 'assets/ninja-clap.min.glb' });
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
  const clip = THREE.AnimationClip.findByName(gltf.animations, CLIP);
  const danceClip = THREE.AnimationClip.findByName(gltf.animations, DANCE);
  const mixer = new THREE.AnimationMixer(model);
  const clapAct = mixer.clipAction(clip);
  const danceAct = danceClip && mixer.clipAction(danceClip);

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
  clapAct.reset().play();
  mixer.setTime(0);   // applies frame 0 right away, even when the clip is not being advanced
  updateShadow();
  if (danceAct) { danceAct.setLoop(THREE.LoopOnce, 1); danceAct.clampWhenFinished = true; }

  // Blends are driven by hand with an ease-in-out curve (smootherstep) so neither clip lurches in or out.
  let phase = 'clap', fade = null, restT = 0;
  const ease = (x) => x * x * x * (x * (x * 6 - 15) + 10);
  const startFade = (from, to, dur, toPhase) => { to.enabled = true; to.setEffectiveWeight(0); fade = { from, to, dur, t: 0 }; phase = toPhase; };
  const toDance = () => { danceAct.reset().play(); danceAct.setEffectiveWeight(0); startFade(clapAct, danceAct, FADE_TO_DANCE, 'dance'); };
  // back to the standing pose (frame 0 of the gesture clip), held still while paused, then the sequence restarts
  const toStand = () => { clapAct.reset().play(); clapAct.time = 0; clapAct.paused = true; clapAct.setEffectiveWeight(0); startFade(danceAct, clapAct, FADE_TO_STAND, 'rest'); };

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
    updateShadow();
    if (danceAct && !fade) {
      if (phase === 'clap' && clapAct.time >= CLAP_UNTIL) toDance();
      else if (phase === 'dance' && danceAct.time >= danceClip.duration - FADE_TO_STAND) toStand();
      else if (phase === 'rest') {
        restT += dt;
        if (restT >= REST_FOR) { clapAct.paused = false; phase = 'clap'; }
      }
    }
  };
  if (location.hash === '#debug') window.__ninjaDebug = { step, model, mixer, clapAct, danceAct, get phase() { return phase; } };

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
