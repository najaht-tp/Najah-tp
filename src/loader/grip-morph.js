// The ninja's rig has no finger bones, so its hand is an open mitten. To let the hand actually hold the katana, the
// fingers are curled with a morph target: the finger vertices are bent as a smooth arc about a hinge line across the
// hand, computed once from the real mesh in the hand bone's own frame. Blend it in (influence 0..1) when the sword is
// drawn and the fingers close around the handle; blend it out and the hand is untouched.
import * as THREE from 'three';

export function createGripMorph(skinnedMesh, handBone) {
  const geo = skinnedMesh.geometry;
  const skeleton = skinnedMesh.skeleton, hi = skeleton.bones.indexOf(handBone);
  const toLocal = new THREE.Matrix4().multiplyMatrices(skeleton.boneInverses[hi], skinnedMesh.bindMatrix);   // mesh -> hand-bone local (cm)
  const toMesh = toLocal.clone().invert();
  const pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;

  // hand vertices (with how strongly the hand bone drives them), in the hand bone's frame
  const idx = [], wts = [], loc = [];
  for (let i = 0; i < pos.count; i++) {
    let w = 0; for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === hi) w += sw.getComponent(i, k);
    if (w < 0.5) continue;
    idx.push(i); wts.push(w); loc.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(toLocal));
  }

  const base = new Float32Array(pos.count * 3);
  geo.morphAttributes.position = [new THREE.BufferAttribute(base, 3)];
  geo.morphTargetsRelative = true;
  skinnedMesh.updateMorphTargets();
  skinnedMesh.morphTargetInfluences[0] = 0;

  // build({ y0, length, angle, fold }): hinge at y0 (cm along the hand's +Y), bend the fingers over `length` cm by `angle`
  // radians toward the `fold` direction (a unit vector perpendicular to +Y in the hand's frame)
  const build = ({ y0 = 13, length = 9, angle = 1.75, fold = new THREE.Vector3(0, 0, -1) } = {}) => {
    const Yh = new THREE.Vector3(0, 1, 0), d = fold.clone().normalize(), A = new THREE.Vector3().crossVectors(Yh, d).normalize();
    let q0 = 0, n = 0;
    for (const p of loc) if (p.y > y0 + 3) { q0 += p.dot(d); n++; }
    q0 = n ? q0 / n : 0;                                                      // the fingers' centre line along the fold direction
    const kappa = angle / length, r = 1 / kappa;
    const out = geo.morphAttributes.position[0].array; out.fill(0);
    const q = new THREE.Vector3(), moved = new THREE.Vector3(), orig = new THREE.Vector3();
    for (let j = 0; j < idx.length; j++) {
      const p = loc[j], s = p.y - y0;
      if (s <= 0) continue;
      const along = Math.min(s, length), phi = kappa * along, extra = Math.max(0, s - length);
      const qr = p.dot(d) - q0, a = p.dot(A);
      const Yp = y0 + r * Math.sin(phi) - qr * Math.sin(phi) + extra * Math.cos(phi);
      const Dp = q0 + r * (1 - Math.cos(phi)) + qr * Math.cos(phi) + extra * Math.sin(phi);
      moved.copy(Yh).multiplyScalar(Yp).addScaledVector(d, Dp).addScaledVector(A, a);
      moved.applyMatrix4(toMesh);
      orig.fromBufferAttribute(pos, idx[j]);
      const w = Math.min(1, wts[j]);
      out[idx[j] * 3] = (moved.x - orig.x) * w; out[idx[j] * 3 + 1] = (moved.y - orig.y) * w; out[idx[j] * 3 + 2] = (moved.z - orig.z) * w;
    }
    geo.morphAttributes.position[0].needsUpdate = true;
    geo.dispose();   // three bakes morph targets into a texture once; dropping the GPU copy makes it re-upload the new shape
  };
  build();

  return { build, set influence(v) { skinnedMesh.morphTargetInfluences[0] = v; }, get influence() { return skinnedMesh.morphTargetInfluences[0]; } };
}
