# Fleet 開發狀態

## 🔴 必修
- [x] Onboarding Step 3 點擊連接 — 已修好（BotConnectSimple）
- [x] Launch 需要至少 1 bot — 已有
- [ ] Launch 後的 Dashboard 還是原版 Paperclip UI — 要換成 Fleet 版
- [ ] Dashboard 要顯示 Fleet 的 BotStatusCard、ContextBar、SkillBadges
- [ ] Sidebar 要顯示 Fleet 品牌 + bot 列表
- [ ] 整體 UI 要看起來是 Pain Point Fleet，不是 Paperclip

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
