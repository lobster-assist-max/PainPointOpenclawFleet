---
title: Setup Commands
summary: Onboard, run, doctor, and configure
---

Instance setup and diagnostics commands.

## `fleet run`

One-command bootstrap and start:

```sh
pnpm fleet run
```

Does:

1. Auto-onboards if config is missing
2. Runs `fleet doctor` with repair enabled
3. Starts the server when checks pass

Choose a specific instance:

```sh
pnpm fleet run --instance dev
```

## `fleet onboard`

Interactive first-time setup:

```sh
pnpm fleet onboard
```

First prompt:

1. `Quickstart` (recommended): local defaults (embedded database, no LLM provider, local disk storage, default secrets)
2. `Advanced setup`: full interactive configuration

Start immediately after onboarding:

```sh
pnpm fleet onboard --run
```

Non-interactive defaults + immediate start (opens browser on server listen):

```sh
pnpm fleet onboard --yes
```

## `fleet doctor`

Health checks with optional auto-repair:

```sh
pnpm fleet doctor
pnpm fleet doctor --repair
```

Validates:

- Server configuration
- Database connectivity
- Secrets adapter configuration
- Storage configuration
- Missing key files

## `fleet configure`

Update configuration sections:

```sh
pnpm fleet configure --section server
pnpm fleet configure --section secrets
pnpm fleet configure --section storage
```

## `fleet env`

Show resolved environment configuration:

```sh
pnpm fleet env
```

## `fleet allowed-hostname`

Allow a private hostname for authenticated/private mode:

```sh
pnpm fleet allowed-hostname my-tailscale-host
```

## Local Storage Paths

| Data | Default Path |
|------|-------------|
| Config | `~/.fleet/instances/default/config.json` |
| Database | `~/.fleet/instances/default/db` |
| Logs | `~/.fleet/instances/default/logs` |
| Storage | `~/.fleet/instances/default/data/storage` |
| Secrets key | `~/.fleet/instances/default/secrets/master.key` |

Override with:

```sh
PAPERCLIP_HOME=/custom/home PAPERCLIP_INSTANCE_ID=dev pnpm fleet run
```

Or pass `--data-dir` directly on any command:

```sh
pnpm fleet run --data-dir ./tmp/fleet-dev
pnpm fleet doctor --data-dir ./tmp/fleet-dev
```
