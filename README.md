# Groundwork

A persistent isometric building game in the browser. You run an operation in
a living frontier economy. Townsfolk and rival operations are run by AI minds,
and the world keeps going while you are away.

The design is in `DESIGN.md`. How it gets built is in `PROCESS.md`.

## Status

Ring 0, foundation. You can open the world in a browser, look around the
map and lay roads on your land. There is no economy yet.

## How to play

Not yet. Once the world server is deployed it will be reachable at
`http://laptop.local:7400` on the home network.

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
