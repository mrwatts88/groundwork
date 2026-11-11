// A usage recorder that writes one row per backend call into the world's
// SQLite file (DESIGN.md 13.5). The server and the smoke script share it.

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { UsageRecorder, UsageRow } from "./types.ts";

export interface StoredUsageRow extends UsageRow {
  readonly id: number;
  /** Real wall time in ms when the row was written. */
  readonly at: number;
}

export class SqliteUsageRecorder implements UsageRecorder {
  private readonly db: DatabaseSync;
  private readonly insert: StatementSync;
  private readonly now: () => number;

  /** dataDir holds groundwork.db, the same file the server uses. */
  constructor(dataDir: string, now: () => number = () => Date.now()) {
    mkdirSync(dataDir, { recursive: true });
    this.now = now;
    this.db = new DatabaseSync(join(dataDir, "groundwork.db"));
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS mind_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at INTEGER NOT NULL,
        agent TEXT NOT NULL,
        backend TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        ms INTEGER NOT NULL,
        ok INTEGER NOT NULL,
        error TEXT
      );
    `);
    this.insert = this.db.prepare(
      "INSERT INTO mind_usage (at, agent, backend, model, input_tokens, output_tokens, ms, ok, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
  }

  record(row: UsageRow): void {
    this.insert.run(this.now(), row.agent, row.backend, row.model, row.inputTokens, row.outputTokens, row.ms, row.ok ? 1 : 0, row.error ?? null);
  }

  /** The newest rows first. */
  recent(limit = 20): StoredUsageRow[] {
    return this.db
      .prepare("SELECT * FROM mind_usage ORDER BY id DESC LIMIT ?")
      .all(limit)
      .map((r) => {
        const base = {
          id: Number(r["id"]),
          at: Number(r["at"]),
          agent: String(r["agent"]),
          backend: String(r["backend"]),
          model: String(r["model"]),
          inputTokens: Number(r["input_tokens"]),
          outputTokens: Number(r["output_tokens"]),
          ms: Number(r["ms"]),
          ok: Number(r["ok"]) === 1,
        };
        return r["error"] === null ? base : { ...base, error: String(r["error"]) as NonNullable<UsageRow["error"]> };
      });
  }

  close(): void {
    this.db.close();
  }
}
