# TrailBase, packaged for deployment.
#
# The only thing this image adds to the upstream one is a staging area. A Docker
# volume is mounted over `/app/traildepot` in production, which hides whatever
# the image left there, so the committed config and migrations are parked at
# `/seed` — outside the mount point — and the entrypoint puts them back on every
# start.
#
# Pinned to the version `pnpm dev` runs locally, so the schema is applied by the
# same binary that wrote the migrations.
FROM trailbase/trailbase:0.33.20

# The upstream image drops to an unprivileged user; take root back to copy.
USER root

COPY traildepot/config.textproto /seed/config.textproto
COPY traildepot/migrations /seed/migrations

# The auth-UI component ships *inside* `/app/traildepot`. A volume is seeded from
# the image only when it is first created, so once it exists it keeps serving the
# component from whichever image created it. Park a copy out of the volume's way
# and let the entrypoint re-sync it, so the component tracks the binary.
RUN cp -a /app/traildepot/wasm /seed/wasm

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod 0755 /app/docker-entrypoint.sh && chown -R trailbase /seed

# Upstream chowns `/app/traildepot` itself but not what is under it, so the
# `wasm/` directory its own COPY creates stays owned by root. A named volume is
# seeded from the image *with its ownership*, so that one directory arrives on
# the volume unwritable by the user this container runs as — and the entrypoint
# has to put a file there on every start. Take the whole depot recursively.
RUN chown -R trailbase /app/traildepot

USER trailbase

# tini forwards signals and reaps zombies. The entrypoint runs under it and
# `exec`s the server, so TrailBase still sees SIGTERM directly.
#
# `-s` because the platform may not start this container with tini as PID 1 —
# registering as a child subreaper restores the reaping that not being PID 1
# would otherwise cost.
ENTRYPOINT ["tini", "-s", "--", "/app/docker-entrypoint.sh"]
CMD []
