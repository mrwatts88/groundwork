// Prints the state hash of the scripted scenario: a 128x128 world run 10000
// ticks against its command log. Run it in two processes and compare the
// output (DESIGN.md 17). Usage: node packages/sim/scripts/scenario-hash.ts [seed]

import { hashWorld, run, SCENARIO_SEED, SCENARIO_TICKS, scenarioLog, scenarioWorld } from "../src/index.ts";

const arg = process.argv[2];
const seed = arg === undefined ? SCENARIO_SEED : Number(arg);
if (!Number.isInteger(seed)) {
  console.error(`bad seed: ${arg}`);
  process.exit(2);
}
const world = scenarioWorld(seed);
const report = run(world, scenarioLog(world), SCENARIO_TICKS);
console.log(
  `seed=${seed} ticks=${world.tick} applied=${report.applied} rejected=${report.rejected} hash=${hashWorld(world)}`,
);
