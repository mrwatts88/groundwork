#!/usr/bin/env bash
# Copy the world's SQLite file to the backup folder and keep the newest N
# (DESIGN.md 18). Runs on the Fedora box from groundwork-backup.service.
# Uses SQLite's online backup, so it is safe while the server is writing.
#
#   GROUNDWORK_DATA_DIR    folder holding groundwork.db (default ~/.local/share/groundwork)
#   GROUNDWORK_BACKUP_DIR  where copies go (default ~/groundwork-backups)
#   GROUNDWORK_BACKUP_KEEP how many copies to keep (default 14)
set -euo pipefail

data_dir="${GROUNDWORK_DATA_DIR:-$HOME/.local/share/groundwork}"
backup_dir="${GROUNDWORK_BACKUP_DIR:-$HOME/groundwork-backups}"
keep="${GROUNDWORK_BACKUP_KEEP:-14}"
db="$data_dir/groundwork.db"

if [[ ! -f "$db" ]]; then
  echo "backup: no world at $db" >&2
  exit 1
fi
if ! [[ "$keep" =~ ^[1-9][0-9]*$ ]]; then
  echo "backup: GROUNDWORK_BACKUP_KEEP must be a positive integer, got $keep" >&2
  exit 1
fi

mkdir -p "$backup_dir"
dest="$backup_dir/groundwork-$(date +%Y%m%d-%H%M%S).db"
tmp="$dest.partial"
sqlite3 "$db" ".backup '$tmp'"
mv "$tmp" "$dest"
echo "backup: wrote $dest"

# Names sort by time, so the glob order is oldest first.
shopt -s nullglob
copies=("$backup_dir"/groundwork-*.db)
excess=$(( ${#copies[@]} - keep ))
if (( excess > 0 )); then
  for old in "${copies[@]:0:excess}"; do
    rm -f -- "$old"
    echo "backup: removed $old"
  done
fi
echo "backup: $(( ${#copies[@]} - (excess > 0 ? excess : 0) )) copies kept in $backup_dir"
