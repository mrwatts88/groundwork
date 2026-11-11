// Mind interface, prompts, backends, budget governor and memory (DESIGN.md 12.2, 13).

import { PROTOCOL_VERSION, type PackageName } from "@groundwork/protocol";

export const PACKAGE: PackageName = "minds";

export const MINDS_PROTOCOL_VERSION: number = PROTOCOL_VERSION;

export * from "./types.ts";
export * from "./reply.ts";
export * from "./fake.ts";
export * from "./claude.ts";
export * from "./governor.ts";
export * from "./mind.ts";
