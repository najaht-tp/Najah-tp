// Shared asset helpers: load a .glb (embedded base64 in the single-file build, or a URL in dev) and its textures.
// Textures are separate images loaded through <img>, so they also work where fetch()/blob decoding is blocked.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const toBuffer = (b64) => {
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
};

export function loadModel({ embedded, url }) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return new Promise((resolve, reject) => {
    if (embedded) loader.parse(toBuffer(embedded), '', resolve, reject);
    else loader.load(url, resolve, undefined, reject);
  });
}

export async function loadTextures(sources, onEach) {
  const texLoader = new THREE.TextureLoader();
  const one = async (key, srgb) => {
    const t = await texLoader.loadAsync(sources[key]);
    t.flipY = false; t.anisotropy = 8;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if (onEach) onEach(key);
    return t;
  };
  const [base, normal, mr] = await Promise.all([one('base', true), one('normal', false), one('mr', false)]);
  return { base, normal, mr };
}

export function applyTextures(model, { base, normal, mr }) {
  model.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    m.map = base; m.normalMap = normal; m.metalnessMap = mr; m.roughnessMap = mr; m.needsUpdate = true;
  });
}

// A soft radial contact shadow (plane lying on the floor)
export function createContactShadow(size) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(0,0,0,0.78)'); grad.addColorStop(0.35, 'rgba(0,0,0,0.5)');
  grad.addColorStop(0.7, 'rgba(0,0,0,0.16)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false })
  );
  mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = -1;
  return mesh;
}

// Resolve when the browser is idle (or after a short timeout), so heavy one-off work can be sliced between frames.
export const idle = () => new Promise((r) => (window.requestIdleCallback ? window.requestIdleCallback(() => r(), { timeout: 300 }) : setTimeout(r, 16)));

// Pre-compile shaders without blocking; give up after a moment so a hidden tab (no animation frames) cannot stall the loader.
export const precompile = (renderer, scene, camera, ms = 1500) => Promise.race([
  (renderer.compileAsync ? renderer.compileAsync(scene, camera) : Promise.resolve(renderer.compile(scene, camera))).catch(() => renderer.compile(scene, camera)),
  new Promise((r) => setTimeout(r, ms)),
]);
