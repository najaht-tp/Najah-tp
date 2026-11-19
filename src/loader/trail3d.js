// Motion trail: ONE continuous ribbon, not stacked layers.
//
// Each frame the blade's tip and an inner point are recorded in world space. The recorded points are smoothed with a
// Catmull-Rom spline (so a fast sweep is a curve, not a polygon) and drawn as a single triangle strip whose colour and
// opacity are computed per pixel in a shader from two numbers: how old that part of the ribbon is (along its length)
// and how far from the cutting edge it is (across it). The GPU interpolates both smoothly, so there are no seams,
// no bands and no per-segment gradients; the ribbon fades out continuously from the sword to its tail.
import * as THREE from 'three';

const MAX_SAMPLES = 36, SUBDIV = 5, LIFETIME = 0.32;   // seconds the tail lives
const MAX_POINTS = (MAX_SAMPLES - 1) * SUBDIV + 1;

const vert = /* glsl */`
  attribute float aAge; attribute float aEdge; attribute float aStr;
  varying float vAge; varying float vEdge; varying float vStr;
  void main() { vAge = aAge; vEdge = aEdge; vStr = aStr; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const frag = /* glsl */`
  varying float vAge; varying float vEdge; varying float vStr;
  void main() {
    float along = pow(clamp(1.0 - vAge, 0.0, 1.0), 1.45);             // brightest at the sword, fading to the tail
    float across = pow(clamp(1.0 - vEdge, 0.0, 1.0), 1.15);            // brightest at the cutting edge, fading toward the blade
    float a = clamp(along * across * vStr * 1.35, 0.0, 1.0);
    vec3 hot = vec3(1.0, 0.7, 0.76), cool = vec3(1.0, 0.1, 0.27);
    vec3 col = mix(hot, cool, smoothstep(0.0, 1.0, vAge * 1.5 + vEdge * 1.0));   // white-hot at the edge by the sword, neon red elsewhere
    gl_FragColor = vec4(col * a, a * 0.9);
  }`;

export function createTrail({ scene, H }) {
  const positions = new Float32Array(MAX_POINTS * 2 * 3), ages = new Float32Array(MAX_POINTS * 2), edges = new Float32Array(MAX_POINTS * 2), strs = new Float32Array(MAX_POINTS * 2);
  for (let i = 0; i < MAX_POINTS; i++) { edges[i * 2] = 0; edges[i * 2 + 1] = 1; }
  const index = [];
  for (let i = 0; i < MAX_POINTS - 1; i++) { const a = i * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAge', new THREE.BufferAttribute(ages, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aEdge', new THREE.BufferAttribute(edges, 1));
  geo.setAttribute('aStr', new THREE.BufferAttribute(strs, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(index);
  const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.visible = false;
  scene.add(mesh);

  const samples = [];      // newest last: { t, tip: Vector3, inner: Vector3, str }
  let clock = 0, prevTip = null, strSmooth = 0, level = 0;   // level = how fast the blade is swinging right now (0..1), used to drive the swish sound
  const smooth = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // Catmull-Rom (centripetal-ish uniform) for one coordinate
  const cr = (p0, p1, p2, p3, t) => 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);

  // dt in seconds; blade = { tip, inner } world points; active = 0..1 (how visible trails should be right now)
  const update = (dt, blade, active) => {
    clock += dt;
    if (prevTip) {
      const speed = blade.tip.distanceTo(prevTip) / Math.max(dt, 1e-3) / H;           // heights per second
      strSmooth += (smooth(speed, 0.9, 3.6) - strSmooth) * (1 - Math.exp(-dt * 30));    // eased, so the trail swells and fades smoothly
    }
    prevTip = (prevTip || new THREE.Vector3()).copy(blade.tip);
    level = strSmooth * active;
    samples.push({ t: clock, tip: blade.tip.clone(), inner: blade.inner.clone(), str: strSmooth * active });
    while (samples.length > MAX_SAMPLES || (samples.length && clock - samples[0].t > LIFETIME)) samples.shift();

    const n = samples.length;
    if (n < 4) { mesh.visible = false; return; }
    let maxStr = 0; for (const s of samples) maxStr = Math.max(maxStr, s.str);
    if (maxStr < 0.01) { mesh.visible = false; return; }
    mesh.visible = true;

    let k = 0;
    const put = (tipV, innerV, age, str) => {
      positions.set([tipV[0], tipV[1], tipV[2]], k * 6); positions.set([innerV[0], innerV[1], innerV[2]], k * 6 + 3);
      ages[k * 2] = ages[k * 2 + 1] = age; strs[k * 2] = strs[k * 2 + 1] = str; k++;
    };
    const P = (i) => samples[Math.min(n - 1, Math.max(0, i))];
    for (let i = 0; i < n - 1; i++) {
      const a = P(i - 1), b = P(i), c = P(i + 1), d = P(i + 2);
      for (let s = 0; s < SUBDIV; s++) {
        const t = s / SUBDIV;
        const tipV = [0, 1, 2].map((j) => cr(a.tip.getComponent(j), b.tip.getComponent(j), c.tip.getComponent(j), d.tip.getComponent(j), t));
        const inV = [0, 1, 2].map((j) => cr(a.inner.getComponent(j), b.inner.getComponent(j), c.inner.getComponent(j), d.inner.getComponent(j), t));
        const time = b.t + (c.t - b.t) * t;
        put(tipV, inV, Math.min(1, (clock - time) / LIFETIME), b.str + (c.str - b.str) * t);
      }
    }
    const last = samples[n - 1];
    put([last.tip.x, last.tip.y, last.tip.z], [last.inner.x, last.inner.y, last.inner.z], 0, last.str);
    // collapse unused points onto the last one
    for (let j = k; j < MAX_POINTS; j++) { positions.copyWithin(j * 6, (k - 1) * 6, (k - 1) * 6 + 6); ages[j * 2] = ages[j * 2 + 1] = 1; strs[j * 2] = strs[j * 2 + 1] = 0; }
    geo.attributes.position.needsUpdate = true; geo.attributes.aAge.needsUpdate = true; geo.attributes.aStr.needsUpdate = true;
  };

  const clear = () => { samples.length = 0; mesh.visible = false; prevTip = null; strSmooth = 0; level = 0; };
  return { update, clear, mesh, get level() { return level; } };
}
