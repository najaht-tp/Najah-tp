// Controlled effects: speed lines (streaks along a direction), a ground shockwave ring, and a screen-shake helper.
import gsap from 'gsap';

export function createFx({ host, ring }) {
  // pool of streak elements, reused
  const lines = Array.from({ length: 22 }, () => {
    const d = document.createElement('div'); d.className = 'speed'; host.appendChild(d); return d;
  });
  let next = 0;

  // Streaks flying along `angleDeg` (screen direction of travel) across the area around (cx, cy)
  const streaks = ({ angleDeg, count = 10, cx, cy, spread, length = 260, travel = 520, duration = 0.5, opacity = 0.75, delay = 0 }) => {
    const a = (angleDeg * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
    for (let i = 0; i < count; i++) {
      const d = lines[next++ % lines.length];
      const off = gsap.utils.random(-spread, spread), back = gsap.utils.random(0, travel * 0.3);
      const x0 = cx + nx * off - dx * back, y0 = cy + ny * off - dy * back;
      gsap.killTweensOf(d);
      gsap.set(d, { x: x0, y: y0, rotation: angleDeg, width: length * gsap.utils.random(0.5, 1.1), opacity: 0, transformOrigin: '0 50%' });
      gsap.to(d, { x: x0 + dx * travel, y: y0 + dy * travel, duration: duration * gsap.utils.random(0.8, 1.2), delay: delay + gsap.utils.random(0, 0.12), ease: 'power2.out' });
      gsap.fromTo(d, { opacity: 0 }, { opacity: opacity * gsap.utils.random(0.5, 1), duration: duration * 0.25, delay: delay + gsap.utils.random(0, 0.12), yoyo: true, repeat: 1, ease: 'sine.inOut' });
    }
  };

  // Expanding ellipse on the floor where the ninja lands
  const shockwave = (x, y, size) => {
    gsap.killTweensOf(ring);
    gsap.fromTo(ring, { x, y, xPercent: -50, yPercent: -50, scaleX: 0.15, scaleY: 0.04, opacity: 0.9, width: size, height: size },
      { scaleX: 1.4, scaleY: 0.34, opacity: 0, duration: 0.7, ease: 'power3.out' });
  };

  return { streaks, shockwave };
}

// Decaying screen shake, expressed in standing-heights for the 3D camera
export function createShake() {
  const s = { x: 0, y: 0, amp: 0 };
  return {
    s,
    hit(amp, duration = 0.45) {
      gsap.killTweensOf(s);
      s.amp = amp;
      gsap.to(s, { amp: 0, duration, ease: 'power3.out' });
    },
    tick(t) { s.x = Math.sin(t * 61) * s.amp; s.y = Math.cos(t * 47) * s.amp * 0.8; },
  };
}
