# Fleet 真實待辦清單 — 持續更新

## ✅ 已驗證完成
- [x] 品牌色 CSS 變數 #D4A373（5 處）
- [x] ContextBar.tsx 元件（46 行）
- [x] SkillBadges.tsx 元件（48 行）
- [x] Company→Fleet 術語替換（0 殘留）
- [x] fleet-roles.ts 職位資料（215 行）
- [x] OnboardingWizard.tsx 改動（1270 行）
- [x] Supabase client + schema（#31）

## ❌ 必須修（按優先順序）

### P1: 元件沒接到頁面（寫了但沒用）
- [ ] AgentDetail.tsx 要 import ContextBar 和 SkillBadges 並實際 render
- [ ] Dashboard.tsx 要 import BotStatusCard 並替換原版卡片
- [ ] router.tsx 要加 fleet 相關 route（Fleet onboarding, BotWorkshop）
- [ ] server/src/routes/index.ts 要註冊 fleet-discover route
- [ ] agents.ts 要加 discover endpoint

### P2: Onboarding 真的能用嗎
- [ ] OnboardingWizard 的改動要能正常 render（不是只改了程式碼但 crash）
- [ ] Step 3 拖拉用 @dnd-kit 真的能拖嗎
- [ ] fleet-discover 掃描 port 真的能回傳結果嗎

### P3: 標題和 Logo
- [ ] document.title / index.html 的 "Paperclip" 改成 "Fleet"
- [ ] 確認 Logo 🦞 真的顯示

### P4: Supabase 完整整合
- [ ] 接 Supabase 環境變數
- [ ] RLS policies
- [ ] Storage bucket（頭像）
- [ ] 測試 CRUD

### P5: Build 能過
- [ ] pnpm build 零 error
- [ ] pnpm dev 能跑
- [ ] 所有頁面能開
