#!/usr/bin/env bash
#
# clean-rebuild.sh — deterministic iOS clean rebuild.
#
# Use when the dev build misbehaves in ways that trace back to drifted packages
# or stale caches — most notably the launch redbox:
#   [runtime not ready]: Property 'require' doesn't exist
# That redbox is NOT a code bug (the committed config + locked deps bundle clean);
# it means node_modules has drifted from package-lock.json and/or a stale Metro /
# Hermes / dev-client bundle is being served. Clearing Metro alone does NOT fix it,
# because it re-bundles from the same drifted node_modules.
#
# This restores the locked dependency tree (npm ci, never npm install), wipes the
# JS + native + simulator caches, reinstalls Pods, and rebuilds. See
# CLAUDE.md "Deployment Rules" + REFERENCE.md §24 for the why behind each step.
#
# Usage:
#   npm run clean:ios          # clean + reinstall + pods, then build
#   bash scripts/clean-rebuild.sh --no-run   # everything except the final build

set -euo pipefail

BUNDLE_ID="com.hotpicksports"
RUN_BUILD=1
[ "${1:-}" = "--no-run" ] && RUN_BUILD=0

# Must run from the repo root (where package-lock.json lives).
if [ ! -f package-lock.json ]; then
  echo "ERROR: run this from the repo root (package-lock.json not found here)." >&2
  exit 1
fi

step() { printf '\n\033[1;36m== %s ==\033[0m\n' "$1"; }

step "1/6  Restore locked dependency manifests"
# Undo any drift from npm install / npm audit fix. Only touches these two files.
git checkout -- package.json package-lock.json

step "2/6  Reinstall node_modules EXACTLY from the lockfile (npm ci)"
rm -rf node_modules
npm ci

step "3/6  Clear JS caches (Metro, Haste, watchman)"
watchman watch-del-all >/dev/null 2>&1 || true
rm -rf "${TMPDIR:-/tmp}/metro-"* "${TMPDIR:-/tmp}/haste-map-"* \
       "${TMPDIR:-/tmp}/react-native-packager-cache-"* 2>/dev/null || true

step "4/6  Clear native + simulator caches"
rm -rf "$HOME/Library/Developer/Xcode/DerivedData/"* 2>/dev/null || true
# Remove the dev-client app so it can't serve a cached bundle / Hermes bytecode.
xcrun simctl uninstall booted "$BUNDLE_ID" >/dev/null 2>&1 || true

step "5/6  Reinstall CocoaPods clean"
( cd ios && rm -rf Pods build && pod install )

if [ "$RUN_BUILD" -eq 1 ]; then
  step "6/6  Rebuild + launch (npx expo run:ios)"
  npx expo run:ios
else
  step "6/6  Skipped build (--no-run). Next: npx expo run:ios"
fi

echo
echo "Done. If the redbox persists after THIS (a true clean rebuild), it is not"
echo "drift/cache — capture the new error and investigate the bundle itself."
