import type { Vec2 } from "../../shared/types.ts";

/** Local tangent-plane projection, accurate to well under a meter across a few km. */
export class LocalProjection {
  readonly mPerDegLat: number;
  readonly mPerDegLon: number;

  constructor(readonly lat0: number, readonly lon0: number) {
    const phi = (lat0 * Math.PI) / 180;
    this.mPerDegLat = 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi);
    this.mPerDegLon = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi);
  }

  toLocal(lat: number, lon: number): Vec2 {
    return [(lon - this.lon0) * this.mPerDegLon, -(lat - this.lat0) * this.mPerDegLat];
  }

  toLatLon(x: number, z: number): { lat: number; lon: number } {
    return { lat: this.lat0 - z / this.mPerDegLat, lon: this.lon0 + x / this.mPerDegLon };
  }

  bbox(halfMeters: number) {
    const dLat = halfMeters / this.mPerDegLat;
    const dLon = halfMeters / this.mPerDegLon;
    return {
      south: this.lat0 - dLat,
      north: this.lat0 + dLat,
      west: this.lon0 - dLon,
      east: this.lon0 + dLon,
    };
  }
}
