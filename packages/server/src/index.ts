// Clock, WebSocket, persistence, Mind scheduling and presence (DESIGN.md 12.2).

import { MINDS_PROTOCOL_VERSION } from "@groundwork/minds";
import { PROTOCOL_VERSION, type PackageName } from "@groundwork/protocol";
import { SIM_PROTOCOL_VERSION } from "@groundwork/sim";

export const PACKAGE: PackageName = "server";

// The server only runs packages that speak the same protocol version.
export function protocolVersionsAgree(): boolean {
  return SIM_PROTOCOL_VERSION === PROTOCOL_VERSION && MINDS_PROTOCOL_VERSION === PROTOCOL_VERSION;
}

export { Clock, type ClockOptions } from "./clock.ts";
export { DEFAULT_CONFIG, loadConfig, type ServerConfig } from "./config.ts";
export { Game, PLAYER_OP } from "./game.ts";
export { startServer, type Health, type RunningServer } from "./server.ts";
export { Store } from "./store.ts";
