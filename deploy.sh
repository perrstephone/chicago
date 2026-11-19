#!/usr/bin/env bash
# Build the public map and publish it to the Lightsail server.
#
#   ./deploy.sh            build + publish
#   ./deploy.sh --setup    install/refresh nginx, the HTTPS certificate and the site config, then publish
#                          (safe to re-run; e.g. after changing deploy/nginx.conf)
#
# Reads from .env (or the environment):
#   DEPLOY_HOST    ssh target, e.g. ubuntu@1.2.3.4
#   DEPLOY_KEY     path to the Lightsail SSH key
#   DEPLOY_DOMAIN  public domain, e.g. chicago.example.com (its DNS must point at the server)
# Only the static map is published; the Editor's Desk runs locally with `npm run dev`.
set -euo pipefail
cd "$(dirname "$0")"

envval() { grep -E "^$1=" .env 2>/dev/null | cut -d= -f2- || true; }
DEPLOY_HOST="${DEPLOY_HOST:-$(envval DEPLOY_HOST)}"
DEPLOY_KEY="${DEPLOY_KEY:-$(envval DEPLOY_KEY)}"
DEPLOY_DOMAIN="${DEPLOY_DOMAIN:-$(envval DEPLOY_DOMAIN)}"
: "${DEPLOY_HOST:?Set DEPLOY_HOST (e.g. ubuntu@1.2.3.4) in .env}"
: "${DEPLOY_KEY:?Set DEPLOY_KEY (path to the Lightsail SSH key) in .env}"
DEPLOY_KEY="${DEPLOY_KEY/#\~/$HOME}"

SSH=(ssh -i "$DEPLOY_KEY" -o BatchMode=yes "$DEPLOY_HOST")
ROOT=/var/www/chicago-guide
RELEASE="$(date +%Y%m%d-%H%M%S)"

if [ "${1:-}" = "--setup" ]; then
  : "${DEPLOY_DOMAIN:?Set DEPLOY_DOMAIN (e.g. chicago.example.com) in .env}"
  echo "→ Installing nginx and certbot"
  "${SSH[@]}" "sudo apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx certbot >/dev/null \
    && sudo mkdir -p $ROOT/releases /var/www/certbot && sudo chown -R \$(whoami): $ROOT"

  if ! "${SSH[@]}" "sudo test -f /etc/letsencrypt/live/$DEPLOY_DOMAIN/fullchain.pem"; then
    echo "→ Requesting an HTTPS certificate for $DEPLOY_DOMAIN"
    # Temporary HTTP-only config so Let's Encrypt can reach the challenge files.
    "${SSH[@]}" "printf '%s\n' 'server { listen 80 default_server; listen [::]:80 default_server; server_name _;' \
      '  location /.well-known/acme-challenge/ { root /var/www/certbot; }' '  location / { root $ROOT/current; try_files \$uri /index.html; } }' \
      | sudo tee /etc/nginx/sites-available/chicago-guide >/dev/null \
      && sudo ln -sfn /etc/nginx/sites-available/chicago-guide /etc/nginx/sites-enabled/chicago-guide \
      && sudo rm -f /etc/nginx/sites-enabled/default && sudo nginx -t -q && sudo systemctl enable --now nginx >/dev/null 2>&1 && sudo systemctl reload nginx"
    # Registered without an email address; certbot's timer renews automatically.
    "${SSH[@]}" "sudo certbot certonly --webroot -w /var/www/certbot -d $DEPLOY_DOMAIN \
      --non-interactive --agree-tos --register-unsafely-without-email --quiet"
  fi

  echo "→ Installing the site config"
  sed "s/__DOMAIN__/$DEPLOY_DOMAIN/g" deploy/nginx.conf | "${SSH[@]}" "sudo tee /etc/nginx/sites-available/chicago-guide >/dev/null"
  # Reload nginx whenever a renewed certificate is installed.
  "${SSH[@]}" "printf '#!/bin/sh\nsystemctl reload nginx\n' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx >/dev/null \
    && sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx \
    && sudo ln -sfn /etc/nginx/sites-available/chicago-guide /etc/nginx/sites-enabled/chicago-guide \
    && sudo rm -f /etc/nginx/sites-enabled/default && sudo nginx -t -q && sudo systemctl enable --now nginx >/dev/null 2>&1 && sudo systemctl reload nginx"
fi

echo "→ Building"
npm run build --silent

echo "→ Publishing release $RELEASE"
tar -czf - -C dist . | "${SSH[@]}" "set -e; mkdir -p $ROOT/releases/$RELEASE && tar -xzf - -C $ROOT/releases/$RELEASE \
  && ln -sfn $ROOT/releases/$RELEASE $ROOT/current \
  && ls -1dt $ROOT/releases/* | tail -n +6 | xargs -r rm -rf"   # keep the 5 newest releases

if [ -n "$DEPLOY_DOMAIN" ]; then echo "✓ Live at https://$DEPLOY_DOMAIN/"; else echo "✓ Live at http://${DEPLOY_HOST#*@}/"; fi
