// One sim tick is one game minute (DESIGN.md 11.1).

import { refillAttention } from "./attention.ts";
import { ROAD_BUILT, type World } from "./world.ts";

export function tick(world: World): void {
  let kept = 0;
  for (const build of world.builds) {
    build.remaining -= 1;
    if (build.remaining <= 0) {
      world.road[build.tile] = ROAD_BUILT;
    } else {
      world.builds[kept++] = build;
    }
  }
  world.builds.length = kept;
  world.tick += 1;
  refillAttention(world);
}
