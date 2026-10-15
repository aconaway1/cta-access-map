#!/bin/sh
# Deploy, tagging the Worker version with the commit it was built from; the page footer and /status show it.
# Workers Builds sets WORKERS_CI_COMMIT_SHA (its deploy command must be `sh scripts/deploy.sh`). A local deploy uses
# git and marks uncommitted changes with "-dirty". Extra arguments go to wrangler.
set -e
if [ -n "$WORKERS_CI_COMMIT_SHA" ]; then
  tag=$(printf %s "$WORKERS_CI_COMMIT_SHA" | cut -c1-12)
else
  tag=$(git rev-parse --short=12 HEAD)
  git diff --quiet HEAD || tag="$tag-dirty"
fi
exec npx wrangler deploy --tag "$tag" "$@"
