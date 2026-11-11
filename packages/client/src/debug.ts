// Types for the small window into the client that the smoke test and a
// curious developer use (window.groundwork). Types only.

import type { Camera } from "./iso.ts";
import type { ClientWorld } from "./state.ts";

/** What a click on the map does: inspect a tile, order a road, stake a claim or place a depot. */
export type Mode = "inspect" | "road" | "stake" | "depot";

export interface ClientDebug {
  ready: boolean;
  world: ClientWorld | undefined;
  camera: Camera;
  mode(): Mode;
  /** Whether the ownership overlay is on. */
  overlay(): boolean;
  /** Centre the camera on a tile at a zoom scale. */
  centreOn(x: number, y: number, scale: number): void;
  /** Where a tile's centre is in page coordinates. */
  tileToClient(x: number, y: number): { x: number; y: number };
}

declare global {
  interface Window {
    groundwork: ClientDebug;
  }
}
