import * as THREE from "three";
import type { Effects } from "../fx/effects.ts";

export type PickupKind = "ammo44" | "health";

interface Pickup {
  kind: PickupKind;
  mesh: THREE.Group;
  pos: THREE.Vector3;
  life: number;
}

const ammoGeo = new THREE.BoxGeometry(0.34, 0.2, 0.24);
const ammoMat = new THREE.MeshStandardMaterial({ color: "#c08a2a", metalness: 0.8, roughness: 0.3, emissive: "#5a3a00", emissiveIntensity: 1.2 });
const roundGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.14, 8);
const brassMat = new THREE.MeshStandardMaterial({ color: "#ffcf5a", metalness: 1, roughness: 0.2, emissive: "#ff9a00", emissiveIntensity: 0.6 });
const crossMat = new THREE.MeshStandardMaterial({ color: "#3dff7a", emissive: "#1aff5a", emissiveIntensity: 2.5 });

export class Pickups {
  readonly group = new THREE.Group();
  readonly items: Pickup[] = [];

  constructor(private readonly fx: Effects, private readonly groundAt: (x: number, z: number) => number) {}

  drop(kind: PickupKind, x: number, z: number) {
    const mesh = new THREE.Group();
    if (kind === "ammo44") {
      mesh.add(new THREE.Mesh(ammoGeo, ammoMat));
      for (let i = 0; i < 3; i++) {
        const r = new THREE.Mesh(roundGeo, brassMat);
        r.position.set(-0.09 + i * 0.09, 0.17, 0);
        mesh.add(r);
      }
    } else {
      mesh.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.15), crossMat));
      mesh.add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.15), crossMat));
    }
    const pos = new THREE.Vector3(x, this.groundAt(x, z) + 0.7, z);
    mesh.position.copy(pos);
    this.group.add(mesh);
    this.items.push({ kind, mesh, pos, life: 30 });
  }

  update(dt: number, elapsed: number, player: THREE.Vector3, collect: (k: PickupKind) => boolean) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life -= dt;
      p.mesh.rotation.y += dt * 2.4;
      p.mesh.position.y = p.pos.y + Math.sin(elapsed * 3 + i) * 0.12;
      if (Math.random() < 0.3) this.fx.pickupGlow(p.mesh.position, p.kind === "ammo44" ? 0xffb22e : 0x3dff7a);
      const d = Math.hypot(player.x - p.pos.x, player.z - p.pos.z);
      const vertical = Math.abs(player.y + 0.8 - p.pos.y) < 2.5;
      if ((d < 1.8 && vertical && collect(p.kind)) || p.life <= 0) {
        this.group.remove(p.mesh);
        this.items.splice(i, 1);
      } else if (p.life < 5) {
        p.mesh.visible = Math.floor(p.life * 6) % 2 === 0;
      }
    }
  }
}
