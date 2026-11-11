# Groundwork

A persistent isometric building game in the browser. You run an operation in
a living frontier economy. Townsfolk and rival operations are run by AI minds,
and the world keeps going while you are away.

The design is in `DESIGN.md`. How it gets built is in `PROCESS.md`.

## Status

Ring 1, first playable, in progress. You can open the world in a browser,
look around the map, find the town and its people, see who owns what, lay
roads, stake land and build a depot. Harvesters run in the game world, but
buying and routing them from the browser comes with the next client update.
There is no ore trade yet.

## How to play

The world server runs on the Fedora box. On the home network, open
`http://laptop.local:7400` in a browser. Drag to pan, scroll to zoom, press
Home to find your land and R to lay roads.

The build sidebar on the right holds the tools: Road (R), Stake (C) and
Depot (B). Click
one to turn it on and click it again, or press Esc, to turn it off. Roads can
go on your own land and across the frontier, the land no one owns yet, so you
can build a road out to a deposit before you own it. You cannot lay a road on
land the rival, the town or a named person owns.

To stake land, pick Stake (C) and click a frontier tile. You pay a claim fee
of $200, or $600 on a deposit, and 3 attention. The tile is then surveyed for
6 game hours. It shows a dashed outline, a post at each corner and a pennant
in your colour (the rival's stakes are red). The inspector's Survey row says
who is surveying it and how long is left. When the survey is done the tile is
yours. You cannot stake water, land someone owns, or a tile someone else is
already surveying.

To build a depot, pick Depot (B) and click a tile of your own land that has a
road on one of its four sides. A road still being built counts. The depot
costs $1,500, which is $1,200 to build and $300 to hire its crew, and 5
attention. It is under construction for 8 game hours, drawn as a scaffold
with a flag in your colour. Then it is a grey shed with a sloped roof and a
yellow stripe. A built depot pays its crew $100 at the start of every game
day. If you cannot pay, the crew stops work: the depot is idle and its door
goes dark. As soon as you have $100 again it hires them back and pays them.
Your cash never goes below zero. The inspector's Building row says whether a
depot is under construction, staffed or idle. You cannot build on water, on
a road, on a deposit, on a tile that already has a building, on frontier or
on land someone else owns.

Press T to centre the map on the town. Its houses have red pitched roofs and
the market is the wide hall with a striped roof and a flag. Press O, or the
Owners button, to colour every parcel by who owns it: yellow is yours, red is
the rival's, white is the town's and blue belongs to one of the town's named
people. Press O again to turn it off. Click any tile to open the inspector
on the right. It shows the terrain, the owner by name and, on a deposit, how
rich it is. Esc closes it.

Harvesters bring ore from a deposit you own to your depot. You buy one at a
built depot for $800 and 3 attention, then route it to a deposit for 2
attention. Your deposit needs a road from the depot, and a depot cannot sit
on a deposit. From then on it works for free: it drives the roads out, mines
a load of 10 ore, drives back and unloads into the depot. Each load lowers the
deposit's richness. When the deposit runs dry the harvester waits at the
depot. While the depot is idle it waits there with its load. The buttons for
this come to the inspector in a later update.

Attention in the HUD is how much you can still do today, shown as N/40.
Every operation, yours and the rival's, gets 40 points at the start of each
game day. Laying a road costs 1, staking a tile costs 3 and placing a depot
costs 5. Buying a harvester costs 3 and routing it costs 2. Points you do not use are gone at the next day, so they do not pile
up. When you run out, the command is refused until the day turns.

## Run locally

You need Node 22 or newer and pnpm 10.

```
pnpm install
make check-fast
```

`make check-fast` lints the plan, checks the scripts, typechecks every package
and runs the unit tests. It prints `check-fast: ok` when everything passes.

To play locally, build the client and start the server, then open
`http://localhost:8787`.

```
pnpm build
pnpm --filter @groundwork/server start
```

More detail for developers is in `docs/dev.md`.
