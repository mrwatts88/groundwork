// Types for the small window into the client that the smoke test and a
// curious developer use (window.groundwork). Types only.

import type { Camera } from "./iso.ts";
import type { ClientWorld } from "./state.ts";

export type Mode = "inspect" | "road";

export interface ClientDebug {
  ready: boolean;
  world: ClientWorld | undefined;
  camera: Camera;
  mode(): Mode;
  /** Where a tile's centre is in page coordinates. */
  tileToClient(x: number, y: number): { x: number; y: number };
}

declare global {
  interface Window {
    groundwork: ClientDebug;
  }
}
