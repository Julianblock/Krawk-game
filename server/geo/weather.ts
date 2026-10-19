import type { Weather } from "../../shared/types.ts";
import { fetchJson } from "./http.ts";

const WMO: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Rime fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow",
  80: "Rain showers", 81: "Heavy showers", 82: "Violent showers", 95: "Thunderstorm",
  96: "Thunderstorm w/ hail", 99: "Severe thunderstorm",
};

export async function currentWeather(lat: number, lon: number): Promise<Weather> {
  try {
    const data = await fetchJson<{
      current: { temperature_2m: number; weather_code: number; cloud_cover: number; is_day: number; wind_speed_10m: number };
    }>(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,weather_code,cloud_cover,is_day,wind_speed_10m`,
      { timeoutMs: 8000 },
    );
    const c = data.current;
    return {
      temperatureC: c.temperature_2m,
      code: c.weather_code,
      description: WMO[c.weather_code] ?? "Unsettled",
      cloudCover: c.cloud_cover,
      windKph: c.wind_speed_10m,
      isDay: c.is_day === 1,
    };
  } catch {
    return { temperatureC: 18, code: 1, description: "Mainly clear", cloudCover: 20, windKph: 8, isDay: true };
  }
}
