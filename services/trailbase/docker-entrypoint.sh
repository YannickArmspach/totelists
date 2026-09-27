#!/bin/sh
#
# Seed the depot, then hand off to TrailBase.
#
# Everything under `/app/traildepot` lives on a Docker volume that mounts over
# the image's own copy, so anything baked into the image has to be put back here
# at start-up. Runs as the unprivileged `trailbase` user the base image switches
# to; the volume is seeded from the image, so it is owned by that user already.
set -eu

DEPOT=/app/traildepot

# TrailBase switches itself into HTTPS mode the moment it finds a key/cert pair,
# with nothing in the logs to say so. The deployment proxy terminates TLS and
# speaks plain HTTP to us, so that would answer TLS to a proxy expecting clear
# text and take the whole backend down. Refuse to start instead — a container
# that will not boot is far easier to diagnose than one that boots wrong.
if [ -e "$DEPOT/secrets/certs/key.pem" ] || [ -e "$DEPOT/secrets/certs/cert.pem" ]; then
  echo "refusing to start: $DEPOT/secrets/certs holds a certificate." >&2
  echo "TrailBase would serve HTTPS, but Temps terminates TLS and proxies" >&2
  echo "plain HTTP to this container. Remove the certificate to continue." >&2
  exit 1
fi

# Copy a seeded tree in, writing only what is missing or different.
#
# Two reasons not to reach for `cp -a` here. It preserves ownership, which this
# unprivileged user is not allowed to set, so every file it touches ends in
# `Operation not permitted`. And busybox `cp` will not overwrite an existing
# file without `-f`, so the second start of any container fails on the files the
# first one put there. Both were fatal under `set -e`.
#
# Comparing first also gets this past a directory we do not own. Upstream's
# `chown` on the depot is not recursive, so a volume created from an image built
# before that was corrected holds a root-owned `wasm/` that we cannot write to.
# Identical bytes need no write at all. A real difference we cannot apply is
# reported and fatal — a stale auth-UI component is exactly the drift this
# function exists to prevent, so it must not pass silently.
sync_seed() {
  for src in "$1"/*; do
    # No match leaves the pattern itself, which is not a path.
    [ -e "$src" ] || return 0

    dst="$2/${src##*/}"

    if [ -d "$src" ]; then
      mkdir -p "$dst"
      sync_seed "$src" "$dst"
      continue
    fi

    if cmp -s "$src" "$dst"; then
      continue
    fi

    if ! cp -f "$src" "$dst"; then
      echo "refusing to start: cannot write $dst." >&2
      echo "The depot volume holds a different copy of this file and does not" >&2
      echo "allow replacing it. It predates the image that owns its whole" >&2
      echo "traildepot; recreate the volume to let this image seed it." >&2
      exit 1
    fi
  done
}

# Migrations are append-only and TrailBase records which ones it applied, so
# copying them on every start is idempotent.
mkdir -p "$DEPOT/migrations"
sync_seed /seed/migrations "$DEPOT/migrations"

# Keep the auth-UI component in step with the binary in this image.
mkdir -p "$DEPOT/wasm"
sync_seed /seed/wasm "$DEPOT/wasm"

# Git is the source of truth for the config: it is restored on every start and
# left read-only, which is what TrailBase's production guide asks for. The
# trade-off is deliberate and worth stating plainly — config edits made in the
# admin UI do NOT survive a redeploy. Secrets are unaffected: TrailBase keeps
# those in `secrets/`, which stays writable and is never overwritten from here.
rm -f "$DEPOT/config.textproto"
cp /seed/config.textproto "$DEPOT/config.textproto"
chmod 0444 "$DEPOT/config.textproto"

# `--public-url` and `--depot` are read from the environment by TrailBase itself,
# but `--cors-allowed-origins` is not — and it defaults to `*`. Passing it
# explicitly is what keeps the backend from answering any origin that asks.
#
# The flag is repeatable, and the app is reachable under more than one name: its
# own domain, and the console hostname Temps generates. Accept a comma-separated
# list so both can be allowed without a second variable.
: "${CORS_ALLOWED_ORIGINS:?CORS_ALLOWED_ORIGINS must be set}"
cors_args=""
old_ifs=$IFS
IFS=','
for origin in $CORS_ALLOWED_ORIGINS; do
  # Trim the spaces people leave after commas.
  origin=$(printf '%s' "$origin" | tr -d '[:space:]')
  [ -n "$origin" ] && cors_args="$cors_args --cors-allowed-origins $origin"
done
IFS=$old_ifs

# Temps injects HOST and PORT; TrailBase wants them as one `--address`.
# shellcheck disable=SC2086 # cors_args is a deliberately unquoted argument list.
exec /app/trail \
  --depot "$DEPOT" \
  --public-url "${PUBLIC_URL:?PUBLIC_URL must be set}" \
  run \
  --address "${HOST:-0.0.0.0}:${PORT:-4000}" \
  $cors_args
