import { NodeIO } from '@gltf-transform/core'; import sharp from 'sharp';
const io = new NodeIO(); const doc = await io.read('r2.glb');
const mat = doc.getRoot().listMaterials()[0];
const out = { base: mat.getBaseColorTexture(), normal: mat.getNormalTexture(), mr: mat.getMetallicRoughnessTexture() };
const q = { base: 88, normal: 90, mr: 85 };
for (const [k, t] of Object.entries(out)) {
  const buf = await sharp(Buffer.from(t.getImage())).webp({ quality: q[k] }).toBuffer();
  await (await import('fs')).promises.writeFile('/Users/muhammadnajahtp-3307/Desktop/Najah Portfolio - Claude -2027/assets/tex-' + k + '.webp', buf);
  console.log(k, t.getSize(), (buf.length/1024).toFixed(0)+'KB');
}
mat.setBaseColorTexture(null).setNormalTexture(null).setMetallicRoughnessTexture(null);
for (const t of doc.getRoot().listTextures()) t.dispose();
console.log('factors', mat.getBaseColorFactor(), mat.getMetallicFactor(), mat.getRoughnessFactor());
await io.write('notex.glb', doc);
