# CLI Reference

Fleet CLI now supports both:

- instance setup/diagnostics (`onboard`, `doctor`, `configure`, `env`, `allowed-hostname`)
- control-plane client operations (issues, approvals, agents, activity, dashboard)

## Base Usage

Use repo script in development:

```sh
pnpm fleet --help
```

First-time local bootstrap + run:

```sh
pnpm fleet run
```

Choose local instance:

```sh
pnpm fleet run --instance dev
```

## Deployment Modes

Mode taxonomy and design intent are documented in `doc/DEPLOYMENT-MODES.md`.

Current CLI behavior:

- `fleet onboard` and `fleet configure --section server` set deployment mode in config
- runtime can override mode with `PAPERCLIP_DEPLOYMENT_MODE`
- `fleet run` and `fleet doctor` do not yet expose a direct `--mode` flag

Target behavior (planned) is documented in `doc/DEPLOYMENT-MODES.md` section 5.

Allow an authenticated/private hostname (for example custom Tailscale DNS):

```sh
pnpm fleet allowed-hostname dotta-macbook-pro
```

All client commands support:

- `--data-dir <path>`
- `--api-base <url>`
- `--api-key <token>`
- `--context <path>`
- `--profile <name>`
- `--json`

Company-scoped commands also support `--company-id <id>`.

Use `--data-dir` on any CLI command to isolate all default local state (config/context/db/logs/storage/secrets) away from `~/.paperclip`:

```sh
pnpm fleet run --data-dir ./tmp/fleet-dev
pnpm fleet issue list --data-dir ./tmp/fleet-dev
```

## Context Profiles

Store local defaults in `~/.paperclip/context.json`:

```sh
pnpm fleet context set --api-base http://localhost:3100 --company-id <company-id>
pnpm fleet context show
pnpm fleet context list
pnpm fleet context use default
```

To avoid storing secrets in context, set `apiKeyEnvVarName` and keep the key in env:

```sh
pnpm fleet context set --api-key-env-var-name FLEET_API_KEY
export FLEET_API_KEY=...
```

## Company Commands

```sh
pnpm fleet company list
pnpm fleet company get <company-id>
pnpm fleet company delete <company-id-or-prefix> --yes --confirm <same-id-or-prefix>
```

Examples:

```sh
pnpm fleet company delete PAP --yes --confirm PAP
pnpm fleet company delete 5cbe79ee-acb3-4597-896e-7662742593cd --yes --confirm 5cbe79ee-acb3-4597-896e-7662742593cd
```

Notes:

- Deletion is server-gated by `PAPERCLIP_ENABLE_COMPANY_DELETION`.
- With agent authentication, company deletion is company-scoped. Use the current company ID/prefix (for example via `--company-id` or `FLEET_COMPANY_ID`), not another company.

## Issue Commands

```sh
pnpm fleet issue list --company-id <company-id> [--status todo,in_progress] [--assignee-agent-id <agent-id>] [--match text]
pnpm fleet issue get <issue-id-or-identifier>
pnpm fleet issue create --company-id <company-id> --title "..." [--description "..."] [--status todo] [--priority high]
pnpm fleet issue update <issue-id> [--status in_progress] [--comment "..."]
pnpm fleet issue comment <issue-id> --body "..." [--reopen]
pnpm fleet issue checkout <issue-id> --agent-id <agent-id> [--expected-statuses todo,backlog,blocked]
pnpm fleet issue release <issue-id>
```

## Agent Commands

```sh
pnpm fleet agent list --company-id <company-id>
pnpm fleet agent get <agent-id>
pnpm fleet agent local-cli <agent-id-or-shortname> --company-id <company-id>
```

`agent local-cli` is the quickest way to run local Claude/Codex manually as a Fleet agent:

- creates a new long-lived agent API key
- installs missing Fleet skills into `~/.codex/skills` and `~/.claude/skills`
- prints `export ...` lines for `FLEET_API_URL`, `FLEET_COMPANY_ID`, `FLEET_AGENT_ID`, and `FLEET_API_KEY`

Example for shortname-based local setup:

```sh
pnpm fleet agent local-cli codexcoder --company-id <company-id>
pnpm fleet agent local-cli claudecoder --company-id <company-id>
```

## Approval Commands

```sh
pnpm fleet approval list --company-id <company-id> [--status pending]
pnpm fleet approval get <approval-id>
pnpm fleet approval create --company-id <company-id> --type hire_agent --payload '{"name":"..."}' [--issue-ids <id1,id2>]
pnpm fleet approval approve <approval-id> [--decision-note "..."]
pnpm fleet approval reject <approval-id> [--decision-note "..."]
pnpm fleet approval request-revision <approval-id> [--decision-note "..."]
pnpm fleet approval resubmit <approval-id> [--payload '{"...":"..."}']
pnpm fleet approval comment <approval-id> --body "..."
```

## Activity Commands

```sh
pnpm fleet activity list --company-id <company-id> [--agent-id <agent-id>] [--entity-type issue] [--entity-id <id>]
```

## Dashboard Commands

```sh
pnpm fleet dashboard get --company-id <company-id>
```

## Heartbeat Command

`heartbeat run` now also supports context/api-key options and uses the shared client stack:

```sh
pnpm fleet heartbeat run --agent-id <agent-id> [--api-base http://localhost:3100] [--api-key <token>]
```

## Local Storage Defaults

Default local instance root is `~/.paperclip/instances/default`:

- config: `~/.paperclip/instances/default/config.json`
- embedded db: `~/.paperclip/instances/default/db`
- logs: `~/.paperclip/instances/default/logs`
- storage: `~/.paperclip/instances/default/data/storage`
- secrets key: `~/.paperclip/instances/default/secrets/master.key`

Override base home or instance with env vars:

```sh
PAPERCLIP_HOME=/custom/home PAPERCLIP_INSTANCE_ID=dev pnpm fleet run
```

## Storage Configuration

Configure storage provider and settings:

```sh
pnpm fleet configure --section storage
```

Supported providers:

- `local_disk` (default; local single-user installs)
- `s3` (S3-compatible object storage)
