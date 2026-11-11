#!/usr/bin/env bash
# The Fedora box half of the deploy (DESIGN.md 18). scripts/deploy.sh runs it
# over ssh after pulling, so it is always the freshly pulled version.
# Installs, builds, links the systemd user units, restarts the server and
# prints the health JSON once it answers.
set -euo pipefail

export PATH="$HOME/.local/bin:$PATH"
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
port="${GROUNDWORK_PORT:-7400}"
units=(groundwork.service groundwork-backup.service groundwork-backup.timer)

cd "$repo"
echo "deploy: install"
pnpm install --frozen-lockfile
echo "deploy: build"
pnpm build

echo "deploy: systemd user units"
unit_dir="$HOME/.config/systemd/user"
mkdir -p "$unit_dir"
for unit in "${units[@]}"; do
  ln -sfn "$repo/deploy/$unit" "$unit_dir/$unit"
done
systemctl --user daemon-reload
systemctl --user enable groundwork.service groundwork-backup.timer
systemctl --user start groundwork-backup.timer
systemctl --user restart groundwork.service

echo "deploy: waiting for health on port $port"
for _ in $(seq 1 30); do
  if health="$(curl -sf "http://localhost:$port/health")"; then
    echo "$health"
    exit 0
  fi
  sleep 1
done
echo "deploy: the server did not answer on port $port. Last log lines:" >&2
journalctl --user -u groundwork.service -n 30 --no-pager >&2 || true
exit 1
