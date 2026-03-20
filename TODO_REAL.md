# Fleet 必修清單 — 做完才能給 Alex 看

## Phase 1: Onboarding → DB（最重要）
- [x] Launch 時把 bot assignments 寫進 DB（agents table）
- [x] 每個 assignment 要存：bot name, emoji, role, gateway URL, status
- [x] Launch 後 redirect 到 Dashboard 要能看到剛連的 bot

## Phase 2: Dashboard 換成 Fleet 版
- [x] Dashboard 頁面用 BotStatusCard 顯示每個連接的 bot
- [x] 每個 BotStatusCard 顯示：name, emoji, role, status 燈, 簡介
- [x] Sidebar 品牌改成 Fleet（🦞 logo, Pain Point Fleet 文字）
- [ ] 移除或替換所有 Paperclip 原版的 Dashboard 內容

## Phase 3: Bot Detail
- [ ] 點進 bot 看到完整資訊（skills, context%, token usage）
- [ ] ContextBar 進度條要能 render
- [ ] SkillBadges 要顯示

## Phase 4: 測試驗證
- [x] pnpm build 通過
- [ ] pnpm dev 能跑
- [ ] 完整走一遍：Onboarding → Launch → Dashboard 看到 bot → 點進 bot detail
- [ ] 用 agent-browser 自己測完所有流程

### Build #1 — 01:52
- handleLaunch now creates agents in DB for each bot assignment (name, emoji, role, gatewayUrl, status, metadata with skills)
- Dashboard renders DB agents as BotStatusCards (fallback when fleet-monitor is not running)
- Sidebar branding already Fleet (🦞 logo confirmed, no Paperclip remnants)
- UI build passes, tsc --noEmit clean
