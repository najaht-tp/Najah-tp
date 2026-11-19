// The loader's 3D ninja. Pure rendering: the loader timeline decides the pose (clip times and weights) and where
// the ninja is on screen; this module just poses the rig, frames the camera and reports where the hand/feet are.
import * as THREE from 'three';
import { loadModel, loadTextures, applyTextures, createContactShadow, idle, precompile } from '../shared/assets.js';
import { createKatana3D } from './katana3d.js';
import { createTrail } from './trail3d.js';
import { createGripMorph } from './grip-morph.js';

const JUMP = '_360_Power_Spin_Jump', COMBO = 'Double_Combo_Attack';
const FEET_AT_MAX = 0.72, FEET_AT_MIN = 0.58;   // where the feet sit (fraction of viewport height); the percentage UI reserves the bottom
const SOLE = 0.04;         // soles sit below the ankle bones (fraction of body height)

export async function createNinjaStage({ canvas, onProgress }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a2024, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(2.5, 4, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff2a36, 3.0); rim.position.set(-4, 2, -3); scene.add(rim);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 200);

  const gltf = await loadModel({ embedded: window.__LOADER_GLB__, url: 'assets/loader/ninja-loader.glb' });
  onProgress?.('model');
  const TEX = window.__LOADER_TEX__ || { base: 'assets/loader/tex-base.webp', normal: 'assets/loader/tex-normal.webp', mr: 'assets/loader/tex-mr.webp' };
  const textures = await loadTextures(TEX, (k) => onProgress?.('tex:' + k));
  applyTextures(gltf.scene, textures);

  const model = gltf.scene;
  const holder = new THREE.Group();            // moved around by the timeline
  holder.add(model); scene.add(holder);

  const mixer = new THREE.AnimationMixer(model);
  const acts = {
    jump: mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, JUMP)),
    combo: mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, COMBO)),
  };
  Object.values(acts).forEach((a) => { a.play(); a.setEffectiveWeight(0); });
  const durations = { jump: acts.jump.getClip().duration, combo: acts.combo.getClip().duration };

  // Measure the standing pose (end of the jump clip) from the bones; skinned-mesh bounds are unreliable here.
  const v = new THREE.Vector3(), box = new THREE.Box3();
  const bones = []; model.traverse((o) => o.isBone && bones.push(o));
  acts.jump.setEffectiveWeight(1); acts.jump.time = durations.jump - 0.05; mixer.update(0);
  model.updateMatrixWorld(true);
  bones.forEach((b) => box.expandByPoint(v.setFromMatrixPosition(b.matrixWorld)));
  acts.jump.setEffectiveWeight(0);
  const h0 = box.max.y - box.min.y;
  const H = h0 * (1 + SOLE + 0.07);            // full standing height incl. soles and head top
  const floor = box.min.y - h0 * SOLE;
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  model.position.set(-cx, 0, 0);               // centre the rig horizontally; the holder carries the animation

  const footBones = bones.filter((b) => /(Left|Right)(Foot|ToeBase)$/.test(b.name)), SOLE_H = h0 * SOLE;
  const SHADOW_UP = h0 * 0.012;                // lift the shadow so it hugs the soles
  const shadow = createContactShadow(H * 0.42);
  shadow.position.set(0, floor + SHADOW_UP, cz); scene.add(shadow);

  const handBone = bones.find((b) => /RightHand$/.test(b.name));
  const katana = createKatana3D({ scene, handBone, H });
  const trail = createTrail({ scene, H });
  let skinned = null; model.traverse((o) => { if (o.isSkinnedMesh) skinned = o; });
  const gripMorph = createGripMorph(skinned, handBone);                // closes the fingers around the handle
  // The slash is performed by the arm itself: the swing angle is shared between shoulder, elbow and wrist (each turning
  // about its own joint, in the screen plane), so the hand carries the sword instead of the sword spinning on its own.
  const armChain = [handBone.parent?.parent, handBone.parent, handBone].filter(Boolean);
  const armShare = armChain.length === 3 ? [0.15, 0.4, 0.45] : [0.5, 0.5];
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qr = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1), yAxis = new THREE.Vector3(0, 1, 0);
  const rotateWorld = (bone, axis, angle) => {                            // turn a bone about a world axis through its own joint
    qr.setFromAxisAngle(axis, angle);
    bone.getWorldQuaternion(qa).premultiply(qr);
    bone.parent.getWorldQuaternion(qb).invert();
    bone.quaternion.copy(qb.multiply(qa));
    bone.updateMatrixWorld(true);                                         // children follow before the next joint reads them
  };
  const swingArm = (angle) => { if (angle) armChain.forEach((bone, i) => rotateWorld(bone, zAxis, angle * armShare[i])); };
  // the whole torso takes part in the slash: twist about the vertical and lean in the screen plane, shared along the spine
  const spine = bones.filter((b) => /Spine/i.test(b.name) && b.parent);
  // The mixer only rewrites a bone when the clip time changes, so rotations added on top would pile up frame after frame
  // while the clip is held. Keep a clean copy of the animated pose and restore it before every frame.
  const mutBones = [...spine, ...armChain], cleanQ = mutBones.map((b) => b.quaternion.clone());
  const restoreClean = () => mutBones.forEach((b, i) => b.quaternion.copy(cleanQ[i]));
  const snapshotClean = () => mutBones.forEach((b, i) => cleanQ[i].copy(b.quaternion));
  const bodyAction = (twist, lean) => {
    if (!twist && !lean) return;
    spine.forEach((b) => { if (twist) rotateWorld(b, yAxis, twist / spine.length); if (lean) rotateWorld(b, zAxis, lean / spine.length); });
  };
  const view = { w: 1, h: 1, vh: 1, halfW: 1, standPx: 1, camY: 0 };
  let reserve = 0;                 // px kept free at the bottom for the percentage UI (set by the loader)

  const layout = () => {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const feetAt = Math.min(FEET_AT_MAX, Math.max(FEET_AT_MIN, 1 - reserve / h));
    const frac = Math.min(0.62, (w / h) * 0.8, feetAt - 0.08);   // how much of the viewport height the standing ninja fills
    const vh = H / frac;                                      // visible height at the ninja's depth
    const dist = (vh / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const camY = floor + (feetAt - 0.5) * vh;
    camera.position.set(0, camY, cz + dist);
    camera.lookAt(0, camY, cz);
    camera.near = dist / 50; camera.far = dist * 6;
    camera.updateProjectionMatrix();
    Object.assign(view, { w, h, vh, camY, halfW: (vh * camera.aspect) / 2, standPx: h * frac });
  };
  layout();
  new ResizeObserver(layout).observe(canvas);

  const project = (x, y, z) => {
    v.set(x, y, z).project(camera);
    return { x: (v.x * 0.5 + 0.5) * view.w, y: (-v.y * 0.5 + 0.5) * view.h };
  };

  // pose = { jumpT, jumpW, comboT, comboW, x, y, shake }  (x, y in standing heights; shake in heights)
  const api = {
    h: H,
    focusZoom: 0,
    setReserve(px) { reserve = px; layout(); },
    get view() { return view; },
    get halfWidthInHeights() { return view.halfW / H; },
    pose(p, dt = 1 / 60) {
      acts.jump.time = Math.min(p.jumpT, durations.jump - 0.001); acts.jump.setEffectiveWeight(p.jumpW);
      acts.combo.time = Math.min(p.comboT, durations.combo - 0.001); acts.combo.setEffectiveWeight(p.comboW);
      restoreClean();
      mixer.update(0);
      snapshotClean();
      holder.position.set((p.x + (p.lunge || 0)) * H, (p.y + (p.crouch || 0)) * H, 0);
      holder.updateMatrixWorld(true);                         // bones follow the new pose and position before the sword reads them
      // the push-in pivots around the feet (not the screen centre), so the ninja grows upward and the feet and shadow stay put
      const zoomK = 1 + (p.zoom || 0), pivotShift = (floor - view.camY) * (1 - 1 / zoomK);
      camera.position.x = (p.shakeX || 0) * H; camera.position.y = view.camY + pivotShift + (p.shakeY || 0) * H;
      camera.lookAt((p.shakeX || 0) * H * 0.4, view.camY + pivotShift, cz);
      if (api.debugAxes) {                                     // debug: show the hand bone's axes (x red, y green, z blue)
        if (!api._axes) { api._axes = new THREE.AxesHelper(0.12 * H); api._axes.matrixAutoUpdate = false; api._axes.renderOrder = 99; api._axes.material.depthTest = false; scene.add(api._axes); }
        const P = new THREE.Vector3(), Q = new THREE.Quaternion(), Sc = new THREE.Vector3();
        handBone.matrixWorld.decompose(P, Q, Sc); api._axes.matrix.compose(P, Q, new THREE.Vector3(1, 1, 1)); api._axes.matrixWorldNeedsUpdate = true; api._axes.updateMatrixWorld(true);
      }
      if (!api.focusZoom && (p.zoom || camera.zoom !== 1)) { camera.zoom = 1 + (p.zoom || 0); camera.updateProjectionMatrix(); }   // slow push-in toward the ninja
      if (api.focusZoom) { camera.zoom = api.focusZoom; camera.updateProjectionMatrix(); camera.lookAt(handBone.getWorldPosition(v)); }   // debug close-up on the hand
      // The shadow rides just under the feet, so the ninja always looks supported by the floor: it sits under the lowest
      // foot (a thin gap shows how high he is) and gets smaller and fainter the higher he is lifted.
      let lowY = Infinity, sx = 0;
      footBones.forEach((b) => { b.getWorldPosition(v); if (v.y < lowY) lowY = v.y; sx += v.x; });
      sx /= footBones.length;
      const gap = Math.max(0, lowY - SOLE_H - floor);                    // how far the soles are above the floor
      shadow.position.set(sx, floor + SHADOW_UP + gap * 0.9, cz);                      // follow the feet, leaving only a sliver under them
      const lift = Math.min(1, gap / (0.6 * H));
      shadow.material.opacity = 1 - 0.6 * lift;
      shadow.scale.setScalar(1 - 0.3 * lift);
      // the katana is gripped by the hand bone; the trail follows the blade tip
      bodyAction(p.twist, p.lean);                              // torso first, then the arm on top of it
      swingArm(katana.K.swing);                                 // arm, wrist and hand turn through the slash
      gripMorph.influence = katana.K.grip;                      // the fingers close as the sword is drawn
      const blade = katana.update();
      trail.update(dt, blade, p.trail ?? 1);
    },
    render() { renderer.render(scene, camera); },
    handScreen() {
      model.updateMatrixWorld(true);
      v.setFromMatrixPosition(handBone.matrixWorld);
      return project(v.x, v.y, v.z);
    },
    feetScreenAt(x, y) { return project(x * H, floor + y * H, cz); },
    dispose() {
      renderer.setAnimationLoop(null);
      scene.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); const m = o.material; ['map','normalMap','metalnessMap','roughnessMap'].forEach((k) => m[k]?.dispose?.()); m.dispose(); } });
      renderer.dispose();
      renderer.forceContextLoss?.();
    },
  };
  api.durations = durations;
  api.gripMorph = gripMorph; api.katana = katana; api.trail = trail; api.model = model; api.scene = scene; api.camera = camera; api.handBone = handBone;

  // Do the one-off GPU work now (shader compile, texture upload) in small idle slices, so the first animated frames never stall.
  for (const t of Object.values(textures)) { await idle(); renderer.initTexture(t); }
  await idle();
  await precompile(renderer, scene, camera);
  katana.group.visible = true; trail.mesh.visible = true; renderer.render(scene, camera); katana.group.visible = false; trail.mesh.visible = false;
  return api;
}
