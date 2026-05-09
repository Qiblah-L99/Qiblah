#!/usr/bin/env bash
set -euo pipefail

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IOS_WEB="${1:-/Users/sodrulislam/Documents/Qiblah Apps/QiblahIPhoneApp/QiblahIPhone/Web}"
INCLUDE_INDEX="${INCLUDE_INDEX:-0}"

if [[ "${1:-}" == "--include-index" ]]; then
  IOS_WEB="${2:-/Users/sodrulislam/Documents/Qiblah Apps/QiblahIPhoneApp/QiblahIPhone/Web}"
  INCLUDE_INDEX="1"
fi

mkdir -p "$IOS_WEB"

copy_file() {
  local src="$WEB_ROOT/$1"
  local dst="$IOS_WEB/$1"
  [[ -f "$src" ]] || return 0
  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
}

copy_dir() {
  local src="$WEB_ROOT/$1"
  local dst="$IOS_WEB/$1"
  [[ -d "$src" ]] || return 0
  mkdir -p "$dst"
  rsync -a --inplace --whole-file "$src/" "$dst/"
}

if [[ "$INCLUDE_INDEX" == "1" ]]; then
  copy_file "index.html"
fi

copy_file "display.html"
copy_file "embed.html"
copy_file "prayer-tablet.html"
copy_file "manifest.json"
copy_file "kahf.js"

copy_dir "mosque"
copy_dir "admin"
copy_dir "register"
copy_dir "institute"
copy_dir "jumuah"
copy_dir "morning-adhkar"
copy_dir "evening-adhkar"
copy_dir "surah-kahf"
copy_dir "assets"
copy_dir "icons"

echo "Synced website web files to: $IOS_WEB"
if [[ "$INCLUDE_INDEX" != "1" ]]; then
  echo "Skipped index.html. Run with --include-index after merging iOS-specific index changes."
fi
