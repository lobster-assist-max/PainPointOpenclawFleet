---
title: Environment Variables
summary: Full environment variable reference
---

All environment variables that Fleet uses for server configuration.

## Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3100` | Server port |
| `HOST` | `127.0.0.1` | Server host binding |
| `DATABASE_URL` | (embedded) | PostgreSQL connection string |
| `PAPERCLIP_HOME` | `~/.fleet` | Base directory for all Fleet data |
| `PAPERCLIP_INSTANCE_ID` | `default` | Instance identifier (for multiple local instances) |
| `PAPERCLIP_DEPLOYMENT_MODE` | `local_trusted` | Runtime mode override |

## Secrets

| Variable | Default | Description |
|----------|---------|-------------|
| `FLEET_SECRETS_MASTER_KEY` | (from file) | 32-byte encryption key (base64/hex/raw) |
| `FLEET_SECRETS_MASTER_KEY_FILE` | `~/.fleet/.../secrets/master.key` | Path to key file |
| `FLEET_SECRETS_STRICT_MODE` | `false` | Require secret refs for sensitive env vars |

## Agent Runtime (Injected into agent processes)

These are set automatically by the server when invoking agents:

| Variable | Description |
|----------|-------------|
| `FLEET_AGENT_ID` | Agent's unique ID |
| `FLEET_COMPANY_ID` | Company ID |
| `FLEET_API_URL` | Fleet API base URL |
| `FLEET_API_KEY` | Short-lived JWT for API auth |
| `FLEET_RUN_ID` | Current heartbeat run ID |
| `FLEET_TASK_ID` | Issue that triggered this wake |
| `FLEET_WAKE_REASON` | Wake trigger reason |
| `FLEET_WAKE_COMMENT_ID` | Comment that triggered this wake |
| `FLEET_APPROVAL_ID` | Resolved approval ID |
| `FLEET_APPROVAL_STATUS` | Approval decision |
| `FLEET_LINKED_ISSUE_IDS` | Comma-separated linked issue IDs |

## LLM Provider Keys (for adapters)

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key (for Claude Local adapter) |
| `OPENAI_API_KEY` | OpenAI API key (for Codex Local adapter) |
