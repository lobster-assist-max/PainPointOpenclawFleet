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

### 品牌 ✅
- [x] index.css 加品牌色 CSS 變數（#D4A373, #FAF9F6, #2C2420）— `@theme inline` 有 light+dark
- [x] tailwind.config — 用 Tailwind v4 `@tailwindcss/vite`，品牌色在 CSS `@theme` 區塊
- [x] "Company" → "Fleet" 全部 UI 檔案已替換
- [x] document.title = "Pain Point Fleet"（BreadcrumbContext.tsx）
- [x] index.html title = "PainPoint OpenClaw Fleet Dashboard"

### 元件 ✅
- [x] ContextBar.tsx 存在（ui/src/components/fleet/ContextBar.tsx）
- [x] SkillBadges.tsx 存在（ui/src/components/fleet/SkillBadges.tsx）
- [x] BotAvatarUpload.tsx 方形頭像上傳（ui/src/components/fleet/BotAvatarUpload.tsx, 187 行）

### 路由 ✅
- [x] App.tsx 有 BotDetail, BotWorkshop, OrgChart, FleetInvite routes
- [x] fleet-discover route 已在 server/src/app.ts 註冊（api.use("/fleet", fleetDiscoverRoutes())）

### 整合 ✅
- [x] BotStatusCard import 到 FleetDashboard
- [x] ConnectBotWizard import 到 App.tsx + Companies.tsx
- [x] fleet-discover 已註冊到 server
- [x] 35 個 fleet 子元件在 ui/src/components/fleet/

### Supabase ✅ (Iteration #31)
- [x] @supabase/supabase-js 加到 server dependencies
- [x] server/src/supabase-client.ts 建好（isSupabaseEnabled / getSupabaseClient / getSupabaseAnonClient）
- [x] fleet_bot_profiles schema 建好（Drizzle + migration 0044）
- [x] fleetAuditLog export 加到 schema/index.ts
- [x] migration journal 更新（0038-0044 全部補上）
- [ ] 實際接 Supabase（需要 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars）
- [ ] 目前仍可用 embedded PG fallback

### Build ✅
- [x] pnpm --filter ui build — 通過（0 errors）
- [x] pnpm --filter @paperclipai/server build — 通過（0 errors）
- [x] npx tsc --noEmit (ui, server, db) — 全部通過

## ❌ 剩餘工作
- [ ] 連接實際 Supabase instance（需要 env vars）
- [ ] RLS policies 設定
- [ ] Supabase storage bucket 用於 bot avatars
- [ ] E2E 測試更新
