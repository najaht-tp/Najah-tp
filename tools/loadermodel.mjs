import { NodeIO } from '@gltf-transform/core'; import sharp from 'sharp'; import fs from 'fs';
const io = new NodeIO();
const doc = await io.read('/Users/muhammadnajahtp-3307/Desktop/Ninja-2.0/Meshy_AI_rigged_ninja_character_20261114_animated_mixamo_All_animation.glb');
const KEEP = ['_360_Power_Spin_Jump', 'Double_Combo_Attack', 'Alert'];
for (const a of doc.getRoot().listAnimations()) if (!KEEP.includes(a.getName())) a.dispose();
const mat = doc.getRoot().listMaterials()[0];
const tex = { base: mat.getBaseColorTexture(), normal: mat.getNormalTexture(), mr: mat.getMetallicRoughnessTexture() };
const spec = { base: [1536, 86], normal: [1024, 88], mr: [512, 85] };
for (const [k, t] of Object.entries(tex)) {
  const buf = await sharp(Buffer.from(t.getImage())).resize(spec[k][0], spec[k][0]).webp({ quality: spec[k][1] }).toBuffer();
  fs.writeFileSync('/Users/muhammadnajahtp-3307/Desktop/Najah Portfolio - Claude -2027/assets/loader/tex-' + k + '.webp', buf); console.log(k, (buf.length/1024).toFixed(0) + 'KB');
}
mat.setBaseColorTexture(null).setNormalTexture(null).setMetallicRoughnessTexture(null);
for (const t of doc.getRoot().listTextures()) t.dispose();
// root motion: keep the vertical bob, lock forward/sideways travel (the page moves the ninja itself)
for (const a of doc.getRoot().listAnimations()) for (const ch of a.listChannels()) {
  if (ch.getTargetNode().getName() === 'mixamorig:Hips' && ch.getTargetPath() === 'translation') {
    const out = ch.getSampler().getOutput(), arr = out.getArray().slice(); const x0 = arr[0], z0 = arr[2];
    for (let i = 0; i < arr.length; i += 3) { arr[i] = x0; arr[i+2] = z0; } out.setArray(arr);
  }
}
for (const a of doc.getRoot().listAnimations()) console.log(a.getName(), Math.max(...a.listSamplers().map(s => s.getInput().getMax([])[0])).toFixed(2));
await io.write('loader-notex.glb', doc);
