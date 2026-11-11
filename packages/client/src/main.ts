// Browser entry: connect, draw the map, handle input, keep the HUD current
// (DESIGN.md 15). The client only sends commands. The server decides.

import { Application } from "pixi.js";
import { formatAttention, TERRAIN, type ServerMessage } from "@groundwork/protocol";
import { Camera, tileCenter } from "./iso.ts";
import { Link, socketUrl, type LinkStatus } from "./net.ts";
import type { ClientDebug, Mode } from "./debug.ts";
import { MapRenderer } from "./render.ts";
import { ClientWorld, formatClock, PLAYER_OP, ROAD_NONE, type TileInfo } from "./state.ts";

/** Sidebar tools and the mode each one turns on. */
const TOOLS: readonly { readonly id: string; readonly mode: Exclude<Mode, "inspect"> }[] = [
  { id: "tool-road", mode: "road" },
  { id: "tool-stake", mode: "stake" },
  { id: "tool-depot", mode: "depot" },
];

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (e === null) throw new Error(`missing #${id}`);
  return e as T;
}

const HOME_SCALE = 1;
const START_SCALE = 0.5;
const PAN_STEP = 64;

async function main(): Promise<void> {
  const host = el<HTMLDivElement>("map");
  const app = new Application();
  await app.init({ resizeTo: window, background: 0x17221a, antialias: true, preference: "webgl" });
  host.appendChild(app.canvas);

  const hudDate = el("hud-date");
  const hudSpeed = el("hud-speed");
  const hudCash = el("hud-cash");
  const hudAttention = el("hud-attention");
  const hudMessage = el("hud-message");
  const hudConn = el("hud-conn");
  const toolButtons = TOOLS.map((t) => ({ mode: t.mode, button: el<HTMLButtonElement>(t.id) }));
  const overlayButton = el<HTMLButtonElement>("tool-overlay");
  const inspector = el<HTMLElement>("inspector");
  const legend = el<HTMLElement>("legend");
  const inspTitle = el("inspector-title");
  const inspTerrain = el("inspector-terrain");
  const inspOwner = el("inspector-owner");
  const inspRichness = el("inspector-richness");
  const inspBuilding = el("inspector-building");
  const inspSurvey = el("inspector-survey");
  const speedButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("button[data-speed]"));

  const camera = new Camera();
  let world: ClientWorld | undefined;
  let renderer: MapRenderer | undefined;
  let mode: Mode = "inspect";
  let hoverTile: { x: number; y: number } | undefined;
  let selected: { x: number; y: number } | undefined;
  let overlay = false;

  const debug: ClientDebug = {
    ready: false,
    world: undefined,
    camera,
    mode: () => mode,
    overlay: () => overlay,
    centreOn: (x, y, scale) => camera.centerOn(tileCenter(x, y), app.screen.width, app.screen.height, scale),
    tileToClient: (x, y) => {
      const s = camera.toScreen(tileCenter(x, y));
      const r = app.canvas.getBoundingClientRect();
      return { x: r.left + s.x, y: r.top + s.y };
    },
  };
  window.groundwork = debug;

  const say = (text: string): void => {
    hudMessage.textContent = text;
  };

  const refreshHud = (): void => {
    if (world === undefined) return;
    hudDate.textContent = world.date;
    hudSpeed.textContent = formatClock(world.clock);
    const cash = world.playerCash();
    hudCash.textContent = cash === undefined ? "-" : `$${cash.toLocaleString("en-US")}`;
    hudAttention.textContent = formatAttention(world.playerAttention());
    for (const b of speedButtons) {
      const on = world.clock.mode !== "away" && Number(b.dataset["speed"]) === world.clock.speed;
      b.setAttribute("aria-pressed", String(on));
    }
  };

  /** Whether the current tool would likely be accepted on a tile. The server decides. */
  const canUseTool = (t: { x: number; y: number }): boolean => {
    if (world === undefined || !world.inBounds(t.x, t.y)) return false;
    const i = world.index(t.x, t.y);
    if (world.terrain[i] === TERRAIN.water) return false;
    const owner = world.owner[i]!;
    if (mode === "road") return (owner === 0 || owner === world.playerOwner()) && world.road[i] === ROAD_NONE;
    if (mode === "stake") return owner === 0 && world.surveyAt(i) === undefined;
    if (mode === "depot") {
      const w = world;
      if (owner !== w.playerOwner() || w.road[i] !== ROAD_NONE || w.buildingAt(i) !== undefined) return false;
      const sides = [[t.x + 1, t.y], [t.x - 1, t.y], [t.x, t.y + 1], [t.x, t.y - 1]] as const;
      return sides.some(([x, y]) => w.inBounds(x, y) && w.road[w.index(x, y)] !== ROAD_NONE);
    }
    return true;
  };

  const refreshHover = (): void => {
    renderer?.setHover(hoverTile, mode, hoverTile !== undefined && canUseTool(hoverTile));
  };

  const setMode = (m: Mode): void => {
    mode = m;
    for (const t of toolButtons) t.button.setAttribute("aria-pressed", String(t.mode === m));
    app.canvas.style.cursor = m === "inspect" ? "default" : "crosshair";
    refreshHover();
  };

  /** A tool button or key turns its tool on, or off if it is already on. */
  const toggleTool = (m: Exclude<Mode, "inspect">): void => setMode(mode === m ? "inspect" : m);

  const setOverlay = (on: boolean): void => {
    overlay = on;
    overlayButton.setAttribute("aria-pressed", String(on));
    legend.hidden = !on;
    renderer?.setOverlay(on);
  };

  const showInspector = (info: TileInfo | undefined): void => {
    if (info === undefined) {
      inspector.hidden = true;
      return;
    }
    inspector.hidden = false;
    inspector.dataset["owner"] = info.ownerKind;
    inspTitle.textContent = `Tile (${info.x}, ${info.y})`;
    inspTerrain.textContent = info.terrain;
    inspOwner.textContent = info.owner;
    inspRichness.textContent = info.richness === undefined ? "none" : String(info.richness);
    inspBuilding.textContent = info.building ?? "none";
    inspSurvey.textContent = info.survey ?? "none";
  };

  const refreshInspector = (): void => {
    if (world === undefined || selected === undefined) return;
    showInspector(world.inspect(selected.x, selected.y));
  };

  const goTown = (): void => {
    if (world === undefined) return;
    const c = world.townCentre();
    camera.centerOn(tileCenter(c.x, c.y), app.screen.width, app.screen.height, HOME_SCALE);
  };

  const goHome = (scale = HOME_SCALE): void => {
    if (world === undefined) return;
    const home = world.playerHome();
    camera.centerOn(tileCenter(home.x, home.y), app.screen.width, app.screen.height, scale);
  };

  const onMessage = (msg: ServerMessage): void => {
    switch (msg.type) {
      case "welcome": {
        const first = world === undefined;
        world = new ClientWorld(msg.state, msg.date, msg.clock, msg.opNames);
        debug.world = world;
        if (renderer !== undefined) {
          app.stage.removeChild(renderer.root);
          renderer.root.destroy({ children: true });
        }
        renderer = new MapRenderer(world);
        renderer.setOverlay(overlay);
        renderer.setSelected(selected);
        app.stage.addChild(renderer.root);
        refreshInspector();
        if (first) goHome(START_SCALE);
        refreshHud();
        debug.ready = true;
        break;
      }
      case "tick": {
        if (world === undefined || renderer === undefined) return;
        renderer.invalidate(world.applyDelta(msg.tick, msg.date, msg.clock, msg.delta));
        refreshHud();
        refreshHover();
        refreshInspector();
        break;
      }
      case "command_result":
        break;
      case "error":
        say(`Server: ${msg.message}`);
        break;
    }
  };

  const onStatus = (status: LinkStatus): void => {
    hudConn.dataset["status"] = status;
    hudConn.textContent = status === "open" ? "connected" : status;
  };

  const link = new Link(socketUrl(window.location), { message: onMessage, status: onStatus });

  const clickTile = async (t: { x: number; y: number }): Promise<void> => {
    if (world === undefined || !world.inBounds(t.x, t.y)) return;
    if (mode === "road") {
      const result = await link.command({ type: "place_road", op: PLAYER_OP, x: t.x, y: t.y });
      say(result.ok ? `Road ordered at (${t.x}, ${t.y})` : result.error.message);
      return;
    }
    if (mode === "stake") {
      const result = await link.command({ type: "stake_claim", op: PLAYER_OP, x: t.x, y: t.y });
      say(result.ok ? `Claim staked at (${t.x}, ${t.y}). Surveying.` : result.error.message);
      return;
    }
    if (mode === "depot") {
      const result = await link.command({ type: "place_building", op: PLAYER_OP, kind: "depot", x: t.x, y: t.y });
      say(result.ok ? `Depot ordered at (${t.x}, ${t.y}). Under construction.` : result.error.message);
      return;
    }
    selected = t;
    renderer?.setSelected(t);
    const info = world.inspect(t.x, t.y);
    showInspector(info);
    say(`(${t.x}, ${t.y}) ${info.terrain}, owned by ${info.owner}`);
  };

  // Pointer: drag pans, a click without a drag acts on the tile.
  let drag: { x: number; y: number; moved: boolean } | undefined;
  app.canvas.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY, moved: false };
    app.canvas.setPointerCapture(e.pointerId);
  });
  app.canvas.addEventListener("pointermove", (e) => {
    if (drag !== undefined) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (drag.moved || Math.abs(dx) + Math.abs(dy) > 4) {
        drag.moved = true;
        camera.pan(dx, dy);
        drag.x = e.clientX;
        drag.y = e.clientY;
      }
    }
    if (renderer !== undefined) {
      const r = app.canvas.getBoundingClientRect();
      hoverTile = renderer.tileAt(camera, e.clientX - r.left, e.clientY - r.top);
      refreshHover();
    }
  });
  app.canvas.addEventListener("pointerup", (e) => {
    const d = drag;
    drag = undefined;
    if (d === undefined || d.moved || renderer === undefined) return;
    const r = app.canvas.getBoundingClientRect();
    void clickTile(renderer.tileAt(camera, e.clientX - r.left, e.clientY - r.top));
  });
  app.canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const r = app.canvas.getBoundingClientRect();
      camera.zoomAt({ x: e.clientX - r.left, y: e.clientY - r.top }, Math.exp(-e.deltaY * 0.0015));
    },
    { passive: false },
  );

  window.addEventListener("keydown", (e) => {
    const centre = { x: app.screen.width / 2, y: app.screen.height / 2 };
    switch (e.key) {
      case "ArrowLeft":
      case "a":
        camera.pan(PAN_STEP, 0);
        break;
      case "ArrowRight":
      case "d":
        camera.pan(-PAN_STEP, 0);
        break;
      case "ArrowUp":
      case "w":
        camera.pan(0, PAN_STEP);
        break;
      case "ArrowDown":
      case "s":
        camera.pan(0, -PAN_STEP);
        break;
      case "+":
      case "=":
        camera.zoomAt(centre, 1.25);
        break;
      case "-":
      case "_":
        camera.zoomAt(centre, 0.8);
        break;
      case "Home":
        goHome();
        break;
      case "t":
        goTown();
        break;
      case "o":
        setOverlay(!overlay);
        break;
      case "r":
        toggleTool("road");
        break;
      case "c":
        toggleTool("stake");
        break;
      case "b":
        toggleTool("depot");
        break;
      case "Escape":
        setMode("inspect");
        selected = undefined;
        renderer?.setSelected(undefined);
        showInspector(undefined);
        break;
    }
  });

  for (const t of toolButtons) t.button.addEventListener("click", () => toggleTool(t.mode));
  overlayButton.addEventListener("click", () => setOverlay(!overlay));
  for (const b of speedButtons) b.addEventListener("click", () => link.setSpeed(Number(b.dataset["speed"])));

  app.ticker.add(() => renderer?.update(camera, app.screen.width, app.screen.height));
}

void main();
