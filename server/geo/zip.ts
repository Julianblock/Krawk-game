import type { Place } from "../../shared/types.ts";
import { fetchJson } from "./http.ts";

interface ZippopotamResponse {
  "post code": string;
  places: {
    "place name": string;
    longitude: string;
    latitude: string;
    state: string;
    "state abbreviation": string;
  }[];
}

export async function geocodeZip(zip: string): Promise<Place> {
  if (!/^\d{5}$/.test(zip)) throw new Error("Zip code must be 5 digits");
  let data: ZippopotamResponse;
  try {
    data = await fetchJson<ZippopotamResponse>(`https://api.zippopotam.us/us/${zip}`, { timeoutMs: 10000 });
  } catch (err) {
    if (String(err).startsWith("Error: 404")) throw new Error(`Zip ${zip} doesn't exist. Not even the goblins live there.`);
    throw err;
  }
  const p = data.places[0];
  if (!p) throw new Error(`No location found for ${zip}`);
  return {
    zip,
    name: p["place name"],
    state: p.state,
    stateAbbr: p["state abbreviation"],
    lat: Number(p.latitude),
    lon: Number(p.longitude),
  };
}
