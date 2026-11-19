// The katana as a real 3D object, rigidly attached to the ninja's hand bone.
//
// Every frame the sword's transform is computed from the hand bone's world matrix plus a fixed grip offset, so it
// can never slip, drift or separate from the fist, whatever the pose does. Independent motion (the draw, the roll
// and the big slash) is layered on top as small, explicit rotations about the grip.
//
// Local frame: +X runs along the blade, +Y is the spine (back) of the blade, +Z is its thickness. The origin is the
// middle of the handle, which is where the fist closes.
import * as THREE from 'three';

const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);

export function createKatana3D({ scene, handBone, H }) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  // sizes (in world units, relative to the ninja's standing height H)
  const HANDLE = 0.15 * H, GUARD_T = 0.012 * H, BLADE = 0.40 * H;
  const hx = HANDLE / 2;                                   // handle spans x: -hx .. +hx
  const bladeX0 = hx + GUARD_T + 0.002 * H;

  // blade: a gently curved, tapered leaf shape extruded along Z, with a small bevel for a bright edge
  const bladeCurve = (u) => 0.075 * BLADE * u * u;           // how far the spine bows at u = 0..1 along the blade
  const half = (u) => 0.034 * H * (1 - 0.62 * Math.pow(u, 1.5)) * (u > 0.93 ? (1 - u) / 0.07 * 0.6 + 0.4 : 1);
  const N = 36, shape = new THREE.Shape();
  for (let i = 0; i <= N; i++) { const u = i / N, x = u * BLADE, y = bladeCurve(u) + half(u) * 0.62; i ? shape.lineTo(x, y) : shape.moveTo(x, y); }
  shape.lineTo(BLADE + 0.012 * H, bladeCurve(1) + 0.004 * H);                                          // the point
  for (let i = N; i >= 0; i--) { const u = i / N; shape.lineTo(u * BLADE, bladeCurve(u) - half(u) * 0.5); }
  const bladeGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.006 * H, bevelEnabled: true, bevelThickness: 0.0016 * H, bevelSize: 0.0014 * H, bevelSegments: 1, curveSegments: 1 });
  bladeGeo.translate(0, 0, -0.003 * H);
  const bladeMat = new THREE.MeshStandardMaterial({ color: '#dfe4e9', metalness: 0.5, roughness: 0.26, emissive: '#ffffff', emissiveIntensity: 0 });
  const blade = new THREE.Mesh(bladeGeo, bladeMat);
  const bladePivot = new THREE.Group();                      // scaled along X to "draw" the blade out of the guard
  bladePivot.position.x = bladeX0;
  bladePivot.add(blade);
  group.add(bladePivot);

  // guard (tsuba): a flat crimson disc
  const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * H, 0.05 * H, GUARD_T, 28), new THREE.MeshStandardMaterial({ color: '#c31826', roughness: 0.42, metalness: 0.2 }));
  guard.rotation.z = Math.PI / 2; guard.position.x = hx + GUARD_T / 2;
  group.add(guard);

  // handle (tsuka): black with a crimson diamond wrap
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = '#12161c'; g.fillRect(0, 0, 256, 64);
  g.strokeStyle = '#c31826'; g.lineWidth = 7; g.lineJoin = 'round';
  for (let i = 0; i < 4; i++) { const x = i * 64 + 32; g.beginPath(); g.moveTo(x - 30, 32); g.lineTo(x, 6); g.lineTo(x + 30, 32); g.lineTo(x, 58); g.closePath(); g.stroke(); }
  const wrap = new THREE.CanvasTexture(c); wrap.colorSpace = THREE.SRGBColorSpace; wrap.wrapS = THREE.RepeatWrapping; wrap.anisotropy = 4;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018 * H, 0.018 * H, HANDLE, 20, 1), new THREE.MeshStandardMaterial({ map: wrap, roughness: 0.55, metalness: 0.1 }));
  handle.rotation.z = Math.PI / 2;
  group.add(handle);
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.022 * H, 16, 12), new THREE.MeshStandardMaterial({ color: '#c31826', roughness: 0.4 }));
  pommel.position.x = -hx - 0.006 * H; pommel.scale.set(0.8, 1, 1);
  group.add(pommel);

  // ── how the hand holds it ──
  // grip.pos: offset from the hand bone's origin (in the bone's own axes, world units); grip.quat: sword orientation
  // relative to the bone. These two are the whole "grip"; calibrated visually against the combo poses.
  // grip.pos is the centre of the hand mesh in the bone's frame, measured from the skinned vertices (about 13 cm along +Y from the wrist).
  // The hand bone's local +Y runs along the forearm toward the fingers (measured), so the blade (+X) is turned onto it
  // with a quarter turn about Z, then tilted 40 degrees about the bone's X axis, as a wrist holds a sword.
  const grip = { pos: new THREE.Vector3(-0.002 * H, 0.079 * H, -0.008 * H), euler: new THREE.Euler(40 * Math.PI / 180, 0, Math.PI / 2) };
  const gripQuat = new THREE.Quaternion().setFromEuler(grip.euler);

  // independent motion, animated by the timeline
  const K = { visible: 0, reveal: 1, scale: 1, roll: 0, swing: 0, glint: 0, grip: 0 };   // grip: 0 open hand .. 1 fingers closed on the handle
  const swingAxis = new THREE.Vector3(0, 0, 1);               // slashes sweep in the screen plane (camera looks down -Z)

  const P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), tmp = new THREE.Vector3();
  const swingQ = new THREE.Quaternion(), rollQ = new THREE.Quaternion(), finalQ = new THREE.Quaternion();
  const tip = new THREE.Vector3(), inner = new THREE.Vector3();

  // Call after the rig has been posed and its matrices updated. Returns the blade's tip and an inner point (world).
  const update = () => {
    group.visible = K.visible > 0.01;
    handBone.matrixWorld.decompose(P, Q, S);
    group.position.copy(P).add(tmp.copy(grip.pos).applyQuaternion(Q));
    rollQ.setFromAxisAngle(X, K.roll);
    finalQ.copy(Q).multiply(gripQuat).multiply(rollQ);
    group.quaternion.copy(finalQ);
    group.scale.setScalar(K.scale);
    bladePivot.scale.x = Math.max(K.reveal, 0.001);
    bladeMat.emissiveIntensity = K.glint * 0.9;
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

  return { group, K, update, setGrip, grip, tip, inner, swingAxis, bladeLength: BLADE, H };
}
