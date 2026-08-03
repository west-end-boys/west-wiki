# Docker Principles

## Non-Root User (mandatory)

Least privilege principle dictates that application containers must always run as a non-root user.

**Pattern for Debian-based images (`python:*-slim`, `node:*-slim`, etc.):**

```dockerfile
# Create user AFTER pip/npm installs (which run as root) but BEFORE USER switch.
# UID 1000 matches the default first user on most Linux hosts, ensuring
# volume-mounted directories are writable without extra host configuration.
RUN useradd --uid 1000 --no-create-home appuser \
    && chown -R appuser:appuser /app
USER appuser

ENTRYPOINT [...]
```

The `USER` directive must appear **after** all `COPY`, `RUN pip install`, and `RUN chown` steps — anything that needs root goes before it.

## Volume Ownership

When a container mounts host directories for write access, the container UID must match the host file owner UID, or writes will fail with `Permission denied`.

- **Strategy:** Use `--uid 1000` to match the default Linux developer UID.
- **Read-only mounts** (`:ro`) are not affected — ownership doesn't matter.
- **Secret files** (Docker secrets at `/run/secrets/`) are mounted read-only by Docker automatically.

If UID alignment is not possible, set the service user in `docker-compose.yml`:

```yaml
services:
  myservice:
    user: "${UID:-1000}:${GID:-1000}"
```

## Least-Privilege Mounts

Only mount directories the container actually needs to write. Mark everything else read-only:

```yaml
volumes:
  - ./src:/app/src          # writable: editable install, live reload
  - ./data:/app/data        # writable: runtime output
  - ./config:/app/config:ro # read-only: config files never written at runtime
```

## Dev Container Signal

If a test must work around a permission check (e.g., using a file path where a directory is expected to trigger `NotADirectoryError` instead of `PermissionError`), treat this as a signal that the container is running as root — and fix the container, not the test.

`chmod`-based permission tests are correct and idiomatic when the container runs as a non-root user. They are the expected pattern.

## Source File Bind Mounts — Use Directory Mounts, Not File Mounts

**File bind mounts go stale when the host editor atomically replaces a file.**

Many editors and tools (including Claude Code's Edit tool) write changes atomically: write to a temp file, then rename it over the original. This creates a **new inode**. Docker file bind mounts are inode-based — the container continues to see the original inode and never receives the new content.

**Symptom:** Linters (ruff, mypy) pass because they read from the filesystem path directly. But Python's import system loads from a stale `.pyc` or the stale inode file — `pytest` fails with `ImportError` or `IndentationError` on code that was just edited.

**Rule:** Never use file bind mounts for source files that will be edited during development:

```yaml
# BAD — file bind mount goes stale after atomic edits
volumes:
  - ./server.py:/app/server.py

# GOOD — directory bind mount always reflects current content
volumes:
  - .:/workspace
environment:
  - PYTHONPATH=/workspace
```

For Python projects, set `PYTHONPATH` to the directory-mounted workspace path so `pytest` finds the fresh source before any in-container copy.

If a file bind mount is unavoidable (e.g. read-only config), this is less of a concern since the file is not being edited during the container's lifetime.

## Dockerfile Layer Order

Maximize cache reuse and minimize rebuild time:

1. `COPY` dependency manifests (`requirements.txt`, `package.json`)
2. `RUN` dependency install (cache-busted only when manifests change)
3. `COPY` application source
4. `RUN` application install / build
5. `RUN` create non-root user + `chown`
6. `USER` switch
7. `ENTRYPOINT` / `CMD`

## Multi-Stage Builds — Dev vs. Production

Use a named `base` stage for the production image and a `dev` stage that extends it for development tooling. This keeps dev dependencies (test runners, linters, auxiliary servers) out of the production image.

```dockerfile
FROM python:3.12-slim AS base

WORKDIR /app
COPY requirements.txt pyproject.toml ./
RUN pip install --no-cache-dir -r requirements.txt
COPY src/ ./src/
RUN pip install --no-cache-dir -e ".[dev]"
RUN useradd --uid 1000 --no-create-home appuser \
    && chown -R appuser:appuser /app
USER appuser
ENTRYPOINT ["python", "-m", "myapp"]


FROM base AS dev

USER root
# Install additional dev tools, copy in auxiliary files, etc.
RUN pip install --no-cache-dir some-dev-tool
USER appuser
ENTRYPOINT ["python", "/dev-server/server.py"]
```

The dev stage inherits all layers from base — no duplication. Build the production image with `docker compose build` (default target); build the dev image with `docker compose -f docker-compose.yml -f docker-compose.dev.yml build` (overrides `target: dev`).

## Additional Build Contexts — Pulling Files from Sibling Projects

`additional_contexts` in a Compose overlay lets a Dockerfile pull files from a directory outside the main build context (e.g., a sibling repository) without changing the primary `context:` path.

**Compose overlay:**
```yaml
services:
  my-app:
    build:
      target: dev
      additional_contexts:
        bridge: ../sibling-project   # registers "bridge" as a named context
```

**Dockerfile — critical syntax:**
```dockerfile
# CORRECT: COPY --from=<context-name> pulls from the named context
COPY --from=bridge server.py /bridge/server.py
COPY --from=bridge requirements.txt /bridge/requirements.txt

# WRONG: COPY bridge/server.py looks for a subdirectory named "bridge"
# inside the DEFAULT build context (your project root) — not the named context.
# This fails silently with "not found" errors.
COPY bridge/server.py /bridge/server.py   # ← DO NOT DO THIS
```

The named context (`bridge`) is only accessible via `COPY --from=<name>`. Path-based `COPY` always resolves against the default build context regardless of what `additional_contexts` defines.

## Compose File Entrypoint Overrides Dockerfile ENTRYPOINT

**Compose file values take precedence over Dockerfile instructions.** If the base `docker-compose.yml` sets `entrypoint:` for a service, the Dockerfile's `ENTRYPOINT` is silently ignored — including in a `dev` stage that sets a different entrypoint.

**Always set `entrypoint:` explicitly in the dev compose overlay** when the dev stage runs a different process than the production image:

```yaml
# docker-compose.dev.yml
services:
  my-app:
    build:
      target: dev
    entrypoint: ["python", "/bridge/server.py"]   # ← required, even though
                                                   #   Dockerfile sets this too
```

Without this, the base compose `entrypoint: ["python", "-m", "myapp"]` wins and the dev container runs the wrong process — often failing immediately with a "COMMAND required" error from the app's CLI parser.

**Rule:** Set `entrypoint:` in both the Dockerfile `dev` stage (for correctness and documentation) and the compose overlay (to actually win the precedence contest).

## Docker Bridge Networks for Dev Container Communication

When Claude Code runs in a devcontainer and needs to reach a service in a separate app container, a dedicated Docker bridge network is the correct solution. Key practices:

### Use a fixed subnet

Devcontainer firewall scripts run at startup, before app containers exist. A fixed subnet lets you write firewall rules that are valid regardless of startup order:

```bash
docker network create --subnet=172.22.0.0/29 my-app-dev-bridge-net
```

### Size networks with /29

A /29 gives 8 addresses — sufficient for virtually all dev setups:

| Address | Role |
|---|---|
| `.0` | Network address (unusable) |
| `.1` | Docker bridge gateway — host machine's bridge interface |
| `.2`–`.6` | Available for containers (5 slots) |
| `.7` | Broadcast address (unusable) |

The `.0` (network) and `.7` (broadcast) addresses are Layer 2 constructs — they cannot be assigned to any interface and no packet will ever route there. Blocking them in iptables is unnecessary; no rule targeting them will ever fire.

### Block the gateway, restrict to a single port

Docker always assigns `.1` to the host machine's bridge interface. Block it explicitly so the devcontainer cannot reach host services through this path, then allow only the specific port needed:

```bash
# In .devcontainer/init-firewall.sh, BEFORE the iptables -P INPUT DROP line:
BRIDGE_SUBNET="172.22.0.0/29"
BRIDGE_GATEWAY="172.22.0.1"
BRIDGE_PORT="7357"

iptables -A OUTPUT -d "$BRIDGE_GATEWAY" -j REJECT --reject-with icmp-host-prohibited
iptables -A INPUT  -s "$BRIDGE_GATEWAY" -j REJECT --reject-with icmp-host-prohibited
iptables -A OUTPUT -d "$BRIDGE_SUBNET"  -p tcp --dport "$BRIDGE_PORT" -j ACCEPT
# Return traffic is handled by the ESTABLISHED,RELATED rule
```

### Service names resolve across shared bridge networks

Containers on the same Docker bridge network resolve each other by their Compose service name as a hostname. A devcontainer connected to `my-app-dev-bridge-net` can reach `http://findworkbot:7357` if `findworkbot` is also on that network — no IP address needed.

### Reconnect after devcontainer rebuilds

The bridge network persists across container lifecycle events, but the devcontainer's membership does not survive a rebuild. After each `Dev Containers: Rebuild Container`, reconnect from the host:

```bash
docker network connect my-app-dev-bridge-net <devcontainer-name>
```

This is not needed after app container restarts (`make dev-down && make dev-up`) — only after devcontainer rebuilds.

### Assign subnets systematically for multiple projects

Each project using a bridge network needs its own /29. Increment by 8 within a dedicated /24:

| Project | Network | Subnet |
|---|---|---|
| project-a | `a-dev-bridge-net` | `172.22.0.0/29` |
| project-b | `b-dev-bridge-net` | `172.22.0.8/29` |
| project-c | `c-dev-bridge-net` | `172.22.0.16/29` |

Keeping all bridge subnets in one /24 means a single range to check for VPN or existing network conflicts.
