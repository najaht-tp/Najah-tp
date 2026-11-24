// The katana as a real 3D object, rigidly attached to the ninja's hand bone.
//
// Every frame the sword's transform is computed from the hand bone's world matrix plus a fixed grip offset, so it
// can never slip, drift or separate from the fist, whatever the pose does. Independent motion (the draw, the roll
// and the big slash) is layered on top as small, explicit rotations about the grip.
//
// A second, sheathed copy rides in the ninja's belt at his left hip (scabbard + hilt) from the very first frame,
// so the sword is with him all the way; when it is drawn the hilt at his hip hides and the blade appears in his hand.
//
// Local frame: +X runs along the blade, +Y is the spine (back) of the blade, +Z is its thickness. The origin is the
// middle of the handle, which is where the fist closes.
import * as THREE from 'three';

const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// size: scales the whole sword (the chibi ninja carries a smaller one); polished: steel and lacquer that read well under studio light;
// backBone: when given, a sheathed copy rides on that bone
export function createKatana3D({ scene, handBone, H, size = 1, polished = false, backBone = null }) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const U = H * size;                                      // sizes below are relative to this
  const HANDLE = 0.15 * U, GUARD_T = 0.012 * U, BLADE = 0.40 * U;
  const hx = HANDLE / 2;                                   // handle spans x: -hx .. +hx
  const bladeX0 = hx + GUARD_T + 0.002 * U;

  // blade outline: a gently curved, tapered leaf shape
  const bladeCurve = (u) => 0.075 * BLADE * u * u;           // how far the spine bows at u = 0..1 along the blade
  const half = (u) => 0.034 * U * (1 - 0.62 * Math.pow(u, 1.5)) * (u > 0.93 ? (1 - u) / 0.07 * 0.6 + 0.4 : 1);
  const outline = (wScale, tipExtra) => {
    const N = 36, shape = new THREE.Shape();
    for (let i = 0; i <= N; i++) { const u = i / N, x = u * BLADE, y = bladeCurve(u) + half(u) * 0.62 * wScale; i ? shape.lineTo(x, y) : shape.moveTo(x, y); }
    shape.lineTo(BLADE + tipExtra, bladeCurve(1) + 0.004 * U);
    for (let i = N; i >= 0; i--) { const u = i / N; shape.lineTo(u * BLADE, bladeCurve(u) - half(u) * 0.5 * wScale); }
    return shape;
  };

  // ── the blade: steel with a brighter edge and a wavy temper line (hamon), drawn with vertex colours ──
  const bladeGeo = new THREE.ExtrudeGeometry(outline(1, 0.012 * U), { depth: 0.006 * U, bevelEnabled: true, bevelThickness: 0.0016 * U, bevelSize: 0.0014 * U, bevelSegments: 1, curveSegments: 1 });
  bladeGeo.translate(0, 0, -0.003 * U);
  {
    const p = bladeGeo.attributes.position, col = new Float32Array(p.count * 3), body = new THREE.Color(polished ? '#c3ccd6' : '#dfe4e9'), edge = new THREE.Color(polished ? '#ffffff' : '#dfe4e9'), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const u = Math.min(1, Math.max(0, p.getX(i) / BLADE)), cv = bladeCurve(u), h = half(u);
      const v = (p.getY(i) - (cv - h * 0.5)) / (h * 1.12);                         // 0 at the cutting edge .. 1 at the back
      const t = smooth(0.26 + 0.035 * Math.sin(u * 38), 0.36 + 0.035 * Math.sin(u * 38), v);
      c.copy(edge).lerp(body, t); col.set([c.r, c.g, c.b], i * 3);
    }
    bladeGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const bladeMat = new THREE.MeshStandardMaterial(polished
    ? { vertexColors: true, metalness: 0.2, roughness: 0.36, emissive: '#ffffff', emissiveIntensity: 0.1 }
    : { color: '#dfe4e9', metalness: 0.5, roughness: 0.26, emissive: '#ffffff', emissiveIntensity: 0 });
  const blade = new THREE.Mesh(bladeGeo, bladeMat);
  const bladePivot = new THREE.Group();                      // scaled along X to "draw" the blade out of the guard
  bladePivot.position.x = bladeX0;
  bladePivot.add(blade);
  group.add(bladePivot);

  // ── fittings, shared by the sword in the hand and the one on his back ──
  const gold = new THREE.MeshStandardMaterial({ color: '#c8a24a', metalness: 0.85, roughness: 0.32 });
  const tsubaMat = new THREE.MeshStandardMaterial(polished ? { color: '#171a21', metalness: 0.7, roughness: 0.35 } : { color: '#c31826', roughness: 0.42, metalness: 0.2 });
  const crimson = new THREE.MeshStandardMaterial({ color: '#c31826', roughness: 0.42, metalness: 0.15 });
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = '#12161c'; g.fillRect(0, 0, 256, 64);
  g.strokeStyle = '#c31826'; g.lineWidth = 7; g.lineJoin = 'round';
  for (let i = 0; i < 4; i++) { const x = i * 64 + 32; g.beginPath(); g.moveTo(x - 30, 32); g.lineTo(x, 6); g.lineTo(x + 30, 32); g.lineTo(x, 58); g.closePath(); g.stroke(); }
  const wrap = new THREE.CanvasTexture(c); wrap.colorSpace = THREE.SRGBColorSpace; wrap.wrapS = THREE.RepeatWrapping; wrap.anisotropy = 4;
  const handleMat = new THREE.MeshStandardMaterial({ map: wrap, roughness: 0.55, metalness: 0.1 });
  const addHilt = (parent) => {
    const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.038 * U, 0.038 * U, GUARD_T, 32), tsubaMat);          // tsuba
    guard.rotation.z = Math.PI / 2; guard.position.x = hx + GUARD_T / 2; parent.add(guard);
    if (polished) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.038 * U, 0.0028 * U, 8, 40), crimson); ring.rotation.y = Math.PI / 2; ring.position.x = hx + GUARD_T / 2; parent.add(ring); }
    const habaki = new THREE.Mesh(new THREE.CylinderGeometry(0.0125 * U, 0.0125 * U, 0.012 * U, 14), gold);          // blade collar
    habaki.rotation.z = Math.PI / 2; habaki.position.x = hx + GUARD_T + 0.006 * U; parent.add(habaki);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.0165 * U, 0.0165 * U, HANDLE, 20, 1), handleMat);     // tsuka
    handle.rotation.z = Math.PI / 2; parent.add(handle);
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.02 * U, 16, 12), crimson);                             // kashira
    pommel.position.x = -hx - 0.006 * U; pommel.scale.set(0.8, 1, 1); parent.add(pommel);
    return parent;
  };
  addHilt(group);

  // ── how the hand holds it ──
  // grip.pos: offset from the hand bone's origin (in the bone's own axes, world units); grip.quat: sword orientation
  // relative to the bone. These two are the whole "grip"; calibrated visually against the combo poses.
  const grip = { pos: new THREE.Vector3(-0.002 * H, 0.079 * H, -0.008 * H), euler: new THREE.Euler(40 * Math.PI / 180, 0, Math.PI / 2) };
  const gripQuat = new THREE.Quaternion().setFromEuler(grip.euler);

  // independent motion, animated by the timeline
  const K = { visible: 0, reveal: 1, scale: 1, roll: 0, swing: 0, glint: 0, grip: 0, sheathed: 1 };   // grip: 0 open hand .. 1 fingers closed on the handle; sheathed: 1 = the sword is in his belt
  const swingAxis = new THREE.Vector3(0, 0, 1);               // slashes sweep in the screen plane (camera looks down -Z)

  // ── the sheathed copy on his back ──
  let back = null, backHilt = null;
  const backOffset = new THREE.Vector3(), backQuat = new THREE.Quaternion();
  if (backBone) {
    back = new THREE.Group(); back.visible = true; scene.add(back);
    const sayaGeo = new THREE.ExtrudeGeometry(outline(1.5, 0.004 * U), { depth: 0.022 * U, bevelEnabled: true, bevelThickness: 0.004 * U, bevelSize: 0.003 * U, bevelSegments: 2, curveSegments: 1 });
    sayaGeo.translate(0, 0, -0.011 * U);
    const saya = new THREE.Mesh(sayaGeo, new THREE.MeshStandardMaterial({ color: '#0d0f14', metalness: 0.25, roughness: 0.28 }));
    saya.position.x = bladeX0; back.add(saya);
    const band = (u0, w) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w * BLADE, 0.1 * U, 0.03 * U), crimson); m.position.set(bladeX0 + (u0 + w / 2) * BLADE, bladeCurve(u0 + w / 2) + 0.004 * U, 0); m.rotation.z = Math.atan(0.15 * (u0 + w / 2)); back.add(m); };
    band(0.0, 0.05); band(0.24, 0.03);                         // mouth collar and a binding
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.02 * U, 14, 10), crimson); tip.scale.set(1.3, 1, 0.8);     // end cap
    tip.position.set(bladeX0 + BLADE, bladeCurve(1) + 0.004 * U, 0); back.add(tip);
    backHilt = addHilt(new THREE.Group()); back.add(backHilt);
    // carried in the belt at his right hip, where his right hand draws it: hilt forward at the belly, scabbard sweeping back and down past the hip, edge up
    const dir = new THREE.Vector3(-0.6, -0.65, -0.45).normalize(), up = new THREE.Vector3(0, -1, 0);
    const yb = up.clone().sub(dir.clone().multiplyScalar(up.dot(dir))).normalize(), zb = new THREE.Vector3().crossVectors(dir, yb).normalize();
    backQuat.setFromRotationMatrix(new THREE.Matrix4().makeBasis(dir, yb, zb));
    backOffset.set(-0.06 * H, 0.06 * H, 0.085 * H);
  }

  const P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), tmp = new THREE.Vector3();
  const swingQ = new THREE.Quaternion(), rollQ = new THREE.Quaternion(), finalQ = new THREE.Quaternion();
  const tip = new THREE.Vector3(), inner = new THREE.Vector3();

  // Call after the rig has been posed and its matrices updated. Returns the blade's tip and an inner point (world).
  const update = () => {
    if (back) {
      backBone.matrixWorld.decompose(P, Q, S);
      back.position.copy(P).add(tmp.copy(backOffset).applyQuaternion(Q));
      back.quaternion.copy(Q).multiply(backQuat);
      backHilt.visible = K.sheathed > 0.5;
    }
    group.visible = K.visible > 0.01;
    handBone.matrixWorld.decompose(P, Q, S);
    group.position.copy(P).add(tmp.copy(grip.pos).applyQuaternion(Q));
    rollQ.setFromAxisAngle(X, K.roll);
    finalQ.copy(Q).multiply(gripQuat).multiply(rollQ);
    group.quaternion.copy(finalQ);
    group.scale.setScalar(K.scale);
    bladePivot.scale.x = Math.max(K.reveal, 0.001);
    bladeMat.emissiveIntensity = (polished ? 0.1 : 0) + K.glint * 0.9;
    // blade points in world space (for the trail)
    group.updateMatrixWorld(true);
    tip.set(bladeX0 + BLADE, bladeCurve(1), 0).applyMatrix4(group.matrixWorld);          // note: reveal scales about bladeX0
    inner.set(bladeX0 + BLADE * 0.74, bladeCurve(0.74), 0).applyMatrix4(group.matrixWorld);
    // scale about the guard when the blade is partly drawn
    const guardW = tmp.set(bladeX0, 0, 0).applyMatrix4(group.matrixWorld).clone();
    tip.sub(guardW).multiplyScalar(K.reveal).add(guardW);
    inner.sub(guardW).multiplyScalar(K.reveal).add(guardW);
    return { tip, inner };
  };

  const setGrip = ({ pos, euler }) => { if (pos) grip.pos.set(pos[0] * H, pos[1] * H, pos[2] * H); if (euler) { grip.euler.set(euler[0], euler[1], euler[2]); gripQuat.setFromEuler(grip.euler); } };

  return { group, back, K, update, setGrip, grip, tip, inner, swingAxis, bladeLength: BLADE, H };
}
