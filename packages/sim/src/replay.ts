// Run a world forward against a command log (DESIGN.md 1 invariant 5).
// Commands stamped with tick t apply, in log order, before tick t runs.

import type { CommandResult, LoggedCommand } from "@groundwork/protocol";
import { apply } from "./apply.ts";
import { tick } from "./tick.ts";
import type { World } from "./world.ts";

export interface RunReport {
  readonly applied: number;
  readonly rejected: number;
}

export function run(world: World, log: readonly LoggedCommand[], ticks: number): RunReport {
  let next = 0;
  while (next < log.length && log[next]!.tick < world.tick) next++;
  let applied = 0;
  let rejected = 0;
  const end = world.tick + ticks;
  while (world.tick < end) {
    while (next < log.length && log[next]!.tick === world.tick) {
      const result: CommandResult = apply(world, log[next]!.command);
      if (result.ok) applied++;
      else rejected++;
      next++;
    }
    tick(world);
  }
  return { applied, rejected };
}
