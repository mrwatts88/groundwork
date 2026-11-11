#!/usr/bin/env bash
# Deploy the world server to the Fedora box (DESIGN.md 18). Run on the Mac:
#
#   scripts/deploy.sh
#
# Pushes main, pulls it on the Fedora box, installs, builds, restarts the
# groundwork user service and prints its health JSON. Set GROUNDWORK_HOST_ALIAS
# to use another ssh alias (laptop-ts away from home).
set -euo pipefail

host="${GROUNDWORK_HOST_ALIAS:-laptop}"
# shellcheck disable=SC2088 # expanded by the remote shell
remote_repo='~/code/groundwork'
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo"

branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$branch" != "main" ]]; then
  echo "deploy: on branch $branch. Deploy from main." >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "deploy: uncommitted changes here are not deployed. Deploying the last commit."
fi

echo "deploy: push"
git push origin main

echo "deploy: pull on $host"
ssh -o BatchMode=yes "$host" "cd $remote_repo && git pull --ff-only origin main && bash scripts/deploy-remote.sh"
