import { NodeIO } from '@gltf-transform/core';
const io = new NodeIO();
const doc = await io.read('/Users/muhammadnajahtp-3307/Desktop/Ninja-2.0/Ninja-Dance-Animation.glb');
const KEEP = ['Agree_Gesture', 'All_Night_Dance'];
for (const a of doc.getRoot().listAnimations()) if (!KEEP.includes(a.getName())) a.dispose();
const mat = doc.getRoot().listMaterials()[0];
mat.setBaseColorTexture(null).setNormalTexture(null).setMetallicRoughnessTexture(null);
for (const t of doc.getRoot().listTextures()) t.dispose();

// lock root drift (hips x/z) in both clips
for (const a of doc.getRoot().listAnimations()) {
  for (const ch of a.listChannels()) {
    if (ch.getTargetNode().getName() === 'mixamorig:Hips' && ch.getTargetPath() === 'translation') {
      const out = ch.getSampler().getOutput(), arr = out.getArray().slice(); const x0 = arr[0], z0 = arr[2];
      let dz = 0; for (let i = 0; i < arr.length; i += 3) { dz = Math.max(dz, Math.abs(arr[i+2]-z0)); arr[i] = x0; arr[i+2] = z0; }
      out.setArray(arr); console.log(a.getName(), 'hips drift locked, max z drift was', dz.toFixed(2));
    }
  }
}
// gentle legs: only for the gesture clip (the dance keeps its full motion)
const keep = { Hips: .4, Spine: .45, Spine1: .5, UpLeg: .4, Leg: .35, Foot: .35, ToeBase: .35 };
const slerp = (q0, q1, t) => { let d = q0[0]*q1[0]+q0[1]*q1[1]+q0[2]*q1[2]+q0[3]*q1[3]; const s = d<0?-1:1; d=Math.abs(d);
  if (d>0.9995){const r=q0.map((x,i)=>x+(s*q1[i]-x)*t);const l=Math.hypot(...r);return r.map(x=>x/l)}
  const th=Math.acos(d), sn=Math.sin(th), w0=Math.sin((1-t)*th)/sn, w1=Math.sin(t*th)/sn; return q0.map((x,i)=>w0*x+w1*s*q1[i]); };
const gest = doc.getRoot().listAnimations().find(a => a.getName() === 'Agree_Gesture');
for (const ch of gest.listChannels()) {
  if (ch.getTargetPath() !== 'rotation') continue;
  const k = keep[ch.getTargetNode().getName().replace('mixamorig:','').replace(/^(Left|Right)/,'')]; if (k === undefined) continue;
  const out = ch.getSampler().getOutput(), v = out.getArray().slice(), q0 = [...v.slice(0,4)];
  for (let i = 0; i < v.length; i += 4) { const r = slerp(q0, [...v.slice(i,i+4)], k); v[i]=r[0]; v[i+1]=r[1]; v[i+2]=r[2]; v[i+3]=r[3]; }
  out.setArray(v);
}
for (const a of doc.getRoot().listAnimations()) console.log(a.getName(), Math.max(...a.listSamplers().map(s => s.getInput().getMax([])[0])).toFixed(2) + 's');
await io.write('notex-two.glb', doc);
