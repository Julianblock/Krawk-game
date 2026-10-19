import { randomUUID } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import type { LeaderboardEntry, ScoreSubmission, WorldData } from "../../shared/types.ts";
import type { ShardCluster } from "./cluster.ts";

interface ScoreRow {
  id: string;
  player_name: string;
  zip: string;
  place_name: string;
  score: number;
  kills: number;
  headshots: number;
  wave: number;
  accuracy: number;
  duration_sec: number;
  weapon_most_used: "m1911" | "anaconda";
  created_at: string;
}

const toEntry = (r: ScoreRow): LeaderboardEntry => ({
  id: r.id,
  playerName: r.player_name,
  zip: r.zip,
  placeName: r.place_name,
  score: r.score,
  kills: r.kills,
  headshots: r.headshots,
  wave: r.wave,
  accuracy: r.accuracy,
  durationSec: r.duration_sec,
  weaponMostUsed: r.weapon_most_used,
  createdAt: r.created_at,
});

export class Repo {
  constructor(private readonly cluster: ShardCluster) {}

  upsertPlayer(id: string, name: string, tutorialShame = 0) {
    const shard = this.cluster.for(`player:${id}`);
    shard.db
      .prepare(
        `INSERT INTO players (id, name, tutorial_shame) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           tutorial_shame = players.tutorial_shame + excluded.tutorial_shame`,
      )
      .run(id, name, tutorialShame);
    return shard.db.prepare("SELECT * FROM players WHERE id = ?").get(id);
  }

  recordPlayerRun(id: string, s: ScoreSubmission) {
    this.cluster
      .for(`player:${id}`)
      .db.prepare(
        `UPDATE players SET
           total_kills = total_kills + ?,
           total_headshots = total_headshots + ?,
           best_score = MAX(best_score, ?),
           last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?`,
      )
      .run(s.kills, s.headshots, s.score, id);
  }

  insertScore(s: ScoreSubmission, placeName: string): LeaderboardEntry {
    const id = randomUUID();
    const shard = this.cluster.for(`zip:${s.zip}`);
    shard.db
      .prepare(
        `INSERT INTO scores (id, player_name, zip, place_name, score, kills, headshots, wave,
                             accuracy, duration_sec, weapon_most_used)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id, s.playerName, s.zip, placeName, s.score, s.kills, s.headshots, s.wave,
        s.accuracy, s.durationSec, s.weaponMostUsed,
      );
    return toEntry(shard.db.prepare("SELECT * FROM scores WHERE id = ?").get(id) as unknown as ScoreRow);
  }

  leaderboardForZip(zip: string, limit = 20): LeaderboardEntry[] {
    const rows = this.cluster
      .for(`zip:${zip}`)
      .db.prepare("SELECT * FROM scores WHERE zip = ? ORDER BY score DESC LIMIT ?")
      .all(zip, limit) as unknown as ScoreRow[];
    return rows.map(toEntry);
  }

  /** Scatter-gather: top N from each shard, then merge. */
  globalLeaderboard(limit = 20): LeaderboardEntry[] {
    return this.cluster
      .scatter(
        (shard) =>
          shard.db.prepare("SELECT * FROM scores ORDER BY score DESC LIMIT ?").all(limit) as unknown as ScoreRow[],
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(toEntry);
  }

  getWorld(zip: string, size: number, version: number): WorldData | null {
    const shard = this.cluster.for(`zip:${zip}`);
    const key = `${zip}:${size}:v${version}`;
    const row = shard.db
      .prepare("SELECT payload FROM world_cache WHERE cache_key = ?")
      .get(key) as { payload: Uint8Array } | undefined;
    if (!row) return null;
    shard.db.prepare("UPDATE world_cache SET hits = hits + 1 WHERE cache_key = ?").run(key);
    return JSON.parse(gunzipSync(row.payload).toString("utf8")) as WorldData;
  }

  putWorld(world: WorldData): void {
    const { zip } = world.place;
    const key = `${zip}:${world.sizeMeters}:v${world.version}`;
    const payload = gzipSync(JSON.stringify(world), { level: 6 });
    this.cluster
      .for(`zip:${zip}`)
      .db.prepare(
        `INSERT INTO world_cache (cache_key, zip, size_m, version, payload, bytes)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, bytes = excluded.bytes`,
      )
      .run(key, zip, world.sizeMeters, world.version, payload, payload.byteLength);
  }

  stats() {
    return this.cluster.all().map((shard) => {
      const count = (sql: string) => (shard.db.prepare(sql).get() as { n: number }).n;
      return {
        shard: shard.id,
        players: count("SELECT COUNT(*) AS n FROM players"),
        scores: count("SELECT COUNT(*) AS n FROM scores"),
        worlds: count("SELECT COUNT(*) AS n FROM world_cache"),
      };
    });
  }
}
