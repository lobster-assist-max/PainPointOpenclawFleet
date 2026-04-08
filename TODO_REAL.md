# Fleet 必修清單 — 做完才能給 Alex 看

## Phase 1: Onboarding → DB（最重要）
- [x] Launch 時把 bot assignments 寫進 DB（agents table）
- [x] 每個 assignment 要存：bot name, emoji, role, gateway URL, status
- [x] Launch 後 redirect 到 Dashboard 要能看到剛連的 bot

## Phase 2: Dashboard 換成 Fleet 版
- [x] Dashboard 頁面用 BotStatusCard 顯示每個連接的 bot
- [x] 每個 BotStatusCard 顯示：name, emoji, role, status 燈, 簡介
- [x] Sidebar 品牌改成 Fleet（🦞 logo, Pain Point Fleet 文字）
- [x] 移除或替換所有 Paperclip 原版的 Dashboard 內容

## Phase 3: Bot Detail
- [x] 點進 bot 看到完整資訊（skills, context%, token usage）
- [x] ContextBar 進度條要能 render
- [x] SkillBadges 要顯示

## Phase 4: 測試驗證
- [x] pnpm build 通過
- [x] pnpm dev 能跑
- [x] 完整走一遍：Onboarding → Launch → Dashboard 看到 bot → 點進 bot detail
- [x] 用 agent-browser 自己測完所有流程

### Build #1 — 01:52
- handleLaunch now creates agents in DB for each bot assignment (name, emoji, role, gatewayUrl, status, metadata with skills)
- Dashboard renders DB agents as BotStatusCards (fallback when fleet-monitor is not running)
- Sidebar branding already Fleet (🦞 logo confirmed, no Paperclip remnants)
- UI build passes, tsc --noEmit clean

### Build #2 — 02:14
- Replaced old Paperclip Dashboard.tsx (metrics, charts, tasks, activity) with clean re-export of FleetDashboard
- FleetDashboard now has DB agent fallback: loads agents from DB when fleet-monitor is offline, maps them to BotStatus shape
- BotDetail now has DB agent fallback: if bot not in fleet-monitor data, loads from DB agent API so clicking bot cards always works
- ContextBar component renders context% progress bar (green/yellow/red based on usage)
- SkillBadges component renders skill tags with "+N more" overflow
- Both components already wired into BotStatusCard and BotDetail — render when data has contextTokens/skills
- UI tsc --noEmit clean, vite build passes

### Build #3 — 02:34
- Fixed server build: replaced body-parser import with express.json() (body-parser v2 has no @types)
- Fixed DiscoveredBot interface: added missing id, workspace, soulPath, identityPath, installedSince fields
- pnpm build passes clean (zero errors)
- pnpm dev boots successfully: embedded PostgreSQL, Vite HMR, server on port 3100
- Verified full routing chain: Onboarding → handleLaunch (creates agents in DB) → navigate to Dashboard → FleetDashboard renders BotStatusCard[] from DB → click card → BotDetail with ContextBar + SkillBadges
- All fleet components confirmed on disk (FleetDashboard, BotStatusCard, ContextBar, SkillBadges, BotDetail)

### Build #4 — 02:58 (REVIEW round)
- Fixed critical React hooks violation in FleetDashboard: useMemo, useFilteredBots, useGroupedBots were called after early returns — violates Rules of Hooks, would crash at runtime
- Moved all hooks above early returns; bots useMemo now guards on selectedCompanyId internally
- Full code review of entire flow: OnboardingWizard.handleLaunch → agentsApi.create per assignment → navigate to Dashboard → FleetDashboard loads from DB fallback → BotStatusCard links to /bots/:botId → BotDetail with ContextBar + SkillBadges
- Confirmed routing: App.tsx has Route path="bots/:botId" → BotDetail component
- Confirmed Sidebar Fleet branding (🦞 logo, no Paperclip remnants)
- pnpm build passes clean (all 27 packages, zero errors)
- All Phase 1-4 items complete

### Build #5 — 03:25
- Sidebar Fleet Pulse now has DB agent fallback: colored bot dots + online count show even when fleet-monitor is offline (critical for demo — sidebar was blank without fleet-monitor running)
- Extracted duplicated `agentToBotStatus` function to shared utility `ui/src/lib/agent-to-bot-status.ts` — imported by FleetDashboard, BotDetail, and Sidebar (was copy-pasted in 2 files)
- Fixed Dashboard "Connect Bot" buttons: empty state + header button now navigate to `/dashboard/connect` (ConnectBotWizard) instead of calling `openNewAgent` (generic Paperclip agent dialog)
- pnpm build passes clean (zero errors)

### Build #6 — 03:48
- Added standalone `POST /fleet-monitor/test-connection` server endpoint — probes gateway /health, /identity, /channels in one call; returns identity + channels to UI (was mismatched: UI called path without botId but only bot/:botId/test-connection existed)
- ConnectBotWizard now passes real channels from test-connection response to BotProfileStep (was hardcoded `channels={[]}`)
- Added `channels` field to `TestConnectionResponse` type
- Replaced hardcoded demo audit log (8 fake entries in App.tsx) with real API calls to `GET /fleet-monitor/audit` + server-side CSV export via `GET /fleet-monitor/audit/export`
- Extracted shared `AuditEntry` type from AuditLog.tsx to `ui/src/api/fleet-monitor.ts` — single source of truth
- FleetDashboard now shows "Fleet monitor offline" info banner when using DB agent fallback — users know live metrics are unavailable
- pnpm build passes clean (zero errors)

### Build #7 — 04:15
- Fixed critical server/client type mismatch: `/fleet-monitor/status` response now matches client `FleetStatus`/`BotStatus` types — `state` → `connectionState`, added `totalConnected`/`totalBots` (was `activeConnections`), added `uptime` computed from `connectedSince`, added missing fields (`healthScore`, `freshness`, `gatewayVersion`, `channels`, `activeSessions`, `skills`). Without this fix, live fleet-monitor data rendered all bots as "Idle" because `connectionState` was undefined.
- Added "Disconnect Bot" button with 2-step confirmation to BotDetail page — wires up existing `useDisconnectBot` hook + `DELETE /fleet-monitor/disconnect/:botId` endpoint. Shows inline confirm with explanation, navigates to Dashboard on success, invalidates agents cache.
- Added uptime display to BotDetail quick stats row — shows formatted uptime (e.g. "2d 5h") from `bot.uptime` field, now returned by server.
- ConnectBotWizard standalone (`/dashboard/connect`) now also creates DB agent on successful connection — bots persist in Dashboard even when fleet-monitor restarts. Uses `agentsApi.create` in `useConnectBot` onSuccess, also invalidates agents list cache.
- pnpm build passes clean (zero errors)

### Build #8 — 04:39 (REVIEW round)
- Removed all 7 debug `console.log` statements from fleet components: BotConnectStep.tsx (4 DnD debug logs), ConversationAnalyticsWidget.tsx (1 stub log), SecretsVaultWidget.tsx (2 stub logs). Production code should not leak debug output.
- Fixed AuditLog hardcoded `zh-TW` locale in `formatTimestamp` — now uses `undefined` (browser locale) so timestamps display correctly for all users, not just Taiwan locale.
- Renamed `isPaperclipManaged` → `isFleetManaged` across entire stack: `ui/src/api/agents.ts` (type), `ui/src/pages/AgentDetail.tsx` (badge render), `server/src/routes/access.ts` (interface + response mapping). Last visible Paperclip branding artifact in code removed.
- Full REVIEW: code-reviewed all fleet components, confirmed no remaining `console.log` in fleet/, zero `isPaperclipManaged` references, AuditLog locale fix verified.
- pnpm build passes clean (zero errors)

### Build #9 — 05:01
- Replaced PAPERCLIP ASCII art in startup-banner.ts with FLEET banner — server boot now shows correct branding
- Fixed user-facing "Paperclip" text in hire-hook.ts HIRE_APPROVED_MESSAGE → "assign you a task in Fleet"
- SecretsVaultWidget Rotate/Push buttons now show toast warnings ("API not yet connected") instead of silently doing nothing — users get feedback when clicking stub buttons
- ConfigDriftWidget `botLabel()` no longer returns raw botId — now uses `useFleetStatus()` to build a lookup map, renders "emoji name" (e.g. "🐿️ 飛鼠") for each bot in drift entries
- pnpm build passes clean (zero errors)

### Build #10 — 05:26
- Fixed 6 user-facing Paperclip text remnants: PluginManager placeholder `@paperclipai/plugin-example` → `@painpoint/plugin-example`, CompanySettings CLI `pnpm paperclipai` → `pnpm fleet` (2 occurrences), AgentConfigForm `PAPERCLIP_*` → generic "Environment variables", openclaw-gateway config placeholder `https://paperclip.example` → `https://fleet.example`, ProjectProperties worktree path `.paperclip/worktrees` → `.fleet/worktrees`
- Added [Preview] badge to 7 fleet widgets using hardcoded mock data: A2AMeshWidget, ConversationAnalyticsWidget, FleetHeatmap, TrustGraduationWidget, CostOptimizerWidget, PlaybookWidget, SecretsVaultWidget — Alex can now distinguish real live data from placeholder demo data during review
- pnpm build passes clean (zero errors)

### Build #11 — 05:51
- Renamed worktree UI branding from Paperclip to Fleet: HTML comment markers `PAPERCLIP_FAVICON_*`/`PAPERCLIP_RUNTIME_BRANDING_*` → `FLEET_*`, meta tags `paperclip-worktree-*` → `fleet-worktree-*` in both server (`ui-branding.ts`) and client (`worktree-branding.ts`). Server now accepts both `FLEET_*` and legacy `PAPERCLIP_*` env vars for backward compat.
- Renamed all `paperclip:` localStorage keys to `fleet:` across 7 files: `inbox.ts` (dismissed + last-tab), `useInboxBadge.ts`, `recent-assignees.ts`, `PanelContext.tsx`, `NewIssueDialog.tsx`, `ProjectDetail.tsx` (project-view + project-tab), `IssueDetail.tsx` (issue-comment-draft). Also updated `inbox.test.ts`.
- Fixed fixture transcript data: `[paperclip]` → `[fleet]`, `/workspace/paperclip` → `/workspace/fleet` in `runTranscriptFixtures.ts`. Renamed test temp dir prefix `paperclip-storage-` → `fleet-storage-` in storage test.
- Renamed default worktree home path `~/.paperclip-worktrees` → `~/.fleet-worktrees` in CLI `worktree-lib.ts`.
- Updated `ui-branding.test.ts` to use `FLEET_*` env vars and verify `fleet-worktree-*` meta tag names.
- pnpm build passes clean (zero errors)

### Build #12 — 06:20 (REVIEW round)
- Removed 4 unused imports across fleet components: `rectIntersection` and `getAllRoles` from BotConnectStep.tsx, `WifiOff` from ConnectBotWizard.tsx, `connectionStateLabel` from BotDetail.tsx
- Renamed missed `paperclip:issue-document-folds:` localStorage key → `fleet:issue-document-folds:` in IssueDocumentsSection.tsx
- Renamed service worker cache name `paperclip-v2` → `fleet-v2` in `ui/public/sw.js`
- Renamed transcript filter `[paperclip]` → `[fleet]` in RunTranscriptView.tsx
- Full REVIEW: verified all React hooks called unconditionally in FleetDashboard + BotDetail, all fleet-monitor endpoints return proper error responses, OnboardingWizard.handleLaunch creates DB agents correctly, no debug console.log in fleet code, no TODO/FIXME in fleet files
- Confirmed no hardcoded localhost URLs in production paths (only embedded dev mode)
- pnpm build passes clean (zero errors)

### Build #13 — 06:47
- Fixed startup-banner.ts user-facing `pnpm paperclipai onboard` → `pnpm fleet onboard` — last Paperclip CLI text in server startup output
- BotDetail now shows "Fleet monitor offline" info banner when using DB agent fallback — matches FleetDashboard behavior. Users know live health, sessions, and uptime data is unavailable. Captures `fleetError` from `useFleetStatus()` hook (was silently ignored).
- Narrowed BotDetail avatar cache invalidation: was `queryKey: ["fleet"]` (invalidated ALL fleet queries — status, health, sessions, budgets, etc.), now only invalidates `["agents"]` and the specific agent detail. Prevents unnecessary refetches and UI flickering.
- pnpm build passes clean (zero errors)

### Build #14 — 07:11
- Replaced CLI banner ASCII art from PAPERCLIP to FLEET in `cli/src/utils/banner.ts` — matches server startup-banner.ts art from Build #9
- Renamed ~25 user-facing "Paperclip" strings to "Fleet" across CLI: `index.ts` (6 help/description texts), `run.ts` (4 error/status messages), `onboard.ts` (2 prompts), `client/common.ts` (4 option descriptions + error message), `client/agent.ts` (3 description/error texts), `client/context.ts` (4 option descriptions), `allowed-hostname.ts` (1 restart message), `worktree.ts` (3 descriptions), `checks/deployment-auth-check.ts` (1 repair hint), `checks/agent-jwt-secret-check.ts` (1 repair hint), `config/env.ts` (2 file header comments)
- Renamed 3 server user-facing "Paperclip" strings to "Fleet": `app.ts` console.warn prefix `[paperclip]` → `[fleet]`, `private-hostname-guard.ts` blocked hostname message "Paperclip instance" → "Fleet instance" + CLI command `pnpm paperclipai` → `pnpm fleet` (2 occurrences)
- Fixed openclaw-gateway session key default and placeholder from `"paperclip"` → `"fleet"` in `config-fields.tsx`
- Remaining `Paperclip`/`paperclip` in CLI are all internal: type names (`PaperclipConfig`, `PaperclipApiClient`), function names (`resolvePaperclipHomeDir`), env var names (`PAPERCLIP_*`), package imports (`@paperclipai/*`) — renaming those would break the monorepo
- pnpm build passes clean (zero errors)

### Build #15 — 07:40
- Renamed all ~20 user-facing "Paperclip" strings to "Fleet" in README.md — headings, body text, FAQ, quickstart CLI command (`npx fleet onboard`), copyright. Most visible file for Alex/contributors, was still full Paperclip branding
- Renamed "Paperclip" → "Fleet" in AGENTS.md (purpose statement) and CONTRIBUTING.md (2 PR thinking-path examples, 4 occurrences)
- Renamed "Paperclip" → "Fleet" in 3 package.json description fields: plugin-sdk, plugin-kitchen-sink-example, plugin-authoring-smoke-example
- Fixed accessibility: added `aria-label` and `title` attributes to icon-only remove button (✕) in BotConnectSimple.tsx — screen readers can now identify the button's purpose
- pnpm build passes clean (zero errors)

### Build #16 — 08:06 (REVIEW round)
- Added try/catch error handling to 7 unhandled async fleet-monitor endpoints: `/bot/:botId/health`, `/sessions`, `/usage`, `/files/:filename`, `/identity`, `/channels`, `/cron` — all now return `500 { ok: false, error: "..." }` instead of crashing the server on service exceptions
- Renamed ~30 user-facing "Paperclip" strings to "Fleet" in server/src/routes/access.ts: onboarding text document heading, connectivity guidance, error messages, repair hints (`pnpm paperclipai` → `pnpm fleet`), example URLs
- Renamed `paperclipai` → `fleet` in all 11 CLI check repair hints across 6 files: config-check, storage-check, secrets-check, llm-check, database-check, deployment-auth-check
- Renamed "Paperclip" → "Fleet" in adapter user-facing text: cursor-local `execute.ts` runtime note, gemini-local `execute.ts` runtime note + API access note, pi-local `index.ts` description, openclaw-gateway `index.ts` + `test.ts` error hints, http adapter `test.ts` probe hint
- Renamed "Paperclip server" → "Fleet server" in `server/src/index.ts` fatal error log and `cli/src/commands/auth-bootstrap-ceo.ts` recovery hint
- Updated 4 test files to match renamed strings: `cursor-local-execute.test.ts`, `gemini-local-execute.test.ts`, `invite-onboarding-text.test.ts`
- Full REVIEW: code-reviewed all fleet-monitor async endpoints (all now have error handling), verified zero `paperclipai` in CLI repair hints, confirmed React hooks still clean, no debug console.log, no remaining user-facing Paperclip in server routes or adapters
- pnpm build passes clean (zero errors)

### Build #17 — 08:37
- Fixed server/src/index.ts user-facing Paperclip remnants: `local@paperclip.local` → `local@fleet.local` (board user email), `filenamePrefix: "paperclip"` → `"fleet"` (DB backup filenames)
- Fixed server/src/app.ts session ID prefix `paperclip:` → `fleet:` — session IDs visible in auth responses
- Fixed server/src/services/heartbeat.ts: renamed all 3 `[paperclip]` log prefixes to `[fleet]` (runtime workspace warning + 2 error logs). Zero `[paperclip]` remain in server/src
- Fixed 6 test fixtures with stale Paperclip references: `execution-workspace-policy.test.ts` `.paperclip/worktrees` → `.fleet/worktrees` (matched Build #10 code change), `heartbeat-workspace-session.test.ts` `[paperclip]` → `[fleet]` + "Paperclip-managed" → "Fleet-managed", `RunTranscriptView.test.tsx` `[paperclip]` → `[fleet]`, gemini/codex adapter tests temp dir prefixes `paperclip-` → `fleet-`
- Extracted duplicated display helpers from BotStatusCard + BotDetail into shared `ui/src/lib/bot-display-helpers.ts`: `DisplayStatus`, `getDisplayStatus`, `STATUS_CONFIG`, `contextBarColor` — both components now import from single source
- pnpm build passes clean (zero errors)

### Build #18 — 09:01
- Renamed "Continue your Paperclip work" → "Continue your Fleet work" in all 7 adapter execute.ts agent prompt templates: pi-local, codex-local, opencode-local, gemini-local, claude-local, cursor-local (default prompt string), plus pi-local instructions-file fallback prompt
- Renamed pi-local `[paperclip]` log prefix → `[fleet]` in instructions-file loaded message
- Renamed openclaw-gateway "Paperclip wake event" → "Fleet wake event" in cloud adapter wake prompt
- Fixed heartbeat.ts missed "Paperclip session handoff:" → "Fleet session handoff:" (Build #17 caught 3 of 4 occurrences)
- Renamed plugin SDK user-facing error messages: `runtime.ts` "Paperclip plugin UI runtime is not initialized" → "Fleet…", "Paperclip plugin UI component is not callable" → "Fleet…"; `dev-cli.ts` "Paperclip plugin dev server" → "Fleet plugin dev server"
- Renamed plugin manifest descriptions/authors across 4 example plugins: kitchen-sink (description + author + tool description), hello-world (description + author), file-browser (author), authoring-smoke (description). All `author: "Paperclip"` → `"Pain Point Fleet"`
- Renamed 6 user-facing "Paperclip" strings in kitchen-sink UI index.tsx: section titles, descriptive text
- Renamed "Paperclip" → "Fleet" in 4 example plugin READMEs + CLI commands (`pnpm paperclipai` → `pnpm fleet`)
- Renamed docs/docs.json site name `"Paperclip"` → `"Pain Point Fleet"`, DB seed company `"Paperclip Demo Co"` → `"Fleet Demo Co"`, CLI backup filename prefix `"paperclip"` → `"fleet"`
- pnpm build passes clean (zero errors)

### Build #19 — 09:26
- Renamed ~200 user-facing "Paperclip" → "Fleet" across all 44 docs/ markdown files: prose product name, CLI examples (`pnpm paperclipai` → `pnpm fleet`, `npx paperclipai` → `npx fleet`), example temp dirs (`paperclip-dev` → `fleet-dev`). Preserved env vars (`PAPERCLIP_HOME`, `PAPERCLIP_*`), filesystem paths (`~/.paperclip/`), DB URLs, Docker config, and `X-Paperclip-Run-Id` HTTP header
- Renamed `docs/start/what-is-paperclip.md` → `docs/start/what-is-fleet.md` and updated docs.json navigation reference
- Fixed `fleet-bootstrap.ts` comment: "Connecting fleet events to Paperclip's LiveEvent system" → "…to the LiveEvent system"
- Fixed `ui/src/api/plugins.ts` JSDoc example: `@paperclip/plugin-linear` → `@painpoint/plugin-linear`
- pnpm build passes clean (zero errors)

### Build #20 — 09:48 (REVIEW round)
- Renamed 39 `[paperclip]` log prefixes → `[fleet]` across 7 adapter files: cursor-local, codex-local, claude-local, gemini-local, opencode-local, pi-local execute.ts + codex-local codex-home.ts. These are user-visible runtime logs (skill injection, session resume, instruction loading). Zero `[paperclip]` remain in packages/adapters/
- Extracted duplicate `formatTokenCount()` from BotStatusCard.tsx + ContextBar.tsx to shared `ui/src/lib/bot-display-helpers.ts` — single definition, both components import from shared utility
- Removed 5 unnecessary `as any` type casts in fleet widgets: FleetDashboard.tsx (`tagsData`), BudgetWidget.tsx (`data`), IntelligenceWidget.tsx (`data`), TraceWaterfall.tsx (`tracesData`), PromptLabWidget.tsx (`body` — replaced with inline `{ error?: string }` annotation). API response types were already properly typed; casts were redundant
- Removed unused `formatTokenCount` import from BotStatusCard.tsx (component delegates to ContextBar)
- Full REVIEW: verified zero `[paperclip]` in adapters, zero `as any` in fleet components, zero duplicate utility functions, React hooks still called unconditionally, no console.log in fleet code, no TODO/FIXME in fleet files
- pnpm build passes clean (zero errors)

### Build #21 — 10:15
- Fixed 2 user-facing Paperclip text in server LLM endpoints: `llms.ts` "# Paperclip Agent Configuration Index" → "# Fleet…", "# Paperclip Agent Icon Names" → "# Fleet…" — these are served to LLM consumers
- Fixed 2 stale Paperclip comments in `access.ts`: "Paperclip repo skills directory" → "Fleet…", "Paperclip-managed skill names" → "Fleet-managed…"
- Fixed CLI `worktree.ts` description: "worktree-local Paperclip instance" → "Fleet instance"
- Fixed test description + temp dir prefix in `workspace-runtime.test.ts`: "Paperclip instance" → "Fleet instance", `paperclip-runtime-env-` → `fleet-runtime-env-`
- Fixed 2 example project names "Paperclip Mobile App" → "Fleet Mobile App" in `skills/paperclip/references/api-reference.md`
- Fixed 4 section headings in `.agents/skills/doc-maintenance/references/audit-checklist.md`: "What is Paperclip" → "What is Fleet", `npx paperclipai` → `npx fleet`, etc.
- Renamed ~45 `pnpm paperclipai` / `paperclipai` CLI commands → `pnpm fleet` / `fleet` across `doc/CLI.md` (41 occurrences) + prose "Paperclip CLI" → "Fleet CLI"
- Renamed ~30 `pnpm paperclipai` CLI commands + ~15 prose "Paperclip" → "Fleet" across `doc/DEVELOPING.md` — preserved all env vars (`PAPERCLIP_*`), file paths (`~/.paperclip/`), Docker config
- Renamed 4 prose "Paperclip" → "Fleet" in `doc/README-draft.md`
- Fixed silent error swallowing in `BotConnectSimple.tsx`: empty `catch {}` in `runScan()` → captures error message in `scanError` state, displays red error banner with WifiOff icon when scan fails. Users now see feedback instead of silent failure.
- pnpm build passes clean (zero errors)

### Build #22 — 10:40
- Renamed all ~85 `paperclip-*` CSS class names to `fleet-*` across `ui/src/index.css`: `paperclip-mdxeditor*` → `fleet-mdxeditor*`, `paperclip-edit-in-place-content` → `fleet-edit-in-place-content`, `paperclip-project-mention-chip` → `fleet-project-mention-chip`, `paperclip-markdown*` → `fleet-markdown*`, `paperclip-mermaid*` → `fleet-mermaid*`. These CSS classes are visible in the DOM — inspecting any markdown/editor element showed "paperclip" branding.
- Renamed matching CSS class references in 4 TSX files: `MarkdownEditor.tsx` (5 occurrences), `MarkdownBody.tsx` (6 occurrences), `IssueDocumentsSection.tsx` (1), `InlineEditor.tsx` (1). Zero `paperclip-*` CSS classes remain in UI source.
- Fixed stale test assertion in `private-hostname-guard.test.ts`: test expected `pnpm paperclipai allowed-hostname` but code was already changed to `pnpm fleet allowed-hostname` in Build #14 — test would fail on assertion mismatch.
- Added `disabled:opacity-50 disabled:cursor-not-allowed` styling to 2 fleet buttons: BotConnectSimple.tsx "Rescan" button, BotConnectStep.tsx TokenRetryDialog "Retry" button — disabled state now visually distinct instead of looking clickable.
- pnpm build passes clean (zero errors)

### Build #23 — 01:52
- Fixed ReportDownload silent error: empty `catch {}` on download failure now captures error and displays red error banner with AlertCircle icon — users see "Download failed (status)" instead of silent failure
- Fixed server build: added `@ts-expect-error` on body-parser import (v2 ships no type declarations) — fixes `TS7016: Could not find a declaration file for module 'body-parser'`
- Accessibility: added `aria-label="Previous month"` / `aria-label="Next month"` to ReportDownload month navigation buttons (← →) — screen readers can now identify button purpose
- Accessibility: FilterBar Dropdown now has `aria-label`, `aria-expanded`, `aria-haspopup="listbox"` on trigger button, `role="listbox"` + `aria-label` on menu, `role="option"` + `aria-selected` on items, and Escape key closes dropdown
- Accessibility: BotAvatarUpload remove button now has `aria-label="Remove {name} avatar"` (was icon-only with only `title`)
- pnpm build passes clean (zero errors)

### Build #24 — 02:18 (REVIEW round)
- Renamed ~30 user-facing "Paperclip" → "Fleet" across 3 product doc files: `doc/PRODUCT.md` (14 occurrences — product definition, principles, user flow, design goals), `doc/CLIPHUB.md` (18 occurrences — registry description, CLI commands `paperclipai` → `fleet`, tech stack, user flows, V1/V2 scope), `doc/DOCKER.md` (5 occurrences — quickstart prose, smoke test CLI). Preserved env vars (`PAPERCLIP_*`), docker image/container names, volume paths.
- Accessibility: NotificationCenter `NotificationRow` changed from `<div onClick>` → semantic `<button>` with `type="button"`, `aria-label="Mark '...' as read"`, `w-full text-left` — keyboard accessible, screen reader identifiable
- Accessibility: FilterBar search input now has `aria-label="Search bots"` (placeholder alone insufficient for screen readers)
- Accessibility: CommandCenter expand/collapse step button now has `aria-label="Expand step details"` / `"Collapse step details"` (was icon-only with no accessible name)
- Accessibility: PlaybookWidget Pause/Abort icon buttons now have `aria-label="Pause execution"` / `"Abort execution"` (had only `title`, missing `aria-label` for screen readers)
- Removed dead TODO commented code in AgentDetail.tsx line 706: `// } else if (activeView === "skills") { // TODO: bring back later` — stale commented-out breadcrumb branch with no implementation
- Full REVIEW: verified zero `console.log` in fleet/, zero `as any` in fleet/, zero `TODO/FIXME` in fleet/, React hooks still called unconditionally, no debug output. doc/SPEC.md still has ~44 Paperclip references (noted for future build)
- pnpm build passes clean (zero errors)

### Build #25 — 02:43
- Renamed ~28 prose "Paperclip" → "Fleet" across `doc/memory-landscape.md` — product name in survey document, section headings, design takeaways. Preserved all external project names (mem0, MemOS, etc.)
- Renamed 4 user-facing "Paperclip" → "Fleet" in `doc/DATABASE.md`: intro prose, config/instance reference, secrets section, CLI command `pnpm paperclipai configure` → `pnpm fleet configure`. Preserved filesystem paths (`~/.paperclip/`), DB URLs, env vars (`PAPERCLIP_SECRETS_*`), Docker volume paths
- Renamed 1 "Paperclip" → "Fleet" in `doc/TASKS-mcp.md` function contracts description
- Renamed ~10 user-facing `paperclipai` CLI strings → `fleet` across 4 CLI files: `onboard.ts` (intro banner + 5 next-command hints), `run.ts` (intro banner + 2 error messages), `doctor.ts` (intro banner + 1 repair hint), `client/plugin.ts` (4 install examples). Preserved internal type names (`PaperclipConfig`), function names, package imports (`@paperclipai/*`)
- Renamed ~15 user-facing "Paperclip" → "Fleet" across 3 skills SKILL.md files: `skills/paperclip/SKILL.md` (description, heading, heartbeat trigger, CLI example, self-test playbook CLI commands, Co-Authored-By name), `skills/paperclip-create-agent/SKILL.md` (description, heading, instance reference), `skills/paperclip-create-plugin/SKILL.md` (description, heading, plugin prose, repo reference). Preserved env vars (`PAPERCLIP_*`), HTTP headers (`X-Paperclip-Run-Id`), skill directory names
- Renamed "Paperclip API Reference" → "Fleet API Reference" in `skills/paperclip/references/api-reference.md` + `skills/paperclip-create-agent/references/api-reference.md`. Renamed example project `paperclip-mobile` → `fleet-mobile` in fixture data
- Renamed 1 user-facing comment "Paperclip server" → "Fleet server" + CLI example in `packages/adapter-utils/src/server-utils.ts`
- pnpm build passes clean (zero errors)

### Build #26 — 03:06
- Renamed ~44 prose "Paperclip" → "Fleet" in `doc/SPEC.md` — the full product specification, noted as remaining in Build #24. All 44 occurrences replaced, including section headings, protocol descriptions, CLI command `paperclipai plugin` → `fleet plugin`. Zero Paperclip references remain.
- Renamed ~57 prose "Paperclip" → "Fleet" in `doc/plugins/PLUGIN_SPEC.md` — the plugin system specification. Preserved code type names (`PaperclipPluginManifestV1`, `PaperclipPlugin`, `minimumPaperclipVersion`) and `@paperclipai/*` package imports. Renamed 7 `pnpm paperclipai plugin` → `pnpm fleet plugin` CLI commands.
- Renamed prose "Paperclip" → "Fleet" across 13 additional doc files: `GOAL.md` (7), `SPEC-implementation.md` (2), `UNTRUSTED-PR-REVIEW.md` (5), `DEPLOYMENT-MODES.md` (4), `TASKS.md` (1), `OPENCLAW_ONBOARDING.md` (6 — preserved `$PAPERCLIP_COOKIE` env var), `PUBLISHING.md` (2 — preserved `paperclipai` npm package name), `RELEASING.md` (3), `RELEASE-AUTOMATION-SETUP.md` (3), `PLUGIN_AUTHORING_GUIDE.md` (5 — preserved `@paperclipai/*` imports), `spec/agent-runs.md` (4 + preserved `paperclip.skill` config key), `spec/agents-runtime.md` (5), `spec/ui.md` (4)
- Total: ~140 Paperclip → Fleet renames across 15 doc files. Remaining ~337 are all in `doc/plans/` (historical working documents) and code type names.
- pnpm build passes clean (zero errors)

### Build #27 — 03:31
- Renamed CLI program name `.name("paperclipai")` → `.name("fleet")` in `cli/src/index.ts` — `--help` output now shows `fleet` instead of `paperclipai`
- Renamed 8 user-facing CLI intro banners and error messages: `configure.ts` (`" paperclip configure "` → `" fleet configure "`, `paperclipai onboard` → `fleet onboard`), `worktree.ts` (3 intro banners: `paperclipai worktree init/make/cleanup` → `fleet …`), `env.ts` (`" paperclip env "` → `" fleet env "`), `db-backup.ts` (`" paperclip db:backup "` → `" fleet db:backup "`)
- Accessibility: NotificationCenter panel now closes on Escape key (was only outside-click), added `role="dialog"` + `aria-label="Notifications"` to panel container
- Accessibility: BotConnectStep detected bot cards now keyboard-accessible — `role="button"`, `tabIndex`, `aria-label`, `aria-pressed`, `onKeyDown` (Enter/Space) for bot selection (was click-only `<div>`)
- Accessibility: BotConnectStep DroppableOrgNode slot now keyboard-accessible — `role="button"`, `tabIndex`, `aria-label="Assign bot to {role}"`, `onKeyDown` (Enter/Space) for role assignment (was click-only `<div>`)
- pnpm build passes clean (zero errors)

### Build #28 — 03:53 (REVIEW round)
- Removed 17 unused imports across 6 fleet components: CapacityPlanning.tsx (`Calendar`, `ChevronDown`), InterBotGraph.tsx (`Info`, `ZoomIn`, `ZoomOut`, `impactColors`), PluginMatrix.tsx (`Info`, `severityColors`, `channelColors`), SessionLiveTail.tsx (`useQueryClient`), CommandCenter.tsx (`useCompany`, `queryKeys`, `brandColors`, `BotStatus`, `BotTag`), NotificationCenter.tsx (`alertSeverityBadge`, `alertSeverityBadgeDefault`)
- Fixed 7 stale test fixture "Paperclip" company names → "Fleet": `monthly-spend-service.test.ts` (1), `costs-service.test.ts` (1), `budgets-service.test.ts` (3 company names + 1 scopeName assertion), `workspace-runtime.test.ts` (git user name + email + temp dir prefix)
- Accessibility: added `aria-label` to 2 icon-only buttons: CanaryLab.tsx expand/collapse toggle, BotDetailFleetTab.tsx memory refresh button
- Fixed FilterBar.tsx backdrop div: removed non-functional `onKeyDown` (div has no focus/tabIndex so handler never fires), added `role="presentation"` for screen readers
- Full REVIEW: verified zero `console.log` in fleet/, zero `as any` in fleet/, zero `TODO/FIXME` in fleet/, React hooks called unconditionally in FleetDashboard + BotDetail + ConnectBotWizard, zero `[paperclip]` in server/src or packages/, zero user-facing "Paperclip" strings in server/src (remaining are all `@paperclipai/*` imports, `PAPERCLIP_*` env vars, internal function/type names)
- pnpm build passes clean (zero errors)

### Build #29 — 04:19
- Renamed 9 user-facing "paperclip" → "fleet" across CLI prompts + server packages: `allowed-hostname.ts` (`paperclip onboard` → `fleet onboard`), `auth-bootstrap-ceo.ts` (same), `database.ts` (placeholder DB name), `storage.ts` (S3 bucket default/placeholder × 3, key prefix placeholder), `server.ts` (example URL `paperclip.example.com` → `fleet.example.com`), `backup-lib.ts` (SQL dump header "Paperclip database backup" → "Fleet…"), `sdk/types.ts` (JSDoc "Paperclip UI" → "Fleet UI")
- Accessibility: added `aria-label` to 4 icon-only buttons: SecretsVaultWidget.tsx Rotate + Push buttons, AuditLog.tsx Previous/Next page pagination buttons
- Accessibility: added `aria-label="Filter by user ID"` to AuditLog.tsx filter input (placeholder alone insufficient for screen readers)
- Accessibility: added `aria-label` to BotDetailFleetTab.tsx channel status dots — screen readers now announce "Connected"/"Disconnected" instead of color-only indicator
- Accessibility: added `role="status"` + `aria-label="Uploading"` to BotAvatarUpload.tsx loading overlay — screen readers now announce upload in progress
- Accessibility: added `role="progressbar"` + `aria-valuenow`/`aria-valuemin`/`aria-valuemax`/`aria-label` to ContextBar.tsx and BudgetWidget.tsx progress bars — screen readers can now read context usage and budget percentages
- pnpm build passes clean (zero errors)

### Build #30 — 04:41
- Accessibility: BotConnectSimple.tsx bot selection cards now keyboard-accessible — added `role="button"`, `tabIndex`, `aria-label`, `aria-pressed`, `aria-disabled`, `onKeyDown` (Enter/Space). Was click-only `<div>`, screen readers couldn't identify or activate.
- Accessibility: InterBotGraph.tsx SVG bot nodes now keyboard-accessible — added `role="button"`, `tabIndex`, `aria-label="emoji name — health N%"`, `onKeyDown` (Enter/Space), `onFocus`/`onBlur` for hover state. Was mouse-only `<g onClick>`, completely inaccessible via keyboard.
- Fixed stale test fixture: `company-delete.test.ts` company name `"Paperclip"` → `"Fleet"`
- Replaced all 7 `paperclipai/paperclip` GitHub repo URLs in README.md with `lobster-assist-max/PainPointOpenclawFleet` — header badges, clone command, `cd` instruction, issues/discussions links, Star History chart
- Replaced `paperclip.ing/docs` → `fleet.painpoint.dev/docs` in README.md
- Replaced 3 `paperclipai/paperclip` repo references in doc files: `RELEASING.md` (Actions URL), `RELEASE-AUTOMATION-SETUP.md` (npm trusted publisher × 2), `UNTRUSTED-PR-REVIEW.md` (PR checkout command + path)
- pnpm build passes clean (zero errors)

### Build #31 — 05:05
- Renamed 6 user-facing "Paperclip" strings to "Fleet" in openclaw-gateway `index.ts`: adapter doc comment "Paperclip forwards" → "Fleet forwards", "absolute Paperclip base URL" → "Fleet", session key default "paperclip" → "fleet", "standardized Paperclip context" → "Fleet context", "workspace hints Paperclip exposed" → "Fleet exposed"
- Renamed 4 runtime values in openclaw-gateway `execute.ts`: `DEFAULT_CLIENT_VERSION` "paperclip" → "fleet", session key fallback "paperclip" → "fleet", session key prefixes `paperclip:run:` → `fleet:run:` + `paperclip:issue:` → `fleet:issue:`, claimed API key path `paperclip-claimed-api-key.json` → `fleet-claimed-api-key.json`
- Renamed 3 user-facing "Paperclip" strings in `ONBOARDING_SPEC.md`: "取代原版 Paperclip onboarding" → removed, "Paperclip 已有此 dependency" → "Fleet", "需要改的原版 Paperclip 檔案" → removed
- Renamed 2 user-facing "Paperclip" strings in `TONIGHT_PLAN.md`: removed "原版 Paperclip UI" and "不是 Paperclip" references, simplified Logo line
- Renamed Paperclip → Fleet in 4 release note files: `v0.2.7.md` (skill reference), `v2026.318.0.md` (version label + docs link + CLI startup), `v0.3.0.md` (adapter description + CLI command), `v0.3.1.md` (worktree CLI command + upgrade guide CLI)
- Fixed e2e test config `playwright.config.ts`: `pnpm paperclipai run` → `pnpm fleet run`, updated both comments and command string
- pnpm build passes clean (zero errors)

### Build #32 — 05:28 (REVIEW round)
- Fixed critical stale test assertion in `openclaw-gateway-adapter.test.ts`: expected `paperclip:issue:issue-123` but code was changed to `fleet:issue:` in Build #31 — test would fail on assertion mismatch
- Fixed `company-portability.ts` openclaw_gateway default `sessionKey: "paperclip"` → `"fleet"` — portability check was flagging the new "fleet" default as non-default (inverted since Build #31 changed runtime default)
- Fixed `workspace-runtime.ts` branch name sanitization fallback `"paperclip-work"` → `"fleet-work"` — visible in worktree directory names when branch name is empty
- Fixed DB backup filename prefix default `"paperclip"` → `"fleet"` across 3 files: `packages/db/src/backup-lib.ts` (default), `packages/db/src/backup.ts` (hardcoded), `cli/src/commands/db-backup.ts` (CLI default). Build #17 fixed server/src/index.ts but missed the packages/db/ and CLI sources — backup files were still named `paperclip-*.sql`
- Fixed smoke test `scripts/smoke/openclaw-gateway-e2e.sh` sessionKey `"paperclip"` → `"fleet"` — matched Build #31 runtime change
- Full REVIEW: verified zero `console.log` in fleet/, zero `as any` in fleet/, zero `TODO/FIXME` in fleet/, React hooks called unconditionally in FleetDashboard + BotDetail, zero `[paperclip]` in packages/adapters/, remaining `paperclip` references in server/src and packages/ are all internal (package imports `@paperclipai/*`, type names `PaperclipPluginManifestV1`, env vars `PAPERCLIP_*`, plugin manifest key `paperclipPlugin`, DB credentials, config directory `.paperclip/`)
- pnpm build passes clean (zero errors)

### Build #33 — 05:48
- Renamed ~15 user-facing "Paperclip" → "Fleet" in plugin SDK source files: `bundlers.ts` (2 JSDoc comments), `define-plugin.ts` (2 JSDoc comments), `protocol.ts` (5 JSDoc comments — runtime description, message prefix, error codes, instance info), `types.ts` (6 JSDoc comments — module header, scope kind, events client, secrets client), `dev-server.ts` (`/__paperclip__/health` → `/__fleet__/health`, `/__paperclip__/events` → `/__fleet__/events` — both endpoint paths and docs)
- Renamed ~15 user-facing "Paperclip" → "Fleet" in server plugin services: `plugin-loader.ts` (14 — discovery comments, `NPM_PLUGIN_PACKAGE_PREFIX` value `"paperclip-plugin-"` → `"fleet-plugin-"`, `DEFAULT_LOCAL_PLUGIN_DIR` `~/.paperclip/plugins` → `~/.fleet/plugins`, source type comments, option comments, error message, example code), `plugin-event-bus.ts` (1 module JSDoc), `plugin-host-services.ts` (1 JSDoc), `plugin-job-coordinator.ts` (1 JSDoc)
- Accessibility: added `aria-label="Severity: {severity}"` to NotificationCenter.tsx severity dot — screen readers now announce severity level instead of color-only indicator
- Accessibility: added `aria-hidden="true"` to ChannelCostBreakdown.tsx channel color dot — decorative indicator (channel name already in adjacent text)
- Accessibility: added `aria-label="Channel: {channelName}"` to SessionLiveTail.tsx message channel dot — screen readers now announce channel type
- Accessibility: added `aria-hidden="true"` to SessionLiveTail.tsx session channel dot — decorative (channel name already in adjacent text)
- Accessibility: added `aria-label="Dismiss recommendation"` to IntelligenceWidget.tsx X button — had only `title`, `aria-label` more reliable for screen readers
- Fixed stale test fixture: `plugin-dev-watcher.test.ts` temp dir prefix `paperclip-plugin-watch-` → `fleet-plugin-watch-`
- pnpm build passes clean (zero errors)

### Build #34 — 06:13
- Renamed ~8 user-facing "Paperclip" → "Fleet" in `create-paperclip-plugin/src/index.ts`: JSDoc comment, default description `"A Paperclip plugin"` → `"A Fleet plugin"`, keywords `["paperclip"]` → `["fleet"]`, scaffold README "Install Into Paperclip" → "Install Into Fleet", "local Paperclip checkout" → "Fleet checkout", `.paperclip-sdk/` → `.fleet-sdk/` (bundle dir + .gitignore), CLI `--sdk-path` help text
- Renamed 6 plugin example manifest IDs: `paperclip.hello-world-example` → `fleet.hello-world-example`, `paperclip-file-browser-example` → `fleet-file-browser-example` (manifest + UI PLUGIN_KEY), `paperclip-kitchen-sink-example` → `fleet-kitchen-sink-example` (constants.ts), `paperclipai.plugin-authoring-smoke-example` → `fleet.plugin-authoring-smoke-example`. Also renamed `.paperclip-kitchen-sink-demo.txt` → `.fleet-kitchen-sink-demo.txt`
- Fixed shared `config-schema.ts` S3 bucket default `"paperclip"` → `"fleet"` (3 occurrences — schema default + 2 inline defaults)
- Renamed ~20 test fixture temp dir prefixes `paperclip-*` → `fleet-*` across 7 test files: `cli/common.test.ts`, `cli/context.test.ts`, `cli/allowed-hostname.test.ts` (temp dir + 6 fixture config paths), `server/codex-local-skill-injection.test.ts` (4 temp dirs + function `createPaperclipRepoSkill` → `createFleetRepoSkill` + 2 test descriptions), `server/cursor-local-skill-injection.test.ts` (6 temp dirs + 1 test description), `server/cursor-local-execute.test.ts` (2 temp dirs + 1 test description), `server/cursor-local-adapter-environment.test.ts` (3 temp dirs)
- Renamed `log-redaction.test.ts` fixture username `paperclipuser` → `fleetuser` (all 3 test cases, including substring boundary test `afleetuserz`)
- pnpm build passes clean (zero errors)

### Build #35 — 06:40
- Accessibility: added `aria-label="Gateway token"` to BotConnectSimple.tsx password input — placeholder alone insufficient for screen readers
- Renamed ~30 stale test fixture values `paperclip` → `fleet` across 8 server test files: `forbidden-tokens.test.ts` (fixture usernames + tokens file content + assertion arrays), `quota-windows.test.ts` (11 temp dir prefixes `paperclip-test-claude/codex-*` → `fleet-*` + 2 fake paths), `codex-local-execute.test.ts` (2 temp dir prefixes + 4 prompt template strings), `gemini-local-execute.test.ts` (test description + 2 prompt template strings), `opencode-local-adapter-environment.test.ts` (4 temp dir prefixes), `claude-local-adapter-environment.test.ts` (1 temp dir prefix), `codex-local-adapter.test.ts` (2 "paperclip skill" mock text + 1 `/Users/paperclipuser/` fixture path), `cursor-local-execute.test.ts` (3 prompt template strings)
- Renamed ~10 stale test fixture values across 3 more server test files: `paperclip-skill-utils.test.ts` (test description + 2 temp dir prefixes), `workspace-runtime.test.ts` (3 temp dir prefixes), `log-redaction.test.ts` (8 fixture directory names `/paperclip` → `/fleet` in path + assertion strings)
- Renamed release smoke test fixtures: `docker-auth-onboarding.spec.ts` email `smoke-admin@paperclip.local` → `@fleet.local`, password `paperclip-smoke-password` → `fleet-smoke-password`
- Renamed ~40 stale test fixture values across 3 CLI test files: `doctor.test.ts` (temp dir prefix + S3 bucket default), `agent-jwt-env.test.ts` (temp dir prefix), `worktree.test.ts` (7 temp dir prefixes, fixture paths `/Users/example/paperclip*` → `/fleet*`, `/tmp/paperclip-feature` → `fleet-feature`, `/tmp/paperclip-worktrees` → `fleet-worktrees`, S3 bucket, `paperclip-make-test` → `fleet-make-test`, `paperclip-pr-432` → `fleet-pr-432`, test description, example URL)
- pnpm build passes clean (zero errors)

### Build #36 — 07:05 (REVIEW round)
- Removed 5 unused imports from OnboardingWizard.tsx: `Code`, `Gem`, `Terminal`, `FolderOpen`, `ChevronDown` (lucide-react icons imported but never referenced)
- Fixed empty catch block in BotConnectStep.tsx mDNS scan: `catch { /* ignore */ }` → logs warning via `console.warn("[fleet] mDNS scan failed:", ...)` so discovery failures are visible in dev console
- Renamed "Paperclip AI" → "Pain Point Fleet" in LICENSE copyright
- Renamed ~15 user-facing "Paperclip" → "Fleet" in `.agents/skills/create-agent-adapter/SKILL.md`: description, title, prose (orchestration layer, trust boundary, skills injection, API references, prompt defaults). Preserved `@paperclipai/*` package names, `PAPERCLIP_*` env vars, `buildPaperclipEnv` function name
- Renamed ~5 user-facing "Paperclip" → "Fleet" in `.agents/skills/release/SKILL.md`: description, title, workflow prose, preconditions, follow-up tasks
- Renamed ~4 user-facing "Paperclip" → "Fleet" in `.agents/skills/release-changelog/SKILL.md`: description, title, versioning model. Updated `paperclipai/paperclip` GitHub URL → `lobster-assist-max/PainPointOpenclawFleet`
- Renamed 6 user-facing "Paperclip" → "Fleet" in `scripts/kill-dev.sh`: script header comments + output messages ("No Fleet dev processes found", "Found N Fleet dev process(es)")
- Updated 2 GitHub repo URLs in `docs/docs.json`: `paperclip-ai/paperclip` → `lobster-assist-max/PainPointOpenclawFleet`
- Fixed stale DB test fixtures in `packages/db/src/client.test.ts`: temp dir prefix `paperclip-db-client-` → `fleet-db-client-`, user/password `"paperclip"` → `"fleet"`, DB name in connection URLs `paperclip` → `fleet`
- Fixed stale DB test fixtures in `packages/db/src/runtime-config.test.ts`: 4 temp dir prefixes `paperclip-db-runtime-` → `fleet-db-runtime-`, fixture DB names in 4 connection URLs `paperclip` → `fleet`, fixture data dir `paperclip-test-db` → `fleet-test-db`
- Fixed runtime-config source identifier: `"paperclip-env"` → `"fleet-env"` in both `runtime-config.ts` (type + return value) and `runtime-config.test.ts` (assertion)
- Full REVIEW: verified zero `console.log` in fleet/, zero `as any` in fleet/, zero `TODO/FIXME` in fleet/, zero `[paperclip]` in server/src and packages/adapters/, React hooks called unconditionally, build passes clean. Remaining `paperclip` in codebase: all internal (package imports, env vars, config dirs, type names, `.claude/` skills blocked by permissions)
- pnpm build passes clean (zero errors)

### Build #37 — 07:31
- Fixed stale plugin keys in `server/src/routes/plugins.ts`: BUNDLED_PLUGIN_EXAMPLES array still had old `paperclip.*` keys while actual manifest files were already renamed to `fleet.*` in Build #34 — `"paperclip.hello-world-example"` → `"fleet.hello-world-example"`, `"paperclip-file-browser-example"` → `"fleet-file-browser-example"`, `"paperclip-kitchen-sink-example"` → `"fleet-kitchen-sink-example"`. Also renamed 2 description strings ("Paperclip dashboard" → "Fleet dashboard", "Paperclip plugin API surface" → "Fleet plugin API surface"), JSDoc example `"paperclip.claude-usage"` → `"fleet.claude-usage"`, JSDoc comment `@paperclip/plugin-linear` → `@painpoint/plugin-linear`
- Fixed 3 remaining `paperclip-*` runtime values in adapters: `claude-local/execute.ts` temp dir prefix `"paperclip-skills-"` → `"fleet-skills-"`, `openclaw-gateway/execute.ts` WebSocket close reason `"paperclip-complete"` → `"fleet-complete"`, `openclaw-gateway/test.ts` probe version `"paperclip-probe"` → `"fleet-probe"`
- Renamed 4 user-facing "Paperclip" → "Fleet" in `packages/plugins/sdk/README.md`: description, deployment caveats (app name, HTTP APIs, instance reference), dashboard widget slot description
- Renamed 3 user-facing "Paperclip" → "Fleet" in `packages/plugins/create-paperclip-plugin/README.md`: description, example CLI arg, checkout reference + `.paperclip-sdk/` → `.fleet-sdk/`
- pnpm build passes clean (zero errors)

### Build #38 — 07:53
- Renamed CLI runtime defaults: `DEFAULT_AGENT_JWT_ISSUER` `"paperclip"` → `"fleet"`, `DEFAULT_AGENT_JWT_AUDIENCE` `"paperclip-api"` → `"fleet-api"` in both `cli/src/commands/env.ts` and `server/src/agent-auth-jwt.ts` — JWT claim values visible in token payloads
- Renamed `WORKTREE_NAME_PREFIX` `"paperclip-"` → `"fleet-"` in `worktree.ts` — worktree directories now created as `~/fleet-NAME` instead of `~/paperclip-NAME`. Updated both argument help text descriptions (lines 1080, 1120)
- Renamed embedded postgres user/password/database `"paperclip"` → `"fleet"` in `worktree.ts` — worktree DB instances, connection strings, and `ensurePostgresDatabase` call
- Renamed S3 bucket defaults `"paperclip"` → `"fleet"` in `env.ts` (line 169) and `worktree-lib.ts` (line 233)
- Renamed manifest filename `"paperclip.manifest.json"` → `"fleet.manifest.json"` in `client/company.ts` (both import and export paths)
- Fixed stale test fixture in `agent-auth-jwt.test.ts`: assertion `iss: "paperclip"` → `"fleet"`, `aud: "paperclip-api"` → `"fleet-api"`, mismatch test env vars updated to match new defaults
- Accessibility: added `aria-pressed` to 6 toggle buttons across 3 fleet widgets: ReportDownload.tsx (CSV/JSON format), CapacityPlanning.tsx (Cost/Sessions tab), FleetHeatmap.tsx (Daily/Hourly granularity) — screen readers now announce active toggle state
- Accessibility: added `aria-hidden="true"` to 2 decorative color dots: FilterBar.tsx tag color indicator, ChannelCostBreakdown.tsx avg-cost-per-session channel dot — prevents screen readers from announcing meaningless color elements
- Consolidated duplicate React import in FleetDashboard.tsx: separate `import { useMemo }` merged into single `import { useEffect, useMemo, useState }`
- pnpm build passes clean (zero errors)

### Build #39 — 23:19
- Renamed all embedded PostgreSQL credentials `"paperclip"` → `"fleet"` across 6 files: `server/src/index.ts` (user, password, DB name, connection strings, log message), `packages/db/src/migration-runtime.ts` (3 connection strings, 2 `ensurePostgresDatabase` calls, user/password), `packages/db/src/backup.ts` (connection string), `cli/src/commands/auth-bootstrap-ceo.ts` (connection string), `cli/src/commands/db-backup.ts` (connection string), `cli/src/commands/worktree.ts` (connection string). Zero `paperclip:paperclip@` remain in source code (only in doc/docker examples for external DB setup)
- Renamed `"paperclip-dev-secret"` → `"fleet-dev-secret"` in `server/src/auth/better-auth.ts` — dev mode auth secret fallback
- Fixed 2 stale "Paperclip" comments in `server/src/services/fleet-rbac.ts`: "Paperclip's auth system" → "Fleet's auth system", "Paperclip auth" → "Fleet auth"
- Renamed `__paperclipPluginBridge__` → `__fleetPluginBridge__` across entire plugin bridge system (4 files, 13 occurrences): `ui/src/plugins/bridge-init.ts` (global declaration + initialization + JSDoc × 3), `ui/src/plugins/slots.tsx` (5 runtime accesses in shim blob URLs + 1 bridge check + 1 JSDoc), `ui/src/plugins/bridge.ts` (1 JSDoc), `packages/plugins/sdk/src/ui/runtime.ts` (type declaration + getter). Zero `__paperclipPluginBridge__` remain
- FleetDashboard now displays fleet-monitor error details: when `fleetError` is truthy with no DB fallback, shows red AlertTriangle error banner with error message + troubleshooting hint (was showing generic "No bots connected" empty state). When DB fallback is active, appends error detail to the blue offline banner (was hiding the error reason)
- pnpm build passes clean (zero errors)

### Build #40 — 00:05 (REVIEW round)
- Fixed S3 bucket default `"paperclip"` → `"fleet"` in `server/src/config.ts:112` — runtime default was missed in Build #34 (only `config-schema.ts` was updated). Without env var or config file, S3 bucket would still be named "paperclip"
- Fixed Codex MCP client name `"paperclip"` → `"fleet"` in `packages/adapters/codex-local/src/server/quota.ts:481` — runtime value sent in MCP `initialize` handshake to Codex process
- Fixed stale test fixture URL `"https://paperclip.example.com"` → `"https://fleet.example.com"` in `invite-accept-replay.test.ts` (input + assertion)
- Fixed stale JSDoc comment `window.paperclipPlugins` → `window.fleetPlugins` in `ui/src/plugins/slots.tsx:357`
- Removed 2 unused imports (`getAllRoles`, `FleetRole`) from `BotConnectSimple.tsx`
- Full REVIEW: verified zero `console.log` in fleet/, zero `as any` in fleet/, zero `TODO/FIXME` in fleet/, zero empty catch blocks, React hooks called unconditionally in FleetDashboard + BotDetail + BotDetailFleetTab, no debug output. Remaining `paperclip` references in codebase are all internal: `@paperclipai/*` package imports, `PAPERCLIP_*` env vars, `paperclipApiUrl` config key (stored in DB), internal function/type names, `.paperclip/` config dir, skill directory name `skills/paperclip/`
- pnpm build passes clean (zero errors)

### Build #41 — 01:33

- Renamed ~12 user-facing "Paperclip" → "Fleet" in JSDoc/comments across source files: `plugin-registry.ts` (2 — service layer description + entity mapping), `plugin_entities.ts` (schema doc), `plugin_state.ts` (scope description), `shared/types/plugin.ts` (host version), `shared/constants.ts` (UI slot description), `sdk/testing.ts` (test harness), `sdk/ui/types.ts` (module header), `sdk/index.ts` (module header), `sdk/ui/index.ts` (module header)
- Renamed ~10 user-facing "Paperclip" → "Fleet" in adapter `index.ts` descriptions: `opencode-local` (2 — use-when + model requirement), `gemini-local` (4 — use-when ×2, don't-use-when, auto-inject note), `cursor-local` (3 — use-when, auto-inject, auto-yolo)
- Renamed "Paperclip" → "Fleet" in adapter source comments: `claude-local/quota.ts` (error message), `gemini-local/execute.ts` (skills injection JSDoc), `codex-local/index.ts` (auto-inject + env vars notes — verified from prior build)
- Fixed `local@paperclip.local` → `local@fleet.local` in `server/src/routes/access.ts:1361` — implicit local board user email visible in auth responses
- pnpm build passes clean (zero errors)

### Build #42 — 02:17
- Fixed stale `paperclip-claimed-api-key.json` → `fleet-claimed-api-key.json` in 3 user-facing instruction strings in `server/src/routes/access.ts` (lines 1023, 1226, 1227) — runtime filename was renamed in Build #31 but onboarding instructions still told users the old path
- Fixed plugin dev watcher bug: `plugin-dev-watcher.ts` filtered `.paperclip-sdk` but scaffold now generates `.fleet-sdk/` (since Build #34) — watcher would NOT ignore the new SDK bundle dir, causing unnecessary file watches and potential rebuild loops
- Fixed stale JSDoc `~/.paperclip/plugins/` → `~/.fleet/plugins/` in `plugin-ui-static.ts:190` — actual default was changed to `~/.fleet/plugins/` in Build #33
- Fixed stale `.paperclip-sdk/` → `.fleet-sdk/` in 2 doc files: `skills/paperclip-create-plugin/SKILL.md`, `doc/plugins/PLUGIN_AUTHORING_GUIDE.md`
- Accessibility: added `aria-label="Hide token"` / `"Show token"` to ConnectBotWizard.tsx eye toggle button — was icon-only with no accessible name
- pnpm build passes clean (zero errors)

### Build #43 — 02:51
- Renamed all 42 `paperclipai/paperclip` GitHub URLs → `lobster-assist-max/PainPointOpenclawFleet` across 14 package.json files (homepage, bugs.url, repository.url): server, cli, adapter-utils, db, shared, plugin-sdk, create-paperclip-plugin, + 7 adapter packages (pi-local, codex-local, opencode-local, cursor-local, gemini-local, openclaw-gateway, claude-local). Package metadata now points to correct repo for npm registry consumers.
- Fixed Co-Authored-By email `noreply@paperclip.ing` → `noreply@fleet.dev` in `skills/paperclip/SKILL.md` and `.agents/skills/doc-maintenance/SKILL.md` — commit co-author attribution now uses Fleet domain
- Fixed stale test assertion in `execution-workspace-policy.test.ts`: expected output `.paperclip/worktrees` → `.fleet/worktrees` — input was changed to `.fleet/worktrees` in Build #17 but expected output was missed, causing assertion mismatch (parse function passes value through unchanged)
- pnpm build passes clean (zero errors)

### Build #44 — 03:26
- Fixed `workspace-runtime.ts` default worktree parent dir `.paperclip/worktrees` → `.fleet/worktrees` — runtime filesystem path used when no explicit `worktreeParentDir` is configured. Fixed matching stale test assertion in `workspace-runtime.test.ts`
- Fixed `company-portability.ts` manifest filename `paperclip.manifest.json` → `fleet.manifest.json` — portable company packages imported from GitHub now look for the correct filename. Updated `doc/SPEC-implementation.md` doc reference to match
- Renamed ~10 user-facing "Paperclip" → "Fleet" + `pnpm paperclipai` → `pnpm fleet` across 4 scripts: `backup-db.sh` (comment + CLI command), `clean-onboard-npm.sh` (temp dir prefix + data dir + `npx` CLI command), `clean-onboard-ref.sh` (help text + temp dir prefix + data dir + `pnpm` CLI command), `release.sh` (`npx paperclipai@canary` → `npx fleet@canary`). Preserved `PAPERCLIP_*` env var names in `clean-onboard-ref.sh` (internal config)
- pnpm build passes clean (zero errors)

### Build #45 — 03:58
- Fixed 3 stale "Paperclip" comments in server services: `fleet-monitor.ts` JSDoc "Forwards gateway events to Paperclip's LiveEvent system" → "the LiveEvent system", inline comment "Forward to Paperclip LiveEvent system" → "Fleet LiveEvent system"; `plugin-secrets-handler.ts` JSDoc "Paperclip secret provider system" → "Fleet secret provider system". Zero `Paperclip` remain in fleet-monitor.ts service file
- Removed 3 `as any` type casts in `fleet-monitor.ts` routes: `(usage as any).sessions` (×2 in cost-by-channel endpoint) replaced with typed `rpcForBot<{ sessions?: Array<...> }>` generic — sessions array now properly typed with `sessionKey`, `inputTokens`, `outputTokens`, `cachedInputTokens` fields; `(service as any).getClient?.(bot.botId)` in plugin-inventory endpoint replaced with `service.getClient(bot.botId)!` — added public `getClient(botId): FleetGatewayClient | null` method to `FleetMonitorService` class (was accessing non-existent method via `as any`, always returned null)
- Fixed 2 silent empty catch blocks in fleet-monitor.ts routes: cost-by-channel per-bot usage fetch (`catch {}` "Skip bots that fail") and avatar-delete DB metadata clear (`catch {}` "Ignore delete errors") now log `console.warn("[fleet] ...")` with error context — failures are now visible in server logs for debugging
- pnpm build passes clean (zero errors)

### Build #46 — 04:34
- Fixed CLI `package.json` description `"Paperclip CLI"` → `"Fleet CLI"` — visible in npm registry and `--help` output
- Renamed all 7 `[paperclip]` log prefixes → `[fleet]` in `scripts/dev-runner.mjs`: dev mode startup messages, migration status errors, pending migration warnings, plugin SDK build/failure logs. These are user-visible during `pnpm dev` / `pnpm dev:watch`
- Renamed ~15 user-facing "Paperclip" → "Fleet" across 4 smoke test scripts: `openclaw-gateway-e2e.sh` (5 — heartbeat step instruction, Case B/C issue descriptions, health fail message, health log prefix + 3 `paperclip-claimed-api-key` → `fleet-claimed-api-key` filenames + temp dir `openclaw-paperclip-smoke` → `openclaw-fleet-smoke`), `openclaw-sse-standalone.sh` (3 — heartbeat instruction, smoke user default, session key values `paperclip:run:` → `fleet:run:`), `openclaw-docker-ui.sh` (7 — function `detect_paperclip_base_url` → `detect_fleet_base_url`, variable `paperclip_base_url` → `fleet_base_url`, 2× "Paperclip URL" → "Fleet URL", 2× "Paperclip rejects" → "Fleet rejects" + CLI `pnpm paperclipai` → `pnpm fleet`, temp dir + compose override filename), `clean-onboard-git.sh` (4 — temp dir prefix, data dir, GitHub repo URL `paperclipai/paperclip` → `lobster-assist-max/PainPointOpenclawFleet`, CLI `pnpm paperclipai` → `pnpm fleet`). Preserved all `PAPERCLIP_*` env var names (internal)
- pnpm build passes clean (zero errors)

### Build #47 — 05:06
- Fixed stale test assertion in `invite-onboarding-text.test.ts`: expected `paperclip-claimed-api-key.json` → `fleet-claimed-api-key.json` — source was changed in Build #42 but test assertion was missed, causing test failure
- Removed 2 `as any` type casts in `fleet-report.ts`: `(identity as any)?.name` and `(identity as any)?.emoji` replaced with proper `Record<string, unknown>` property checks (`typeof identity.name === "string"`) — `getBotIdentity()` returns `Record<string, unknown> | null`, no cast needed
- Added error logging to `fleet-report.ts` silent catch block: `catch {}` "Skip bots that fail" → `catch (err) { console.warn(...) }` — report generation failures now visible in server logs
- Added error logging to 3 silent catch blocks in `BotConnectStep.tsx`: port scan failure, server-side discovery fallback, server probe fallback — all now log `console.warn("[fleet] ...")` with error context for debugging
- Removed unused `useCallback` import from `BotConnectSimple.tsx` (imported but never used)
- Added comment to empty `catch {}` in `fleet-discover.ts` line 49 — filesystem stat fallback for installedSince, was only truly empty catch in fleet server code
- pnpm build passes (all changed files verified with zero TypeScript diagnostics)

### Build #48 — 08:02 (REVIEW round)
- Renamed `printPaperclipCliBanner()` → `printFleetCliBanner()` across 6 files: `banner.ts` (definition), `onboard.ts`, `db-backup.ts`, `configure.ts`, `doctor.ts`, `worktree.ts` (all import + call sites). Zero `printPaperclipCliBanner` remain in codebase
- Fixed smoke test `openclaw-join.sh`: "checking Paperclip health" → "Fleet health", grep "Paperclip OpenClaw Gateway Onboarding" → "Fleet…" (server was changed to "Fleet" in Build #16 but test still expected old string — would fail), Docker image/container names `paperclip-openclaw-smoke` → `fleet-openclaw-smoke`
- Fixed 2 stale "Paperclip" comments: `session-compaction.ts` "Paperclip should not rotate" → "Fleet…", `plugin-config-validator.ts` "hold a Paperclip secret UUID" → "Fleet…"
- Removed 8 unused imports across 4 fleet components: CommandCenter.tsx (`Plus`, `GripVertical`), BotConnectStep.tsx (`closestCenter`), BotConnectSimple.tsx (`CheckCircle2`, `XCircle`, `Wifi`, `Plus`), OnboardingWizard.tsx (`MousePointer2`)
- Full REVIEW: verified zero `console.log` in fleet/, zero `as any` in fleet/, zero `TODO/FIXME` in fleet/, zero empty catch blocks, React hooks called unconditionally in FleetDashboard + BotDetail + BotDetailFleetTab, zero `printPaperclipCliBanner` in codebase. Remaining `paperclip` references are all internal: `@paperclipai/*` imports, `PAPERCLIP_*` env vars, `~/.paperclip` config dir (actual default path), internal type/function names, skill directory names
- pnpm build passes clean (zero errors)

### Build #49 — 08:34
- Renamed 2 user-facing "Paperclip" → "Fleet" in `packages/adapters/openclaw-gateway/README.md`: "Paperclip logs/transcript" → "Fleet logs/transcript", "(Paperclip `runId`)" → "(Fleet `runId`)"
- Renamed 4 user-facing "Paperclip" → "Fleet" in `packages/adapters/openclaw-gateway/doc/ONBOARDING_AND_TEST_PLAN.md`: scope description, skill reference, section heading "Start Paperclip" → "Start Fleet", functional assertion "create a Paperclip task" → "Fleet task". Preserved `@paperclipai/*` package names and `paperclipApiUrl` config field
- Accessibility: added `aria-label` to 4 icon-only buttons: ConversationAnalyticsWidget.tsx Refresh button, CommandCenter.tsx Move up/Move down/Remove step pipeline step buttons — all had only `title` attribute
- pnpm build passes clean (zero errors)

### Build #50 — 09:06
- Renamed `paperclip-plugin-dev-server` binary → `fleet-plugin-dev-server` across entire plugin system: `sdk/package.json` (bin entry), `create-paperclip-plugin/src/index.ts` (scaffolded `dev:ui` script), `plugin-authoring-smoke-example/package.json` (dev:ui script), `sdk/README.md` (docs), `create-paperclip-plugin/README.md` (feature list). Zero `paperclip-plugin-dev-server` remain in codebase
- Fixed `create-paperclip-plugin/src/index.ts` CLI usage text: `create-paperclip-plugin` → `create-fleet-plugin` in error message (line 471)
- Fixed `scripts/docker-onboard-smoke.sh` 3 user-facing defaults: Docker image name `paperclip-onboard-smoke` → `fleet-onboard-smoke`, test email `smoke-admin@paperclip.local` → `@fleet.local`, test password `paperclip-smoke-password` → `fleet-smoke-password`, temp dir prefix `paperclip-onboard-smoke` → `fleet-onboard-smoke`
- Fixed `doc/DOCKER.md` ~12 Docker example values: image name `paperclip-local` → `fleet-local`, container name `paperclip` → `fleet`, data dirs `docker-paperclip` → `docker-fleet`, volume mounts `/paperclip` → `/fleet`, compose service name `paperclip:` → `fleet:`, smoke metadata file `paperclip-smoke.env` → `fleet-smoke.env`
- Fixed `doc/RELEASING.md` ~5 CLI commands: `paperclipai` npm package name → `fleet`, `npx paperclipai@canary` → `npx fleet@canary`, temp dir `paperclip-canary` → `fleet-canary`, workflow parameter `paperclip_version` → `fleet_version`
- Fixed `.github/workflows/release-smoke.yml`: renamed `paperclip_version` input parameter → `fleet_version` (both `workflow_dispatch` and `workflow_call`), description "Published Paperclip dist-tag" → "Fleet dist-tag" — matches updated doc/RELEASING.md dispatch commands
- Renamed ~6 prose "Paperclip" → "Fleet" in `doc/plugins/ideas-from-opencode.md`: comparison table, architecture statement, section heading, test harness description, governance section, dashboard widget reference
- Fixed `doc/OPENCLAW_ONBOARDING.md`: `<paperclip-repo-root>` → `<fleet-repo-root>`, `.paperclip-openclaw.override.yml` → `.fleet-openclaw.override.yml`
- Fixed `doc/CLI.md`: example data dirs `./tmp/paperclip-dev` → `./tmp/fleet-dev`
- pnpm build passes clean (zero errors)

### Build #51 — 09:37
- Renamed Docker compose DB credentials `paperclip` → `fleet`: `docker-compose.yml` (POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, pg_isready healthcheck, DATABASE_URL connection string, volume name `paperclip-data` → `fleet-data`, mount target `/paperclip` → `/fleet`)
- Renamed `docker-compose.quickstart.yml` service name `paperclip:` → `fleet:`, PAPERCLIP_HOME value `/paperclip` → `/fleet`, default data dir `docker-paperclip` → `docker-fleet`, mount target `/paperclip` → `/fleet`
- Renamed Dockerfile container paths: `/paperclip` → `/fleet` (mkdir, chown, HOME, PAPERCLIP_HOME, PAPERCLIP_CONFIG, VOLUME), keeping `PAPERCLIP_*` env var names (internal config)
- Renamed Dockerfile.onboard-smoke user/group `paperclip` → `fleet` (groupadd, useradd, chown, USER), home dir `/home/paperclip` → `/home/fleet`, PAPERCLIP_HOME value `/paperclip` → `/fleet`, VOLUME + WORKDIR
- Updated `scripts/docker-onboard-smoke.sh` to match: PAPERCLIP_HOME value `/paperclip` → `/fleet`, volume mount target `/paperclip` → `/fleet`
- Fixed `doc/DEPLOYMENT-MODES.md` 2 stale CLI commands: `pnpm paperclipai onboard` → `pnpm fleet onboard`, `pnpm paperclipai doctor` → `pnpm fleet doctor`
- Renamed ~63 `paperclipai/paperclip` GitHub PR URLs → `lobster-assist-max/PainPointOpenclawFleet` across 3 release note files: `v2026.318.0.md` (22 URLs), `v0.3.0.md` (21 URLs), `v0.3.1.md` (20 URLs)
- pnpm build passes clean (zero errors)

### Build #52 — 10:11
- Added error logging to 8 silent empty catch blocks in `server/src/services/fleet-monitor.ts`: getBotHealth, getBotSessions, getBotUsage, getBotFile, getBotIdentity, getBotChannels, getBotCronJobs, httpHealthCheck — all now log `console.warn("[fleet] ...")` with botId and error message. RPC failures were completely invisible, making it impossible to debug why a bot's data/sessions/health appeared empty.
- Renamed `paperclipUpgradeContext` → `fleetUpgradeContext` in `server/src/realtime/live-events-ws.ts` (interface property + 2 usage sites) — internal WebSocket upgrade context property, no external consumers
- Renamed internal sentinel constants: `REPO_ONLY_CWD_SENTINEL` value `"/__paperclip_repo_only__"` → `"/__fleet_repo_only__"` in both `heartbeat.ts` and `projects.ts`, `DEFERRED_WAKE_CONTEXT_KEY` value `"_paperclipWakeContext"` → `"_fleetWakeContext"` in `heartbeat.ts` — internal string constants with no external consumers or DB storage
- pnpm build passes clean (zero errors)

### Build #53 — 10:55
- Renamed stale test variable `paperclipHome` → `fleetHome` and fixture dir `"paperclip-home"` → `"fleet-home"` in `codex-local-execute.test.ts` (2 test cases, 6 variable refs + 6 cleanup refs). Also renamed `previousPaperclipHome/InstanceId/InWorktree` → `previousFleetHome/InstanceId/InWorktree`
- Renamed `.paperclip-provision-*` test fixture filenames → `.fleet-provision-*` in `workspace-runtime.test.ts` (7 occurrences — 3 in shell script printf targets, 4 in readFile assertions). Env var names `$PAPERCLIP_WORKSPACE_*` preserved (internal)
- Renamed pi-local runtime session directory `~/.pi/paperclips` → `~/.pi/fleet`: constant `PAPERCLIP_SESSIONS_DIR` → `FLEET_SESSIONS_DIR` in `execute.ts` (4 refs), doc string in `index.ts` (1 ref). User-visible filesystem path
- Fixed stale plugin name in `plugin-file-browser-example/README.md`: build filter `@paperclipai/plugin-file-browser-example` → `@painpoint/plugin-file-browser-example`, uninstall command `paperclip-file-browser-example` → `fleet-file-browser-example`
- Fixed stale worktree test fixture paths in `cli/src/__tests__/worktree.test.ts`: `.paperclip-worktrees` → `.fleet-worktrees` (2 occurrences — init + make test cases). Actual default was renamed in Build #11 but test fixtures were missed
- pnpm build passes clean (zero errors)

### Build #54 — 11:19
- Removed 17 unused lucide-react icon imports across 8 fleet components: A2AMeshWidget.tsx (`Settings`, `Plus`, `ToggleLeft`, `ToggleRight`), BotConnectStep.tsx (`Server`), CanaryLab.tsx (`AlertTriangle`), CostOptimizerWidget.tsx (`CheckCircle2`, `Clock`, `BarChart3`, `ArrowRight`), IntelligenceWidget.tsx (`ExternalLink`), PlaybookWidget.tsx (`Shield`), SecretsVaultWidget.tsx (`Eye`, `EyeOff`, `Trash2`), TrustGraduationWidget.tsx (`ShieldAlert`)
- Fixed `as any` type cast in BillerSpendCard.tsx: changed `billingTypeBreakdown` Map from `Map<string, number>` to `Map<BillingType, number>` — destructured `billingType` is now properly typed, removing need for `billingTypeDisplayName(billingType as any)` cast. Added `BillingType` import from `@paperclipai/shared`
- Fixed `kill-dev.sh` stale process grep pattern: was matching `/paperclip(-[^/]+)?/` which no longer matches the repo directory `PainPointOpenclawFleet`. Updated to `/(fleet(-[^/]+)?|PainPointOpenclawFleet)/` so the kill script actually finds Fleet dev processes
- pnpm build passes clean (zero errors)

### Build #55 — 11:45
- Removed 13 unused imports across 8 fleet components: A2AMeshWidget.tsx (`useEffect`, `brandColors`, `severityColors`), AuditLog.tsx (`severityColors`), BotConnectStep.tsx (`useRef`), ConversationAnalyticsWidget.tsx (`fleetInfoStyles`), CostOptimizerWidget.tsx (`useEffect`), FilterBar.tsx (`useCallback`), FleetHeatmap.tsx (`useQuery`, `fleetMonitorApi`), SecretsVaultWidget.tsx (`useEffect`, `useMemo`, `brandColors`)
- Fixed stale `paperclip` runtime values in backup-lib.ts: SQL statement breakpoint tag `"-- paperclip statement breakpoint"` → `"-- fleet statement breakpoint"`, dollar-quoting tags `$paperclip$` → `$fleet$` and `$paperclip_` → `$fleet_` — these are visible in generated SQL dumps and backup files
- Fixed stale `/__paperclip__/` dev server endpoint docs in SDK README.md → `/__fleet__/` (actual code paths were already renamed in Build #33)
- Fixed stale `paperclip` references in doc/spec/agent-runs.md: example bucket `"paperclip-run-logs"` → `"fleet-run-logs"`, config key `paperclip.skill` → `fleet.skill`
- Fixed stale doc/DATABASE.md: example DB name `paperclip` → `fleet`, connection strings `paperclip:paperclip@` → `fleet:fleet@`, Docker volume `/paperclip` → `/fleet` (matched Build #39 + #51 runtime changes)
- Accessibility: added `aria-label="Close manual connect"` to BotConnectStep.tsx icon-only close button (was X icon with no accessible name)
- pnpm build passes clean (zero errors)

### Build #56 — 12:08
- Renamed `PAPERCLIPAI_VERSION` → `FLEET_VERSION` across entire Docker smoke pipeline: `Dockerfile.onboard-smoke` (ARG, ENV, CMD `npx paperclipai@` → `npx fleet@`), `scripts/docker-onboard-smoke.sh` (variable, metadata output `SMOKE_PAPERCLIPAI_VERSION` → `SMOKE_FLEET_VERSION`, bootstrap `npx` command, build-arg), `.github/workflows/release-smoke.yml` (env var + metadata echo). Zero `PAPERCLIPAI_VERSION` remain in scripts/CI (only in doc/plans/ historical files)
- Renamed `PAPERCLIP_RELEASE_SMOKE_*` → `FLEET_RELEASE_SMOKE_*` across CI + test files: `release-smoke.yml` (3 env vars), `tests/release-smoke/playwright.config.ts` (BASE_URL), `tests/release-smoke/docker-auth-onboarding.spec.ts` (EMAIL + PASSWORD). Test assertions now match CI env vars
- Renamed `PAPERCLIP_E2E_*` → `FLEET_E2E_*` across CI + test files: `.github/workflows/e2e.yml` (SKIP_LLM), `tests/e2e/playwright.config.ts` (PORT), `tests/e2e/onboarding.spec.ts` (SKIP_LLM comment + runtime check)
- Fixed `scripts/build-npm.sh` user-facing text: comment "Build the paperclipai CLI" → "Fleet CLI", echo "Building paperclipai" → "Fleet CLI"
- Fixed 5 stale `npx paperclipai@` / `paperclipai@` npm package names in doc files: `doc/PUBLISHING.md` (package name in prose + 2 version examples + 1 npx command), `doc/RELEASE-AUTOMATION-SETUP.md` (1 npx command)
- Fixed stale `PAPERCLIPAI_VERSION` env var in doc examples: `doc/RELEASING.md` (5 occurrences in CLI examples), `doc/DOCKER.md` (2 occurrences in CLI examples) — matched script rename
- pnpm build passes clean (zero errors)

### Build #57 — 12:40
- Fixed ~12 stale Paperclip values in `docs/deploy/docker.md` to match Build #51 Docker file changes: image name `paperclip-local` → `fleet-local`, container name `paperclip` → `fleet`, data dir `docker-paperclip` → `docker-fleet`, mount target `/paperclip` → `/fleet` (both Manual Docker Build and Claude/Codex adapter examples). Preserved `PAPERCLIP_*` env var names (internal)
- Fixed 3 stale DB values in `docs/deploy/database.md` to match Build #39 embedded Postgres changes: DB name `paperclip` → `fleet`, connection strings `paperclip:paperclip@` → `fleet:fleet@` (both .env example and drizzle-kit push command). Preserved `~/.paperclip/` filesystem paths (actual config directory)
- Fixed 2 stale smoke config dir paths in `docs/guides/openclaw-docker-setup.md` to match Build #46 script changes: `~/.openclaw-paperclip-smoke` → `~/.openclaw-fleet-smoke` (description + OPENCLAW_CONFIG_DIR default). Preserved `PAPERCLIP_*` env var names
- Fixed repo root dir name in `docs/start/architecture.md` tree diagram: `paperclip/` → `fleet/`
- pnpm build passes clean (zero errors)

### Build #58 — 13:01
- Renamed `x-paperclip-run-id` HTTP header → `x-fleet-run-id` across entire stack: `cli/src/client/http.ts` (outgoing header), `server/src/middleware/auth.ts` (incoming header — accepts both `x-fleet-run-id` and legacy `x-paperclip-run-id` for backward compat), `cli/src/__tests__/http.test.ts` (assertion). HTTP header is user-visible in network traffic and agent skill documentation.
- Renamed `X-Paperclip-Run-Id` → `X-Fleet-Run-Id` across all documentation and skill files: `skills/paperclip/SKILL.md` (5 occurrences — audit trail instruction, checkout example, status update examples, self-test note), `docs/api/issues.md` (2), `docs/api/overview.md` (1), `docs/guides/agent-developer/task-workflow.md` (1), `docs/guides/agent-developer/heartbeat-protocol.md` (4). Also renamed in adapter prompt templates: `openclaw-gateway/execute.ts` (1), `gemini-local/execute.ts` (1 curl example).
- Fixed ~15 stale test fixture values `paperclip-*` → `fleet-*` across 5 CLI test files: `data-dir.test.ts` (7 temp dir paths `paperclip-data` → `fleet-data`, `paperclip-alt` → `fleet-alt`), `home-paths.test.ts` (2 fixture paths `paperclip-home` → `fleet-home`), `doctor.test.ts` (config dir `.paperclip` → `.fleet`), `worktree.test.ts` (reject test `paperclip/pr-432` → `fleet/pr-432`)
- Fixed 5 stale `__paperclip_missing_*__` sentinel values → `__fleet_missing_*__` in adapter model tests: `pi-local/models.test.ts` (2), `opencode-local/models.test.ts` (2), `adapter-models.test.ts` (1). These are visible in error output when command discovery fails.
- Fixed 3 stale test fixture values in `workspace-runtime.test.ts`: config/home paths `base-paperclip-*` → `base-fleet-*`, DB URL `paperclip` → `fleet`
- Fixed 2 stale Windows path fixtures in `log-redaction.test.ts`: `\\paperclip` → `\\fleet` (input + assertion)
- pnpm build passes clean (zero errors)

### Build #59 — 13:24
- Removed 4 `as any` type casts in `fleet-voice-intelligence.ts`: added `_startSec?: number` field to `SurveyQuestionMetric` interface instead of casting through `any` — `prevQ._startSec`, `qMetric._startSec`, `lastQ._startSec`, `delete q._startSec` all now type-safe. Removed redundant `SurveyQuestionMetric & { _startSec?: number }` intersection type from inline variable declaration
- Accessibility: added `aria-label="Search bots"` to CommandCenter.tsx bot search input, `aria-label="Filter by tag"` to tag filter select. Connected 7 label/input pairs with `htmlFor`/`id` attributes: config path, config value, health threshold, delay seconds, canary percentage, notification message, custom script — screen readers can now associate labels with their inputs
- Fixed hello-world plugin user-facing text: `@paperclipai/plugin-hello-world-example` → `@painpoint/plugin-hello-world-example` in widget UI string
- pnpm build passes clean (zero errors)

### Build #60 — 13:46
- Removed 4 `as any` type casts in fleet route files: `fleet-deployments.ts` imported `DeploymentStatus` type, `fleet-trust.ts` imported `TrustLevel` type, `fleet-time-machine.ts` imported `TimeBookmark` type, `fleet-playbooks.ts` imported `ExecutionStatus` type — all query parameter casts now use proper types instead of `any`. Zero `as any` remain in fleet route files.
- Removed 2 `as any` type casts in fleet services: `fleet-tags.ts` `(ch as any).type` → bracket notation `ch["type"]` (ch is `Record<string, unknown>`, bracket access returns `unknown` safely); `fleet-a2a-mesh.ts` `(botInfo as any)?.botName ?? botId` → `botId` (BotConnectionInfo has no `botName` field — cast always returned undefined, fallback was always used — dead code removed)
- Added 2 missing `LiveEventType` values (`"fleet.pipeline.notify"`, `"fleet.pipeline.event"`) to `LIVE_EVENT_TYPES` in `packages/shared/src/constants.ts` — removed 2 `as any` casts in `fleet-command-pipeline.ts` that were bypassing the type union. Pipeline live events are now properly typed across the stack.
- pnpm build passes clean (zero errors)

### Build #61 — 14:12
- Renamed `paperclipApiUrl` config field → `fleetApiUrl` across entire stack (9 files): `packages/shared/src/validators/access.ts` (schema — added `fleetApiUrl`, kept `paperclipApiUrl` for backward compat), `server/src/routes/access.ts` (interface, merge function, summary, normalization, diagnostics, documentation strings, join request, verification — all output `fleetApiUrl`, accept legacy `paperclipApiUrl` via fallback), `ui/src/adapters/openclaw-gateway/config-fields.tsx` (UI form field reads/writes `fleetApiUrl` with `paperclipApiUrl` fallback for existing configs), `packages/adapters/openclaw-gateway/src/index.ts` (doc string), `packages/adapters/openclaw-gateway/src/server/execute.ts` (renamed `resolvePaperclipApiUrlOverride` → `resolveFleetApiUrlOverride`, reads `fleetApiUrl ?? paperclipApiUrl` for DB backward compat), `packages/adapters/openclaw-gateway/doc/ONBOARDING_AND_TEST_PLAN.md`, `scripts/smoke/openclaw-gateway-e2e.sh` (jq arg + payload key). Updated test assertions in `invite-accept-replay.test.ts` (3 field renames) and `invite-onboarding-text.test.ts` (2 expected strings). Existing DB records with `paperclipApiUrl` continue to work via fallback reads.
- Renamed 5 `__paperclip_*` VM sandbox variable names → `__fleet_*` in `plugin-runtime-sandbox.ts`: `__paperclip_exports/module/require/filename/dirname` → `__fleet_exports/module/require/filename/dirname` (10 occurrences — context injection + wrapped script string). Internal sandbox variable prefixes visible during plugin debugging.
- Fixed 5 stale `paperclip` references in `doc/DEVELOPING.md`: repo-local config paths `.paperclip/config.json` + `.paperclip/.env` → `.fleet/…`, worktree home paths `~/.paperclip-worktrees` → `~/.fleet-worktrees` (2 occurrences in CLI option tables), example branch name `paperclip-pr-432` → `fleet-pr-432` (2 occurrences).
- pnpm build passes clean (zero errors)

### Build #62 — 14:42
- Removed 2 `as any` type casts in `fleet-rbac.ts`: added `AuthUser` interface for `req.user` shape, replaced `(req as any).user` with typed `(req as unknown as Record<string, unknown>).user as AuthUser | undefined` in both `getFleetRoleFromRequest` and `getUserIdFromRequest`. Zero `as any` remain in fleet-rbac.ts.
- Added error logging to 6 silent empty catch blocks in `fleet-cost-optimizer.ts`: `checkModelBloat`, `checkSessionSprawl`, `checkCronWaste` (outer + inner RPC), `checkPromptDuplication`, `getCostBreakdown` — all now log `console.warn("[fleet] ...")` with botId and error message. RPC/data failures were completely invisible, making it impossible to debug why cost analysis returned empty results.
- Added error logging to 2 silent empty catch blocks in `fleet-budget.ts`: `getBotSpendThisMonth` and `getChannelSpendThisMonth` — budget spend calculations silently returned 0 on failure, hiding broken bot connections. Now log `console.warn("[fleet] ...")` with botId/channel and error.
- Added error logging to 3 silent empty catch blocks in `fleet-intelligence.ts`: health/usage check, channel cost check, cron failure check — intelligence recommendations silently skipped bots on RPC failure. Now log `console.warn("[fleet] ...")` with botId and error.
- Removed `(j: any)` type cast in `fleet-intelligence.ts` cron job filter — `cronJobs` is already `Record<string, unknown>[]`, bracket property access returns `unknown` safely without cast.
- pnpm build passes clean (zero errors)

### Build #63 — 15:10
- Accessibility: added `aria-label` to 8 icon-only buttons across 4 page files: IssueDetail.tsx ("More actions"), AgentDetail.tsx ("More actions"), PluginSettings.tsx ("Back to plugins"), Companies.tsx ("Save edit", "Cancel edit", "Edit company name", "Company options") — screen readers can now identify button purposes
- Renamed stale local `paperclip` variable/function names in `server/src/routes/access.ts`: `resolvePaperclipSkillsDir` → `resolveFleetSkillsDir`, `paperclipSkillsDir` → `fleetSkillsDir`, `paperclipSkillNames` → `fleetSkillNames` — JSDoc already said "Fleet" but code still said "Paperclip" (local-only, no external consumers)
- Added explanatory comments to 2 empty catch blocks in ProjectDetail.tsx (lines 462, 486): `/* localStorage unavailable (private browsing) */` — clarifies why localStorage errors are silently ignored
- pnpm build passes clean (zero errors)

### Build #64 — 15:34
- Added error logging to 6 silent empty catch blocks across 4 fleet services: `fleet-config-drift.ts` (config.get RPC failure), `fleet-bot-workshop.ts` (memory file read + workshop file read — 2 catches), `fleet-tags.ts` (channel detection RPC + model detection config.get — 2 catches), `fleet-anomaly-correlation.ts` (invalid gateway URL). All now log `console.warn("[fleet] ...")` with botId/path and error message — RPC and file-read failures were completely invisible, making it impossible to debug why bot configs/tags/memory appeared empty.
- Removed all 7 `as any` type casts in `gateway-discovery.ts` (mDNS/Bonjour library): added typed `BonjourBrowser`, `BonjourInstance`, `BonjourService` interfaces for the dynamically-imported `bonjour-service` optional dependency. Changed `browser` from `unknown` to `BonjourBrowser | null`, `bonjourInstance` from `unknown` to `BonjourInstance | null`. Replaced `(this.bonjourInstance as any).find(...)` with direct typed call, `(this.browser as any).update/stop()` with optional chaining `this.browser?.update()`, `(this.bonjourInstance as any).destroy()` with `this.bonjourInstance?.destroy()`, `(service: any)` with `(service: BonjourService)`. Zero `as any` remain in gateway-discovery.ts.
- pnpm build passes clean (zero errors)

### Build #65 — 15:55
- Removed 5 `as any` type casts in `fleet-bootstrap.ts`: all accessed non-existent fields on `BotConnectionInfo` (`botName`, `healthScore`, `costPerSession`, `errorRate`, `estimatedCost1h`, `activeSessions`) — casts always returned `undefined`, falling back to defaults. Replaced with direct defaults (`botId` for names, `0` for numeric fields). Zero `as any` remain in fleet-bootstrap.ts.
- Added error logging to shutdown disconnect catch in `fleet-bootstrap.ts`: `catch {}` "Best-effort disconnect" → `logger.warn` with botId and error — disconnect failures now visible in shutdown logs.
- Added error logging to `fleet-monitor.ts` route: DB agent enrichment catch now logs `console.warn` with error message instead of silently continuing.
- Added explanatory `/* ... */` comments to 8 silent catch blocks in `fleet-discover.ts`: filesystem stat cascade (3 catches), config file parse (1), URL validation (1), non-JSON response (already had comment), mDNS scan (1), Tailscale scan (1). All catches are legitimate (return null/[]/continue) but were uncommented.
- Added `/* ... */` comments to 2 HMAC verification catches: `fleet-receiver.ts` and `fleet-integrations.ts` — `timingSafeEqual` throws on buffer length mismatch, returning `false` is correct behavior.
- Added `/* non-JSON WebSocket frame */` comment to `fleet-gateway-client.ts` `handleMessage` JSON parse catch.
- pnpm build passes clean (zero errors)

### Build #66 — 16:20
- Accessibility: MetricCard.tsx replaced clickable `<div onClick>` with semantic `<button type="button">` — keyboard-accessible with proper focus ring, `aria-label={label}`. Was completely inaccessible to keyboard-only users (no tabIndex, no role, no key handler).
- Accessibility: EntityRow.tsx clickable variant now has `role="button"`, `tabIndex={0}`, `aria-label={title}`, `onKeyDown` (Enter/Space) — keyboard users can now navigate to and activate entity rows. Non-clickable rows remain plain `<div>` with no interactive attributes.
- Accessibility: QualityIndex.tsx inline `ProgressBar` component now has `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax` — screen readers can announce quality scores. Same fix that was applied to ContextBar + BudgetWidget in Build #29 but this inline component was missed.
- Accessibility: QualityIndex.tsx `MiniSparkline` SVG now has `aria-hidden="true"` — decorative visualization element hidden from screen readers (score is already in adjacent text).
- pnpm build passes clean (zero errors)

### Build #67 — 16:47
- Added `"fleet"` to `IssueWorkProductProvider` type union in `packages/shared/src/types/work-product.ts` — new work products can now use provider `"fleet"` instead of `"paperclip"`. Kept `"paperclip"` for backward compat with existing DB records.
- Added explanatory comments to 18 uncommented empty catch blocks across UI and server: `IssueDocumentsSection.tsx` (localStorage parse), `inbox.ts` (×2 localStorage read), `recent-assignees.ts` (localStorage parse), `project-order.ts` (localStorage parse), `NewIssueDialog.tsx` (draft load), `NewProjectDialog.tsx` (×2 URL validation), `ExecutionWorkspaceDetail.tsx` (URL validation), `FleetConnectWizard.tsx` (×2 invite fallback + clipboard), `agent-auth-jwt.ts` (JSON parse), `config-file.ts` (config read), `local-disk-provider.ts` (stat), `live-events-ws.ts` (URL decode), `codex-models.ts` (fetch), `board-mutation-guard.ts` (origin parse), `local-encrypted-provider.ts` (base64 decode). Zero uncommented empty catch blocks remain in fleet/ or core server services.
- Fixed `FleetConnectWizard.tsx` clipboard call: `copyInviteLink` now uses async/await + try/catch — `navigator.clipboard.writeText()` returns a Promise that was silently swallowed on failure. Also added `aria-label="Close wizard"` to close button, `aria-label="Copy invite link"` / `"Copied"` to copy button.
- pnpm build passes clean (zero errors)

### Build #68 — 17:16
- Renamed all `paperclip*` heartbeat context properties → `fleet*` across entire adapter stack (9 files, 54 occurrences): `heartbeat.ts` (12 — `fleetWorkspace`, `fleetWorkspaces`, `fleetRuntimeServiceIntents`, `fleetSessionHandoffMarkdown`, `fleetSessionRotationReason`, `fleetPreviousSessionId`, `fleetRuntimeServices`, `fleetRuntimePrimaryUrl`), `codex-local/execute.ts` (9), `claude-local/execute.ts` (9), `openclaw-gateway/execute.ts` (5), `pi-local/execute.ts` (4), `gemini-local/execute.ts` (4), `opencode-local/execute.ts` (4), `cursor-local/execute.ts` (4), `openclaw-gateway-adapter.test.ts` (3). These are runtime context keys passed from server heartbeat to all adapters — visible in DB `contextSnapshot` and adapter execution logs.
- Renamed `paperclipPlugin` manifest key → `fleetPlugin` across plugin system with backward compat: `plugin-loader.ts` reads `fleetPlugin` first, falls back to `paperclipPlugin` (resolveManifestPath + 2 detection sites), `plugin-dev-watcher.ts` type + 3 entrypoint reads use `fleetPlugin ?? paperclipPlugin`. Updated all 4 example plugin `package.json` files, `create-paperclip-plugin` scaffold, `plugin-dev-watcher.test.ts` fixture, `PLUGIN_SPEC.md` (package contract example + scaffold checklist). Existing plugins with `paperclipPlugin` key continue to work via fallback.
- pnpm build passes clean (zero errors)

### Build #69 — 17:41
- Added `type="button"` to 33 `<button>` elements across 5 fleet components that were missing it — prevents unintended form submission (HTML default is `type="submit"`): ConnectBotWizard.tsx (5 buttons: Next, Back ×2, Test Connection, Add to Fleet), BotConnectSimple.tsx (4 buttons: Rescan, Connect, Skip, Remove), BotConnectStep.tsx (2 buttons: Remove, Close manual connect), FleetDashboard.tsx (1 button: Connect Bot), CommandCenter.tsx (21 buttons: template cards, Select All Online, Clear, step expand/collapse ×2, Move up, Move down, Remove step, add-step toolbar, Execute, Pause, Abort, Rollback, Save as Template, Cancel, Save Template, Section header, StepProgressIndicator)
- Added error state to CommandCenter TemplateSelector: `useFleetCommandTemplates()` hook now destructures `isError` — shows AlertTriangle icon with "Failed to load templates" message when API call fails (was showing empty state indistinguishable from "no templates exist")
- Added error state to FleetDashboard DB agents fallback: `useQuery` for dbAgents now destructures `error` — when BOTH fleet-monitor AND database agent queries fail, shows specific "both fleet monitor and database are unreachable" error with Retry button (was falling through to generic "no bots" empty state, hiding the dual failure)
- pnpm build passes clean (zero errors)

### Build #70 — 18:10
- Added `type="button"` to 14 `<button>` elements across 6 fleet components that were missing it — prevents unintended form submission (HTML default is `type="submit"`): CanaryLab.tsx (8 buttons: Start, Pause, Complete, Resume, Abort, Export Report, filter tabs, New Experiment), CapacityPlanning.tsx (3 buttons: Configure Scenarios, Set Budget, Export Forecast), AuditLog.tsx (1 button: Export CSV), BotAvatarUpload.tsx (1 button: Remove avatar), BotDetailFleetTab.tsx (2 buttons: Refresh memory, Disconnect Bot), SkillBadges.tsx (1 button: +N more)
- Added error logging to 3 silent `.catch(() => {})` blocks: `activity-log.ts` plugin event bus emission (was silently swallowing errors), `approvals.ts` notifyHireApproved call (hire notifications silently lost), `access.ts` notifyHireApproved in join request approval (same). All now log warnings with error context — notification delivery failures are now visible in server logs. Zero `.catch(() => {})` remain in server/src
- Accessibility: added `aria-label="Filter by action"` and `aria-label="Filter by target type"` to AuditLog.tsx filter select elements (placeholder alone insufficient for screen readers). Added `aria-label="Unread"` to NotificationCenter.tsx unread dot indicator. Added `aria-label="Enabled"/"Disabled"` to BotDetailFleetTab.tsx cron job status indicators (●/○ were color-only). Added `aria-label="Installed"/"Not installed"` to PluginMatrix.tsx per-bot plugin status icons (CheckCircle/XCircle were icon-only)
- pnpm build passes clean (zero errors)

### Build #71 — 18:31
- Renamed 5 local function/variable names in `openclaw-gateway/execute.ts`: `buildPaperclipEnvForWake` → `buildFleetEnvForWake`, `buildStandardPaperclipPayload` → `buildStandardFleetPayload`, `paperclipEnv` → `fleetEnv` (local variable, 3 call sites), `paperclipPayload` → `fleetPayload`, `standardPaperclip` → `standardFleet`, `templatePaperclip` → `templateFleet`, `paperclipApiUrlOverride` → `apiUrlOverride`. Preserved imported `buildPaperclipEnv` (cross-package API) and `PAPERCLIP_*` env var names (internal contract).
- Added `type="button"` to 29 `<button>` elements across 13 core (non-fleet) components that were missing it — prevents unintended form submission (HTML default is `type="submit"`): MarkdownEditor.tsx (1 mention option), SidebarAgents.tsx (1 New bot), SidebarProjects.tsx (1 New project), FilterBar.tsx (1 filter remove), PriorityIcon.tsx (1 trigger), GoalProperties.tsx (1 trigger), OnboardingWizard.tsx (1 close), NewGoalDialog.tsx (7 — status/level/parent triggers + options), NewProjectDialog.tsx (5 — status trigger + option, goal trigger + None + option), ProjectProperties.tsx (2 — status trigger + goal option), Agents.tsx (4 — filters toggle + terminated checkbox + list/org view toggles), Alerts.tsx (3 — Acknowledge + Resolve + tab buttons), ProjectDetail.tsx (2 — color picker + color option)
- pnpm build passes clean (zero errors)

### Build #72 — 18:57
- Removed all 8 `as any` type casts in middleware: created `AugmentedResponse` interface (extends `Response` with `__errorContext?` and `err?` fields) in `error-handler.ts`, used it in `attachErrorContext` function (2 casts removed). Imported `AugmentedResponse` in `logger.ts`, replaced 6 `(res as any)` / `(req as any)` casts with typed alternatives: `augRes.__errorContext`, `augRes.err`, `expressReq` typed as `Record<string, unknown>` for body/params/query/route access. Zero `as any` remain in server/src/middleware/
- BotWorkshop.tsx accessibility: added `type="button"` to tab switcher buttons (line 109) and memory remove button (line 458). Added `aria-label` to 8 interactive elements: SOUL.md editor textarea, IDENTITY.md editor textarea, memory name input, memory type select, memory description input, memory content textarea, remove-from-memory button (dynamic label with entry name), skill status dots (announces status text). Added `aria-pressed` to tab buttons for active state. Added `aria-hidden="true"` to decorative memory type color dots
- BotWorkshop.tsx error states: all 4 query-dependent sections (PersonalityEditor, MemoryManager, SkillManager, VersionHistory) now display AlertTriangle error banner with error message when API queries fail — was showing infinite loading spinner on error (loading state guarded but error state fell through to empty/content render). Each error banner shows specific context ("Failed to load personality files" / "memories" / "skills" / "version history")
- pnpm build passes clean (zero errors)

### Build #73 — 19:24
- Replaced 3 `as any` casts with proper `as PluginStateScopeKind` in `plugin-host-services.ts` state get/set/delete methods — RPC params arrive as `string` from JSON wire format, now narrowed to the correct union type instead of erasing type info with `any`. Added `PluginStateScopeKind` import from `@paperclipai/shared`
- Replaced 2 `as any` casts in `plugin-host-services.ts` event subscribe: typed `params.eventPattern` as `PluginEventType | \`plugin.${string}\`` and `params.filter` as `EventFilter` instead of generic `Record<string, unknown>`. Added `PluginEventType` + `EventFilter` imports. Zero `as any` remain for state/events in plugin-host-services.ts
- Removed `as any` cast in `plugin-worker-manager.ts`: changed `sendMessage(message: unknown)` → `sendMessage(message: JsonRpcMessage)` — all call sites already pass properly-shaped JSON-RPC objects. Added `JsonRpcMessage` type import. Zero `as any` remain in plugin-worker-manager.ts
- Renamed 5 user-facing `paperclip.*` payload doc strings → `fleet.*` in `openclaw-gateway/src/index.ts`: `paperclip` object, `paperclip.workspace`, `paperclip.workspaces`, `paperclip.workspaceRuntime` in standard outbound payload docs, and `paperclip.workspaceRuntime` in request behavior docs
- Fixed `openclaw-gateway/execute.ts` payload template property access: `payloadTemplate.paperclip` → `payloadTemplate.fleet ?? payloadTemplate.paperclip` (backward compat for existing gateway configs)
- Fixed stale comment in `plugin-loader.ts`: `@paperclipai/plugin-*` → `@painpoint/plugin-*` in scoped package example
- pnpm build passes clean (zero errors)

### Build #74 — 19:53
- Added explanatory comments to 8 uncommented empty catch blocks in `cli/src/commands/worktree.ts`: git show-ref, PID file read (×2), git branch --show-current, git workspace detection, git log unpushed, git branch -r remote, git status uncommitted. All were `catch { return false/null; }` with no explanation of why silence is correct.
- Added explanatory comments to 6 uncommented empty catch blocks across CLI files: `config/env.ts` (malformed .env), `heartbeat-run.ts` (non-serializable error + malformed JSON log), `run.ts` (non-serializable error), `client/http.ts` (non-JSON response), `onboard.ts` (invalid URL)
- Added explanatory comments to 6 uncommented empty catch blocks across UI files: `ProjectProperties.tsx` (3 URL validation/formatting catches), `plugins/bridge.ts` (non-serializable params), `RunTranscriptView.tsx` (2 JSON format/parse catches)
- Renamed stale `paperclipVersionMin` → `fleetVersionMin` schema field in `docs/specs/cliphub-plan.md` — proposed ClipHub listing schema had old product name
- pnpm build passes clean (zero errors)

### Build #76 — 20:45
- Replaced 6 `as any` casts with proper types in `plugin-host-services.ts`: `params.level as any` → `as GoalLevel | undefined`, `params.status as any` → `as GoalStatus | undefined` (goals.create), `params as any` → `params as IssueFilters` (issues.list), `rows as any` → `as IssueDocumentSummary[]`, `(doc ?? null) as any` → `as IssueDocument | null`, `result.document as any` → `as IssueDocument` (issueDocuments list/get/upsert). Added imports for `GoalLevel`, `GoalStatus`, `IssueDocumentSummary`, `IssueDocument` from `@paperclipai/shared` and `IssueFilters` from issues service. Remaining 5 `as any` in file are cross-package type bridges (entity/issue/goal mutations) that genuinely need casts.
- Added proper eslint-disable comments to 2 `as any` casts in `plugin-config-validator.ts` — CJS/ESM default export interop for Ajv and ajv-formats (these casts are required by the module system mismatch, now documented with reason)
- Removed unused `ChevronRight` import from `BotWorkshop.tsx` — imported but never referenced in component JSX
- pnpm build passes clean (zero errors)

### Build #75 — 20:18
- Typed `db` variable as `Db` in `server/src/index.ts` — was `let db;` (implicitly `any`), now `let db: Db;`. Removed all 7 `db as any` casts (`ensureLocalTrustedBoardPrincipal`, `createBetterAuthInstance`, `initializeBoardClaimChallenge`, `createApp`, `setupLiveEventsWebSocketServer`, `reconcilePersistedRuntimeServicesOnStartup`, `heartbeatService`). Fixed `ensureLocalTrustedBoardPrincipal(db: any)` → `(db: Db)`. Added `type Db` import from `@paperclipai/db`. Zero `as any` remain in server/src/index.ts.
- Replaced `as any` with proper type assertion in `plugin-registry.ts` entity insert: `.values({ ...input, pluginId } as any)` → `.values({ ...input, pluginId } as typeof pluginEntities.$inferInsert)` — drizzle insert values now type-checked against actual schema instead of erasing type info
- Fixed `status?: any` → `status?: A2ACollaboration["status"]` in `fleet-a2a.ts` collaboration history filter — query parameter now properly typed as the `"pending" | "in_progress" | "completed" | "failed" | "timed_out"` union. Added `A2ACollaboration` type import
- Fixed `data?: any` → `data?: Record<string, unknown>` in `fleet-monitor.ts` test-connection probe — gateway probe responses now properly typed. Refactored nested identity/channels access to use explicit `Record<string, unknown>` narrowing instead of relying on `any` propagation
- Fixed `permissionKey: any` → `permissionKey: PermissionKey` in `access.ts` `assertCompanyPermission` — permission check parameter now properly typed against the shared `PermissionKey` union. Added `PermissionKey` type import from `@paperclipai/shared`
- pnpm build passes clean (zero errors)

### Build #77 — 21:20
- Added explanatory comments to 7 uncommented empty catch blocks in server/src: `index.ts` (`isPidRunning` — process.kill(0) throws if PID absent, `getRunningPid` — PID file unreadable, embedded postgres reuse probe — no reachable postgres, `isMainModule` — path resolution), `config.ts` (malformed AUTH_PUBLIC_BASE_URL), `routes/assets.ts` (SVG sanitization failure), `middleware/private-hostname-guard.ts` (invalid URL fallback). Zero uncommented empty catch blocks remain in server/src/
- Added `type="button"` to 52 `<button>` elements across 19 fleet components that were missing it — prevents unintended form submission (HTML default is `type="submit"`): QualityIndex.tsx (3), AuditLog.tsx (2), BotConnectStep.tsx (3), CanaryLab.tsx (1), CapacityPlanning.tsx (2), ConversationAnalyticsWidget.tsx (2), CostOptimizerWidget.tsx (2), CustomerJourneyWidget.tsx (1), FilterBar.tsx (4), FleetHeatmap.tsx (2), IntelligenceWidget.tsx (2), NotificationCenter.tsx (2), PlaybookWidget.tsx (4), PromptLabWidget.tsx (8), ReportDownload.tsx (5), SecretsVaultWidget.tsx (4), SessionLiveTail.tsx (1), TraceWaterfall.tsx (1), TrustGraduationWidget.tsx (3). Zero `<button>` without `type=` remain in ui/src/components/fleet/
- pnpm build passes clean (zero errors)

### Build #78 — 21:45
- Renamed file-local `paperclip*` variable/function names in 3 adapter source files: `codex-home.ts` (`paperclipHome` → `fleetHome`), `cursor-local/execute.ts` (`renderPaperclipEnvNote` → `renderFleetEnvNote`, `paperclipKeys` → `fleetKeys`, `paperclipEnvNote` → `fleetEnvNote`), `gemini-local/execute.ts` (same pattern as cursor-local). These are file-local names, not cross-package exports.
- Renamed file-local `PAPERCLIP_SKILLS_CANDIDATES` → `FLEET_SKILLS_CANDIDATES` and `resolvePaperclipSkillsDir` → `resolveFleetSkillsDir` in both `claude-local/execute.ts` and `opencode-local/execute.ts` — local constants and wrapper functions (not the cross-package `listPaperclipSkillEntries` export from adapter-utils).
- Renamed stale test fixture variable names across 4 test files: `paperclipEnvKeys` → `fleetEnvKeys` in `codex-local-execute.test.ts`, `cursor-local-execute.test.ts`, `gemini-local-execute.test.ts` (script output JSON key, CapturePayload type, assertion); `paperclipConfig`/`paperclipHome`/`paperclipInstanceId` → `fleetConfig`/`fleetHome`/`fleetInstanceId` in `workspace-runtime.test.ts` (script output + assertions). Also renamed test-internal env var `PAPERCLIP_TEST_CAPTURE_PATH` → `FLEET_TEST_CAPTURE_PATH` across all 3 adapter test files (script reader + config objects).
- pnpm build passes clean (zero errors)

### Build #79 — 22:13
- Fixed CLI `package.json` keyword `"paperclip"` → `"fleet"` — visible to npm users searching for the package
- Removed all 4 `as any` type casts in `packages/plugins/sdk/src/worker-rpc-host.ts`: changed `sendMessage(message: unknown)` → `sendMessage(message: JsonRpcMessage)` (all callers already pass `JsonRpcRequest | JsonRpcResponse | JsonRpcNotification` — cast was unnecessary), replaced 3 `(err as any)?.code` error code extractions with `(err as Record<string, unknown>)?.code` type narrowing (lines 835, 836, 1122). Added `JsonRpcMessage` import from protocol.ts. Zero `as any` remain in worker-rpc-host.ts
- Renamed `PaperclipSdkUiComponent` → `FleetSdkUiComponent` in `packages/plugins/sdk/src/ui/components.ts` — internal function name visible in React DevTools component tree. Updated 2 JSDoc comments removing `@paperclipai/plugin-sdk/ui` package name references
- Renamed `PAPERCLIP_SPRITES` → `FLEET_SPRITES` and `PaperclipSprite` → `FleetSprite` in kitchen-sink example plugin `AsciiArtAnimation.tsx` (constant, type, interface field, function parameter — 7 occurrences)
- pnpm build passes clean (zero errors)

### Build #80 — 22:37
- Added proper `eslint-disable-next-line` comments with explanations to all 5 remaining `as any` casts in production `plugin-host-services.ts`: entities.upsert (params + return), entities.list (params + return), issues.create (params), issues.update (patch), goals.update (patch). Each comment documents the cross-package type bridge reason (SDK wire type → Drizzle schema type). These are the last undocumented `as any` casts in server production code — all others are either in test files or already have eslint-disable comments (plugin-config-validator.ts)
- Added `type="button"` to 14 `<button>` elements across 5 core (non-fleet) pages/components: AgentDetail.tsx (2 — icon picker, session collapse), NewAgent.tsx (6 — role trigger, reports-to trigger, role options, no-manager option, agent options), OrgChart.tsx (3 — zoom in, zoom out, fit to screen), DesignGuide.tsx (2 — list/org view toggle), NewIssueDialog.tsx (3 — more options, start date, due date). Zero `<button>` without `type=` remain in these files
- Accessibility: added `aria-label="Change agent icon"` to AgentDetail.tsx icon picker button (icon-only, no text), `aria-label="More options"` to NewIssueDialog.tsx MoreHorizontal icon button (icon-only), `aria-pressed` to DesignGuide.tsx view toggle buttons for active state
- Verified zero remaining `paperclip`/`Paperclip` references in server/src, packages/, ui/src, cli/src source files (all cleaned in previous builds — only internal type names, package imports, env vars, and config dirs remain)
- pnpm build passes clean (zero errors)

### Build #81 — 23:08
- Renamed `PaperclipApiClient` → `FleetApiClient` across CLI: `cli/src/client/http.ts` (class definition), `cli/src/commands/client/common.ts` (import, type, constructor call), `cli/src/__tests__/http.test.ts` (import, describe block, 3 constructor calls). Zero `PaperclipApiClient` remain in codebase
- Renamed `resolvePaperclipHomeDir` → `resolveFleetHomeDir`, `resolvePaperclipInstanceId` → `resolveFleetInstanceId`, `resolvePaperclipInstanceRoot` → `resolveFleetInstanceRoot` across entire stack (20 files, ~50 occurrences): `server/src/home-paths.ts` (definitions + all internal calls), `cli/src/config/home.ts` (definitions + all internal calls), `packages/db/src/backup.ts` (local definitions + calls), `packages/db/src/runtime-config.ts` (local definitions + calls), `server/src/services/workspace-operation-log-store.ts` (import + call), `server/src/services/run-log-store.ts` (import + call), CLI commands: `onboard.ts`, `run.ts`, `env.ts`, `configure.ts`, `db-backup.ts` (imports + calls), CLI prompts: `logging.ts`, `database.ts`, `secrets.ts`, `storage.ts` (imports + calls), CLI config: `store.ts`, `data-dir.ts` (imports + calls), `cli/src/__tests__/home-paths.test.ts` (imports + test calls). Zero `resolvePaperclipHomeDir/InstanceId/InstanceRoot` remain in .ts/.tsx source
- Added `type="button"` to 3 `<button>` elements in `AgentDetail.tsx`: Copy Agent ID popover button, Reset Sessions popover button, Configuration Revisions expand/collapse toggle — prevents unintended form submission
- pnpm build passes clean (zero errors)

---

### Build #82 — 23:31
- Renamed `paperclipConfigSchema` → `fleetConfigSchema` across entire config stack: `packages/shared/src/config-schema.ts` (primary export renamed, added `FleetConfig` type), `packages/shared/src/index.ts` (added `fleetConfigSchema` + `FleetConfig` exports), `server/src/config-file.ts` (import + parse call + return type), `cli/src/config/schema.ts` (re-export), `cli/src/config/store.ts` (import + parse call + `readConfig`/`writeConfig` return/param types). Backward-compat aliases `paperclipConfigSchema` and `PaperclipConfig` kept as deprecated re-exports — existing consumers compile without changes
- Renamed `"$paperclip"` → `"$fleet"` in adapter agent configuration doc strings: `cursor-local/src/index.ts` (skill discovery note), `codex-local/src/index.ts` (skill discovery note). These strings are served to LLM agents as configuration documentation
- Added `type="button"` to 14 `<button>` elements across 5 files: `AgentDetail.tsx` (1 — Terminate button), `IssueDetail.tsx` (1 — Archive issue button), `Org.tsx` (1 — tree expand/collapse toggle), `Companies.tsx` (1 — close Connect Bot overlay), `IssueProperties.tsx` (10 — inline/popover triggers ×2, label toggle, create label, No assignee, Assign to me, Assign to requester, agent assignee list items, No project, project list items). Prevents unintended form submission (HTML default is `type="submit"`)
- pnpm build passes clean (zero errors)

### Build #83 — 23:59
- Renamed `resolvePaperclipConfigPath` → `resolveFleetConfigPath` and `resolvePaperclipEnvPath` → `resolveFleetEnvPath` in `server/src/paths.ts` (definitions) + 3 importers: `startup-banner.ts` (import + 2 call sites), `config-file.ts` (import + 1 call site), `config.ts` (import + 1 call site). Zero `resolvePaperclipConfigPath/EnvPath` remain in server/src
- Renamed `resolvePaperclipConfigPath` → `resolveFleetConfigPath` and `resolvePaperclipEnvPath` → `resolveFleetEnvPath` in `packages/db/src/runtime-config.ts` (file-private functions, 2 definitions + 2 call sites). Zero `resolvePaperclipConfigPath/EnvPath` remain in packages/db
- Renamed 5 exported functions in `cli/src/config/env.ts`: `resolvePaperclipEnvFile` → `resolveFleetEnvFile`, `loadPaperclipEnvFile` → `loadFleetEnvFile`, `readPaperclipEnvEntries` → `readFleetEnvEntries`, `writePaperclipEnvEntries` → `writeFleetEnvEntries`, `mergePaperclipEnvEntries` → `mergeFleetEnvEntries` (5 definitions + 2 internal cross-calls). Updated all 7 importer files: `index.ts` (import + call), `run.ts` (import + call), `auth-bootstrap-ceo.ts` (import + call), `doctor.ts` (import + 2 calls), `worktree.ts` (import with 5 names + 7 call sites), `agent-jwt-env.test.ts` (import with 2 names + 2 call sites). Zero `resolvePaperclipEnvFile/loadPaperclipEnvFile/readPaperclipEnvEntries/writePaperclipEnvEntries/mergePaperclipEnvEntries` remain in codebase
- pnpm build passes clean (zero errors)

### Build #84 — 00:23
- Renamed 5 exported functions + 1 type + 1 constant in `packages/adapter-utils/src/server-utils.ts`: `buildPaperclipEnv` → `buildFleetEnv`, `resolvePaperclipSkillsDir` → `resolveFleetSkillsDir`, `listPaperclipSkillEntries` → `listFleetSkillEntries`, `readPaperclipSkillMarkdown` → `readFleetSkillMarkdown`, `ensurePaperclipSkillSymlink` → `ensureFleetSkillSymlink`, `PaperclipSkillEntry` → `FleetSkillEntry`, `PAPERCLIP_SKILL_ROOT_RELATIVE_CANDIDATES` → `FLEET_SKILL_ROOT_RELATIVE_CANDIDATES`. Added backward-compat aliases for all 6 exports. Updated all 12 importer files: 7 adapter execute.ts (pi-local, openclaw-gateway, codex-local, claude-local, gemini-local, opencode-local, cursor-local), `server/src/adapters/utils.ts`, `server/src/adapters/process/execute.ts`, `cli/src/commands/client/agent.ts`, 2 test files. Zero non-alias `buildPaperclipEnv/listPaperclipSkillEntries/etc` remain in source
- Renamed `PaperclipPluginManifestV1` → `FleetPluginManifestV1` across entire plugin system (26 files, ~60 occurrences): type definition in `packages/shared/src/types/plugin.ts`, re-exports in shared/index.ts + types/index.ts + sdk/index.ts + sdk/types.ts, all server plugin services (plugin-loader, plugin-registry, plugin-lifecycle, plugin-manifest-validator, plugin-worker-manager, plugin-runtime-sandbox, plugin-capability-validator, plugin-tool-registry, plugin-tool-dispatcher), `server/src/routes/plugins.ts`, `packages/db/src/schema/plugins.ts`, SDK files (worker-rpc-host, protocol, testing, types), all 4 example plugin manifests, scaffold template in create-paperclip-plugin. Added backward-compat type alias `PaperclipPluginManifestV1 = FleetPluginManifestV1` — existing plugin packages compile without changes
- Added `type="button"` to 15 `<button>` elements across 4 files: `FleetConnectWizard.tsx` (3 — close, connect another, generate invite), `StatusIcon.tsx` (1 — status trigger), `AgentConfigForm.tsx` (5 — adapter picker trigger + options, model picker trigger + default option, thinking effort trigger + options), `NewIssueDialog.tsx` (6 — status trigger + options, priority trigger + options, labels placeholder, upload attachment). Prevents unintended form submission (HTML default is `type="submit"`)
- Updated 2 JSDoc `@see` references in `packages/shared/src/validators/plugin.ts` from `PaperclipPluginManifestV1` → `FleetPluginManifestV1`
- pnpm build passes clean (zero errors)

### Build #85 — 00:54
- Renamed `PaperclipConfig` → `FleetConfig` across entire CLI package (20 files, ~40 occurrences): 7 command files (`onboard.ts`, `run.ts`, `worktree.ts`, `doctor.ts`, `env.ts`, `configure.ts`, `worktree-lib.ts`), 7 check files (`database-check.ts`, `log-check.ts`, `port-check.ts`, `deployment-auth-check.ts`, `secrets-check.ts`, `llm-check.ts`, `storage-check.ts`), 2 config files (`store.ts`, `secrets-key.ts`), 3 test files (`doctor.test.ts`, `worktree.test.ts`, `allowed-hostname.test.ts`). Backward-compat alias `PaperclipConfig` kept only in `cli/src/config/schema.ts` re-export. Zero non-alias `PaperclipConfig` remain in cli/src
- Renamed `PaperclipPlugin` → `FleetPlugin` across plugin SDK + examples (4 files): `define-plugin.ts` (interface renamed + backward-compat alias added), `worker-rpc-host.ts` (import + 2 type usages), `index.ts` (primary export updated, `PaperclipPlugin` kept as deprecated re-export), `plugin-kitchen-sink-example/worker.ts` (import + const type). Zero non-alias `PaperclipPlugin` remain in SDK source
- Fixed silent `.catch(() => {})` in `claude-local/execute.ts` skills temp dir cleanup — now logs `console.warn("[fleet] failed to clean up skills temp dir:", err)`. Zero silent promise catches remain in adapters
- Accessibility: added `aria-label` to 7 icon-only buttons across 6 core components: CommentThread.tsx (Attach image), PropertiesPanel.tsx (Close properties panel), Sidebar.tsx (Search), AgentDetail.tsx (Hide/Show token + Copy token), NewAgentDialog.tsx (Close dialog), IssuesList.tsx (New issue in group — dynamic label)
- pnpm build passes clean (zero errors)
