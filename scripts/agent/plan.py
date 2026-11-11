#!/usr/bin/env python3
"""plan.py: the only way sessions read and change plan/features.json.

  next              actionable agent items in the current ring
  human             Matt's open items, with their commands
  status            counts per ring
  show ID           one item in full
  start ID          mark an item in_progress (one agent item at a time)
  done ID --evidence TEXT
                    mark done; evidence must say what was checked and the result
  block ID --reason TEXT
  reopen ID         back to todo (for example after a failed verification)
  lint              validate the plan; outside planning sessions, also refuse
                    any change to an item other than status, evidence, done_at

A planning session creates plan/.planning (gitignored) to allow item changes.
Standard library only, so it runs anywhere Python 3.9+ does.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PLAN = ROOT / "plan" / "features.json"
PLANNING_MARKER = ROOT / "plan" / ".planning"

STATUSES = ("todo", "in_progress", "done", "blocked")
OWNERS = ("agent", "human")
MUTABLE = {"status", "evidence", "done_at"}
REQUIRED = ("id", "ring", "title", "owner", "design", "depends_on", "acceptance", "status")


def load(path: Path = PLAN) -> dict:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def save(plan: dict) -> None:
    text = json.dumps(plan, indent=2, ensure_ascii=False) + "\n"
    tmp = PLAN.with_suffix(".json.tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(PLAN)


def items_by_id(plan: dict) -> dict[str, dict]:
    return {i["id"]: i for i in plan["items"]}


def gates_ring(item: dict) -> bool:
    return item.get("gates_ring", True)


def current_ring(plan: dict) -> int:
    """The lowest ring that still has an unfinished item that gates it."""
    open_rings = [i["ring"] for i in plan["items"] if gates_ring(i) and i["status"] != "done"]
    return min(open_rings) if open_rings else max(i["ring"] for i in plan["items"])


def deps_done(item: dict, by_id: dict[str, dict]) -> bool:
    return all(by_id[d]["status"] == "done" for d in item["depends_on"] if d in by_id)


def actionable(plan: dict, owner: str = "agent") -> list[dict]:
    by_id = items_by_id(plan)
    ring = current_ring(plan)
    out = []
    for i in plan["items"]:
        if i["owner"] != owner or i["status"] not in ("todo", "in_progress"):
            continue
        # Current ring, plus non-gating stragglers from earlier rings.
        if i["ring"] > ring:
            continue
        if not deps_done(i, by_id):
            continue
        out.append(i)
    # In-progress first, then plan order.
    return sorted(out, key=lambda i: (i["status"] != "in_progress",))


def waiting_on(item: dict, by_id: dict[str, dict]) -> list[str]:
    return [d for d in item["depends_on"] if d in by_id and by_id[d]["status"] != "done"]


# --------------------------------------------------------------------------- commands


def cmd_next(plan: dict, _args) -> int:
    ring = current_ring(plan)
    items = actionable(plan, "agent")
    print(f"Current ring: {ring}")
    if not items:
        by_id = items_by_id(plan)
        blocked = [
            i for i in plan["items"]
            if i["owner"] == "agent" and i["ring"] <= ring and i["status"] in ("todo", "in_progress")
        ]
        if blocked:
            print("No agent item is actionable. Waiting on:")
            for i in blocked:
                print(f"  {i['id']}  {i['title']}  <- {', '.join(waiting_on(i, by_id))}")
        else:
            print("No agent items left in this ring.")
        return 0
    print("Actionable (take the first):")
    for i in items:
        mark = "*" if i["status"] == "in_progress" else " "
        print(f" {mark} {i['id']}  [{i.get('effort', 'medium')}]  {i['title']}  (DESIGN {', '.join(i['design'])})")
    return 0


def cmd_human(plan: dict, _args) -> int:
    by_id = items_by_id(plan)
    open_items = [i for i in plan["items"] if i["owner"] == "human" and i["status"] != "done"]
    if not open_items:
        print("Nothing waiting on Matt.")
        return 0
    for i in open_items:
        ready = "ready" if deps_done(i, by_id) else f"after {', '.join(waiting_on(i, by_id))}"
        print(f"{i['id']}  {i['title']}  ({ready})")
        for cmd in i.get("commands", []):
            print(f"    {cmd}")
    return 0


def cmd_status(plan: dict, _args) -> int:
    rings: dict[int, dict[str, int]] = {}
    for i in plan["items"]:
        r = rings.setdefault(i["ring"], {s: 0 for s in STATUSES})
        r[i["status"]] += 1
    cur = current_ring(plan)
    for ring in sorted(rings):
        counts = rings[ring]
        total = sum(counts.values())
        flag = "  <- current" if ring == cur else ""
        print(f"Ring {ring}: {counts['done']}/{total} done, {counts['in_progress']} in progress, "
              f"{counts['blocked']} blocked{flag}")
    return 0


def cmd_show(plan: dict, args) -> int:
    item = items_by_id(plan).get(args.id)
    if not item:
        print(f"no item {args.id}", file=sys.stderr)
        return 1
    print(json.dumps(item, indent=2, ensure_ascii=False))
    return 0


def set_status(plan: dict, item_id: str, status: str, **fields) -> int:
    by_id = items_by_id(plan)
    item = by_id.get(item_id)
    if not item:
        print(f"no item {item_id}", file=sys.stderr)
        return 1
    if status == "in_progress":
        others = [i["id"] for i in plan["items"]
                  if i["owner"] == "agent" and i["status"] == "in_progress" and i["id"] != item_id]
        if item["owner"] == "agent" and others:
            print(f"already in progress: {', '.join(others)}. Finish or block it first.", file=sys.stderr)
            return 1
        if not deps_done(item, by_id):
            print(f"{item_id} still depends on: {', '.join(waiting_on(item, by_id))}", file=sys.stderr)
            return 1
    item["status"] = status
    for k, v in fields.items():
        item[k] = v
    save(plan)
    print(f"{item_id} -> {status}")
    return 0


def cmd_start(plan: dict, args) -> int:
    return set_status(plan, args.id, "in_progress")


def cmd_done(plan: dict, args) -> int:
    evidence = (args.evidence or "").strip()
    if len(evidence) < 20:
        print("evidence must say what was checked and the result (at least a sentence)", file=sys.stderr)
        return 1
    item = items_by_id(plan).get(args.id)
    if item and item["owner"] == "agent" and "verifier: PASS" not in evidence:
        print('agent items need the verifier subagent\'s result in the evidence, as "verifier: PASS ..."',
              file=sys.stderr)
        return 1
    return set_status(plan, args.id, "done", evidence=evidence, done_at=dt.date.today().isoformat())


def cmd_block(plan: dict, args) -> int:
    return set_status(plan, args.id, "blocked", evidence=f"blocked: {args.reason.strip()}")


def cmd_reopen(plan: dict, args) -> int:
    return set_status(plan, args.id, "todo")


# --------------------------------------------------------------------------- lint


def head_plan() -> dict | None:
    rel = PLAN.relative_to(ROOT).as_posix()
    try:
        out = subprocess.run(["git", "-C", str(ROOT), "show", f"HEAD:{rel}"],
                             capture_output=True, text=True, check=True).stdout
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return None


def cmd_lint(plan: dict, _args) -> int:
    errors: list[str] = []
    ids = [i.get("id") for i in plan.get("items", [])]
    if len(ids) != len(set(ids)):
        errors.append("duplicate item ids")
    by_id = items_by_id(plan)
    for i in plan["items"]:
        iid = i.get("id", "?")
        for key in REQUIRED:
            if key not in i:
                errors.append(f"{iid}: missing {key}")
        if i.get("status") not in STATUSES:
            errors.append(f"{iid}: bad status {i.get('status')!r}")
        if i.get("owner") not in OWNERS:
            errors.append(f"{iid}: bad owner {i.get('owner')!r}")
        if not i.get("acceptance"):
            errors.append(f"{iid}: no acceptance checks")
        if i.get("owner") == "human" and not i.get("commands") and not i.get("instructions"):
            errors.append(f"{iid}: human item needs commands or instructions")
        for d in i.get("depends_on", []):
            if d not in by_id:
                errors.append(f"{iid}: depends on unknown {d}")
            elif by_id[d]["ring"] > i["ring"]:
                errors.append(f"{iid}: depends on {d} from a later ring")
        if i.get("status") == "done" and len(i.get("evidence", "").strip()) < 20:
            errors.append(f"{iid}: done without evidence")
    in_progress = [i["id"] for i in plan["items"] if i["owner"] == "agent" and i["status"] == "in_progress"]
    if len(in_progress) > 1:
        errors.append(f"more than one agent item in progress: {', '.join(in_progress)}")

    if not PLANNING_MARKER.exists():
        old = head_plan()
        if old is not None:
            old_by_id = {i["id"]: i for i in old.get("items", [])}
            for oid, oi in old_by_id.items():
                ni = by_id.get(oid)
                if ni is None:
                    errors.append(f"{oid}: removed outside a planning session")
                    continue
                for key in set(oi) | set(ni):
                    if key in MUTABLE:
                        continue
                    if oi.get(key) != ni.get(key):
                        errors.append(f"{oid}: {key} changed outside a planning session")
            for nid in by_id:
                if nid not in old_by_id:
                    errors.append(f"{nid}: added outside a planning session")

    if errors:
        print("plan lint failed:", file=sys.stderr)
        for e in errors:
            print(f"  {e}", file=sys.stderr)
        return 1
    print(f"plan ok: {len(plan['items'])} items")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("next", "human", "status", "lint"):
        sub.add_parser(name)
    for name in ("show", "start", "reopen"):
        sub.add_parser(name).add_argument("id")
    d = sub.add_parser("done")
    d.add_argument("id")
    d.add_argument("--evidence", required=True)
    b = sub.add_parser("block")
    b.add_argument("id")
    b.add_argument("--reason", required=True)
    args = p.parse_args()

    plan = load()
    handler = {
        "next": cmd_next, "human": cmd_human, "status": cmd_status, "show": cmd_show,
        "start": cmd_start, "done": cmd_done, "block": cmd_block, "reopen": cmd_reopen,
        "lint": cmd_lint,
    }[args.cmd]
    return handler(plan, args)


if __name__ == "__main__":
    sys.exit(main())
