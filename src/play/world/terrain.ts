import * as THREE from "three";
import { PolygonGrid, pointInPolygon } from "../../../shared/geometry.ts";
import type { Area, WorldData } from "../../../shared/types.ts";

const AREA_PRIORITY: Area["kind"][] = ["water", "sand", "forest", "park", "grass", "industrial", "commercial", "residential"];

const DETAIL_NOISE = /* glsl */ `
  varying vec3 vWPos;
  float kHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float kNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(kHash(i), kHash(i + vec2(1, 0)), u.x), mix(kHash(i + vec2(0, 1)), kHash(i + vec2(1, 1)), u.x), u.y);
  }
  float kFbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * kNoise(p); p *= 2.07; a *= 0.5; }
    return v;
  }
`;

export function applyDetailShader(material: THREE.MeshStandardMaterial, scale = 0.35, strength = 0.28) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${DETAIL_NOISE}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
         float kd = kFbm(vWPos.xz * ${scale.toFixed(3)});
         float kc = kFbm(vWPos.xz * ${(scale * 0.08).toFixed(4)});
         diffuseColor.rgb *= (1.0 - ${strength.toFixed(3)} * 0.5) + ${strength.toFixed(3)} * kd;
         diffuseColor.rgb *= 0.9 + 0.2 * kc;`,
      );
  };
}

export class Terrain {
  readonly mesh: THREE.Mesh;
  readonly skirt: THREE.Mesh;
  readonly size: number;
  readonly half: number;
  readonly res: number;
  readonly step: number;
  readonly heights: Float32Array;
  /** y of mean sea level in local coordinates, or null when the ocean isn't in frame. */
  readonly seaLevel: number | null;

  constructor(world: WorldData) {
    const { terrain, sizeMeters, director } = world;
    this.size = sizeMeters;
    this.half = sizeMeters / 2;
    this.res = terrain.resolution;
    this.step = sizeMeters / (this.res - 1);
    this.heights = Float32Array.from(terrain.heights);
    const belowSea = terrain.heights.filter((h) => h + terrain.minElevation < 0.5).length;
    this.seaLevel = terrain.minElevation < 1.5 && belowSea > terrain.heights.length * 0.02 ? -terrain.minElevation : null;

    const geo = new THREE.PlaneGeometry(sizeMeters, sizeMeters, this.res - 1, this.res - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) pos.setY(k, this.heights[k]);
    geo.computeVertexNormals();

    const pal = director.palette;
    const c = {
      ground: new THREE.Color(pal.ground),
      grass: new THREE.Color(pal.grass),
      rock: new THREE.Color(pal.rock),
      forest: new THREE.Color(pal.grass).multiplyScalar(0.62),
      park: new THREE.Color(pal.grass).lerp(new THREE.Color("#5fa83a"), 0.35),
      sand: new THREE.Color("#d6c39a").lerp(new THREE.Color(pal.ground), 0.25),
      urban: new THREE.Color("#6f6c66").lerp(new THREE.Color(pal.ground), 0.2),
      seabed: new THREE.Color("#3b5560"),
      bank: new THREE.Color("#6b5d45"),
    };
    const grid = new PolygonGrid(
      world.areas.map((a) => ({ poly: a.polygon, kind: a.kind })),
      48,
    );
    const normals = geo.attributes.normal as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const tmp = new THREE.Color();
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
      const slope = 1 - normals.getY(k);
      const hits = grid.near(x, z).filter((a) => pointInPolygon(x, z, a.poly));
      const kind = AREA_PRIORITY.find((p) => hits.some((h) => h.kind === p));
      switch (kind) {
        case "forest": tmp.copy(c.forest); break;
        case "park": tmp.copy(c.park); break;
        case "grass": tmp.copy(c.grass); break;
        case "sand": tmp.copy(c.sand); break;
        case "water": tmp.copy(c.bank); break;
        case "industrial": case "commercial": tmp.copy(c.urban); break;
        case "residential": tmp.copy(c.ground).lerp(c.grass, 0.45); break;
        default: tmp.copy(c.ground).lerp(c.grass, director.biome === "desert" ? 0.1 : 0.5);
      }
      tmp.lerp(c.rock, THREE.MathUtils.smoothstep(slope, 0.18, 0.45));
      if (this.seaLevel !== null) {
        const dy = y - this.seaLevel;
        if (dy < 0) tmp.lerp(c.seabed, Math.min(1, -dy / 4));
        else if (dy < 2.5) tmp.lerp(c.sand, 1 - dy / 2.5);
      }
      const n = hash2(x * 0.37, z * 0.37) * 0.12 - 0.06;
      colors[k * 3] = tmp.r * (1 + n);
      colors[k * 3 + 1] = tmp.g * (1 + n);
      colors[k * 3 + 2] = tmp.b * (1 + n);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
    applyDetailShader(mat);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.name = "terrain";

    this.skirt = this.buildSkirt(mat);
  }

  /** Low-res apron beyond the playable square so the horizon never shows a cliff edge. */
  private buildSkirt(mat: THREE.Material): THREE.Mesh {
    const outer = this.size * 4;
    const segs = 96;
    const geo = new THREE.PlaneGeometry(outer, outer, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const srcColors = (this.mesh.geometry.attributes.color as THREE.BufferAttribute);
    const colors = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      const cx = THREE.MathUtils.clamp(x, -this.half, this.half);
      const cz = THREE.MathUtils.clamp(z, -this.half, this.half);
      const out = Math.max(Math.abs(x) - this.half, Math.abs(z) - this.half, 0);
      const hills = (valueNoise(x * 0.004, z * 0.004) * 0.65 + valueNoise(x * 0.013, z * 0.013) * 0.35) * Math.min(1, out / 400) * (this.size * 0.12);
      const inside = Math.abs(x) < this.half - 1 && Math.abs(z) < this.half - 1;
      pos.setY(k, inside ? -40 : this.heightAt(cx, cz) + hills - 0.3);
      const i = Math.round((cx + this.half) / this.step), j = Math.round((cz + this.half) / this.step);
      const src = j * this.res + i;
      colors[k * 3] = srcColors.getX(src) * 0.9;
      colors[k * 3 + 1] = srcColors.getY(src) * 0.9;
      colors[k * 3 + 2] = srcColors.getZ(src) * 0.9;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  heightAt(x: number, z: number): number {
    const fx = THREE.MathUtils.clamp((x + this.half) / this.step, 0, this.res - 1.0001);
    const fz = THREE.MathUtils.clamp((z + this.half) / this.step, 0, this.res - 1.0001);
    const i = Math.floor(fx), j = Math.floor(fz);
    const ax = fx - i, az = fz - j;
    const r = this.res, h = this.heights;
    const a = h[j * r + i], b = h[j * r + i + 1], c = h[(j + 1) * r + i], d = h[(j + 1) * r + i + 1];
    return (a * (1 - ax) + b * ax) * (1 - az) + (c * (1 - ax) + d * ax) * az;
  }

  normalAt(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    const e = this.step;
    const hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }
}

export function hash2(x: number, z: number) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function valueNoise(x: number, z: number) {
  const i = Math.floor(x), j = Math.floor(z);
  const fx = x - i, fz = z - j;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
  return (a * (1 - ux) + b * ux) * (1 - uz) + (c * (1 - ux) + d * ux) * uz;
}
