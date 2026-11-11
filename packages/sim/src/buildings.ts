// Buildings (DESIGN.md 6.3, 5.5, D-017). Ring 1 has one kind, the depot. A
// building is placed by place_building, stays under construction for its
// build time, then is active. Labor is abstracted (D-012): the build price
// includes a hiring cost, and an active building pays a daily wage. While its
// Op cannot pay, it is unstaffed and idle.

import { TICKS_PER_DAY, type BuildingKind } from "@groundwork/protocol";
import type { Building, World } from "./world.ts";

export interface BuildingSpec {
  /** Construction cost, whole currency units. */
  readonly cost: number;
  /** Hiring the first crew, paid with the construction cost. */
  readonly hiring: number;
  /** Game minutes of construction. */
  readonly buildTicks: number;
  /** Paid at the start of every game day while the building is active. */
  readonly wage: number;
}

/** The one table of building costs and times. */
export const BUILDING_SPEC: Readonly<Record<BuildingKind, BuildingSpec>> = {
  depot: { cost: 1200, hiring: 300, buildTicks: 480, wage: 100 },
};

/** What placing a building of this kind costs in cash: construction plus hiring. */
export function buildingPrice(kind: BuildingKind): number {
  const spec = BUILDING_SPEC[kind];
  return spec.cost + spec.hiring;
}

/** The building on a tile, if any. */
export function buildingAt(world: World, tile: number): Building | undefined {
  return world.buildings.find((b) => b.tile === tile);
}

/**
 * Called once per tick after the clock advances. Counts construction down,
 * pays wages at the start of each day, and rehires an idle building's crew as
 * soon as its Op can pay a wage. Never takes an Op's cash below 0.
 */
export function updateBuildings(world: World): void {
  const payday = world.tick % TICKS_PER_DAY === 0;
  for (const b of world.buildings) {
    if (b.remaining > 0) {
      b.remaining -= 1;
      // The crew hired with the build price starts work when it is done.
      if (b.remaining === 0) b.staffed = true;
      continue;
    }
    if (!payday && b.staffed) continue;
    const op = world.ops.find((o) => o.id === b.op);
    const wage = BUILDING_SPEC[b.kind].wage;
    if (op !== undefined && op.cash >= wage) {
      op.cash -= wage;
      b.staffed = true;
    } else {
      b.staffed = false;
    }
  }
}
