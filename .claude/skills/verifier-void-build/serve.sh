#!/usr/bin/env bash
# Bring up a vite dev server for the assembled void build, cross-origin to the
# running build binary. This is the env bootstrap that is most of the setup
# cost: the assembled worktree has no node_modules and no generated GraphQL.
#
#   .claude/skills/verifier-void-build/serve.sh
#
# Prereq: the void build binary is already running and serving on :9999
# (that is the GraphQL backend the dev UI talks to). Auth must be disabled on
# the server — the dev UI is cross-origin and cannot send the session cookie.
#
# The dev server comes up on http://localhost:3000 with HMR (great for A/B:
# toggle a line, save, re-run the scenario).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_BRANCH="${VOID_BUILD_BRANCH:-void-build}"
BACKEND_PORT="${BACKEND_PORT:-9999}"

# Locate the assembled worktree (the one checked out on $BUILD_BRANCH) without
# hardcoding any path. Override with VOID_BUILD_WORKTREE if needed.
WORKTREE="${VOID_BUILD_WORKTREE:-$(git -C "$HERE" worktree list --porcelain \
  | awk -v b="refs/heads/$BUILD_BRANCH" '/^worktree /{w=$2} $0=="branch "b{print w; exit}')}"

[ -n "$WORKTREE" ] || { echo "no worktree on branch '$BUILD_BRANCH' — set VOID_BUILD_WORKTREE" >&2; exit 1; }
UI="$WORKTREE/ui/v2.5"
[ -d "$UI" ] || { echo "no UI at $UI" >&2; exit 1; }
cd "$UI"

# Own deps (the worktree pins vite 5 etc — do NOT symlink the develop tree's
# node_modules; the major versions differ and pre-bundling breaks).
# Gate on the actual gqlgen bin, not just the dir: assemble.py recreates the
# worktree (wiping node_modules) and an interrupted install leaves a partial
# node_modules that would skip install and then fail with "gql-gen: not found".
[ -x node_modules/.bin/gql-gen ] || pnpm install --prefer-offline

# generated-graphql.ts is gitignored and built from this build's schema.
[ -f src/core/generated-graphql.ts ] || pnpm gqlgen

echo ">> vite dev on http://localhost:3000  (backend :$BACKEND_PORT)" >&2
exec env VITE_APP_NOLEGACY=true VITE_APP_PLATFORM_PORT="$BACKEND_PORT" pnpm start
