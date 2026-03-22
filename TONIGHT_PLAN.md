# Fleet 今晚開發計畫 — 2026-03-19 23:00 ~ 03-20 12:00

## 整體目標
把所有已寫好的 Fleet component 整合進 UI，完成後接 Supabase。
明天中午前要能跑起來，看起來是 Pain Point Fleet Dashboard。

---

## 時間分配（13 小時 / 52 輪）

### Phase A：品牌替換（23:00 ~ 00:00，4 輪）
| 輪次 | 做什麼 |
|------|--------|
| 1 | CSS 全域色彩替換 — #D4A373 金棕、#FAF9F6 米白、#2C2420 深棕 |
| 2 | Logo 替換 — 🦞 Pain Point Fleet |
| 3 | 術語全面搜尋替換 — Company→Fleet, Agent→Bot, Hire→Connect |
| 4 | **REVIEW** — 確認品牌替換完整，截圖對比 |

### Phase B：Onboarding Wizard（00:00 ~ 02:00，8 輪）
| 輪次 | 做什麼 |
|------|--------|
| 5 | 建立 fleet-roles.ts — 所有職位資料結構 |
| 6 | Step 1 UI — Create Fleet（名稱 + Mission） |
| 7 | Step 2 UI — 職位選擇 checkbox + 即時組織圖預覽 |
| 8 | **REVIEW** — Step 1+2 能跑嗎？ |
| 9 | Step 3 UI — 拖拉區域（左：bot 列表，右：組織圖空位） |
| 10 | Bot 偵測 API — 掃描 local ports + mDNS |
| 11 | 拖拉邏輯 — @dnd-kit 整合，拖進去觸發 Gateway 驗證 |
| 12 | **REVIEW** — 完整 Onboarding 3 步驟能走完嗎？ |

### Phase C：Dashboard 整合（02:00 ~ 04:00，8 輪）
| 輪次 | 做什麼 |
|------|--------|
| 13 | 替換原版 Dashboard 頁面為 Fleet Dashboard |
| 14 | BotStatusCard 接入 — 顯示每個 bot 的即時狀態 |
| 15 | Sidebar 改造 — Fleet Pulse 指示燈、Bot 列表 |
| 16 | **REVIEW** — Dashboard 看起來對嗎？ |
| 17 | 組織圖頁面 — 用新的 org chart（有頭像 + 狀態燈） |
| 18 | Bot Detail 頁面 — 顯示 skills、memory、sessions |
| 19 | 方形頭像上傳功能 — 最大尺寸顯示 |
| 20 | **REVIEW** — 核心頁面全部能用嗎？ |

### Phase D：功能頁面接入（04:00 ~ 06:00，8 輪）
| 輪次 | 做什麼 |
|------|--------|
| 21 | Command Center 頁面接入 routing |
| 22 | Costs / Budget 頁面接入 |
| 23 | Activity / Audit Log 頁面接入 |
| 24 | **REVIEW** — 所有頁面都能 navigate 到嗎？ |
| 25 | Alert / Notification 系統接入 |
| 26 | Invite Link 功能（生成 + 加入） |
| 27 | Settings 頁面（Fleet 設定） |
| 28 | **REVIEW** — 全功能檢查 |

### Phase E：Supabase 整合（06:00 ~ 09:00，12 輪）
| 輪次 | 做什麼 |
|------|--------|
| 29 | 移除 embedded PostgreSQL 依賴 |
| 30 | 建立 Supabase schema（fleets, bots, roles, connections） |
| 31 | 建立 Supabase client（server 端） |
| 32 | **REVIEW** — Supabase 連線正常嗎？ |
| 33 | Fleet CRUD 改用 Supabase |
| 34 | Bot CRUD 改用 Supabase |
| 35 | Bot 狀態同步寫入 Supabase |
| 36 | **REVIEW** — 資料正確寫入 Supabase 嗎？ |
| 37 | Auth 整合（Supabase Auth 或保持原版） |
| 38 | Realtime 訂閱（bot 狀態變更即時推送） |
| 39 | Storage 整合（頭像上傳到 Supabase Storage） |
| 40 | **REVIEW** — Supabase 全面整合完成？ |

### Phase F：測試 + 修 Bug（09:00 ~ 12:00，12 輪）
| 輪次 | 做什麼 |
|------|--------|
| 41 | pnpm build 能通過嗎？修所有 TypeScript error |
| 42 | pnpm dev 能啟動嗎？修 runtime error |
| 43 | Onboarding 流程 end-to-end 測試 |
| 44 | **REVIEW** — 能跑起來嗎？ |
| 45 | Dashboard 顯示正確嗎？ |
| 46 | 組織圖正確嗎？ |
| 47 | Bot detail 正確嗎？ |
| 48 | **REVIEW** — UI 全面檢查 |
| 49 | 手機 responsive 測試 |
| 50 | 效能優化（lazy loading、API caching） |
| 51 | 最終清理（移除 console.log、整理 imports） |
| 52 | **FINAL REVIEW** — 截圖所有頁面，準備報告給 Alex |

---

## Review 規則
- 每 4 輪做一次 REVIEW
- REVIEW 時：檢查最近 4 輪的 git diff，確認方向正確
- 如果偏了 → 立刻修正
- 如果卡住 → 跳過，先做下一個

## Git 規則
- 每輪 commit + push（origin + alex）
- Commit message 格式：`Integration #N: 簡短描述`

## Supabase 配置
- URL: https://qxoahjoqxmhjedakeqss.supabase.co
- Keys: Keychain (supabase-fleet-anon, supabase-fleet-service)
