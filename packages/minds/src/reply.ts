// What a Mind may return, as a JSON schema for the model and a validator for
// the reply (DESIGN.md 13.2). The schema covers the same command types the sim
// takes. The sim still validates every command against the game rules.

import { parseCommand, type Command, type Parsed } from "@groundwork/protocol";

export interface MindReply {
  /** Zero or more commands for the one command API. */
  readonly commands: readonly Command[];
  /** Private notes for the Mind's memory. */
  readonly notes: readonly string[];
}

/** JSON schema passed to `claude -p --json-schema`. */
export const MIND_REPLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["commands", "notes"],
  properties: {
    commands: {
      type: "array",
      items: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "op", "x", "y"],
            properties: {
              type: { const: "place_road" },
              op: { type: "string", minLength: 1 },
              x: { type: "integer" },
              y: { type: "integer" },
            },
          },
        ],
      },
    },
    notes: { type: "array", items: { type: "string" } },
  },
} as const;

export const MIND_REPLY_SCHEMA_JSON: string = JSON.stringify(MIND_REPLY_SCHEMA);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Check a reply against the schema. Never throws. */
export function parseMindReply(v: unknown): Parsed<MindReply> {
  if (!isRecord(v)) return { ok: false, message: "reply must be an object" };
  for (const key of Object.keys(v)) {
    if (key !== "commands" && key !== "notes") return { ok: false, message: `unexpected field ${key}` };
  }
  const { commands, notes } = v;
  if (!Array.isArray(commands)) return { ok: false, message: "commands must be an array" };
  if (!Array.isArray(notes)) return { ok: false, message: "notes must be an array" };
  const parsed: Command[] = [];
  for (const [i, c] of commands.entries()) {
    const r = parseCommand(c);
    if (!r.ok) return { ok: false, message: `commands[${i}]: ${r.message}` };
    const known = Object.keys(r.value);
    const extra = Object.keys(c as object).find((k) => !known.includes(k));
    if (extra !== undefined) return { ok: false, message: `commands[${i}]: unexpected field ${extra}` };
    parsed.push(r.value);
  }
  for (const [i, n] of notes.entries()) {
    if (typeof n !== "string") return { ok: false, message: `notes[${i}] must be a string` };
  }
  return { ok: true, value: { commands: parsed, notes: notes as string[] } };
}
