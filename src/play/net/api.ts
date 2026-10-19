import type { LeaderboardEntry, Place, ScoreSubmission, WorldData, WorldProgress, WorldSize } from "../../../shared/types.ts";

export function streamWorld(
  zip: string,
  size: WorldSize,
  onProgress: (p: WorldProgress) => void,
): { promise: Promise<WorldData>; cancel: () => void } {
  const es = new EventSource(`/api/world/${zip}/stream?size=${size}`);
  let settled = false;
  const promise = new Promise<WorldData>((resolve, reject) => {
    es.onmessage = (ev) => {
      const p = JSON.parse(ev.data) as WorldProgress;
      onProgress(p);
      if (p.type === "done") {
        settled = true;
        es.close();
        resolve(p.world);
      } else if (p.type === "error") {
        settled = true;
        es.close();
        reject(new Error(p.message));
      }
    };
    es.onerror = () => {
      if (settled) return;
      settled = true;
      es.close();
      reject(new Error("Lost uplink to the KRAWK server. Is `npm run dev` running?"));
    };
  });
  return { promise, cancel: () => es.close() };
}

export async function lookupZip(zip: string): Promise<Place | null> {
  try {
    const res = await fetch(`/api/zip/${zip}`);
    if (!res.ok) return null;
    return (await res.json()) as Place;
  } catch {
    return null;
  }
}

export async function fetchLeaderboard(zip?: string): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch(`/api/leaderboard${zip ? `?zip=${zip}` : ""}`);
    return res.ok ? ((await res.json()) as LeaderboardEntry[]) : [];
  } catch {
    return [];
  }
}

export async function fetchHealth(): Promise<{ shards: { shard: string }[]; ai: string } | null> {
  try {
    const res = await fetch("/api/health");
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export async function submitScore(
  s: ScoreSubmission & { playerId: string; placeName: string },
): Promise<{ entry: LeaderboardEntry; rank: number | null; board: LeaderboardEntry[] } | null> {
  try {
    const res = await fetch("/api/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export function playerId(): string {
  let id = localStorage.getItem("krawk.playerId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("krawk.playerId", id);
  }
  return id;
}

export async function upsertPlayer(name: string, tutorialShame = 0) {
  try {
    await fetch("/api/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: playerId(), name, tutorialShame }),
    });
  } catch {
    /* offline is fine */
  }
}
