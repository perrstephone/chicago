#!/usr/bin/env bash
# Build the public map and publish it to the Lightsail server.
#
#   ./deploy.sh            build + publish
#   ./deploy.sh --setup    first time only: install nginx and the site config, then publish
#
# Reads DEPLOY_HOST (e.g. ubuntu@1.2.3.4) and DEPLOY_KEY (path to the SSH key) from .env or the environment.
# Only the static map is published; the Editor's Desk runs locally with `npm run dev`.
set -euo pipefail
cd "$(dirname "$0")"

if [ -f .env ]; then
  DEPLOY_HOST="${DEPLOY_HOST:-$(grep -E '^DEPLOY_HOST=' .env | cut -d= -f2- || true)}"
  DEPLOY_KEY="${DEPLOY_KEY:-$(grep -E '^DEPLOY_KEY=' .env | cut -d= -f2- || true)}"
fi
: "${DEPLOY_HOST:?Set DEPLOY_HOST (e.g. ubuntu@1.2.3.4) in .env}"
: "${DEPLOY_KEY:?Set DEPLOY_KEY (path to the Lightsail SSH key) in .env}"
DEPLOY_KEY="${DEPLOY_KEY/#\~/$HOME}"

SSH=(ssh -i "$DEPLOY_KEY" -o BatchMode=yes "$DEPLOY_HOST")
ROOT=/var/www/chicago-guide
RELEASE="$(date +%Y%m%d-%H%M%S)"

if [ "${1:-}" = "--setup" ]; then
  echo "→ Installing nginx and the site config"
  "${SSH[@]}" "sudo apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx >/dev/null \
    && sudo mkdir -p $ROOT/releases && sudo chown -R \$(whoami): $ROOT"
  "${SSH[@]}" "sudo tee /etc/nginx/sites-available/chicago-guide >/dev/null" < deploy/nginx.conf
  "${SSH[@]}" "sudo ln -sfn /etc/nginx/sites-available/chicago-guide /etc/nginx/sites-enabled/chicago-guide \
    && sudo rm -f /etc/nginx/sites-enabled/default && sudo nginx -t -q && sudo systemctl enable --now nginx >/dev/null 2>&1 && sudo systemctl reload nginx"
fi

echo "→ Building"
npm run build --silent

echo "→ Publishing release $RELEASE"
tar -czf - -C dist . | "${SSH[@]}" "set -e; mkdir -p $ROOT/releases/$RELEASE && tar -xzf - -C $ROOT/releases/$RELEASE \
  && ln -sfn $ROOT/releases/$RELEASE $ROOT/current \
  && ls -1dt $ROOT/releases/* | tail -n +6 | xargs -r rm -rf"   # keep the 5 newest releases

echo "✓ Live at http://${DEPLOY_HOST#*@}/"
