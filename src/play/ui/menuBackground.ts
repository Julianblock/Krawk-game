import * as THREE from "three";

/** Endless flyover of glowing topographic contours, used behind the menu and the landing hero. */
export class ContourFlyover {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(55, 1, 0.1, 600);
  private mat: THREE.ShaderMaterial;
  private embers: THREE.Points;
  private raf = 0;
  private t0 = performance.now();
  private mx = 0;
  private my = 0;
  private alive = true;
  private readonly onMove = (e: PointerEvent) => {
    this.mx = (e.clientX / innerWidth) * 2 - 1;
    this.my = (e.clientY / innerHeight) * 2 - 1;
  };
  private readonly onResize = () => this.resize();
  boost = 0;
  paused = false;

  constructor(private readonly canvas: HTMLCanvasElement, accent = "#b6ff1f") {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.scene.background = new THREE.Color("#04060a");
    this.scene.fog = new THREE.Fog("#04060a", 40, 210);

    const geo = new THREE.PlaneGeometry(420, 420, 220, 220);
    geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.ShaderMaterial({
      fog: true,
      uniforms: {
        ...THREE.UniformsLib.fog,
        uTime: { value: 0 },
        uAccent: { value: new THREE.Color(accent) },
        uHot: { value: new THREE.Color("#ffb22e") },
      },
      vertexShader: /* glsl */ `
        #include <fog_pars_vertex>
        uniform float uTime;
        varying float vH;
        varying vec2 vXZ;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a*n(p); p *= 2.03; a *= 0.5; } return v; }
        void main() {
          vec3 p = position;
          vec2 q = p.xz * 0.018 + vec2(0.0, -uTime * 0.06);
          float ridge = 1.0 - abs(fbm(q * 0.6) * 2.0 - 1.0);
          float H = fbm(q) * 26.0 + ridge * ridge * 22.0 - 14.0;
          H *= smoothstep(8.0, 60.0, abs(p.x)) * 0.85 + 0.15;
          p.y = H;
          vH = H;
          vXZ = p.xz;
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <fog_pars_fragment>
        uniform vec3 uAccent, uHot;
        uniform float uTime;
        varying float vH;
        varying vec2 vXZ;
        void main() {
          float k = vH / 2.2;
          float line = 1.0 - min(abs(fract(k - 0.5) - 0.5) / fwidth(k), 1.0);
          float major = 1.0 - min(abs(fract(k / 5.0 - 0.5) - 0.5) / fwidth(k / 5.0), 1.0);
          float g = 1.0 - min(min(abs(fract(vXZ.x / 12.0 - 0.5) - 0.5), abs(fract(vXZ.y / 12.0 - 0.5) - 0.5)) / fwidth(vXZ.x / 12.0) , 1.0);
          vec3 base = vec3(0.012, 0.02, 0.018) + vec3(0.0, 0.04, 0.02) * smoothstep(-10.0, 30.0, vH);
          vec3 col = base + uAccent * line * 0.55 + uAccent * major * 0.9 + vec3(0.06, 0.1, 0.08) * g * 0.35;
          col = mix(col, uHot * (line + major), smoothstep(22.0, 34.0, vH) * 0.8);
          gl_FragColor = vec4(col, 1.0);
          #include <fog_fragment>
        }`,
    });
    this.scene.add(new THREE.Mesh(geo, this.mat));

    const n = 900;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 200;
      pos[i * 3 + 1] = Math.random() * 60;
      pos[i * 3 + 2] = -Math.random() * 220;
    }
    const eg = new THREE.BufferGeometry();
    eg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.embers = new THREE.Points(
      eg,
      new THREE.PointsMaterial({ color: "#ffb22e", size: 0.35, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.scene.add(this.embers);

    this.resize();
    addEventListener("resize", this.onResize);
    addEventListener("pointermove", this.onMove);
    this.raf = requestAnimationFrame(this.frame);
  }

  private resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private frame = () => {
    if (!this.alive) return;
    this.raf = requestAnimationFrame(this.frame);
    if (this.paused) return;
    const t = (performance.now() - this.t0) / 1000;
    this.mat.uniforms.uTime.value = t * (1 + this.boost * 6);
    this.camera.position.set(this.mx * 6, 34 - this.my * 4, 30);
    this.camera.lookAt(this.mx * 10, 6, -80);
    const p = this.embers.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      let z = p.getZ(i) + 0.15 * (1 + this.boost * 8);
      let y = p.getY(i) + 0.03;
      if (z > 40) z -= 260;
      if (y > 60) y = 0;
      p.setZ(i, z);
      p.setY(i, y);
    }
    p.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    removeEventListener("resize", this.onResize);
    removeEventListener("pointermove", this.onMove);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
