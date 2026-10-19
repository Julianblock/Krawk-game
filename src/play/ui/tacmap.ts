import type { WorldData } from "../../../shared/types.ts";

/** Renders the real survey data as a tactical map: hillshade, contours, water, roads, buildings. */
export function renderTacMap(world: WorldData, px: number, style: "brief" | "mini" = "brief"): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = px;
  const g = canvas.getContext("2d")!;
  const { terrain, sizeMeters } = world;
  const res = terrain.resolution;
  const H = terrain.heights;
  const relief = Math.max(1, terrain.maxElevation - terrain.minElevation);
  const interval = [1, 2, 5, 10, 20, 50].find((v) => relief / v <= 14) ?? 100;

  const img = g.createImageData(px, px);
  const sample = (u: number, v: number) => {
    const fx = Math.min(res - 1.001, Math.max(0, u * (res - 1)));
    const fz = Math.min(res - 1.001, Math.max(0, v * (res - 1)));
    const i = Math.floor(fx), j = Math.floor(fz), ax = fx - i, az = fz - j;
    const a = H[j * res + i], b = H[j * res + i + 1], c = H[(j + 1) * res + i], d = H[(j + 1) * res + i + 1];
    return (a * (1 - ax) + b * ax) * (1 - az) + (c * (1 - ax) + d * ax) * az;
  };
  const mPerPx = sizeMeters / px;
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const u = x / (px - 1), v = y / (px - 1);
      const h = sample(u, v);
      const hx = sample(u + 1 / px, v) - sample(u - 1 / px, v);
      const hz = sample(u, v + 1 / px) - sample(u, v - 1 / px);
      const nx = -hx / (2 * mPerPx), nz = -hz / (2 * mPerPx);
      const shade = Math.max(0, Math.min(1, 0.65 + (nx * -0.6 + nz * -0.6) * 1.6));
      const t = h / relief;
      let r: number, gg: number, b: number;
      if (style === "brief") {
        r = 10 + t * 28; gg = 22 + t * 44; b = 16 + t * 18;
      } else {
        r = 22 + t * 30; gg = 30 + t * 40; b = 28 + t * 20;
      }
      r *= shade * 1.4; gg *= shade * 1.4; b *= shade * 1.4;
      const band = Math.floor(h / interval);
      const edge = Math.floor(sample(u + 1 / px, v) / interval) !== band || Math.floor(sample(u, v + 1 / px) / interval) !== band;
      if (edge) {
        const major = band % 5 === 0;
        r += major ? 60 : 30; gg += major ? 110 : 55; b += major ? 20 : 10;
      }
      const o = (y * px + x) * 4;
      img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  const half = sizeMeters / 2;
  const toPx = (x: number, z: number): [number, number] => [((x + half) / sizeMeters) * px, ((z + half) / sizeMeters) * px];
  const scale = px / sizeMeters;

  if (terrain.minElevation < 1.5) {
    g.fillStyle = "rgba(30,110,160,0.55)";
    for (let y = 0; y < px; y += 2) for (let x = 0; x < px; x += 2) {
      if (sample(x / (px - 1), y / (px - 1)) + terrain.minElevation < 0.3) g.fillRect(x, y, 2, 2);
    }
  }

  for (const a of world.areas) {
    const color =
      a.kind === "water" ? "rgba(41,150,220,0.75)" :
      a.kind === "forest" ? "rgba(60,140,50,0.28)" :
      a.kind === "park" || a.kind === "grass" ? "rgba(100,190,60,0.18)" :
      a.kind === "sand" ? "rgba(220,190,120,0.25)" : null;
    if (!color) continue;
    g.fillStyle = color;
    g.beginPath();
    a.polygon.forEach(([x, z], i) => (i ? g.lineTo(...toPx(x, z)) : g.moveTo(...toPx(x, z))));
    g.closePath();
    g.fill();
  }

  g.lineCap = g.lineJoin = "round";
  for (const r of world.roads) {
    const water = r.name?.startsWith("~water");
    g.strokeStyle = water ? "rgba(41,150,220,0.8)" : r.kind === "path" ? "rgba(255,210,140,0.35)" : r.kind === "motorway" || r.kind === "primary" ? "rgba(255,190,60,0.9)" : "rgba(230,236,240,0.6)";
    g.lineWidth = Math.max(style === "mini" ? 1.5 : 1, r.width * scale * (style === "mini" ? 1.3 : 1));
    g.beginPath();
    r.points.forEach(([x, z], i) => (i ? g.lineTo(...toPx(x, z)) : g.moveTo(...toPx(x, z))));
    g.stroke();
  }

  for (const b of world.buildings) {
    const tall = b.height > 15;
    g.fillStyle = tall ? "rgba(255,120,80,0.85)" : style === "brief" ? "rgba(182,255,31,0.55)" : "rgba(200,210,220,0.75)";
    g.strokeStyle = style === "brief" ? "rgba(182,255,31,0.9)" : "rgba(0,0,0,0.5)";
    g.lineWidth = 0.6;
    g.beginPath();
    b.footprint.forEach(([x, z], i) => (i ? g.lineTo(...toPx(x, z)) : g.moveTo(...toPx(x, z))));
    g.closePath();
    g.fill();
    if (style === "brief") g.stroke();
  }

  if (style === "brief") {
    g.strokeStyle = "rgba(182,255,31,0.12)";
    g.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      g.beginPath(); g.moveTo((i / 10) * px, 0); g.lineTo((i / 10) * px, px); g.stroke();
      g.beginPath(); g.moveTo(0, (i / 10) * px); g.lineTo(px, (i / 10) * px); g.stroke();
    }
    for (const [x, z] of world.director.spawnZones) {
      const [sx, sy] = toPx(x, z);
      g.strokeStyle = "rgba(255,45,85,0.95)";
      g.lineWidth = 2;
      g.beginPath(); g.arc(sx, sy, 9, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(sx - 5, sy - 5); g.lineTo(sx + 5, sy + 5); g.moveTo(sx + 5, sy - 5); g.lineTo(sx - 5, sy + 5); g.stroke();
    }
    const [hx, hy] = toPx(...world.director.heroSpawn);
    g.fillStyle = "#ffb22e";
    g.shadowColor = "#ffb22e";
    g.shadowBlur = 14;
    g.beginPath(); g.moveTo(hx, hy - 9); g.lineTo(hx + 7, hy + 7); g.lineTo(hx, hy + 3); g.lineTo(hx - 7, hy + 7); g.closePath(); g.fill();
    g.shadowBlur = 0;
  }
  return canvas;
}

export function contourInterval(world: WorldData) {
  const relief = Math.max(1, world.terrain.maxElevation - world.terrain.minElevation);
  return [1, 2, 5, 10, 20, 50].find((v) => relief / v <= 14) ?? 100;
}
