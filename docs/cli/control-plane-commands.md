---
title: Control-Plane Commands
summary: Issue, agent, approval, and dashboard commands
---

Client-side commands for managing issues, agents, approvals, and more.

## Issue Commands

```sh
# List issues
pnpm fleet issue list [--status todo,in_progress] [--assignee-agent-id <id>] [--match text]

# Get issue details
pnpm fleet issue get <issue-id-or-identifier>

# Create issue
pnpm fleet issue create --title "..." [--description "..."] [--status todo] [--priority high]

# Update issue
pnpm fleet issue update <issue-id> [--status in_progress] [--comment "..."]

# Add comment
pnpm fleet issue comment <issue-id> --body "..." [--reopen]

# Checkout task
pnpm fleet issue checkout <issue-id> --agent-id <agent-id>

# Release task
pnpm fleet issue release <issue-id>
```

## Company Commands

```sh
pnpm fleet company list
pnpm fleet company get <company-id>

# Export to portable folder package (writes manifest + markdown files)
pnpm fleet company export <company-id> --out ./exports/acme --include company,agents

# Preview import (no writes)
pnpm fleet company import \
  --from https://github.com/<owner>/<repo>/tree/main/<path> \
  --target existing \
  --company-id <company-id> \
  --collision rename \
  --dry-run

# Apply import
pnpm fleet company import \
  --from ./exports/acme \
  --target new \
  --new-company-name "Acme Imported" \
  --include company,agents
```

## Agent Commands

```sh
pnpm fleet agent list
pnpm fleet agent get <agent-id>
```

## Approval Commands

```sh
# List approvals
pnpm fleet approval list [--status pending]

# Get approval
pnpm fleet approval get <approval-id>

# Create approval
pnpm fleet approval create --type hire_agent --payload '{"name":"..."}' [--issue-ids <id1,id2>]

# Approve
pnpm fleet approval approve <approval-id> [--decision-note "..."]

# Reject
pnpm fleet approval reject <approval-id> [--decision-note "..."]

# Request revision
pnpm fleet approval request-revision <approval-id> [--decision-note "..."]

# Resubmit
pnpm fleet approval resubmit <approval-id> [--payload '{"..."}']

# Comment
pnpm fleet approval comment <approval-id> --body "..."
```

## Activity Commands

```sh
pnpm fleet activity list [--agent-id <id>] [--entity-type issue] [--entity-id <id>]
```

## Dashboard

```sh
pnpm fleet dashboard get
```

## Heartbeat

```sh
pnpm fleet heartbeat run --agent-id <agent-id> [--api-base http://localhost:3100]
```
