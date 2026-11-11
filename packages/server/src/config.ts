// Server config (DESIGN.md 11.1, 11.2). Defaults match the design. Every value
// can be overridden from the environment, and tests pass their own.

import { fileURLToPath } from "node:url";

/** The built client, next to this package in the workspace. */
export const DEFAULT_CLIENT_DIR = fileURLToPath(new URL("../../client/dist", import.meta.url));

export interface ServerConfig {
  /** HTTP and WebSocket port. 0 picks a free port. */
  readonly port: number;
  readonly host: string;
  /** Where the SQLite file lives. */
  readonly dataDir: string;
  /** Map seed for a brand new world. Ignored once a world exists. */
  readonly seed: number;
  readonly mapSize: number;
  /** Real milliseconds per tick at 1x. 1 game day = 1 real hour gives 2500. */
  readonly tickMs: number;
  /** Highest speed-up while someone is present. */
  readonly maxSpeed: number;
  /** Real milliseconds with no client input before the away clock starts. */
  readonly awayAfterMs: number;
  /** Clock rate while away. 0.25 gives 1 game day = 4 real hours. */
  readonly awayRate: number;
  /** Ticks between snapshots. One game day. */
  readonly snapshotEveryTicks: number;
  /** The built client (index.html and assets), served at /. */
  readonly clientDir: string;
}

export const DEFAULT_CONFIG: ServerConfig = {
  port: 8787,
  host: "0.0.0.0",
  dataDir: "data",
  seed: 1,
  mapSize: 128,
  tickMs: 2500,
  maxSpeed: 4,
  awayAfterMs: 15 * 60 * 1000,
  awayRate: 0.25,
  snapshotEveryTicks: 1440,
  clientDir: DEFAULT_CLIENT_DIR,
};

const ENV: Readonly<Record<keyof ServerConfig, string>> = {
  port: "GROUNDWORK_PORT",
  host: "GROUNDWORK_HOST",
  dataDir: "GROUNDWORK_DATA_DIR",
  seed: "GROUNDWORK_SEED",
  mapSize: "GROUNDWORK_MAP_SIZE",
  tickMs: "GROUNDWORK_TICK_MS",
  maxSpeed: "GROUNDWORK_MAX_SPEED",
  awayAfterMs: "GROUNDWORK_AWAY_AFTER_MS",
  awayRate: "GROUNDWORK_AWAY_RATE",
  snapshotEveryTicks: "GROUNDWORK_SNAPSHOT_EVERY_TICKS",
  clientDir: "GROUNDWORK_CLIENT_DIR",
};

function num(env: Readonly<Record<string, string | undefined>>, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  const v = Number(raw);
  if (!Number.isFinite(v)) throw new Error(`${key} must be a number, got ${raw}`);
  return v;
}

export function loadConfig(
  env: Readonly<Record<string, string | undefined>>,
  overrides: Partial<ServerConfig> = {},
): ServerConfig {
  const d = DEFAULT_CONFIG;
  const config: ServerConfig = {
    port: num(env, ENV.port, d.port),
    host: env[ENV.host] || d.host,
    dataDir: env[ENV.dataDir] || d.dataDir,
    seed: num(env, ENV.seed, d.seed),
    mapSize: num(env, ENV.mapSize, d.mapSize),
    tickMs: num(env, ENV.tickMs, d.tickMs),
    maxSpeed: num(env, ENV.maxSpeed, d.maxSpeed),
    awayAfterMs: num(env, ENV.awayAfterMs, d.awayAfterMs),
    awayRate: num(env, ENV.awayRate, d.awayRate),
    snapshotEveryTicks: num(env, ENV.snapshotEveryTicks, d.snapshotEveryTicks),
    clientDir: env[ENV.clientDir] || d.clientDir,
    ...overrides,
  };
  if (config.tickMs <= 0) throw new Error("tickMs must be positive");
  if (config.maxSpeed < 1) throw new Error("maxSpeed must be at least 1");
  if (config.awayRate <= 0) throw new Error("awayRate must be positive");
  if (!Number.isInteger(config.snapshotEveryTicks) || config.snapshotEveryTicks < 1) {
    throw new Error("snapshotEveryTicks must be a positive integer");
  }
  return config;
}
