import type { Director, DirectorPalette, Place, Vec2, Weather, WorldStats } from "../../shared/types.ts";

export interface DirectorInput {
  place: Place;
  stats: WorldStats;
  weather: Weather;
  sizeMeters: number;
  forestShare: number;
  waterShare: number;
  seaLevelVisible: boolean;
  spawnCandidates: Vec2[];
  heroCandidates: Vec2[];
}

export function seeded(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const PALETTES: Record<string, DirectorPalette> = {
  desert: { sky: "#f2a65a", horizon: "#ffd9a0", fog: "#e8b98a", sun: "#fff1c9", ground: "#c99a63", rock: "#9c6b45", grass: "#a39150", accent: "#ff5e1a" },
  coastal: { sky: "#3d7fd6", horizon: "#bfe3ff", fog: "#a9cde6", sun: "#fff6dc", ground: "#b8a77f", rock: "#7d7469", grass: "#6d8f45", accent: "#00e5ff" },
  mountain: { sky: "#4f6fa8", horizon: "#d8e2f0", fog: "#b6c3d6", sun: "#fff3e0", ground: "#6f6a52", rock: "#77736c", grass: "#4f7039", accent: "#9dff00" },
  urban: { sky: "#1c1f3a", horizon: "#ff7a59", fog: "#4a3c52", sun: "#ffc59a", ground: "#5a5a55", rock: "#4b4a47", grass: "#4d6b38", accent: "#ff2bd6" },
  forest: { sky: "#5a86b0", horizon: "#d3e6d0", fog: "#9fb8a3", sun: "#fff4d6", ground: "#5b5236", rock: "#6a675c", grass: "#3f6b2a", accent: "#b6ff3b" },
  plains: { sky: "#5d9be0", horizon: "#f0e6c8", fog: "#c9d4d8", sun: "#fff4d0", ground: "#8b7d50", rock: "#7a7264", grass: "#7a9440", accent: "#ffcc00" },
  frozen: { sky: "#8fa9c9", horizon: "#eef3fa", fog: "#dde6f0", sun: "#ffffff", ground: "#c9d2dc", rock: "#8a8f96", grass: "#a7b6a0", accent: "#62d0ff" },
  storm: { sky: "#2a3140", horizon: "#6c7889", fog: "#596273", sun: "#c7d0dd", ground: "#5d5a4c", rock: "#5b5d61", grass: "#4c6236", accent: "#ff3b3b" },
};

const ADJ = ["CRIMSON", "IRON", "FERAL", "BLACK", "HOLLOW", "MOLTEN", "ROGUE", "SAVAGE", "THUNDER", "GHOST", "BRASS", "ROTTEN"];
const NOUN = ["GOBLET", "TUSK", "CANYON", "HOWL", "MAW", "ANVIL", "SPITE", "WARREN", "HAMMER", "FANG", "THRONE", "HEX"];

export function pickBiome(i: DirectorInput): string {
  const { place, stats, weather } = i;
  if (weather.code >= 71 && weather.code <= 77) return "frozen";
  if (weather.temperatureC < -2) return "frozen";
  if (weather.code >= 95 || weather.code === 65 || weather.code === 82) return "storm";
  if (stats.reliefMeters > 140) return "mountain";
  if (i.seaLevelVisible || i.waterShare > 0.12) return "coastal";
  if (stats.buildings > 700) return "urban";
  if (["AZ", "NV", "NM", "UT"].includes(place.stateAbbr) || (place.lon < -104 && place.lat < 36.5 && i.forestShare < 0.05 && stats.trees < 80))
    return "desert";
  if (i.forestShare > 0.15 || stats.trees > 900) return "forest";
  return "plains";
}

export function heuristicDirector(i: DirectorInput): Director {
  const rand = seeded(i.place.zip);
  const biome = pickBiome(i);
  const palette = { ...PALETTES[biome] };
  const codename = `OPERATION ${ADJ[Math.floor(rand() * ADJ.length)]} ${NOUN[Math.floor(rand() * NOUN.length)]}`;

  const timeOfDay = biome === "urban" ? 20.2 : i.weather.isDay ? 9 + rand() * 7 : 19 + rand() * 1.2;
  const fogDensity =
    (i.weather.code === 45 || i.weather.code === 48 ? 0.0045 : 0.0012) +
    (i.weather.cloudCover / 100) * 0.0008 +
    (biome === "storm" ? 0.0015 : 0);

  const spawnZones = [...i.spawnCandidates].sort(() => rand() - 0.5).slice(0, 8);
  const heroSpawn = i.heroCandidates[0] ?? [0, 0];
  const density = Math.min(1, i.stats.buildings / 900);

  const where = `${i.place.name}, ${i.place.stateAbbr}`;
  const terrainLine =
    i.stats.reliefMeters > 60
      ? `${Math.round(i.stats.reliefMeters)} meters of vertical relief give them the high ground`
      : `the ground is flat — nowhere to hide`;
  const briefing =
    `Goblin warbands have overrun ${where} (${i.place.zip}). Satellite and survey data confirm ` +
    `${i.stats.buildings.toLocaleString()} structures and ${i.stats.roadKm.toFixed(1)} km of road in the hot zone; ` +
    `${terrainLine}. Current conditions: ${i.weather.description.toLowerCase()}, ${Math.round(i.weather.temperatureC)}°C. ` +
    `You have a double-stack .45 and a .44 Magnum. Make every round go BOPOOOOOOM.`;

  return {
    source: "heuristic",
    codename,
    briefing,
    biome,
    palette,
    fogDensity,
    timeOfDay,
    heroSpawn,
    spawnZones,
    waves: 5 + Math.round(density * 3),
    goblinsPerWave: 6 + Math.round(density * 6),
    taunts: [
      `Welcome to ${i.place.name}. We ate the mayor.`,
      "Your little pistol tickles, meatbag.",
      `${i.place.zip}? More like ${i.place.zip.split("").reverse().join("")}, because you're going backwards.`,
      "Mommy can't hear you over the BOOM.",
      "Goblins don't pay property tax. Goblins ARE property tax.",
    ],
  };
}
