// SQLite persistence (DESIGN.md 11.2): the latest snapshot plus the command
// log since it, and the tick reached. node:sqlite, so there is no native
// dependency to build on the Fedora box.

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { Command, LoggedCommand, WorldSnapshot } from "@groundwork/protocol";

export const DB_FILE = "groundwork.db";

export class Store {
  private readonly db: DatabaseSync;
  private readonly insertCommand: StatementSync;
  private readonly setMeta: StatementSync;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.db = new DatabaseSync(join(dataDir, DB_FILE));
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS snapshots (tick INTEGER PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS commands (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        tick INTEGER NOT NULL,
        command TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    this.insertCommand = this.db.prepare("INSERT INTO commands (tick, command) VALUES (?, ?)");
    this.setMeta = this.db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  }

  latestSnapshot(): WorldSnapshot | undefined {
    const row = this.db.prepare("SELECT data FROM snapshots ORDER BY tick DESC LIMIT 1").get();
    return row === undefined ? undefined : (JSON.parse(String(row["data"])) as WorldSnapshot);
  }

  /** Save a snapshot and drop what it replaces: older snapshots and the commands before it. */
  saveSnapshot(snapshot: WorldSnapshot): void {
    this.db.exec("BEGIN");
    try {
      this.db.prepare("INSERT OR REPLACE INTO snapshots (tick, data) VALUES (?, ?)").run(snapshot.tick, JSON.stringify(snapshot));
      this.db.prepare("DELETE FROM snapshots WHERE tick < ?").run(snapshot.tick);
      this.db.prepare("DELETE FROM commands WHERE tick < ?").run(snapshot.tick);
      this.setMeta.run("tick", String(snapshot.tick));
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  appendCommand(tick: number, command: Command): void {
    this.insertCommand.run(tick, JSON.stringify(command));
  }

  /** Commands at or after a tick, in the order they were applied. */
  commandsSince(tick: number): LoggedCommand[] {
    return this.db
      .prepare("SELECT tick, command FROM commands WHERE tick >= ? ORDER BY seq")
      .all(tick)
      .map((row) => ({ tick: Number(row["tick"]), command: JSON.parse(String(row["command"])) as Command }));
  }

  setTick(tick: number): void {
    this.setMeta.run("tick", String(tick));
  }

  /** The last tick the world reached, or undefined for a new store. */
  tick(): number | undefined {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = 'tick'").get();
    return row === undefined ? undefined : Number(row["value"]);
  }

  close(): void {
    this.db.close();
  }
}
