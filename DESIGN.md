# Groundwork: design

A persistent, browser-played building game on another planet. You are one
builder inside a living world, not its mayor. AI operations, business owners
and citizens play by the same rules you do. You grow an operation from a
frontier claim into something that shapes towns, and you earn more say in the
world as you go. No combat, ever. Competition is economic.

This document is the source of truth. `PROCESS.md` says how it gets built.
Sections are numbered so plan items can point at them.

## 1. Invariants

These hold in every ring. A change that breaks one is a design change and
needs a decision in section 24.

1. **You are a peer, not the overseer.** The player is an Operation, the same
   kind of entity as AI rival operations. There is no player-only command.
   Every command goes through one validated command API (section 12.2) that
   the client, the foreman and the AI all use.
2. **Same rules for everyone.** Same costs, same build times, same attention
   budget per game day, same information limits. AIs never see what they
   could not see as a player would.
3. **No combat.** No weapons, no destruction of other players' things. You can
   outbid, outbuild, outnegotiate and outgrow someone. Losing is economic.
4. **The simulation is code, the minds are models.** The economy, physics,
   construction and money are deterministic code. Language models only choose
   among legal actions and talk. A model can never move money, create goods or
   change state except by issuing a command the sim validates.
5. **Deterministic sim.** Same seed plus same command log gives the same world,
   bit for bit. Model outputs enter the world only as logged commands, so a
   replay never calls a model.
6. **The world is persistent and fair while you are away.** It keeps running
   when no one is watching, at a slower clock, and your foreman runs your
   operation on your standing orders with the same budget the AIs have.
7. **Model use is governed.** Thinking gets turned down, never off, when the
   budget runs tight. With every model unavailable, the world still runs on
   reflex AI (section 13.1).
8. **Readable at a glance.** Every flow that matters (goods, money, power,
   vehicles) is visible on the map.

## 2. Glossary

- **Operation (Op).** An economic actor that owns land, buildings, vehicles
  and cash, and issues commands. The player is one. Rivals are others.
- **Mind.** The model-backed decision maker for a named NPC or an AI Op.
- **Reflex AI.** Plain-code rules and utility scoring that run every tick for
  free. Every agent has one. Minds steer it.
- **Foreman.** Your operation's Mind while you are away. Follows your
  standing orders.
- **Standing orders.** Rules you write for your foreman, in plain text plus
  structured limits.
- **Attention.** Per-Op budget of non-routine commands per game day.
- **Parcel.** One tile of land with an owner.
- **Town.** A settlement with citizens, businesses and an NPC council.
- **Frontier.** Unclaimed land outside towns, where raw resources are.
- **Standing.** Your reputation with a person, business, town or Op.
- **Role.** A granted position (franchise, steward, council seat) that unlocks
  commands in a scope.
- **Era.** A world-wide tech level.

## 3. The player loop

Minute to minute: lay roads, place buildings, route vehicles, watch harvesters
drive out to resource fields and back, haul goods to towns, sell.

Hour to hour (a game day): negotiate land, sign supply contracts, react to
what rivals did, talk to people, decide what to build next.

Day to day (real days): check in, read the foreman's briefing, adjust standing
orders, push a big project forward. A game year is about two weeks of real
time while you play.

Long arc, all open-ended (sandbox, no win screen):
- **Growth.** From a single claim to a network of harvesters, refineries and
  contracts.
- **Standing and roles.** Reputation with towns earns roles: utility
  franchises, district stewardships, council seats (section 9).
- **Eras.** The whole world advances through tech eras, driven by what gets
  produced (section 10).
- **Rivals.** AI operations grow alongside you and compete for land, workers,
  contracts and resources (section 8).

## 4. The world

### 4.1 Setting

Another planet, settled generations ago, never named in-game as "space".
It looks and works like a near-future Earth: cars, trucks, rail, power
plants, offices, apartments. Beyond the towns is frontier with resources that
do not exist on Earth (section 5.1), a few strange landforms and a sense of
open space. Tone: grounded, optimistic, a little wild-west at the edges.
Nothing alien, no sci-fi chrome.

### 4.2 Map

- Isometric tile grid. Ring 1 map: 128 x 128. Later rings: 256 x 256 and up,
  chunked.
- Terrain: flat, hills, water, forest, rock, resource deposits.
- Generated from a seed. Towns placed on good land near water, deposits
  scattered in the frontier, richer and farther away.
- Every parcel has an owner: a town authority, a citizen, a business, an Op,
  or no one (frontier).

### 4.3 Towns

A town has a council (an NPC group with its own rules, set in world settings,
never by the player), citizens, businesses, a market and demand. Towns grow
on their own when they have demand, land and materials. Building materials
come from the market. That is where you come in.

## 5. Economy

### 5.1 Goods (target: 12, Ring 1 uses ore only)

| Tier | Good | Made from | Where |
|---|---|---|---|
| Raw | Ore | deposits | frontier hills |
| Raw | Timber | forest | frontier |
| Raw | Crops | farmland | near towns |
| Raw | Lumen crystal | crystal fields | deep frontier |
| Raw | Water | wells, rivers | anywhere with water |
| Refined | Metal | ore + power | smelter |
| Refined | Lumber | timber | mill |
| Refined | Food | crops + water | processor |
| Refined | Cells | lumen crystal | refinery. Portable energy, the futuristic part |
| Made | Parts | metal + power | works |
| Made | Building materials | lumber + metal | yard |
| Made | Electronics | parts + cells | fab |

Power is a utility, not a good: generated by plants (cells, later others),
carried on visible lines, sold by whoever holds the franchise.

### 5.2 Markets and prices

- Each town has a market with per-good stock, demand and a price set by a
  simple clearing rule (price rises when stock is short of demand, falls when
  long). Deterministic.
- Anyone can sell into a market or buy from it. Contracts (section 5.4) bypass
  the market at a fixed price.
- Transport is physical: goods only move in vehicles or on rail, and only on
  roads or track someone owns or has access to.

### 5.3 Land

- Frontier parcels can be **staked**: pay a claim fee, survey takes time.
- Owned parcels can be **bought** or **leased** from the owner through an
  offer. Owners decide with their Mind (named NPCs) or reflex rules (everyone
  else). History matters: an owner who dislikes you can refuse.
- Towns can sell or lease town land through their council.

### 5.4 Offers and contracts

An **Offer** is a structured, typed proposal: parties, what each gives
(cash, goods per period, land, access, a role), duration, penalties. Offers
come from menus or from chat (section 13.3). Accepting creates a **Contract**
the sim enforces each day. Breaking a contract costs the penalty and standing.

### 5.5 Labor

Buildings and vehicles need workers. Workers come from towns, and commuting
distance matters. Wages are set by the Op and compete with other employers.
Ring 1 abstracts this as a hiring cost plus a staffing level.

## 6. Operations

### 6.1 What an Op is

Cash, assets (parcels, buildings, vehicles), contracts, standing with others,
roles, research. The player Op and every rival Op are the same type.

### 6.2 Attention

Every Op gets the same attention budget per game day (Ring 1: 40 points).
Routine automation (vehicle routes, standing sell orders, contract
fulfillment) costs nothing. Non-routine commands cost points: placing a
building, making an offer, changing a route, hiring. This caps how fast any
Op, human or AI, can act, so an AI deliberating around the clock cannot
outpace you by sheer volume. Unused attention does not bank beyond one day.

### 6.3 Building

You place buildings on parcels you own or lease. Construction takes game
time, materials and a crew. You can build anything the current era and your
roles allow: roads, harvesters, depots, refineries, housing for your workers,
landmarks, and with a utility franchise, power plants and lines.

## 7. People

### 7.1 Citizens

Two layers.
- **The crowd.** Most citizens are simulated statistically per town: counts,
  jobs, income, mood. No Mind.
- **Named people.** A capped set per town (Ring 1: 6, later about 30). Each has
  a home, a job, a personality, goals, relationships and memories, and a Mind.
  You can click them and talk to them. They own land, start businesses, sit on
  councils, and remember what you did.

### 7.2 Businesses

Run by named people. They buy, sell, hire, set prices, expand and go
bankrupt. Ring 1 has none beyond the town market. Ring 4 fills this in.

### 7.3 Memory

Each named agent stores: a profile (personality, values, goals), a
relationship entry per entity it knows (score plus short notes), an episodic
log of events it witnessed or was told, and a rolling summary rewritten every
game week. Gossip spreads events between agents with some loss. This is how a
bad deal with one landowner makes the next one wary.

## 8. Rival operations

AI Ops play the same game. Each has a leader (a named person with a Mind),
a personality (aggressive expander, careful refiner, deal maker) and a home
region. Some are nearby and contest land. Some are far away and show up as
trade partners and news. Ring 1 has one rival. Section 13 says how they
think. Section 15 says how they stay fair.

## 9. Standing and roles

- Standing is a number per relationship, moved by contracts kept or broken,
  prices, wages, what you build near people, and gossip.
- Roles are granted by councils or businesses when standing and track record
  qualify you, usually through a bid that rivals can also enter:
  - **Utility franchise:** build and sell power (later water) in a town.
  - **District steward:** approve building in a district, collect a fee.
  - **Council seat:** vote on town rules.
- Roles unlock commands in a scope and can be lost.

## 10. Eras

The world advances through eras when cumulative production of key goods
crosses thresholds (for example, enough cells produced worldwide unlocks the
next power plants and vehicles). Your own research buildings and tech
licensing from NPC firms unlock things for your Op inside the era. Ring 1 has
one era.

## 11. Time and persistence

### 11.1 Clock

- Sim tick = 1 game minute.
- **Present clock:** 1 game day = 1 real hour (a tick every 2.5 s). While you
  watch, you can speed up to 4x.
- **Away clock:** when no one has interacted for 15 real minutes, the world
  runs at 0.25x (1 game day = 4 real hours).
- With friends (Ring 8), the away clock applies only when everyone is away,
  and speed-up is disabled.

### 11.2 Persistence

The server runs 24/7 on the Fedora box (section 18). State lives in SQLite:
a snapshot every game day plus the command log since. Restarting resumes
exactly. The store records a world format version. A save in an older
format is kept under a new name and a fresh world starts. The client is a view and holds nothing that matters.

### 11.3 Foreman, standing orders and the briefing

- **Standing orders** are plain-text rules plus structured limits: "keep the
  harvesters running", "never sell the ridge parcels", "buy ore under 40",
  "don't spend more than 5,000 a day".
- While you are away, your **foreman** (a Mind) runs your Op under those
  orders with the same attention budget everyone has. Structured limits are
  enforced by the sim, not trusted to the model.
- When you return you get a **briefing**: what happened, what the foreman did
  and why, what rivals did, offers waiting for you, decisions it would not
  make without you.

## 12. Architecture

### 12.1 Shape

```
browser client  <--WebSocket-->  server (Node, Fedora box)
                                   |-- sim (pure TS, deterministic)
                                   |-- minds (claude -p, API fallback)
                                   |-- SQLite (snapshots, command log, memories, usage)
```

Server-authoritative from day one, so friends can join later without a
rewrite. The client sends commands and receives state deltas.

### 12.2 Packages (pnpm workspace, TypeScript, strict)

| Package | Holds | Depends on |
|---|---|---|
| `packages/protocol` | Command, event and state types, zod schemas, wire messages | nothing |
| `packages/sim` | World state, tick, commands, economy, reflex AI. No I/O, no clock, no randomness except the seeded RNG | protocol |
| `packages/minds` | Mind interface, prompts, backends, budget governor, memory | protocol |
| `packages/server` | Clock, WebSocket, persistence, scheduling Minds, presence | sim, minds, protocol |
| `packages/client` | Vite, PixiJS isometric renderer, DOM UI | protocol |

The command API is one function in sim: `apply(state, command) -> Result`.
Every caller (client, foreman, rival Minds, reflex AI) goes through it.

### 12.3 Determinism rules

Seeded RNG only (no `Math.random`, no `Date`). Integer or fixed-point money.
Stable iteration order. A test replays a recorded log and compares state
hashes (section 17).

## 13. The minds

### 13.1 Three tiers

| Tier | Runs | Cost | Used for |
|---|---|---|---|
| Reflex | every tick, plain code | free | moving, routine buying and selling, default behavior |
| Deliberation | on a schedule and on events | model call | plans and decisions for named NPCs, rival leaders, the foreman |
| Conversation | when you talk to someone | model call, streamed | chat and negotiation |

Deliberation sets goals and weights the reflex tier uses. A rival leader
might deliberate once or twice a game day and on events (outbid, contract
offered, parcel for sale nearby). Named citizens deliberate less often.

### 13.2 Output is actions

A Mind's reply is JSON against a schema derived from the same command types
the sim uses: zero or more commands plus private notes for its memory. The
sim validates every command. Invalid ones are dropped and logged. Minds see
only what their entity could see (invariant 2).

### 13.3 Chat and negotiation

You type to anyone. The NPC's Conversation Mind replies in character and can
put a structured Offer on the table, which appears as a card in the chat. You
accept or counter with buttons or words. Only accepting a card changes the
world. The NPC's memory records the conversation.

### 13.4 Backends

One `Mind` interface, three implementations:
- **`claude -p`** (default). The server shells out to Claude Code in headless
  mode on the Fedora box, under Matt's logged-in subscription, with tools off
  and JSON output. Cheap model for deliberation, a stronger one for
  conversation and rival leaders. Models are config, not code.
  Proven on 2026-11-11 (Claude Code 2.1.319 on the Fedora box), the call is:
  `~/.local/bin/claude -p <prompt> --model haiku --output-format json
  --tools '' --system-prompt <persona> --setting-sources ''
  --strict-mcp-config --no-session-persistence --json-schema <schema>`, run
  from an empty working directory. The reply's `structured_output` field holds
  the schema-valid object. Measured: about 1.2k input tokens, 2.5 s. Without
  `--system-prompt`, `--setting-sources ''` and `--strict-mcp-config` the
  call drags in about 74k tokens of Claude Code context, so those flags are
  required. `claude` is not on the PATH of non-interactive ssh or systemd, so
  the backend uses the absolute path from config.
- **Anthropic API** (fallback, and the backend once friends join). Same
  prompts, through `@anthropic-ai/sdk`, with prompt caching. Model choice at
  that point: Claude Haiku 5.5 for the crowd, Claude Sonnet 5.5 for chat and
  leaders, under a $20 per month cap.
- **Fake** (tests). Replays recorded replies by prompt hash, or scripted
  rules. All automated tests use it. No test calls a real model unless it is
  explicitly a live smoke test.

### 13.5 Budget governor

- Counts model calls per real hour and per day for the `claude -p` backend,
  and dollars per month for the API backend.
- Default `claude -p` limits: 120 calls per real hour, conversation exempt
  but rate limited. Tunable in config. The limit exists so NPCs never starve
  Matt's own Claude Code sessions on the same subscription.
- When near the limit, deliberation intervals stretch and lower-priority
  agents fall back to reflex. Conversation and the foreman go last.
- Usage is recorded per agent and shown in a debug panel.

## 14. Fairness while away

The foreman and the away clock together (decision D-004). Plus:
- The attention budget (section 6.2) applies to every Op.
- Rival Minds deliberate on the same schedule present or away.
- A soak test runs a headless year with reflex AI and the fake Mind and
  checks that no Op runs away with the map from attention alone (section 17).

## 15. Rendering and UI

- PixiJS, isometric 2:1 tiles (64 x 32 px), chunked rendering, culling.
- Placeholder art is drawn in code (flat-shaded shapes) until the art ring.
  Every building type has a distinct silhouette and color from day one.
- Vehicles move smoothly between ticks (interpolated on the client).
- UI is DOM over the canvas: Red Alert style build sidebar, top bar (cash,
  date, clock speed, attention left), inspector panel for anything clicked,
  chat panel, offers inbox, briefing screen, standing orders editor.
- Overlays: ownership, resources, flows, standing.

## 16. Settings

World settings, chosen at world creation and editable on the server: seed,
map size, number of rivals and their personalities, town rules, clock rates,
Mind budget. The player cannot change these in play (invariant 1).

## 17. Testing

- Unit tests (Vitest) next to the code.
- **Determinism:** run N ticks with a command log twice and in a fresh process
  and compare state hashes.
- **Scenario tests:** headless sim, scripted commands, assertions on outcomes
  ("a harvester on a deposit delivers ore to the depot within 2 game days").
- **Mind contract tests:** every prompt's schema round-trips, invalid model
  output is rejected, and the fake backend covers each agent type.
- **Soak:** a headless game year, all AI on reflex plus the fake Mind, with
  invariant checks (no negative stock, money conserved except for defined
  sources and sinks, no Op with more attention than allowed).
- **Client smoke:** Playwright loads the client against a test server, takes a
  screenshot and checks the canvas is drawn and the HUD shows the date.
- **Live smoke** (manual or ring review only): one real `claude -p` call per
  agent type.

## 18. Deployment

- Development and play on the Mac. The world server runs on the Fedora box as
  a systemd user service (`groundwork.service`, linger is on), Node 22.
- Reachable at `http://laptop.local:7400` at home and over Tailscale away from
  home.
- `scripts/deploy.sh` (run from the Mac): push, pull on the Fedora box,
  install, build, restart, health check.
- Secrets (an API key, if the API backend is ever used) live in
  `~/.config/groundwork/env` on the Fedora box, never in the repo.
- A nightly copy of the SQLite file to `~/groundwork-backups/` on the Fedora
  box, keeping 14.

## 19. Documentation

- `README.md`: what it is, how to play, how to run locally.
- `docs/dev.md`: architecture walkthrough, commands, how to add a building, a
  good, a command, an agent type.
- A user-facing feature is not done without its line in `docs/`.

## 20. Non-goals

Combat, policy-setting as the player, real-world maps, mobile, monetization,
a public release.

## 21. Open questions (decided by building, recorded in 24)

- Exact attention numbers and costs.
- How many named people per town before memory and calls get too heavy.
- Whether rail arrives in Ring 3 or later.

## 22. Risks

| Risk | Answer |
|---|---|
| Minds too slow or flaky through `claude -p` | Reflex tier carries the world. Calls are async and never block a tick. API backend is a config change |
| NPC calls eat Matt's Claude Code quota | Governor caps calls per hour (section 13.5) |
| Fedora box sleeps or reboots | World pauses and resumes from SQLite. Lid-close sleep is a Matt item if it bites |
| AIs dominate | Attention budget, same rules, foreman, soak test |
| Scope | Rings, one item per session, breadth first |

## 23. Build plan

### 23.1 Order

Breadth first, in rings. Each ring ends with something that works end to end.
Only the current ring is broken into items (rolling wave, PROCESS.md).

### 23.2 Rings

#### Ring 0: foundation [done, tagged ring-0]

Repo, workspace, checks, the skeleton of every package, the deploy pipeline
and a proven `claude -p` call from the server.

Done when:
- `make check-fast` is green and runs typecheck, unit tests and plan lint.
- The sim advances ticks deterministically (determinism test passes).
- The server runs the sim on the clock, persists to SQLite and resumes after a
  restart.
- The client draws an isometric map from the server's state in a browser.
- The server runs as a service on the Fedora box, reachable from the Mac.
- The Mind interface works with the fake backend and with one real
  `claude -p` call on the Fedora box.
- `tests/rings/ring0.sh` passes.

#### Ring 1: first playable [now]

One town, one rival, one resource. Small map. You stake or buy land, lay
roads, build a harvester and a depot, haul ore and sell it to a town that
grows when it gets materials. One rival Op does the same, led by a Mind. You
can chat with a few named people, including landowners, and close a land
deal in chat. Present and away clocks run. Persistent on the Fedora box.
The shape of the ore loop is decision D-012.

Done when:
- From a fresh world, a player can stake a deposit, lay roads to it and to
  the town, build a depot, run a harvester and a truck, and sell ore to the
  town for cash, in a scenario test and in the browser.
- The town market price moves with stock and demand, and the town grows
  (population, demand and houses) when it gets ore.
- Every Op has 40 attention points per game day under one cost table, and the
  HUD shows what is left.
- The rival Op runs the same loop through the same command API under the same
  costs and attention, steered by a leader Mind that deliberates on the
  server. Its commands replay from the log without calling a Mind.
- The player can chat with the town's six named people and close a land deal
  from an offer card in chat. Landowners also answer plain offers by reflex.
- Every cash change is in a per-Op ledger, and a 30 game day headless run
  keeps cash and stock non-negative.
- The world runs on the Fedora box under the present and away clocks,
  persists across restarts, and the rival's Mind runs there on `claude -p`
  with the governor on.
- `tests/rings/ring1.sh` passes.

#### Ring 2: away and fair [next]

Foreman, standing orders, the briefing, governor hardening, attention
tuning, soak test, nightly backups.

#### Ring 3: the economy

All 12 goods, refining chains, trucks and rail, power as a franchise, two or
three towns, contracts.

#### Ring 4: people

Named citizens with full lives, businesses that open and fail, memory and
gossip, a news feed.

#### Ring 5: standing, roles and eras

Standing everywhere, bids for roles, steward and council powers, world eras
and research.

#### Ring 6: a bigger world

More rivals with distinct personalities, distant regions as trade partners,
256 x 256 and larger maps.

#### Ring 7: look and feel

Art pass, sound, animation, UI polish, onboarding.

#### Ring 8: friends

Accounts, a second human Op, the API backend, possibly a cloud host.

## 24. Decisions

| Id | Date | Decision | Why |
|---|---|---|---|
| D-001 | 2026-11-11 | The player is a builder Op among peers, not a mayor. Power is earned as roles | Matt: "I am not the overseer of the landscape. I am living and building within it." |
| D-002 | 2026-11-11 | Near-future setting on an unnamed planet, frontier resources, not space-themed | Matt's choice |
| D-003 | 2026-11-11 | Browser client, TypeScript, PixiJS isometric 2D, server-authoritative single player | Matt chose browser, isometric and "single player, friends later". PixiJS is mature and fast for 2D. Server-authoritative keeps friends a feature, not a rewrite |
| D-004 | 2026-11-11 | Persistent world, 1 game day per real hour, away clock at 0.25x, plus a foreman on standing orders | Matt chose persistence, the hourly clock and both fairness tools |
| D-005 | 2026-11-11 | World server on the Fedora box, development on the Mac | Matt's choice. Free, always on, Tailscale for away |
| D-006 | 2026-11-11 | Minds run through `claude -p` on the Fedora box by default. API backend kept behind the same interface | Matt's suggestion. Uses his subscription instead of an API bill. API is needed once other people play |
| D-007 | 2026-11-11 | Medium economy: 12 goods, visible chains. Free-text chat with structured offers | Matt's choices |
| D-009 | 2026-11-11 | The repo is public on GitHub (mrwatts88/groundwork) | Matt's choice. Secrets stay out of the repo (section 18), and a history scan runs before the first push |
| D-008 | 2026-11-11 | First playable: one town, one rival, one resource, chat with a few NPCs | Matt's choice |
| D-010 | 2026-11-11 | The server stores SQLite through Node's built-in `node:sqlite` and serves WebSockets with `ws`. Client messages are checked by hand-written parsers in protocol for now | No native module to build on the Fedora box. `ws` is small and standard. Zod can replace the parsers when the command set grows |
| D-011 | 2026-11-11 | No privacy rules for this repo. Matt's name and email are fine anywhere, and public actions on it are routine. The only rule left is section 18: credentials never enter the repo | Matt: "there's no secrecy going on here." The old rules came from another project |
| D-012 | 2026-11-11 | Ring 1 ore loop. A harvester carries ore from a deposit the Op owns to its depot. A truck carries it from the depot to the town market and sells on arrival. Roads can be laid on your own land and on frontier, and in Ring 1 every road is open to every vehicle. A tile's owner is a party: frontier, an Op, the town or a named person. Reflex actors (the rival, landowners, the town) act through `apply()` inside the tick and are not logged, because replay recreates them. Mind output is logged as commands, and a Mind may only issue commands as its own entity. The town grows on ore, standing in for building materials until Ring 3. Labor is a hiring cost in the build price plus a daily wage. The Ring 0 world on the Fedora box is replaced by a fresh one and its db file is kept | Thinnest loop that keeps transport physical (5.2) and every actor on the one command API (invariant 1). Access rules for roads wait for Ring 3. The Ring 0 world has no economy worth keeping |
| D-013 | 2026-11-11 | A tile's owner value indexes a party list in the world state: frontier at 0, then the Ops, then the town, then named people. The town starts as a 7 x 7 block on the dry, deposit-free site nearest the map centre whose every tile has water within 6 tiles, with a road cross and the market beside the crossing. Starting claims keep 3 tiles clear of it. A save carries a world format version (Ring 1 is 2) and an older save is renamed `groundwork.format-<N>.db` | One lookup answers who owns a tile for every kind of owner, and adding people or towns adds parties without a new tile layer. Room around the town lets it grow onto frontier (R1-10). The version check is how D-012's world replacement happens without a manual step |
