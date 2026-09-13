# Linux toolchain for the Compact compiler (docs/adr/0016).
#
# The Compact CLI is Linux/macOS only. On Windows `compact` on PATH is the NTFS compression tool,
# and WSL is not always available, so Docker is the portable way to get a reproducible compile.
#
# unzip is REQUIRED and easy to miss: without it `compact update` fails with
# "Failed to spawn artifact extraction command", which does not name the missing tool.
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates git python3 build-essential unzip xz-utils \
    && rm -rf /var/lib/apt/lists/*

RUN curl --proto '=https' --tlsv1.2 -LsSf \
      https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh

ENV PATH="/root/.local/bin:/root/.compact/bin:${PATH}"
WORKDIR /work
