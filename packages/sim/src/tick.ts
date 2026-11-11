// One sim tick is one game minute (DESIGN.md 11.1).

import { refillAttention } from "./attention.ts";
import { updateBuildings } from "./buildings.ts";
import { NO_OWNER, partyIndex, ROAD_BUILT, type World } from "./world.ts";

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
  kept = 0;
  for (const survey of world.surveys) {
    survey.remaining -= 1;
    if (survey.remaining <= 0) {
      // stake_claim only takes frontier, and nothing else takes a tile under survey.
      if (world.owner[survey.tile] === NO_OWNER) world.owner[survey.tile] = partyIndex(world, "op", survey.op);
    } else {
      world.surveys[kept++] = survey;
    }
  }
  world.surveys.length = kept;
  world.tick += 1;
  refillAttention(world);
  updateBuildings(world);
}
