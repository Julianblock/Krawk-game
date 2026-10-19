import type { Vec2 } from "./types.ts";

export function pointInPolygon(x: number, z: number, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export interface Bounds { minX: number; minZ: number; maxX: number; maxZ: number }

export function polyBounds(poly: Vec2[]): Bounds {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const [x, z] of poly) {
    if (x < minX) minX = x;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (z > maxZ) maxZ = z;
  }
  return { minX, minZ, maxX, maxZ };
}

/** Uniform-grid spatial index over polygons for fast point queries. */
export class PolygonGrid<T extends { poly: Vec2[] }> {
  private cells = new Map<number, T[]>();

  constructor(items: T[], private readonly cell = 32) {
    for (const item of items) {
      const b = polyBounds(item.poly);
      for (let cx = Math.floor(b.minX / cell); cx <= Math.floor(b.maxX / cell); cx++) {
        for (let cz = Math.floor(b.minZ / cell); cz <= Math.floor(b.maxZ / cell); cz++) {
          const k = this.key(cx, cz);
          let list = this.cells.get(k);
          if (!list) this.cells.set(k, (list = []));
          list.push(item);
        }
      }
    }
  }

  private key(cx: number, cz: number) {
    return ((cx + 32768) << 16) | (cz + 32768);
  }

  near(x: number, z: number): T[] {
    return this.cells.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell))) ?? [];
  }

  hit(x: number, z: number): T | null {
    for (const item of this.near(x, z)) if (pointInPolygon(x, z, item.poly)) return item;
    return null;
  }
}

export function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  const cx = ax + t * dx, cz = az + t * dz;
  return { dist: Math.hypot(px - cx, pz - cz), cx, cz, t };
}
