# Fleet 開發狀態

## 🔴 必修 Bug
- [ ] Onboarding Step 3: 拖拉/點擊連接 bot 到職位不生效（agent-browser 測不了 React controlled input，需要用真瀏覽器驗證或重寫）
- [ ] Launch 按鈕必須至少 1 個 bot connected 才能按
- [ ] Step 1→2 前進在某些情況失敗（React state 問題）

## ✅ 已完成核心功能
- 品牌色 #D4A373 ✅
- Company→Fleet 術語 ✅
- Logo 🦞 ✅
- fleet-roles.ts 職位資料 ✅
- OnboardingWizard 3 步驟 ✅
- @dnd-kit 拖拉（BotConnectStep, 1145 行）✅
- BotStatusCard（avatar + ContextBar + SkillBadges）✅
- Dashboard 用 Fleet 版 ✅
- fleet-discover 掃 port ✅
- OrgChart（538 行）✅
- Invite Link ✅
- Supabase client ✅
- Build 零 error ✅

## 後續優化
- [ ] 部署到 Zeabur
- [ ] Supabase RLS policies
- [ ] Supabase Storage bucket（bot-avatars）
- [ ] Fleet/Bot CRUD 遷移到 Supabase
