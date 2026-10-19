/**
 * Every shard carries the full schema; rows are placed by shard key.
 * Append-only: never edit a shipped migration, add a new one.
 */
export const MIGRATIONS: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: "players",
    sql: `
      CREATE TABLE players (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        total_kills INTEGER NOT NULL DEFAULT 0,
        total_headshots INTEGER NOT NULL DEFAULT 0,
        best_score INTEGER NOT NULL DEFAULT 0,
        tutorial_shame INTEGER NOT NULL DEFAULT 0
      );
    `,
  },
  {
    id: 2,
    name: "scores",
    sql: `
      CREATE TABLE scores (
        id TEXT PRIMARY KEY,
        player_name TEXT NOT NULL,
        zip TEXT NOT NULL,
        place_name TEXT NOT NULL DEFAULT '',
        score INTEGER NOT NULL,
        kills INTEGER NOT NULL,
        headshots INTEGER NOT NULL,
        wave INTEGER NOT NULL,
        accuracy REAL NOT NULL,
        duration_sec REAL NOT NULL,
        weapon_most_used TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX scores_zip_score ON scores (zip, score DESC);
      CREATE INDEX scores_score ON scores (score DESC);
    `,
  },
  {
    id: 3,
    name: "world_cache",
    sql: `
      CREATE TABLE world_cache (
        cache_key TEXT PRIMARY KEY,
        zip TEXT NOT NULL,
        size_m INTEGER NOT NULL,
        version INTEGER NOT NULL,
        payload BLOB NOT NULL,
        bytes INTEGER NOT NULL,
        hits INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
    `,
  },
];
