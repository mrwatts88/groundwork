// Client smoke (DESIGN.md 17): load the client from the test server, check the
// map is drawn and the HUD shows the date and clock speed, pan and zoom, then
// place a road by clicking a tile and confirm it on screen and on the server.

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { WorldSnapshot } from "@groundwork/protocol";
import type {} from "../src/debug.ts";

const SHOT_DIR = join(import.meta.dirname, "..", "..", "..", "test-results", "smoke");

const ROAD_NONE = 0;

async function waitReady(page: Page): Promise<void> {
  await expect(page.locator("#map canvas")).toBeVisible();
  await page.waitForFunction(() => window.groundwork?.ready === true);
}

/** Let Pixi draw a couple of frames after a camera change. */
async function frames(page: Page, n = 3): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let left = count;
        const step = (): void => {
          if (--left <= 0) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    n,
  );
}

/** Ask the server for the world, over a separate WebSocket from the page. */
async function serverState(page: Page): Promise<WorldSnapshot> {
  return page.evaluate(
    () =>
      new Promise<WorldSnapshot>((resolve, reject) => {
        const ws = new WebSocket(`ws://${location.host}/ws`);
        ws.onmessage = (ev) => {
          const msg = JSON.parse(String(ev.data)) as { type: string; state?: WorldSnapshot };
          if (msg.type === "welcome" && msg.state !== undefined) {
            ws.close();
            resolve(msg.state);
          }
        };
        ws.onerror = () => reject(new Error("websocket error"));
      }),
  );
}

test("map, HUD, pan and zoom, and placing a road", async ({ page }) => {
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.goto("/");
  await waitReady(page);

  // HUD: the game date and the clock speed, read from the DOM.
  const date = page.locator("#hud-date");
  const speed = page.locator("#hud-speed");
  await expect(date).toHaveText(/^Day \d+, \d\d:\d\d$/);
  await expect(speed).toHaveText(/^1x live$/);
  const firstDate = await date.textContent();
  await expect(date).not.toHaveText(firstDate ?? "", { timeout: 5000 });
  await page.locator("button[data-speed='4']").click();
  await expect(speed).toHaveText("4x sped up");
  await page.locator("button[data-speed='1']").click();
  await expect(speed).toHaveText("1x live");

  // Zoom out with the wheel to see a wide stretch of country.
  const scale0 = await page.evaluate(() => window.groundwork.camera.scale);
  await page.mouse.move(640, 420);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 300);
  await expect.poll(() => page.evaluate(() => window.groundwork.camera.scale)).toBeLessThan(scale0);

  // Pan by dragging.
  const x0 = await page.evaluate(() => window.groundwork.camera.x);
  await page.mouse.move(700, 400);
  await page.mouse.down();
  await page.mouse.move(600, 380, { steps: 5 });
  await page.mouse.up();
  const x1 = await page.evaluate(() => window.groundwork.camera.x);
  expect(x1).toBeLessThan(x0 - 50);
  await frames(page);
  await page.screenshot({ path: join(SHOT_DIR, "1-map.png") });

  // The map holds several terrain kinds, so the picture shows several colours.
  const kinds = await page.evaluate(() => new Set(window.groundwork.world!.terrain).size);
  expect(kinds).toBeGreaterThanOrEqual(4);

  // Home centres on the player's land at full size. Pick a tile there.
  await page.keyboard.press("Home");
  const target = await page.evaluate(() => {
    const w = window.groundwork.world!;
    const me = w.playerOwner();
    const home = w.playerHome();
    let best: { x: number; y: number } | undefined;
    let bestD = Infinity;
    for (let y = 0; y < w.height; y++) {
      for (let x = 0; x < w.width; x++) {
        const i = w.index(x, y);
        if (w.owner[i] !== me || w.road[i] !== 0 || w.terrain[i] === 2) continue;
        const d = (x - home.x) ** 2 + (y - home.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { x, y };
        }
      }
    }
    return best!;
  });
  const at = await page.evaluate(({ x, y }) => window.groundwork.tileToClient(x, y), target);
  const clip = { x: at.x - 40, y: at.y - 24, width: 80, height: 48 };

  // Park the pointer away from the tile so the hover outline is not in the clip.
  await page.mouse.move(1100, 700);
  await frames(page);
  const before = await page.screenshot({ clip });
  await page.screenshot({ path: join(SHOT_DIR, "2-before-road.png") });

  await page.locator("#tool-road").click();
  await expect(page.locator("#tool-road")).toHaveAttribute("aria-pressed", "true");
  await page.mouse.click(at.x, at.y);
  await expect(page.locator("#hud-message")).toHaveText(`Road ordered at (${target.x}, ${target.y})`);
  await page.waitForFunction(
    ({ x, y }) => {
      const w = window.groundwork.world!;
      return w.road[w.index(x, y)] !== 0;
    },
    target,
  );
  await page.mouse.move(1100, 700);
  await frames(page);
  const after = await page.screenshot({ clip });
  await page.screenshot({ path: join(SHOT_DIR, "3-road.png") });
  expect(after.equals(before)).toBe(false);

  // The server has the road too.
  const state = await serverState(page);
  const i = target.y * state.width + target.x;
  expect(state.road[i]).not.toBe(ROAD_NONE);
  expect(state.ops.find((op) => op.id === "player")!.cash).toBeLessThan(10_000);
});

test("the server serves the client and the socket on one port", async ({ request }) => {
  const index = await request.get("/");
  expect(index.status()).toBe(200);
  expect(await index.text()).toContain("<title>Groundwork</title>");
  const health = await request.get("/health");
  expect(health.status()).toBe(200);
  expect((await health.json()) as { ok: boolean }).toMatchObject({ ok: true });
});

test("the town, the ownership overlay and the inspector", async ({ page }) => {
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.goto("/");
  await waitReady(page);

  // T centres on the town at full size: its houses, market and roads.
  await page.keyboard.press("t");
  const town = await page.evaluate(() => window.groundwork.world!.townCentre());
  const townAt = await page.evaluate(({ x, y }) => window.groundwork.tileToClient(x, y), town);
  expect(Math.abs(townAt.x - 640)).toBeLessThan(2);
  expect(Math.abs(townAt.y - 400)).toBeLessThan(2);
  await page.mouse.move(1270, 790);
  await frames(page);
  await page.screenshot({ path: join(SHOT_DIR, "4-town.png") });

  // O toggles the ownership overlay. Zoom out to see every kind of land.
  const all = await page.evaluate(() => {
    const w = window.groundwork.world!;
    const kinds = new Set<string>();
    for (let i = 0; i < w.owner.length; i++) kinds.add(w.ownerKind(i));
    return [...kinds].sort();
  });
  expect(all).toEqual(["frontier", "person", "rival", "town", "you"]);
  await page.evaluate(() => {
    const w = window.groundwork.world!;
    window.groundwork.centreOn(w.width / 2, w.height / 2, 0.16);
  });
  await frames(page);
  const off = await page.screenshot();
  await page.screenshot({ path: join(SHOT_DIR, "5-overlay-off.png") });
  await page.keyboard.press("o");
  expect(await page.evaluate(() => window.groundwork.overlay())).toBe(true);
  await expect(page.locator("#tool-overlay")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#legend")).toBeVisible();
  await frames(page);
  const on = await page.screenshot();
  await page.screenshot({ path: join(SHOT_DIR, "6-overlay-on.png") });
  expect(on.equals(off)).toBe(false);
  await page.keyboard.press("o");
  expect(await page.evaluate(() => window.groundwork.overlay())).toBe(false);
  await expect(page.locator("#legend")).toBeHidden();

  // Clicking a tile fills the inspector. Pick a town tile, a person's tile, a deposit,
  // a rival tile and one of yours.
  const picks = await page.evaluate(() => {
    const w = window.groundwork.world!;
    const find = (ok: (i: number) => boolean): { x: number; y: number } => {
      for (let i = 0; i < w.owner.length; i++) if (ok(i)) return { x: i % w.width, y: Math.floor(i / w.width) };
      throw new Error("no such tile");
    };
    return {
      town: find((i) => w.ownerKind(i) === "town" && w.road[i] === 0 && i !== w.town.market && w.homeOf(i) === undefined),
      market: find((i) => i === w.town.market),
      person: find((i) => w.ownerKind(i) === "person"),
      deposit: find((i) => w.terrain[i] === 5),
      rival: find((i) => w.ownerKind(i) === "rival"),
      you: find((i) => w.ownerKind(i) === "you"),
    };
  });
  const expected = await page.evaluate((p) => {
    const w = window.groundwork.world!;
    const person = w.people.find((q) => w.ownerName(w.index(p.person.x, p.person.y)) === q.name);
    const d = w.index(p.deposit.x, p.deposit.y);
    return { town: w.town.name, person: person?.name, richness: w.richness[d], depositOwner: w.ownerName(d) };
  }, picks);
  expect(expected.person).toBeDefined();
  expect(expected.richness).toBeGreaterThan(0);

  const inspect = async (t: { x: number; y: number }): Promise<void> => {
    await page.evaluate(({ x, y }) => window.groundwork.centreOn(x, y, 1), t);
    await frames(page);
    const at = await page.evaluate(({ x, y }) => window.groundwork.tileToClient(x, y), t);
    await page.mouse.click(at.x, at.y);
    await expect(page.locator("#inspector")).toBeVisible();
    await expect(page.locator("#inspector-title")).toHaveText(`Tile (${t.x}, ${t.y})`);
  };
  const terrain = page.locator("#inspector-terrain");
  const owner = page.locator("#inspector-owner");
  const richness = page.locator("#inspector-richness");
  const building = page.locator("#inspector-building");

  await inspect(picks.town);
  await expect(owner).toHaveText(expected.town);
  await expect(terrain).toHaveText(/^(flat|hills|forest|rock)$/);
  await expect(richness).toHaveText("none");
  await page.screenshot({ path: join(SHOT_DIR, "7-inspector-town.png") });

  await inspect(picks.market);
  await expect(owner).toHaveText(expected.town);
  await expect(building).toHaveText("market");

  await inspect(picks.person);
  await expect(owner).toHaveText(expected.person!);

  await inspect(picks.deposit);
  await expect(terrain).toHaveText("deposit");
  await expect(owner).toHaveText(expected.depositOwner);
  await expect(richness).toHaveText(String(expected.richness));
  await page.screenshot({ path: join(SHOT_DIR, "8-inspector-deposit.png") });

  await inspect(picks.rival);
  await expect(owner).toHaveText("Redrock Mining");

  await inspect(picks.you);
  await expect(owner).toHaveText("You");
});
