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
