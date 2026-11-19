// Loads the game's assets and reports real progress (bytes for URLs, steps for embedded data).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { ASSETS } from './config.js';

const toBuffer = (b64) => {
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
};

function loadGLB(spec, onProgress) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const embedded = spec.embedded && spec.embedded();
  return new Promise((resolve, reject) => {
    if (embedded) loader.parse(toBuffer(embedded), '', (g) => { onProgress(1); resolve(g); }, reject);
    else loader.load(spec.url, (g) => { onProgress(1); resolve(g); }, (e) => { if (e.total) onProgress(Math.min(0.99, e.loaded / e.total)); }, reject);
  });
}

function loadTextures(spec, onProgress) {
  const src = (spec.embedded && spec.embedded()) || spec.urls;
  const tl = new THREE.TextureLoader();
  let done = 0;
  const one = (key, srgb) => tl.loadAsync(src[key]).then((t) => {
    t.flipY = false; t.anisotropy = 4; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    onProgress(++done / 3);
    return t;
  });
  return Promise.all([one('base', true), one('normal', false), one('mr', false)]).then(([base, normal, mr]) => ({ base, normal, mr }));
}

// onProgress(0..1) is called as each part arrives
export async function loadGameAssets(onProgress) {
  const parts = { ninja: 0, katana: 0, tex: 0, bg: 0 }, weight = { ninja: 0.45, katana: 0.15, tex: 0.25, bg: 0.15 };
  const report = (k) => (p) => { parts[k] = p; onProgress(Object.keys(parts).reduce((s, n) => s + parts[n] * weight[n], 0)); };
  const bgSrc = (ASSETS.background.embedded && ASSETS.background.embedded()) || ASSETS.background.url;
  const [ninja, katana, textures, background] = await Promise.all([
    loadGLB(ASSETS.ninja, report('ninja')),
    loadGLB(ASSETS.katana, report('katana')),
    loadTextures(ASSETS.ninjaTextures, report('tex')),
    new THREE.TextureLoader().loadAsync(bgSrc).then((t) => { t.colorSpace = THREE.SRGBColorSpace; report('bg')(1); return t; }).catch(() => { report('bg')(1); return null; }),
  ]);
  return { ninja, katana, textures, background };
}
