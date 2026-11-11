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

  // Attention in the HUD, before the road. A fresh world starts the day at 40.
  const attention = page.locator("#hud-attention");
  await expect(attention).toHaveText(/^\d+\/40$/);
  const attentionBefore = Number((await attention.textContent())!.split("/")[0]);

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
  // The road cost 1 attention, and the HUD shows it.
  await expect(attention).toHaveText(`${attentionBefore - 1}/40`);
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
  expect(state.ops.find((op) => op.id === "player")!.attention).toBe(attentionBefore - 1);
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

/** The fast-clock test server from playwright.config.ts. A tick there is 25 ms. */
const FAST_URL = "http://127.0.0.1:8792/";

test("staking frontier land from the sidebar", async ({ page }) => {
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.goto(FAST_URL);
  await waitReady(page);

  // The build sidebar has the Road and Stake tools.
  const sidebar = page.locator("#sidebar");
  await expect(sidebar.locator("#tool-road")).toBeVisible();
  await expect(sidebar.locator("#tool-stake")).toBeVisible();

  // The frontier tile nearest your land that is dry, not a deposit, and has no road.
  const target = await page.evaluate(() => {
    const w = window.groundwork.world!;
    const home = w.playerHome();
    let best: { x: number; y: number } | undefined;
    let bestD = Infinity;
    for (let y = 0; y < w.height; y++) {
      for (let x = 0; x < w.width; x++) {
        const i = w.index(x, y);
        if (w.owner[i] !== 0 || w.road[i] !== 0 || w.terrain[i] === 2 || w.terrain[i] === 5) continue;
        const d = (x - home.x) ** 2 + (y - home.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { x, y };
        }
      }
    }
    return best!;
  });
  await page.evaluate(({ x, y }) => window.groundwork.centreOn(x, y, 1.5), target);
  const at = await page.evaluate(({ x, y }) => window.groundwork.tileToClient(x, y), target);
  const clip = { x: at.x - 60, y: at.y - 50, width: 120, height: 80 };
  await page.mouse.move(1100, 760);
  await frames(page);
  const before = await page.screenshot({ clip });

  await page.locator("#tool-stake").click();
  await expect(page.locator("#tool-stake")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#tool-road")).toHaveAttribute("aria-pressed", "false");
  await page.mouse.click(at.x, at.y);
  await expect(page.locator("#hud-message")).toHaveText(`Claim staked at (${target.x}, ${target.y}). Surveying.`);
  await page.waitForFunction(({ x, y }) => {
    const w = window.groundwork.world!;
    return w.surveyAt(w.index(x, y)) !== undefined;
  }, target);

  // The tile is drawn as being surveyed: stakes and a pennant in your colour.
  await page.mouse.move(1100, 760);
  await frames(page);
  const surveying = await page.screenshot({ clip });
  await page.screenshot({ path: join(SHOT_DIR, "9-surveying.png") });
  expect(surveying.equals(before)).toBe(false);

  // Turn the tool off and inspect the tile: nobody owns it yet and you are surveying it.
  await page.locator("#tool-stake").click();
  await expect(page.locator("#tool-stake")).toHaveAttribute("aria-pressed", "false");
  await page.mouse.click(at.x, at.y);
  await expect(page.locator("#inspector-title")).toHaveText(`Tile (${target.x}, ${target.y})`);
  const owner = page.locator("#inspector-owner");
  const survey = page.locator("#inspector-survey");
  // The survey can finish while this runs, so either state is fine here.
  await expect(survey).toHaveText(/^(You, .* left|none)$/);

  // Once the survey is done the inspector names you as the owner.
  await expect(owner).toHaveText("You", { timeout: 30_000 });
  await expect(survey).toHaveText("none");
  await page.mouse.move(1100, 760);
  await frames(page);
  await page.screenshot({ path: join(SHOT_DIR, "10-staked.png") });

  // The server agrees, and the claim fee came out of your cash.
  const state = await serverState(page);
  const i = target.y * state.width + target.x;
  const me = state.parties.findIndex((p) => p.kind === "op" && p.id === "player");
  expect(state.owner[i]).toBe(me);
  expect(state.ops.find((op) => op.id === "player")!.cash).toBe(10_000 - 200);
  expect(state.surveys).toEqual([]);
});

test("placing a depot next to a road from the sidebar", async ({ page }) => {
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.goto(FAST_URL);
  await waitReady(page);
  await expect(page.locator("#sidebar #tool-depot")).toBeVisible();

  // A dry tile of yours, nearest the middle of your land, with a dry tile of yours
  // to its right. Neither has a road or a building.
  const site = await page.evaluate(() => {
    const w = window.groundwork.world!;
    const me = w.playerOwner();
    const home = w.playerHome();
    const free = (x: number, y: number): boolean => {
      if (!w.inBounds(x, y)) return false;
      const i = w.index(x, y);
      return w.owner[i] === me && w.terrain[i] !== 2 && w.road[i] === 0 && w.buildingAt(i) === undefined;
    };
    let best: { x: number; y: number } | undefined;
    let bestD = Infinity;
    for (let y = 0; y < w.height; y++) {
      for (let x = 0; x < w.width; x++) {
        if (!free(x, y) || !free(x + 1, y)) continue;
        const d = (x - home.x) ** 2 + (y - home.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { x, y };
        }
      }
    }
    return best!;
  });
  const road = { x: site.x + 1, y: site.y };
  await page.evaluate(({ x, y }) => window.groundwork.centreOn(x, y, 1.5), site);
  await frames(page);
  const at = await page.evaluate(({ x, y }) => window.groundwork.tileToClient(x, y), site);
  const roadAt = await page.evaluate(({ x, y }) => window.groundwork.tileToClient(x, y), road);
  const clip = { x: at.x - 60, y: at.y - 70, width: 120, height: 100 };
  const cashBefore = await page.evaluate(() => window.groundwork.world!.playerCash()!);

  // Lay the road with the Road tool.
  await page.locator("#tool-road").click();
  await page.mouse.click(roadAt.x, roadAt.y);
  await expect(page.locator("#hud-message")).toHaveText(`Road ordered at (${road.x}, ${road.y})`);

  // Then the depot beside it with the Depot tool.
  await page.locator("#tool-depot").click();
  await expect(page.locator("#tool-depot")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#tool-road")).toHaveAttribute("aria-pressed", "false");
  await page.mouse.click(at.x, at.y);
  await expect(page.locator("#hud-message")).toHaveText(`Depot ordered at (${site.x}, ${site.y}). Under construction.`);
  await page.waitForFunction(({ x, y }) => {
    const w = window.groundwork.world!;
    return w.buildingAt(w.index(x, y)) !== undefined;
  }, site);

  // Inspect it: under construction.
  await page.locator("#tool-depot").click();
  await page.mouse.click(at.x, at.y);
  const building = page.locator("#inspector-building");
  await expect(building).toHaveText(/^Your depot, under construction, .* left$/);
  await page.mouse.move(1100, 760);
  await frames(page);
  const underConstruction = await page.screenshot({ clip });
  await page.screenshot({ path: join(SHOT_DIR, "11-depot-building.png") });

  // 8 game hours at 25 ms a tick is 12 seconds. Then it is built and staffed.
  await expect(building).toHaveText("Your depot, staffed", { timeout: 40_000 });
  await frames(page);
  const built = await page.screenshot({ clip });
  await page.screenshot({ path: join(SHOT_DIR, "12-depot-built.png") });
  expect(built.equals(underConstruction)).toBe(false);

  // The server agrees, and the price with hiring came out of your cash.
  const state = await serverState(page);
  const i = site.y * state.width + site.x;
  expect(state.buildings.find((b) => b.tile === i)).toMatchObject({ kind: "depot", op: "player", remaining: 0 });
  const cashAfter = state.ops.find((op) => op.id === "player")!.cash;
  // A road costs at most a few hundred, the depot 1,500. A wage may have been paid since.
  expect(cashBefore - cashAfter).toBeGreaterThanOrEqual(1_500);
});
