import * as THREE from "three";

interface P {
  alive: boolean;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  s0: number; s1: number;
  r0: number; g0: number; b0: number;
  r1: number; g1: number; b1: number;
  a0: number;
  gravity: number;
  drag: number;
  floor: number;
}

export interface Emit {
  pos: THREE.Vector3;
  vel?: THREE.Vector3;
  spread?: number;
  speed?: [number, number];
  life?: [number, number];
  size?: [number, number];
  color?: THREE.ColorRepresentation;
  color2?: THREE.ColorRepresentation;
  alpha?: number;
  gravity?: number;
  drag?: number;
  count?: number;
  floor?: number;
  jitter?: number;
}

const VERT = /* glsl */ `
  attribute float aSize;
  attribute vec4 aColor;
  varying vec4 vColor;
  uniform float uScale;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

const FRAG = /* glsl */ `
  varying vec4 vColor;
  uniform float uSoft;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    float a = smoothstep(1.0, uSoft, d);
    if (a <= 0.001) discard;
    gl_FragColor = vec4(vColor.rgb, vColor.a * a);
  }`;

/** CPU-simulated, GPU-drawn particle pool. One draw call per blend mode. */
export class ParticlePool {
  readonly points: THREE.Points;
  private ps: P[];
  private cursor = 0;
  private posAttr: THREE.BufferAttribute;
  private colAttr: THREE.BufferAttribute;
  private sizeAttr: THREE.BufferAttribute;
  private tmpA = new THREE.Color();
  private tmpB = new THREE.Color();

  constructor(readonly max: number, additive: boolean, soft = 0.0) {
    this.ps = Array.from({ length: max }, () => ({
      alive: false, x: 0, y: -9999, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s0: 1, s1: 1,
      r0: 1, g0: 1, b0: 1, r1: 1, g1: 1, b1: 1, a0: 1, gravity: 0, drag: 0, floor: -Infinity,
    }));
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("position", this.posAttr);
    g.setAttribute("aColor", this.colAttr);
    g.setAttribute("aSize", this.sizeAttr);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: window.innerHeight * 0.9 }, uSoft: { value: soft } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
  }

  resize() {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = window.innerHeight * 0.9;
  }

  emit(e: Emit) {
    const count = e.count ?? 1;
    this.tmpA.set(e.color ?? 0xffffff);
    this.tmpB.set(e.color2 ?? e.color ?? 0xffffff);
    const [sp0, sp1] = e.speed ?? [0, 0];
    const [l0, l1] = e.life ?? [0.5, 0.8];
    const [s0, s1] = e.size ?? [0.3, 0.3];
    const spread = e.spread ?? 1;
    const jitter = e.jitter ?? 0;
    for (let i = 0; i < count; i++) {
      const p = this.ps[this.cursor];
      this.cursor = (this.cursor + 1) % this.max;
      const sp = sp0 + Math.random() * (sp1 - sp0);
      let dx = (Math.random() * 2 - 1), dy = (Math.random() * 2 - 1), dz = (Math.random() * 2 - 1);
      const dl = Math.hypot(dx, dy, dz) || 1;
      dx /= dl; dy /= dl; dz /= dl;
      const base = e.vel;
      if (base) {
        const bl = base.length() || 1;
        const bx = base.x / bl, by = base.y / bl, bz = base.z / bl;
        dx = bx + dx * spread; dy = by + dy * spread; dz = bz + dz * spread;
        const l = Math.hypot(dx, dy, dz) || 1;
        dx /= l; dy /= l; dz /= l;
      }
      p.alive = true;
      p.x = e.pos.x + (Math.random() - 0.5) * jitter;
      p.y = e.pos.y + (Math.random() - 0.5) * jitter;
      p.z = e.pos.z + (Math.random() - 0.5) * jitter;
      p.vx = dx * sp; p.vy = dy * sp; p.vz = dz * sp;
      p.life = 0;
      p.max = l0 + Math.random() * (l1 - l0);
      p.s0 = s0 * (0.7 + Math.random() * 0.6);
      p.s1 = s1 * (0.7 + Math.random() * 0.6);
      p.r0 = this.tmpA.r; p.g0 = this.tmpA.g; p.b0 = this.tmpA.b;
      p.r1 = this.tmpB.r; p.g1 = this.tmpB.g; p.b1 = this.tmpB.b;
      p.a0 = e.alpha ?? 1;
      p.gravity = e.gravity ?? 0;
      p.drag = e.drag ?? 0;
      p.floor = e.floor ?? -Infinity;
    }
  }

  update(dt: number) {
    const pos = this.posAttr.array as Float32Array;
    const col = this.colAttr.array as Float32Array;
    const size = this.sizeAttr.array as Float32Array;
    for (let i = 0; i < this.max; i++) {
      const p = this.ps[i];
      if (!p.alive) {
        size[i] = 0;
        continue;
      }
      p.life += dt;
      if (p.life >= p.max) {
        p.alive = false;
        size[i] = 0;
        continue;
      }
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k; p.vy = p.vy * k - p.gravity * dt; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < p.floor) { p.y = p.floor; p.vy *= -0.2; p.vx *= 0.5; p.vz *= 0.5; }
      const t = p.life / p.max;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      col[i * 4] = p.r0 + (p.r1 - p.r0) * t;
      col[i * 4 + 1] = p.g0 + (p.g1 - p.g0) * t;
      col[i * 4 + 2] = p.b0 + (p.b1 - p.b0) * t;
      col[i * 4 + 3] = p.a0 * (1 - t) * Math.min(1, p.life * 30);
      size[i] = p.s0 + (p.s1 - p.s0) * t;
    }
    this.posAttr.needsUpdate = this.colAttr.needsUpdate = this.sizeAttr.needsUpdate = true;
  }
}
