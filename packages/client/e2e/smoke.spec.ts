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
