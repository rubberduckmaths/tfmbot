// globectl.js -- tabletop-style controls for the Mars globe.
//
// Nobody spins a board game around, so there is no free orbit. A drag PANS:
// the surface follows the finger by turning the camera a little around the
// planet (a pan south tilts the south pole toward you), and when zoomed out
// the globe also slides a little on screen. Both are bounded so the globe
// stays at least ~90% in view; the allowed turn grows as you zoom in so the
// whole board can be reached. Wheel / pinch zoom toward the pointer.
//
// State: yaw, pitch (radians, around the planet, relative to the home view),
// dist (camera distance from the planet centre). The camera always looks at
// the planet centre.
import * as THREE from 'three';

export class GlobeControls {
  constructor(camera, dom, opts) {
    this.camera = camera;
    this.dom = dom;
    this.R = opts.R;
    this.home = opts.home.clone().normalize();       // home view direction
    this.dHome = opts.home.length();
    this.dMin = opts.dMin ?? this.R * 1.12;
    this.dMax = opts.dMax ?? this.dHome * 1.25;
    this.aFar = opts.aFar ?? 0.38;                    // max turn at the home distance
    this.aNear = opts.aNear ?? 0.85;                  // max turn fully zoomed in
    this.slideFrac = opts.slideFrac ?? 0.09;          // max on-screen slide (of the free area)
    this.onChange = opts.onChange || (() => {});
    this.enabled = true;
    this.yaw = 0; this.pitch = 0; this.dist = this.dHome;
    // home frame: f toward the camera, r to the right, u up
    this.f = this.home.clone();
    this.r = new THREE.Vector3(0, 1, 0).cross(this.f).normalize();
    this.u = this.f.clone().cross(this.r).normalize();
    this.slide = { x: 0, y: 0 };
    this.ray = new THREE.Raycaster();
    this.ptrs = new Map();
    this.bind();
    this.update();
  }

  // ---- geometry ---------------------------------------------------------------
  dirOf(yaw, pitch) {
    return this.f.clone().multiplyScalar(Math.cos(pitch) * Math.cos(yaw))
      .addScaledVector(this.r, Math.sin(yaw) * Math.cos(pitch))
      .addScaledVector(this.u, Math.sin(pitch)).normalize();
  }
  anglesOf(dir) {
    const d = dir.clone().normalize();
    return { yaw: Math.atan2(d.dot(this.r), d.dot(this.f)), pitch: Math.asin(THREE.MathUtils.clamp(d.dot(this.u), -1, 1)) };
  }
  // 0 at (or beyond) home distance, 1 fully zoomed in
  nearness(dist = this.dist) { return THREE.MathUtils.clamp((this.dHome - dist) / (this.dHome - this.dMin), 0, 1); }
  limit(dist = this.dist) { return this.aFar + (this.aNear - this.aFar) * Math.pow(this.nearness(dist), 0.7); }
  clamp() {
    this.dist = THREE.MathUtils.clamp(this.dist, this.dMin, this.dMax);
    const A = this.limit(), m = Math.hypot(this.yaw, this.pitch);
    if (m > A) { this.yaw *= A / m; this.pitch *= A / m; }
  }

  set(yaw, pitch, dist) { this.yaw = yaw; this.pitch = pitch; if (dist != null) this.dist = dist; this.clamp(); this.update(); }

  update() {
    if (!this.enabled) return;
    const dir = this.dirOf(this.yaw, this.pitch);
    this.camera.position.copy(dir).multiplyScalar(this.dist);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, 0);
    // on-screen slide: only when zoomed out, proportional to the turn
    const far = 1 - this.nearness();
    const A = this.aFar;
    this.slide.x = -THREE.MathUtils.clamp(this.yaw / A, -1, 1) * this.slideFrac * far;
    this.slide.y = THREE.MathUtils.clamp(this.pitch / A, -1, 1) * this.slideFrac * far;
    this.onChange(this.slide);
  }

  // ---- input -------------------------------------------------------------------
  // radians of turn per screen pixel at the current distance (surface follows the finger)
  radPerPx() {
    const alt = Math.max(0.3, this.dist - this.R);
    const h = this.dom.clientHeight || innerHeight;
    return 2 * alt * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) / h / this.R;
  }
  panBy(dx, dy) {
    const k = this.radPerPx();
    this.yaw -= dx * k;
    this.pitch += dy * k;
    this.clamp();
    this.update();
  }
  // zoom by factor (<1 = in) toward the planet point under (cx, cy)
  zoomAt(factor, cx, cy) {
    const old = this.dist;
    this.dist = THREE.MathUtils.clamp(old * factor, this.dMin, this.dMax);
    if (cx != null && factor < 1) {
      const rc = this.dom.getBoundingClientRect();     // the canvas's box, not the window (phone URL bar)
      const nd = new THREE.Vector2(((cx - rc.left) / (rc.width || 1)) * 2 - 1, -((cy - rc.top) / (rc.height || 1)) * 2 + 1);
      this.ray.setFromCamera(nd, this.camera);
      const hit = this.ray.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), this.R), new THREE.Vector3());
      if (hit) {
        const k = 1 - (this.dist - this.R) / (old - this.R);          // fraction of the way in
        const cur = this.dirOf(this.yaw, this.pitch);
        const to = cur.clone().lerp(hit.normalize(), THREE.MathUtils.clamp(k, 0, 1)).normalize();
        const a = this.anglesOf(to);
        this.yaw = a.yaw; this.pitch = a.pitch;
      }
    }
    this.clamp();
    this.update();
  }

  bind() {
    const el = this.dom;
    el.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.cancelTween?.();
      this.zoomAt(Math.exp(e.deltaY * (e.deltaMode ? 0.05 : 0.0015)), e.clientX, e.clientY);
    }, { passive: false });
    el.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      try { el.setPointerCapture?.(e.pointerId); } catch {}   // (throws if the pointer was already released)
      this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.cancelTween?.();
    });
    const up = (e) => { this.ptrs.delete(e.pointerId); this.pinch = null; };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointermove', (e) => {
      if (!this.enabled || !this.ptrs.has(e.pointerId)) return;
      const prev = this.ptrs.get(e.pointerId);
      const cur = { x: e.clientX, y: e.clientY };
      if (this.ptrs.size === 1) {
        this.panBy(cur.x - prev.x, cur.y - prev.y);
      } else if (this.ptrs.size === 2) {
        const [a, b] = [...this.ptrs.entries()].map(([id, p]) => (id === e.pointerId ? cur : p));
        const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (this.pinch) {
          this.zoomAt(this.pinch.d / Math.max(1, d), mx, my);
          this.panBy(mx - this.pinch.mx, my - this.pinch.my);
        }
        this.pinch = { d, mx, my };
      }
      this.ptrs.set(e.pointerId, cur);
    });
    addEventListener('keydown', (e) => {
      if (!this.enabled || e.target.closest?.('input,select,textarea')) return;
      const s = 40;
      if (e.key === 'ArrowLeft') this.panBy(s, 0);
      else if (e.key === 'ArrowRight') this.panBy(-s, 0);
      else if (e.key === 'ArrowUp') this.panBy(0, s);
      else if (e.key === 'ArrowDown') this.panBy(0, -s);
      else if (e.key === '+' || e.key === '=') this.zoomAt(0.85);
      else if (e.key === '-') this.zoomAt(1.15);
    });
  }
}
