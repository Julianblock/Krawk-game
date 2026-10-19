import type { Director, DirectorPalette } from "../../shared/types.ts";
import { fetchWithTimeout } from "../geo/http.ts";
import { heuristicDirector, type DirectorInput } from "./heuristicDirector.ts";

const HEX = /^#[0-9a-fA-F]{6}$/;

const SYSTEM_PROMPT = `You are the level director for KRAWK, an over-the-top arcade FPS where a lone hero with a
.45 ACP double-stack 1911 and a .44 Magnum Colt Anaconda clears goblins out of REAL places.
You receive verified real-world data for a US zip code (terrain relief, building count, roads, water,
forest share, live weather). Design the battle so it feels true to that place: pick colors that match
how it really looks (desert ochre, coastal blues, urban neon dusk, etc.), fog that matches the weather,
and a briefing that cites the real data. Choose goblin spawn zones from the provided candidate list
by index (spread them out). Keep the tone loud, cocky, funny — PG-13, no slurs.
Respond with JSON only.`;

interface AiDirectorJson {
  codename: string;
  biome: string;
  briefing: string;
  palette: Partial<DirectorPalette>;
  fogDensity: number;
  timeOfDay: number;
  spawnZoneIndices: number[];
  waves: number;
  goblinsPerWave: number;
  taunts: string[];
}

export async function direct(input: DirectorInput, onLog: (m: string) => void): Promise<Director> {
  const fallback = heuristicDirector(input);
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    onLog("No OPENAI_API_KEY set: the built-in rules director is composing the battlefield");
    return fallback;
  }
  const model = process.env.OPENAI_MODEL ?? "gpt-5-mini";
  try {
    onLog(`Briefing ${model} with the real-world survey data...`);
    const userPayload = {
      place: input.place,
      stats: input.stats,
      weather: input.weather,
      sizeMeters: input.sizeMeters,
      forestShare: Number(input.forestShare.toFixed(3)),
      waterShare: Number(input.waterShare.toFixed(3)),
      oceanVisible: input.seaLevelVisible,
      spawnCandidates: input.spawnCandidates.map((p, i) => ({ i, x: Math.round(p[0]), z: Math.round(p[1]) })),
      schema: {
        codename: "OPERATION <TWO WORDS>, all caps",
        biome: "one of desert|coastal|mountain|urban|forest|plains|frozen|storm",
        briefing: "2-3 sentences citing the real numbers",
        palette: "object with hex colors: sky, horizon, fog, sun, ground, rock, grass, accent",
        fogDensity: "0.0006 - 0.006",
        timeOfDay: "0-24 local hour for lighting",
        spawnZoneIndices: "6-8 indices into spawnCandidates",
        waves: "4-9",
        goblinsPerWave: "5-14",
        taunts: "5 short goblin taunts referencing the place",
      },
    };
    const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      timeoutMs: 40000,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as { choices: { message: { content: string } }[] };
    const ai = JSON.parse(body.choices[0].message.content) as Partial<AiDirectorJson>;

    const palette = { ...fallback.palette };
    for (const [k, v] of Object.entries(ai.palette ?? {})) {
      if (k in palette && typeof v === "string" && HEX.test(v)) palette[k as keyof DirectorPalette] = v;
    }
    const clamp = (v: unknown, lo: number, hi: number, d: number) =>
      typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
    const zones = (ai.spawnZoneIndices ?? [])
      .filter((i) => Number.isInteger(i) && input.spawnCandidates[i])
      .map((i) => input.spawnCandidates[i]);

    onLog(`${model} signed off on "${ai.codename ?? fallback.codename}"`);
    return {
      ...fallback,
      source: "openai",
      codename: typeof ai.codename === "string" ? ai.codename.toUpperCase().slice(0, 48) : fallback.codename,
      biome: typeof ai.biome === "string" ? ai.biome : fallback.biome,
      briefing: typeof ai.briefing === "string" ? ai.briefing.slice(0, 600) : fallback.briefing,
      palette,
      fogDensity: clamp(ai.fogDensity, 0.0006, 0.006, fallback.fogDensity),
      timeOfDay: clamp(ai.timeOfDay, 0, 24, fallback.timeOfDay),
      spawnZones: zones.length >= 3 ? zones : fallback.spawnZones,
      waves: Math.round(clamp(ai.waves, 4, 9, fallback.waves)),
      goblinsPerWave: Math.round(clamp(ai.goblinsPerWave, 5, 14, fallback.goblinsPerWave)),
      taunts: Array.isArray(ai.taunts) && ai.taunts.length ? ai.taunts.slice(0, 8).map((t) => String(t).slice(0, 120)) : fallback.taunts,
    };
  } catch (err) {
    onLog(`AI director unavailable (${(err as Error).message}); using rules director`);
    return fallback;
  }
}
