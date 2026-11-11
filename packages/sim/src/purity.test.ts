// Guards DESIGN.md 12.3: nothing under packages/sim/src may read a clock or an
// unseeded random source. The banned names are assembled from pieces so this
// file does not trip its own scan.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL(".", import.meta.url));

const BANNED: readonly { name: string; pattern: RegExp }[] = [
  { name: ["Math", "random"].join("."), pattern: new RegExp(["\\bMath", "\\s*\\.\\s*", "random\\b"].join("")) },
  { name: ["Da", "te"].join(""), pattern: new RegExp(["\\bDa", "te\\b"].join("")) },
  {
    name: ["performance", "now"].join("."),
    pattern: new RegExp(["\\bperformance", "\\s*\\.\\s*", "now\\b"].join("")),
  },
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) out.push(path);
  }
  return out.sort();
}

function violations(text: string): string[] {
  return BANNED.filter((b) => b.pattern.test(text)).map((b) => b.name);
}

describe("sim purity", () => {
  it("finds the sim sources", () => {
    const files = sourceFiles(SRC);
    expect(files.some((f) => f.endsWith("apply.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("rng.ts"))).toBe(true);
  });

  it("catches each banned name in a sample", () => {
    for (const b of BANNED) expect(violations(`const x = ${b.name}();`)).toEqual([b.name]);
    expect(violations("function update(): void {}")).toEqual([]);
  });

  it("has no unseeded randomness or clock reads in any file under packages/sim/src", () => {
    const found: string[] = [];
    for (const file of sourceFiles(SRC)) {
      for (const name of violations(readFileSync(file, "utf8"))) found.push(`${file}: ${name}`);
    }
    expect(found).toEqual([]);
  });
});
