// World state, tick, commands, economy and reflex AI (DESIGN.md 12.2).
// No I/O, no clock, no randomness except the seeded RNG (DESIGN.md 12.3).

import { PROTOCOL_VERSION, type PackageName } from "@groundwork/protocol";

export const PACKAGE: PackageName = "sim";

export const SIM_PROTOCOL_VERSION: number = PROTOCOL_VERSION;

export { apply, ROAD_BUILD_TICKS, ROAD_COST } from "./apply.ts";
export { hashWorld } from "./hash.ts";
export {
  CLAIM_SIZE,
  createWorld,
  STARTING_CASH,
  TOWN_CLEARANCE,
  TOWN_ID,
  TOWN_SIZE,
  TOWN_WATER_RANGE,
  type WorldOptions,
} from "./mapgen.ts";
export {
  ASKING_MAX,
  ASKING_MIN,
  DEPOSIT_REACH,
  LANDOWNERS,
  PARCEL_SIZE,
  PEOPLE_PER_TOWN,
  PERSONALITY_TRAITS,
} from "./people.ts";
export { run, type RunReport } from "./replay.ts";
export { fromSnapshot, toSnapshot } from "./snapshot.ts";
export { createRng, nextInt, nextU32, type Rng } from "./rng.ts";
export {
  SCENARIO_OPS,
  SCENARIO_SEED,
  SCENARIO_SIZE,
  SCENARIO_TICKS,
  scenarioLog,
  scenarioWorld,
} from "./scenario.ts";
export { tick } from "./tick.ts";
export {
  inBounds,
  NO_OWNER,
  opIndex,
  partyIndex,
  partyOf,
  ROAD_BUILDING,
  ROAD_BUILT,
  ROAD_NONE,
  tileIndex,
  tileOwner,
  WORLD_FORMAT,
  type Build,
  type Op,
  type Person,
  type Town,
  type World,
} from "./world.ts";
