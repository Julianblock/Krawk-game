import { createHash } from "node:crypto";

/**
 * Consistent hash ring with virtual nodes. Adding or removing a shard only
 * remaps ~1/N of keys, so the shard count can grow without a full reshuffle.
 */
export class HashRing<T extends { id: string }> {
  private ring: { point: number; node: T }[] = [];

  constructor(nodes: T[], private readonly virtualNodes = 160) {
    for (const node of nodes) this.add(node);
  }

  static hash(key: string): number {
    return createHash("md5").update(key).digest().readUInt32BE(0);
  }

  add(node: T): void {
    for (let i = 0; i < this.virtualNodes; i++) {
      this.ring.push({ point: HashRing.hash(`${node.id}#${i}`), node });
    }
    this.ring.sort((a, b) => a.point - b.point);
  }

  remove(id: string): void {
    this.ring = this.ring.filter((entry) => entry.node.id !== id);
  }

  get(key: string): T {
    if (this.ring.length === 0) throw new Error("HashRing is empty");
    const h = HashRing.hash(key);
    let lo = 0;
    let hi = this.ring.length - 1;
    if (h > this.ring[hi].point) return this.ring[0].node;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.ring[mid].point < h) lo = mid + 1;
      else hi = mid;
    }
    return this.ring[lo].node;
  }

  nodes(): T[] {
    return [...new Map(this.ring.map((e) => [e.node.id, e.node])).values()];
  }
}
