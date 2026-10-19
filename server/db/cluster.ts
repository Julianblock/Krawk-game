import { join } from "node:path";
import { HashRing } from "./hashRing.ts";
import { Shard } from "./shard.ts";

/**
 * A set of SQLite shards behind a consistent-hash router.
 *
 * Shard keys:
 *  - players      -> player id
 *  - scores       -> zip (so per-zip leaderboards hit exactly one shard)
 *  - world_cache  -> zip
 * Global queries (top scores everywhere) scatter to every shard and merge.
 *
 * Swapping a Shard for a remote Postgres/libSQL node only requires keeping the
 * same `id` so the ring placement stays stable.
 */
export class ShardCluster {
  private readonly ring: HashRing<Shard>;

  constructor(dir: string, shardCount: number) {
    const shards = Array.from(
      { length: shardCount },
      (_, i) => new Shard(`shard-${i}`, join(dir, `shard-${i}.db`)),
    );
    this.ring = new HashRing(shards);
  }

  for(key: string): Shard {
    return this.ring.get(key);
  }

  all(): Shard[] {
    return this.ring.nodes();
  }

  scatter<R>(fn: (shard: Shard) => R[]): R[] {
    return this.all().flatMap(fn);
  }

  close(): void {
    for (const s of this.all()) s.close();
  }
}
