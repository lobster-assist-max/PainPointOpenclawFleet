# Fleet 真實待辦清單 — 什麼做了什麼沒做

## ✅ 有做的
- [x] OnboardingWizard.tsx 改了（1270 行改動）
- [x] Dashboard.tsx 改了（388 行）
- [x] AgentDetail.tsx 改了（2811 行）
- [x] OrgChart.tsx 改了（538 行）
- [x] Layout.tsx 改了（434 行）
- [x] Sidebar.tsx 改了（179 行）
- [x] App.tsx 改了（509 行）
- [x] index.css 改了（768 行）
- [x] fleet-roles.ts 建好（215 行）
- [x] ConnectBotWizard.tsx 建好（435 行）
- [x] BotStatusCard.tsx 建好（231 行）
- [x] FleetConnectWizard.tsx 建好（763 行）
- [x] fleet-monitor.ts API client 建好（647 行）
- [x] fleet-discover.ts server route 建好（253 行）

## ❌ 沒做的（必須做）

### 品牌
- [ ] index.css 加品牌色 CSS 變數（#D4A373, #FAF9F6, #2C2420）
- [ ] tailwind.config 加品牌色
- [ ] 28 個檔案還有 "Company" 沒換成 "Fleet"
- [ ] document.title 還是 "Paperclip" 要改 "Fleet"

### 元件缺失
- [ ] ContextBar.tsx 不存在（Context % 進度條）
- [ ] SkillBadges.tsx 不存在（Skills 標籤）
- [ ] 頭像上傳元件（方形、最大尺寸）

### 路由
- [ ] router.tsx 沒改（新頁面可能沒有 route）
- [ ] agents.ts server route 沒改（discover endpoint 沒接上）

### 整合
- [ ] 新元件（BotStatusCard, ConnectBotWizard）是否真的被 import 到頁面？
- [ ] fleet-discover route 是否被註冊到 server？
- [ ] OnboardingWizard 的改動是否能正常 render？

### Supabase
- [ ] 完全沒做
- [ ] schema 沒建
- [ ] client 沒接
- [ ] 還在用 embedded PG

### Build
- [ ] pnpm build 會過嗎？
- [ ] TypeScript errors？
- [ ] Runtime errors？
