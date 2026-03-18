# PainPoint OpenClaw Fleet Dashboard — Planning Document

**專案名稱：** PainPoint OpenClaw Fleet Dashboard
**代號：** Fleet
**開始日期：** 2026-03-19
**Team：** 小龍蝦 🦞 (Lead) + Alex (Product Owner)
**基礎：** Paperclip fork（MIT 開源）
**GitHub：** https://github.com/lobster-assist-max/PainPointOpenclawFleet

---

## 🎯 核心概念

**一句話：** OpenClaw 多 bot 部署的管理 Dashboard — 監控、管理、追蹤你的 AI bot 車隊。

**跟原版 Paperclip 的根本差異：**
- Paperclip = 自己啟動 agent，自己管任務
- Fleet = **連接已存在的 OpenClaw bot**，讀取它們的真實狀態

```
Fleet Dashboard (Web App)
    ↓ 連接
OpenClaw Bot A (MacBook Pro :18789)
OpenClaw Bot B (Mac Mini :18789)  
OpenClaw Bot C (Mac Mini :18793)
OpenClaw Bot D (Mac Mini :18797)
    ↓ 讀取
Sessions, Memory, Skills, Cron, Status, Token Usage
    ↓ 顯示
Dashboard + Org Chart + Cost Tracking
```

---

## 🏗️ 架構改動（從 Paperclip 改什麼）

### 術語改名
| Paperclip 原版 | Fleet 版 |
|---------------|----------|
| Company | Fleet |
| Agent | Bot |
| Hire | Connect / Attach |
| Heartbeat | Sync |

### Onboarding Wizard 重設計
**原版流程：** Create Company → Create Agent → Create Task → Launch
**Fleet 流程：**
1. **Create Fleet** — 命名你的 bot 車隊
2. **Connect First Bot** — 輸入 OpenClaw Gateway URL + Token → 自動拉取 bot 資訊（名稱、skills、memory）
3. **Bot Profile** — 自動填充（從 IDENTITY.md / SOUL.md 讀取），可手動調整職位
4. **Connect More** — 加更多 bot 或稍後再加（生成邀請連結）
5. **Dashboard** — 完成！

### 新增的 API Endpoints
```
GET /api/bots/:id/sync          — 從 OpenClaw gateway 拉最新狀態
GET /api/bots/:id/sessions      — 拉 session 列表
GET /api/bots/:id/memory        — 讀 MEMORY.md / STATE.md
GET /api/bots/:id/skills        — 讀 skills 清單
GET /api/bots/:id/cron          — 讀 cron jobs
GET /api/bots/:id/usage         — 讀 token 用量
POST /api/bots/:id/message      — 發訊息給 bot
POST /api/fleets/invite         — 生成邀請連結
POST /api/fleets/join           — bot 透過連結加入
```

### OpenClaw Gateway 整合
每個 bot 需要提供：
- Gateway URL（如 `http://192.168.50.73:18789`）
- Gateway Auth Token
- Fleet 定期 poll 或用 WebSocket 監聽

### 從 OpenClaw 拉取的資料
| 資料 | OpenClaw API / 方式 | 用途 |
|------|---------------------|------|
| Bot 狀態 | `GET /health` | 在線/離線 |
| Session 列表 | `sessions list` | 活躍對話 |
| Token 用量 | `/status` | 成本追蹤 |
| Skills | 讀 skills 目錄 | 能力展示 |
| Memory | 讀 MEMORY.md | bot 記憶 |
| State | 讀 STATE.md | 當前任務 |
| Identity | 讀 IDENTITY.md / SOUL.md | bot 介紹 |
| Cron Jobs | `cron list` | 排程任務 |
| 對話歷史 | session history | 聊天記錄 |

---

## 🎨 UI/UX 設計方向

### 視覺風格
- **Pixel Art** 路線（跟原版 Paperclip 類似但不同）
- **Pain Point 品牌色** — 從 https://painpoint-ai.com 提取
  - 主色調待確認（需要看官網）
- **每個 bot 有自己的 pixel art 頭像**
  - 🦞 小龍蝦 — 像素龍蝦
  - 🐿️ 飛鼠 — 像素飛鼠
  - 🦚 孔雀 — 像素孔雀
  - 🐗 山豬 — 像素山豬

### 頁面結構
1. **Dashboard** — 所有 bot 的即時狀態概覽
2. **Fleet** — 車隊管理（加/移除 bot）
3. **Org Chart** — 組織圖（誰 report to 誰）
4. **Bot Detail** — 個別 bot 的詳細資訊（skills、memory、sessions）
5. **Costs** — 成本追蹤（從每個 bot 拉 token 用量）
6. **Activity** — 全車隊活動紀錄
7. **Settings** — Fleet 設定

### 邀請流程
1. Fleet 管理者（Alex/小龍蝦）生成邀請連結
2. 連結包含 Fleet ID + 一次性 token
3. Bot 的 OpenClaw 收到連結 → 自動連接 → 出現在 Dashboard
4. 或手動輸入 Gateway URL + Token

---

## 📅 Phase 計畫

### Phase 1: 基礎結構 (Planning, 今晚 cron)
- [ ] 完整計畫文件
- [ ] 術語改名（Company → Fleet, Agent → Bot）
- [ ] 確認 OpenClaw Gateway API 支援哪些操作
- [ ] 確認 Pain Point 品牌色
- [ ] 設計 Onboarding Wizard 流程
- [ ] Notion 專案建立

### Phase 2: 核心功能 (開發)
- [ ] 改 Onboarding Wizard（Gateway URL + Token 連接方式）
- [ ] 實作 OpenClaw Gateway 連接器
- [ ] 實作 bot 狀態同步
- [ ] 實作 dashboard 即時顯示

### Phase 3: 完整功能 (開發)
- [ ] 邀請連結系統
- [ ] 成本追蹤
- [ ] Skills 展示
- [ ] Memory / State 讀取
- [ ] 對話歷史瀏覽

### Phase 4: UI + 品牌 (設計)
- [ ] Pain Point 品牌色套用
- [ ] Pixel art 頭像
- [ ] 手機 responsive
- [ ] 邀請頁面

---

## 📝 Planning Phase 記錄

### Planning #1 — 2026-03-19 01:10
- 建立計畫文件
- 建立 GitHub repo
- 建立 Notion 專案
- 核心概念定義完成
- 術語改名定義完成
- Onboarding 流程初版設計完成
- 下一步：確認 OpenClaw Gateway API、品牌色

### Planning #2 — 2026-03-19 01:42
**研究成果：**

**1. OpenClaw Gateway API 確認可用：**
- `GET /health` → `{"ok":true,"status":"live"}` ✅
- `openclaw sessions` — 列出 session 列表
- `openclaw status` — 顯示 channel health + token 用量
- `openclaw cron list` — 列出 cron jobs
- `openclaw agents` — 管理 agents
- Gateway 有 WebSocket API，可即時監控

**2. Pain Point 品牌色提取完成：**
```
主色調：
- 背景色：#FAF9F6 (rgb(250,249,246)) — 溫暖米白
- 深色文字：#2C2420 (rgb(44,36,32)) — 深棕/炭黑
- 品牌金：#D4A373 (rgb(212,163,115)) — 金棕色（主 accent）
- 邊框灰：#E5E7EB (rgb(229,231,235)) — 淺灰

色彩系統：
- Primary: #D4A373 (金棕) — 按鈕、連結、重點
- Background: #FAF9F6 (米白) — 頁面背景
- Foreground: #2C2420 (深棕) — 文字
- Muted: #E5E7EB (淺灰) — 邊框、分隔線
```

**3. Onboarding Wizard 細化：**
```
Step 1: "Create Your Fleet"
  - Fleet 名稱（如 "Pain Point AI Fleet"）
  - Fleet 描述（選填）

Step 2: "Connect Your First Bot"
  - 輸入 Gateway URL（如 http://192.168.50.73:18789）
  - 輸入 Gateway Token
  - 點擊 "Test Connection"
  - ✅ 成功 → 自動拉取 bot 名稱、skills、memory
  - ❌ 失敗 → 顯示錯誤 + 排錯指南

Step 3: "Bot Profile"（自動填充）
  - 名稱（從 IDENTITY.md 讀）
  - 角色/職位（手動選）
  - Emoji 頭像
  - 技能列表（從 skills 讀）

Step 4: "Your Fleet"
  - 顯示已連接的 bot
  - "Connect Another Bot" 或 "Generate Invite Link"
  - "Go to Dashboard"
```

**4. 技術決定：**
- Gateway 通訊用 WebSocket（即時）+ HTTP（polling backup）
- Bot 狀態每 30 秒同步一次
- 連接資訊（URL + Token）加密存在 Paperclip 的 DB
- 前端用 Pain Point 色系替換 Paperclip 原色

**下一步 Planning #3：**
- 確認 OpenClaw Gateway WebSocket API 的具體 endpoints
- 設計 DB schema 改動（Company → Fleet, Agent → Bot）
- 列出需要改的前端檔案清單
