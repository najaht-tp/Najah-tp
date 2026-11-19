// Small visual effects: the katana slash arc, sparkles for pickups, a ring burst for scrolls. Pooled, additive, cheap.
import * as THREE from 'three';
import { glowTexture } from './level.js';

function arcTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 32; const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 256, 0);
  grd.addColorStop(0, 'rgba(255,60,80,0)'); grd.addColorStop(0.55, 'rgba(255,70,90,.75)'); grd.addColorStop(0.9, 'rgba(255,225,230,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 32);
  const v = g.createLinearGradient(0, 0, 0, 32); v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(0.5, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = v; g.fillRect(0, 0, 256, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createFx(scene) {
  const group = new THREE.Group(); scene.add(group);
  const arcTex = arcTexture(), dot = glowTexture();

  // slash: a crescent strip in front of the ninja, swept and faded
  const arcGeo = new THREE.RingGeometry(0.9, 1.25, 32, 1, -Math.PI * 0.45, Math.PI * 0.9);
  // map u along the arc
  const uv = arcGeo.attributes.uv, posA = arcGeo.attributes.position;
  for (let i = 0; i < uv.count; i++) { const a = Math.atan2(posA.getY(i), posA.getX(i)); uv.setXY(i, (a + Math.PI * 0.45) / (Math.PI * 0.9), Math.hypot(posA.getX(i), posA.getY(i)) > 1.07 ? 1 : 0); }
  const arcMat = new THREE.MeshBasicMaterial({ map: arcTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0 });
  const arc = new THREE.Mesh(arcGeo, arcMat); arc.visible = false; group.add(arc);
  let arcT = 1;

  // sparkles (pickups and hits)
  const sparks = [];
  const sparkMat = (color) => new THREE.SpriteMaterial({ map: dot, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pool = (color, n) => Array.from({ length: n }, () => { const s = new THREE.Sprite(sparkMat(color)); s.visible = false; group.add(s); return { s, t: 1, v: new THREE.Vector3(), life: 0.5 }; });
  const gold = pool('#ffd35a', 40), red = pool('#ff4a5c', 40), white = pool('#fff1e0', 24);
  const burst = (list, at, n, speed, size, life) => {
    let k = 0;
    for (const p of list) { if (k >= n) break; if (p.t < 1) continue; k++;
      p.t = 0; p.life = life * (0.7 + Math.random() * 0.6); p.s.visible = true; p.s.position.copy(at);
      const a = Math.random() * Math.PI * 2; p.v.set(Math.cos(a), Math.sin(a), (Math.random() - 0.5) * 0.4).multiplyScalar(speed * (0.5 + Math.random()));
      p.size = size * (0.6 + Math.random() * 0.8);
    }
  };
  // ring burst for scrolls
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.75, 40), new THREE.MeshBasicMaterial({ color: '#ff4458', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  ring.visible = false; group.add(ring); let ringT = 1;

  return {
    slash(at, dir = 1) { arc.visible = true; arcT = 0; arc.position.copy(at); arc.scale.set(dir, 1, 1); },
    coin(at) { burst(gold, at, 6, 3, 0.35, 0.4); },
    hit(at) { burst(red, at, 12, 5, 0.45, 0.5); burst(white, at, 6, 6, 0.3, 0.3); },
    wood(at) { burst(white, at, 8, 5, 0.3, 0.45); burst(red, at, 6, 4, 0.4, 0.4); },
    scroll(at) { ring.visible = true; ringT = 0; ring.position.copy(at); burst(red, at, 18, 6, 0.5, 0.7); burst(gold, at, 10, 4, 0.35, 0.6); },
    update(dt) {
      if (arc.visible) {
        arcT += dt / 0.2;
        const k = Math.min(1, arcT);
        arcMat.opacity = Math.sin(k * Math.PI) * 0.95;
        arc.rotation.z = (0.6 - k * 1.3) * arc.scale.x;
        arc.scale.y = 1 + k * 0.25;
        if (arcT >= 1) arc.visible = false;
      }
      if (ring.visible) { ringT += dt / 0.6; const k = Math.min(1, ringT); ring.scale.setScalar(1 + k * 3); ring.material.opacity = (1 - k) * 0.9; if (ringT >= 1) ring.visible = false; }
      for (const list of [gold, red, white]) for (const p of list) {
        if (p.t >= 1) continue;
        p.t += dt / p.life; p.v.y -= 6 * dt; p.s.position.addScaledVector(p.v, dt);
        const k = Math.min(1, p.t); p.s.material.opacity = 1 - k; p.s.scale.setScalar(p.size * (1 - k * 0.5));
        if (p.t >= 1) p.s.visible = false;
      }
    },
    dispose() { group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); arcTex.dispose(); dot.dispose(); scene.remove(group); },
  };
}
