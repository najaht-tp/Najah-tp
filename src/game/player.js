// The ninja: model, katana, and the animation state manager.
//
// The game owns the physics (position, velocity, grounded); this module only turns that state into a pose.
// All clips play at once and are blended by weight. Clip time is advanced by hand, so the long clips (jump, combo)
// can be cut to the windows the game needs. Root motion is removed every frame: the hips stay over the feet, and
// in the air the clip's own jump height is cancelled because physics already lifts the character.
import * as THREE from 'three';
import { CLIPS, CLIP_WINDOWS as W, CHARACTER as C, TUNING as T } from './config.js';

const DEG = Math.PI / 180;
const findClip = (clips, words) => clips.find((c) => words.some((w) => c.name.toLowerCase().includes(w)));

export function createPlayer(scene, assets) {
  const root = new THREE.Group();          // at the feet; moved by the game
  const body = new THREE.Group();          // procedural tilt and squash on top of the clips
  root.add(body); scene.add(root);

  const model = assets.ninja.scene;
  body.add(model);
  model.rotation.y = C.facing;
  let material = null;
  const { base, normal, mr } = assets.textures;
  model.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    m.map = base; m.normalMap = normal; m.metalnessMap = mr; m.roughnessMap = mr;
    m.emissive = new THREE.Color('#ff2a3d'); m.emissiveIntensity = 0; m.needsUpdate = true;
    o.castShadow = true; o.frustumCulled = false;
    material = m;
  });

  const bones = {}; const allBones = [];
  model.traverse((o) => { if (o.isBone) { allBones.push(o); for (const [k, re] of Object.entries(C.bones)) if (!bones[k] && re.test(o.name)) bones[k] = o; } });

  // ── clips ──
  const mixer = new THREE.AnimationMixer(model);
  const clips = assets.ninja.animations;
  const act = {};
  for (const [state, words] of Object.entries(CLIPS)) {
    const clip = findClip(clips, words);
    if (!clip) continue;
    const a = mixer.clipAction(clip);
    a.play(); a.timeScale = 0; a.setEffectiveWeight(0);
    act[state] = a;
  }
  // graceful fallbacks: a missing clip borrows another one (the pose code adds motion on top)
  act.idle ||= act.run || Object.values(act)[0];
  act.run ||= act.idle;
  const has = { jump: !!act.jump, attack: !!act.attack, victory: !!act.victory };
  const weight = Object.fromEntries(Object.keys(act).map((k) => [k, 0]));
  const time = Object.fromEntries(Object.keys(act).map((k) => [k, 0]));
  const dur = (k) => (act[k] ? act[k].getClip().duration : 1);

  // ── measure the standing pose: height, feet and hips rest offset ──
  const solo = (k, t) => { for (const a of Object.values(act)) a.setEffectiveWeight(0); act[k].setEffectiveWeight(1); act[k].time = t; mixer.update(0); };
  solo('idle', 0.5); model.updateMatrixWorld(true);
  const v = new THREE.Vector3(), box = new THREE.Box3();
  allBones.forEach((b) => box.expandByPoint(v.setFromMatrixPosition(b.matrixWorld)));
  const h0 = box.max.y - box.min.y;
  const scale = C.height / (h0 * 1.11);                     // 1.11: soles below the ankles and the head above its top bone
  model.scale.setScalar(scale);
  const baseY = -(box.min.y - h0 * 0.04) * scale;           // feet on y = 0
  model.position.y = baseY;
  root.updateMatrixWorld(true);
  const rest = new THREE.Vector3();
  const hipsLocal = () => { bones.hips.getWorldPosition(v); return root.worldToLocal(v); };
  if (bones.hips) rest.copy(hipsLocal());

  // running speed of the clip, so the feet do not slide: how far a foot travels back while planted
  let runRate = 1.4;
  if (act.run && bones.foot && act.run !== act.idle) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 24; i++) {
      solo('run', (i / 24) * dur('run'));
      model.position.set(0, baseY, 0); root.updateMatrixWorld(true);
      const fx = root.worldToLocal(bones.foot.getWorldPosition(v)).x - hipsLocal().x;
      lo = Math.min(lo, fx); hi = Math.max(hi, fx);
    }
    const native = (2 * (hi - lo)) / dur('run');
    if (native > 0.5) runRate = THREE.MathUtils.clamp(T.speed / native, 0.8, 2.2);
  }

  // ── katana, attached to the right hand every frame ──
  const H = C.height;
  const K = C.katana;
  const katana = new THREE.Group();
  const kModel = assets.katana.scene;
  kModel.position.x = -K.handleCentre;
  const turn = new THREE.Group(); turn.rotation.y = Math.PI; turn.add(kModel);       // blade along +X
  turn.scale.setScalar((K.lengthOfHeight * H * 1.0) / K.modelLength);
  katana.add(turn); scene.add(katana);
  kModel.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  const gripPos = new THREE.Vector3(K.gripPos[0] * H, K.gripPos[1] * H, K.gripPos[2] * H);
  const gripQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(K.gripEuler[0] * DEG, K.gripEuler[1] * DEG, K.gripEuler[2] * DEG));
  const P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
  const tipLocal = new THREE.Vector3(K.lengthOfHeight * H * (1 - K.handleCentre / K.modelLength * 0.5), 0, 0);
  const tip = new THREE.Vector3();

  // ── state ──
  let state = 'idle', stateT = 0;
  let airT = 0, spinFrom = W.jump.air;
  let attackT = -1;                   // clip time of the running attack, -1 when not attacking
  let hitT = 0, landT = 0, victoryT = 0;
  const blendTo = (targets, dt, rate = 12) => {
    const k = 1 - Math.exp(-dt * rate);
    for (const n of Object.keys(weight)) weight[n] += ((targets[n] || 0) - weight[n]) * k;
  };

  const api = {
    root, katana, runRate, height: H, has,
    get state() { return state; },
    setState(s) { if (s === state) return; if (s === 'air' && state !== 'air') { airT = 0; spinFrom = W.jump.air; } if (s === 'land') landT = 0; if (s === 'victory') victoryT = 0; state = s; stateT = 0; },
    doubleJump() { airT = 0; spinFrom = W.jump.air + 0.12; },
    attack() { attackT = W.attack.from; },
    get attacking() { return attackT >= 0; },
    // true while the blade is in its cutting arc
    get cutting() { return attackT >= W.attack.hitFrom && attackT <= W.attack.hitTo; },
    hit() { hitT = 0.45; },
    tip,
    update(dt, phys) {
      stateT += dt;
      const targets = {};
      // base layer
      if (state === 'idle') { time.idle = (time.idle + dt) % dur('idle'); targets.idle = 1; }
      else if (state === 'run' || state === 'fall') { time.run = (time.run + dt * runRate * (state === 'fall' ? 0.35 : 1)) % dur('run'); targets.run = 1; }
      else if (state === 'air') {
        airT += dt;
        if (has.jump) {
          const span = W.jump.land - spinFrom, expected = (2 * T.jumpVelocity) / T.gravity;
          time.jump = Math.min(spinFrom + (airT / expected) * span, W.jump.land - 0.02);
          targets.jump = 1;
        } else { targets.run = 1; }
      } else if (state === 'land') {
        landT += dt;
        if (has.jump) { time.jump = Math.min(W.jump.land + landT * 2.6, W.jump.end); targets.jump = Math.max(0, 1 - landT / 0.18); }
        time.run = (time.run + dt * runRate) % dur('run');
        targets.run = 1 - (targets.jump || 0);
      } else if (state === 'victory') {
        victoryT += dt;
        if (has.victory) { const span = W.victory.loopTo - W.victory.from; time.victory = W.victory.from + (victoryT % span); targets.victory = 1; }
        else { time.idle = (time.idle + dt) % dur('idle'); targets.idle = 1; }
      }
      // attack layer: replaces the upper body motion while it lasts
      if (attackT >= 0) {
        attackT += dt * W.attack.rate;
        if (attackT >= W.attack.to) attackT = -1;
        else if (has.attack) { time.attack = attackT; const k = Math.min(1, (attackT - W.attack.from) / 0.08, (W.attack.to - attackT) / 0.12); for (const n in targets) targets[n] *= 1 - k * 0.95; targets.attack = k; }
      }
      blendTo(targets, dt, state === 'air' ? 18 : 12);
      for (const [n, a] of Object.entries(act)) { a.setEffectiveWeight(weight[n]); a.time = time[n]; }
      mixer.update(0);

      // remove root motion (and, in the air, the clip's own jump height)
      model.position.set(0, baseY, 0);
      root.updateMatrixWorld(true);
      if (bones.hips) {
        const hp = hipsLocal();
        model.position.x -= hp.x - rest.x; model.position.z -= hp.z - rest.z;
        const airW = (weight.jump || 0);
        model.position.y -= (hp.y - rest.y) * airW * 0.9;
      }

      // procedural layer: lean while running fast, tilt when falling, squash on landing, recoil when hit
      hitT = Math.max(0, hitT - dt);
      const squash = state === 'land' ? Math.sin(Math.min(1, landT / 0.18) * Math.PI) * 0.08 : 0;
      body.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);
      const fallTilt = state === 'fall' ? -0.18 : 0;
      const recoil = hitT > 0 ? Math.sin((hitT / 0.45) * Math.PI) * 0.35 : 0;
      body.rotation.z += ((fallTilt + recoil) - body.rotation.z) * Math.min(1, dt * 10);
      material.emissiveIntensity = hitT > 0 ? (Math.sin(hitT * 40) > 0 ? 0.55 : 0.1) : 0;
      root.updateMatrixWorld(true);

      // katana in the fist
      bones.hand.matrixWorld.decompose(P, Q, S);
      katana.position.copy(P).add(v.copy(gripPos).applyQuaternion(Q));
      katana.quaternion.copy(Q).multiply(gripQ);
      katana.updateMatrixWorld(true);
      tip.copy(tipLocal).applyMatrix4(katana.matrixWorld);
      if (phys) phys.tip = tip;
    },
    setVisible(on) { root.visible = on; katana.visible = on; },
    flash(on) { body.visible = on; katana.visible = on; },
    dispose() { mixer.stopAllAction(); scene.remove(root); scene.remove(katana); },
  };
  api.update(0);
  return api;
}
