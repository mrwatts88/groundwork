# Groundwork

A persistent isometric building game in the browser. You run an operation in
a living frontier economy. Townsfolk and rival operations are run by AI minds,
and the world keeps going while you are away.

The design is in `DESIGN.md`. How it gets built is in `PROCESS.md`.

## Status

Ring 1, first playable, in progress. You can open the world in a browser,
look around the map, find the town and its people, see who owns what and lay
roads on your land. There is no economy yet.

## How to play

The world server runs on the Fedora box. On the home network, open
`http://laptop.local:7400` in a browser. Drag to pan, scroll to zoom, press
Home to find your land and R to lay roads on it.

Press T to centre the map on the town. Its houses have red pitched roofs and
the market is the wide hall with a striped roof and a flag. Press O, or the
Owners button, to colour every parcel by who owns it: yellow is yours, red is
the rival's, white is the town's and blue belongs to one of the town's named
people. Press O again to turn it off. Click any tile to open the inspector
on the right. It shows the terrain, the owner by name and, on a deposit, how
rich it is. Esc closes it.

Attention in the HUD is how much you can still do today, shown as N/40.
Every operation, yours and the rival's, gets 40 points at the start of each
game day. Laying a road costs 1. Points you do not use are gone at the next
day, so they do not pile up. When you run out, a road is refused until the
day turns.

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
