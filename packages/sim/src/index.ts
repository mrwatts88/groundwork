// World state, tick, commands, economy and reflex AI (DESIGN.md 12.2).
// No I/O, no clock, no randomness except the seeded RNG (DESIGN.md 12.3).

import { PROTOCOL_VERSION, type PackageName } from "@groundwork/protocol";

export const PACKAGE: PackageName = "sim";

export const SIM_PROTOCOL_VERSION: number = PROTOCOL_VERSION;
