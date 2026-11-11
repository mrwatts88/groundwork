// Attention (DESIGN.md 6.2, D-015). Every Op, the player and every rival
// alike, gets the same budget each game day. Non-routine commands spend it.
// Unused points do not carry over: the budget is refilled, not topped up, at
// each day boundary.

import { ATTENTION_PER_DAY, TICKS_PER_DAY, type CommandType } from "@groundwork/protocol";
import type { World } from "./world.ts";

export { ATTENTION_PER_DAY };

/**
 * Commands that do not exist yet but whose cost is already chosen, so the
 * budget can be checked against them. R1-06 turns place_building into a
 * real command and moves it out of this list.
 */
export type PlannedCommandType = "place_building";

/** The one attention cost table. Every command type must have an entry. */
export const ATTENTION_COST: Readonly<Record<CommandType | PlannedCommandType, number>> = {
  place_road: 1,
  stake_claim: 3,
  place_building: 5,
};

/** Points a command costs. */
export function attentionCost(type: CommandType): number {
  return ATTENTION_COST[type];
}

/** Called once per tick after the clock advances. Refills every Op at the start of a day. */
export function refillAttention(world: World): void {
  if (world.tick % TICKS_PER_DAY !== 0) return;
  for (const op of world.ops) op.attention = ATTENTION_PER_DAY;
}
