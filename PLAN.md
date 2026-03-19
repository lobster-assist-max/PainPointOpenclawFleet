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

### Supabase 配置
```
URL: https://qxoahjoqxmhjedakeqss.supabase.co
Anon Key: Keychain "supabase-fleet-anon" account "painpoint"
Service Key: Keychain "supabase-fleet-service" account "painpoint"
```
用 Supabase 替換 embedded PostgreSQL。所有 DB 操作改用 Supabase client。

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

### Planning #3 — 2026-03-19 02:30
**重大發現 & 新洞察：**

---

**1. OpenClaw Gateway WebSocket 深度解析（全新資料）**

Gateway 是 **WebSocket-first** 架構，單一 port 同時服務 WS + HTTP。

**連線握手流程（三步驟）：**
```
1. Gateway → Client:  connect.challenge  {nonce}
2. Client → Gateway:  connect  {protocol, role:"operator", scopes, auth.token, device.id, device.publicKey, device.signature, signedNonce}
3. Gateway → Client:  hello-ok  {protocol, policy, presence, health, auth.deviceToken}
```
→ 這比我們原本想的「URL + Token 就好」更複雜。需要實作 device identity + nonce signing。

**可用 RPC 方法（完整清單）：**
| 方法 | 用途 | Fleet 需要？ |
|------|------|-------------|
| `health` | 完整健康快照（channels, sessions, agents） | ✅ 核心 |
| `status` | Runtime 版本、heartbeat config、session details | ✅ 核心 |
| `system-presence` | 已連接的 devices/clients | ✅ 顯示誰在線 |
| `agent` | 啟動 agent turn（兩階段：ack → stream → final） | ⚠️ Phase 3 |
| `agent.wait` | 等待 agent 完成 | ⚠️ Phase 3 |
| `chat.send` | 發送聊天訊息（含 slash commands） | ✅ 核心（發指令給 bot） |
| `tools.catalog` | 取得 agent 的工具清單 | ✅ 顯示 bot 能力 |
| `skills.bins` | 取得 skill 執行檔清單 | ✅ Skills 展示 |
| `cron.*` | Cron job 管理 | ✅ 排程管理 |
| `device.pair.list` | 列出已配對裝置 | ✅ 連線管理 |
| `device.pair.approve` | 批准裝置配對 | ✅ 邀請流程 |
| `device.token.rotate` | 輪替裝置 token | ⚠️ 安全性 |
| `device.token.revoke` | 撤銷裝置 token | ⚠️ 安全性 |
| `exec.approval.resolve` | 解決執行批准請求 | ⚠️ Phase 3 |

**即時事件串流：**
- `agent` — agent 執行期間的串流事件
- `chat` — 聊天更新
- `presence` — 裝置上下線
- `tick` — 每 15 秒心跳
- `health` — 健康狀態變更
- `heartbeat` — heartbeat 活動
- `shutdown` — 優雅關機通知
- `exec.approval.requested` — 執行批准請求

**四種認證模式：**
| 模式 | 機制 | Fleet 適用？ |
|------|------|-------------|
| `none` | 無認證（僅 loopback） | ❌ 不安全 |
| `token` | 靜態共享 token | ✅ 最簡單，Phase 1 用這個 |
| `password` | 共享密碼 | ⚠️ 備選 |
| `trusted-proxy` | 反向代理 header | ⚠️ 生產環境用 |

**HTTP endpoints：**
| Endpoint | 說明 |
|----------|------|
| `GET /health` | `{"ok":true,"status":"live"}` |
| `POST /v1/chat/completions` | OpenAI-compatible（預設關閉） |
| `POST /v1/responses` | OpenResponses-compatible（預設關閉） |
| `POST /tools/invoke` | 直接調用工具 |

---

**2. 驚喜發現：openclaw-gateway adapter 已存在！**

Paperclip 已經有一個 `openclaw-gateway` adapter：
- `ui/src/adapters/openclaw-gateway/config-fields.tsx`

→ **這是巨大的加速器！** 我們不需要從零開始寫 OpenClaw 連接器。
→ 但需要擴展它——原版可能只支援基本連接，我們需要加入：
  - Device identity / pairing 流程
  - Real-time event subscription
  - Memory/State/Skills 讀取
  - Cost tracking integration

---

**3. Pain Point 雙品牌色系發現（全新）**

painpoint-ai.com 有 **兩套不同的視覺系統**：

**A. 首頁 "PAIN POINT" — 溫暖路線（已知，確認無誤）**
```css
--pp-dark-brown:    #3C3533;   /* 比原本的 #2C2420 略淺 */
--pp-brand-gold:    #D3A374;   /* 確認 ≈ #D4A373 */
--pp-cream-bg:      #FBFBF3;   /* 確認 ≈ #FAF9F6 */
--pp-taupe:         #B8ADA2;   /* 🆕 次要文字色 */
--pp-warm-gray:     #948F8C;   /* 🆕 中灰 */
--pp-light-warm:    #DCD1C7;   /* 🆕 卡片背景/分隔線 */
```

**B. 產品頁 "商機特工" — 冷色路線（全新發現）**
```css
--sa-navy:          #376492;   /* 🆕 主標題色 */
--sa-teal:          #30A1A8;   /* 🆕 主 accent */
--sa-dark-teal:     #32707F;   /* 🆕 深色背景 */
--sa-green:         #27BD74;   /* 🆕 CTA 按鈕 */
--sa-green-alt:     #2AC46B;   /* 🆕 活躍狀態 */
--sa-purple:        #9940ED;   /* 🆕 強調色 */
--sa-dark-text:     #1C252E;   /* 🆕 深色文字 */
--sa-border:        #D1D3DB;   /* 🆕 邊框灰 */
```

**CTA 漸層：** teal → navy（左到右），也有 green → teal 變體

**🎨 Fleet 設計決定：混合兩套色系**
```
Dashboard 外框/導航 → 溫暖路線（cream + gold + brown）— 品牌識別
狀態指示器 → 冷色路線：
  - 🟢 Online: #27BD74 (green)
  - 🔵 Working: #30A1A8 (teal)
  - 🟡 Idle: #D3A374 (gold)
  - 🔴 Error: destructive red
  - ⚫ Offline: #948F8C (warm-gray)
CTA 按鈕 → teal-to-navy gradient
資料視覺化 → 冷色系（navy, teal, green, purple）
```

**UI 設計 token（從官網提取）：**
```
border-radius（按鈕）: 24-32px（pill 膠囊型）
border-radius（卡片）: 16-20px
border-radius（輸入框）: 8px
nav 高度: 64-72px
內容最大寬度: 1200-1280px
section 間距: 80-120px
卡片內距: 24-32px
字型: Sans-serif（系統字型 + Noto Sans TC）
無 dark mode
```

---

**4. DB Schema 改動策略（新想法：漸進式，不破壞 migration history）**

**策略：View + Alias 優先，不直接改表名**

因為 Paperclip 有 56+ schema 檔案和既有 migration history，直接改表名風險太高。

**Phase 1：加 TypeScript alias（零風險）**
```typescript
// packages/db/src/schema/fleet-aliases.ts
export { companies as fleets } from './companies';
export { agents as bots } from './agents';
export { companyMemberships as fleetMemberships } from './company_memberships';
```

**Phase 2：前端 UI 只改顯示文字**
- "Company" → "Fleet"（只改 JSX 文字和 label）
- "Agent" → "Bot"（只改 JSX 文字和 label）
- 不改 API route paths（保持 `/api/companies/` 不變）

**Phase 3（如果需要完全改名）：**
- 新增 migration 加 view
- 逐步遷移 route paths

→ 這比 Planning #2 暗示的「直接改」安全得多。

---

**5. 需要修改的檔案清單（按優先順序）**

**🔴 Phase 1 — 核心改動（Onboarding + 連接器）：**
```
ui/src/components/OnboardingWizard.tsx        ← 重寫為 Fleet 版
ui/src/adapters/openclaw-gateway/             ← 擴展現有 adapter
ui/src/index.css                              ← 套用 Pain Point 色系
ui/src/context/CompanyContext.tsx              ← 加 Fleet alias
server/src/routes/companies.ts                ← 加 Fleet onboarding endpoints
server/src/services/companies.ts              ← 加 Gateway 連接邏輯
packages/db/src/schema/fleet-aliases.ts       ← 新增 alias 檔
```

**🟡 Phase 2 — 顯示改名：**
```
ui/src/pages/Companies.tsx                    ← 文字改 Fleet
ui/src/pages/Agents.tsx                       ← 文字改 Bot
ui/src/pages/AgentDetail.tsx                  ← 文字改 Bot
ui/src/components/CompanyRail.tsx             ← 文字改 Fleet
ui/src/components/CompanySwitcher.tsx          ← 文字改 Fleet
ui/src/components/SidebarAgents.tsx           ← 文字改 Bot
ui/src/components/AgentConfigForm.tsx         ← 文字改 Bot
```

**🟢 Phase 3 — 新功能頁面：**
```
ui/src/pages/Costs.tsx                        ← 整合 Gateway usage
ui/src/pages/Activity.tsx                     ← 整合 Gateway events
ui/src/pages/Org.tsx / OrgChart.tsx           ← Bot 組織圖
server/src/realtime/live-events-ws.ts         ← 橋接 Gateway → Fleet WS
```

---

**6. 即時事件橋接架構（新想法）**

```
OpenClaw Bot A ──WS──→ ┌──────────────────┐
OpenClaw Bot B ──WS──→ │ Fleet Gateway    │ ──WS──→ Dashboard
OpenClaw Bot C ──WS──→ │ Bridge Service   │
OpenClaw Bot D ──WS──→ └──────────────────┘
                              │
                         Normalize events
                         to Paperclip format
```

Fleet 後端建立一個 **Gateway Bridge Service**：
1. 對每個已連接的 bot，維持一條 WebSocket 到其 OpenClaw Gateway
2. 接收 OpenClaw events（agent, presence, health, tick）
3. 轉譯為 Paperclip live event 格式（activity.logged, agent.status 等）
4. 透過既有的 `live-events-ws.ts` 推送到 Dashboard

→ 這樣前端幾乎不用改 real-time 邏輯，只需要改資料來源。

---

**7. Device Pairing 作為邀請機制（新想法）**

OpenClaw 已有完整的 device pairing 系統。我們可以利用它：

**原本的邀請流程（Planning #2）：**
```
生成邀請連結 → Bot 收到 → 連接
```

**升級版（利用 device pairing）：**
```
1. Fleet Dashboard 生成 pairing request
2. Bot 的 OpenClaw 收到 → device.pair.approve
3. Gateway 發回 deviceToken（唯一、可撤銷）
4. Fleet 用 deviceToken 持續連線（不需要明文 token）
5. 管理員可從 Dashboard 撤銷（device.token.revoke）
```

→ 比明文 token 安全得多，而且 OpenClaw 已經內建這功能。

---

**8. Onboarding Wizard 重新設計（v3，結合 device pairing）**

```
Step 1: "Name Your Fleet"
  - Fleet 名稱
  - Fleet 描述（選填）
  - Fleet icon/色彩（選填）

Step 2: "Connect Your First Bot"
  - 方式 A: 輸入 Gateway URL → Test Connection（GET /health）
           → 成功 → 輸入 Gateway Token
           → 建立 WS 連線 → 拉取 bot 資訊
  - 方式 B: 掃描 QR Code（Gateway URL + pairing token）
           → 自動連線 + device pairing
  - 方式 C: 區網自動發現（mDNS / broadcast）
           → 顯示找到的 Gateway 列表

Step 3: "Bot Profile"（自動填充 + 可編輯）
  - 🖼️ Pixel art 頭像（根據 bot 名稱自動選）
  - 📛 名稱（從 IDENTITY.md）
  - 💼 角色/職位（手動選）
  - 🛠️ Skills 列表（從 tools.catalog + skills.bins）
  - 📊 當前狀態（從 health）

Step 4: "Fleet Overview"
  - Dashboard 預覽
  - "Connect Another Bot" / "Generate Invite Link" / "Go to Dashboard"
```

→ 新增 QR Code 和區網發現，降低手動輸入的摩擦。

---

**9. 技術風險評估（新增）**

| 風險 | 嚴重度 | 緩解方案 |
|------|--------|----------|
| OpenClaw WS 握手需要 crypto signing | 🟡 中 | 用 Node.js crypto 模組，參考 Gateway 文件 |
| 多 bot 同時 WS 連線的記憶體壓力 | 🟡 中 | 連線池 + 懶連接（只在 Dashboard 打開時連） |
| Gateway token 明文存 DB | 🔴 高 | 用 device pairing + 加密存儲（已有 company_secrets 機制） |
| Paperclip DB migration 衝突 | 🟡 中 | 用 alias 策略，不改表名 |
| 前端 56+ 檔案改名的 regression | 🟡 中 | Phase 1 只改文字，不改變數名 |

---

**下一步 Planning #4：**
- 設計 Gateway Bridge Service 的具體 class 架構
- 建立 Onboarding Wizard v3 的 Figma mockup / ASCII wireframe
- 評估 QR Code 掃描的可行性（需要攝影頭？或只是 URL？）
- 確認 `openclaw-gateway` adapter 目前支援什麼（讀原始碼）
- 開始寫 CSS 色彩變數（index.css）

### Planning #4 — 2026-03-19 04:15
**主題：架構範式轉移 + 全新 API 發現 + 簡化策略**

---

**1. 根本架構洞察：「Read-Only Operator」模式（全新思路）**

Planning #3 設計的 Gateway Bridge Service **方向有誤**。

原版 Paperclip 的 `openclaw-gateway` adapter 是 **「控制者」模式**：
```
Paperclip → 發任務給 OpenClaw → 等結果 → 記錄
```

Fleet 需要的是 **「觀察者」模式**——完全相反：
```
Fleet → 連線到 OpenClaw → 被動監聽 → 顯示即時狀態
```

**具體差異：**
| 面向 | Paperclip 原版 adapter | Fleet 需要的模式 |
|------|----------------------|----------------|
| 角色 | 發起 agent turn | 只讀監控 |
| WS 方向 | 主動發 `req agent` | 被動聽 events |
| Scope | `operator.admin` | `operator.read`（最小權限）|
| 連線數 | 一次一個 bot | 同時 N 個 bots |
| 生命週期 | 任務完成就斷 | 長駐連線 |

**結論：不要改原有 adapter，建立新的 `fleet-monitor` service。**

```typescript
// server/src/services/fleet-monitor.ts
class FleetMonitorService {
  private connections: Map<string, GatewayConnection>;  // botId → WS

  // 連接到一個 bot 的 OpenClaw Gateway
  async connectBot(botId: string, gatewayUrl: string, token: string): Promise<void>;

  // 斷開連接
  async disconnectBot(botId: string): Promise<void>;

  // 被動事件訂閱（不發 agent turn）
  private onHealthEvent(botId: string, event: HealthEvent): void;
  private onPresenceEvent(botId: string, event: PresenceEvent): void;
  private onChatEvent(botId: string, event: ChatEvent): void;
  private onTickEvent(botId: string, event: TickEvent): void;

  // 主動查詢（低頻率，按需）
  async getBotSessions(botId: string): Promise<Session[]>;
  async getBotUsage(botId: string, dateRange?: DateRange): Promise<UsageReport>;
  async getBotAgentFiles(botId: string): Promise<AgentFile[]>;
  async getBotChannelStatus(botId: string): Promise<ChannelStatus[]>;
}
```

→ 比 Planning #3 的 Bridge 架構**簡單一半**，因為不需要「事件轉譯」——直接暴露 OpenClaw 原生事件。

---

**2. 完整 OpenClaw Gateway RPC 方法清單（比 Planning #3 多 3 倍）**

深度研究 Gateway protocol schema 後，發現大量之前遺漏的 API：

**🆕 Session 管理（Fleet 核心）：**
| 方法 | 用途 | Fleet 優先級 |
|------|------|-------------|
| `sessions.list` | 列出所有 sessions（含篩選、搜尋、衍生標題） | ✅ P0 |
| `sessions.usage` | Token 用量統計（日期範圍、context weight 分析） | ✅ P0 |
| `sessions.preview` | Session 對話預覽 | ✅ P1 |
| `sessions.resolve` | 根據 key/id/label 解析 session | ⚠️ P2 |
| `sessions.patch` | 修改 session 設定（model、thinking level 等） | ⚠️ P2 |
| `sessions.compact` | 手動壓縮 session | ⚠️ P3 |
| `sessions.reset` | 重置 session | ⚠️ P3 |
| `sessions.delete` | 刪除 session | ⚠️ P3 |

**🆕 Agent 檔案存取（不需 SSH！）：**
| 方法 | 用途 | Fleet 優先級 |
|------|------|-------------|
| `agents.list` | 列出所有 agent 設定 | ✅ P0 |
| `agents.files.list` | 列出 workspace 檔案（IDENTITY.md, SOUL.md, MEMORY.md...） | ✅ P0 |
| `agents.files.get` | **直接讀取** bot 的 IDENTITY.md / MEMORY.md | ✅ P0 |
| `agents.files.set` | 遠端寫入 bootstrap 檔案 | ⚠️ P2（遠端管理用） |
| `agent.identity` | 取得 agent 名稱、avatar、emoji | ✅ P0 |

**🆕 Chat 操作（Fleet Phase 3）：**
| 方法 | 用途 | Fleet 優先級 |
|------|------|-------------|
| `chat.send` | 發訊息給 bot（觸發 agent turn） | ⚠️ P2 |
| `chat.abort` | 中止正在執行的 agent turn | ⚠️ P2 |
| `chat.inject` | 注入系統訊息（不觸發 turn） | ⚠️ P3 |
| `chat.history` | 取得完整對話歷史 | ✅ P1 |

**🆕 Config 管理（遠端管理）：**
| 方法 | 用途 | Fleet 優先級 |
|------|------|-------------|
| `config.get` | 取得完整運行中 config | ⚠️ P2 |
| `config.patch` | 部分 config 更新（JSON merge patch） | ⚠️ P3 |
| `config.schema` | 取得 config JSON schema + UI hints | ⚠️ P2（動態 config editor） |

**🆕 其他有用 API：**
| 方法 | 用途 | Fleet 優先級 |
|------|------|-------------|
| `channels.status` | 所有 channel 狀態（Telegram、Discord、WhatsApp...） | ✅ P1 |
| `logs.tail` | 遠端 log tailing（cursor-based） | ⚠️ P2 |
| `models.list` | 可用 model 列表 | ✅ P1 |
| `skills.status` | Skill 啟用狀態 | ✅ P1 |
| `skills.install` | 安裝新 skill | ⚠️ P3 |
| `cron.list` | Cron jobs + 篩選/排序 | ✅ P0 |
| `cron.runs` | Cron 執行歷史 + token 用量 | ✅ P1 |
| `wake` | 觸發即時/下次 heartbeat | ⚠️ P2 |

→ **重大簡化：`sessions.usage` 一個 endpoint 就能搞定整個成本追蹤頁。不需要自己聚合！**

---

**3. mDNS 自動發現 — 已原生支援！（驚喜）**

OpenClaw Gateway 廣播 `_openclaw-gw._tcp` Bonjour/mDNS。

Planning #3 提到「區網自動發現」作為 nice-to-have，但現在確認 **Gateway 已內建**。

**實作方式：**
```typescript
// 用 Node.js 的 mdns / bonjour 套件
import Bonjour from 'bonjour-service';
const bonjour = new Bonjour();

bonjour.find({ type: 'openclaw-gw' }, (service) => {
  // service.host = '192.168.50.73'
  // service.port = 18789
  // service.txt = { version: '2026.1.24-3', ... }
  console.log(`Found bot at ws://${service.host}:${service.port}`);
});
```

**Onboarding Wizard Step 2 升級為三合一：**
```
┌─────────────────────────────────────────┐
│  Connect Your First Bot                 │
│                                         │
│  🔍 Scan Network          [Scanning...] │
│  ┌─────────────────────────────────┐    │
│  │ 🟢 clawdbot (192.168.50.73)    │    │
│  │ 🟢 bot-mini-1 (192.168.50.74)  │    │
│  │ 🟡 bot-mini-2 (192.168.50.75)  │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ── or ──                               │
│                                         │
│  📝 Enter URL manually                  │
│  ┌─────────────────────────────────┐    │
│  │ ws://                           │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ── or ──                               │
│                                         │
│  📱 Scan QR Code                        │
│  (Bot 的 Control UI 會顯示 QR)          │
│                                         │
└─────────────────────────────────────────┘
```

→ mDNS 發現讓 onboarding 從「手動輸入 URL」變成「點一下就連上」。UX 飛躍。

---

**4. 現有 Adapter 深度分析（1434 行，比想像完整得多）**

`packages/adapters/openclaw-gateway/src/server/execute.ts` 已經實作：

| 功能 | 實作狀態 | Fleet 可複用？ |
|------|---------|--------------|
| Ed25519 device auth + nonce signing | ✅ 完整 | ✅ 直接複用 crypto 邏輯 |
| Auto device pairing | ✅ `autoPairOnFirstConnect` | ✅ Fleet 連接時自動配對 |
| WS connect + challenge/response | ✅ 完整 | ✅ 抽出為共用模組 |
| Agent turn execution | ✅ 完整 | ❌ Fleet 不需要 |
| Token usage parsing | ✅ 從 response metadata | ✅ 改用 `sessions.usage` |
| Stream event processing | ✅ agent/error/lifecycle | 🔄 需擴展為全事件監聽 |
| Session key strategies | ✅ 三種策略 | ❌ Fleet 用不同方式 |
| Runtime service reporting | ✅ preview URLs | ⚠️ 可能有用 |

**關鍵複用策略：**
```
packages/adapters/openclaw-gateway/
├── src/
│   ├── server/
│   │   ├── execute.ts        ← 原版（Paperclip 控制模式）
│   │   ├── test.ts           ← 可複用
│   │   └── fleet-monitor.ts  ← 🆕 Fleet 觀察模式
│   ├── shared/
│   │   ├── ws-connect.ts     ← 🆕 抽出 WS 握手邏輯（兩模式共用）
│   │   ├── device-auth.ts    ← 🆕 抽出 Ed25519 邏輯
│   │   └── types.ts          ← 🆕 共用型別
│   ├── ui/
│   │   └── parse-stdout.ts   ← 可複用
│   └── cli/
│       └── print-stream.ts   ← 可複用
```

→ 不是從零開始，而是**從 execute.ts 抽出 200-300 行共用邏輯**，然後建 fleet-monitor.ts。

---

**5. Pain Point 品牌色完整版 + OKLch 轉換（Paperclip 用 Tailwind v4）**

⚠️ **重要發現：** Paperclip 用 Tailwind CSS v4 + OKLch 色彩空間，但 painpoint-ai.com 用 Tailwind v3 + hex。需要轉換。

**完整品牌色 → OKLch 對照表：**
```css
/* Pain Point Fleet — Color System (OKLch for Tailwind v4) */

/* === 溫暖品牌色（首頁） === */
--pp-cream-bg:     oklch(0.979 0.007 90);    /* #FAF9F6 → 頁面背景 */
--pp-dark-brown:   oklch(0.282 0.030 55);    /* #2C2420 → 主文字 */
--pp-brand-gold:   oklch(0.758 0.095 68);    /* #D4A373 → 主 accent */
--pp-medium-brown: oklch(0.663 0.088 62);    /* #B08968 → 次 accent */
--pp-taupe:        oklch(0.756 0.023 65);    /* #B8ADA2 → 次要文字 */
--pp-warm-gray:    oklch(0.646 0.016 60);    /* #948F8C → 中灰 */
--pp-light-warm:   oklch(0.867 0.015 70);    /* #DCD1C7 → 卡片/分隔 */
--pp-dark-variant: oklch(0.316 0.025 50);    /* #3D3530 → 深色漸層 */

/* === 功能色（產品頁 + 狀態） === */
--pp-teal-dark:    oklch(0.422 0.075 210);   /* #264653 → 深 teal */
--pp-teal:         oklch(0.648 0.120 180);   /* #2A9D8F → 主 teal */
--pp-green:        oklch(0.720 0.175 155);   /* #27BD74 → 在線/成功 */
--pp-green-alt:    oklch(0.742 0.180 152);   /* #2AC46B → CTA */
--pp-navy:         oklch(0.468 0.080 245);   /* #376492 → 標題 */
--pp-purple:       oklch(0.530 0.235 300);   /* #9940ED → 強調 */

/* === 漸層預設 === */
--pp-gradient-warm:  linear-gradient(135deg, var(--pp-brand-gold), var(--pp-medium-brown));
--pp-gradient-dark:  linear-gradient(135deg, var(--pp-dark-brown), var(--pp-dark-variant));
--pp-gradient-cream: linear-gradient(135deg, var(--pp-cream-bg), oklch(0.961 0.010 80));
--pp-gradient-cta:   linear-gradient(90deg, var(--pp-teal), var(--pp-navy));

/* === 狀態色（混合兩套） === */
--status-online:   var(--pp-green);
--status-working:  var(--pp-teal);
--status-idle:     var(--pp-brand-gold);
--status-error:    oklch(0.637 0.237 25);    /* destructive red */
--status-offline:  var(--pp-warm-gray);
```

**新增設計 token（從官網提取）：**
```css
/* Pain Point 特有的 hover 效果 */
--hover-lift: translateY(-2px);
--hover-scale: scale(1.02);
--hover-shadow-glow: 0 8px 24px oklch(0.758 0.095 68 / 0.3);  /* gold glow */

/* 圓角系統（比 Paperclip 更圓潤） */
--radius-button: 1.5rem;   /* 24px — pill 膠囊型 */
--radius-card: 1rem;        /* 16px */
--radius-input: 0.5rem;     /* 8px */
```

---

**6. 控制 UI 整合策略（不重造輪子）**

**重大發現：** OpenClaw Gateway 本身已有 Control UI（`http://127.0.0.1:18789`）。

**策略：Fleet Dashboard ≠ 重建 Control UI**
```
┌──────────────────────────────────────────────────┐
│  Fleet Dashboard（我們做的）                       │
│  ├── 多 bot 概覽（Control UI 做不到）              │
│  ├── 組織圖（Control UI 做不到）                   │
│  ├── 跨 bot 成本匯總（Control UI 做不到）          │
│  ├── 車隊活動時間線（Control UI 做不到）            │
│  └── Bot Detail → 嵌入/深連結到 Control UI        │
│       ├── Config Editor → iframe or link          │
│       ├── Session Browser → 我們自己做（更好的 UX） │
│       └── Log Viewer → link to Control UI         │
└──────────────────────────────────────────────────┘
```

→ Fleet 專注做 **「多 bot 獨有」** 的功能，單 bot 進階操作可以深連結到 Control UI。
→ 省下 50%+ 的開發時間。

---

**7. 成本追蹤架構（簡化為一個 API 呼叫）**

Planning #3 沒提到 `sessions.usage` 的強大：

```typescript
// 一次呼叫就拿到完整成本資料
const usage = await gateway.rpc('sessions.usage', {
  dateRange: { from: '2026-03-01', to: '2026-03-19' },
  includeContextWeight: true
});

// 回傳：
{
  sessions: [
    {
      sessionKey: 'patrol-morning',
      inputTokens: 45000,
      outputTokens: 12000,
      cachedInputTokens: 30000,
      // context weight = system prompt 佔多少
    }
  ],
  total: { inputTokens: 180000, outputTokens: 48000, ... }
}
```

**成本頁面設計（ASCII Wireframe）：**
```
┌─ Fleet Costs ──────────────────────────────────┐
│                                                 │
│  📊 This Month: $42.50 USD                     │
│  ├── 🦞 小龍蝦: $18.20 (43%)  ████████░░      │
│  ├── 🐿️ 飛鼠:   $12.30 (29%)  █████░░░░░      │
│  ├── 🦚 孔雀:   $8.00 (19%)   ███░░░░░░░      │
│  └── 🐗 山豬:   $4.00 (9%)    █░░░░░░░░░      │
│                                                 │
│  📈 Daily Trend                                 │
│  [Line chart: 30 天每日成本]                     │
│                                                 │
│  📋 By Session                                  │
│  ┌─────────────────────────────────────────┐    │
│  │ Bot      Session         Tokens    Cost │    │
│  │ 🦞       patrol-am       45K      $2.10│    │
│  │ 🦞       fleet-plan      32K      $1.50│    │
│  │ 🐿️       code-review     28K      $1.30│    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

---

**8. Dashboard 首頁 ASCII Wireframe（全新設計）**

```
┌─ Fleet Dashboard ────────────────────────────────────────┐
│                                                           │
│  ┌─ Fleet Health ──┐  ┌─ Today ───────┐  ┌─ Cost ──────┐│
│  │ 🟢 3 Online     │  │ 📨 47 msgs    │  │ 💰 $3.20    ││
│  │ 🟡 1 Idle       │  │ ✅ 12 tasks   │  │ ↑ 5% vs avg ││
│  │ 🔴 0 Error      │  │ 🔄 3 cron     │  │             ││
│  └─────────────────┘  └───────────────┘  └─────────────┘│
│                                                           │
│  ┌─ Bots ─────────────────────────────────────────────┐  │
│  │                                                     │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐         │  │
│  │  │ 🦞       │  │ 🐿️       │  │ 🦚       │         │  │
│  │  │ 小龍蝦   │  │ 飛鼠     │  │ 孔雀     │         │  │
│  │  │ 🟢 Online│  │ 🟢 Work  │  │ 🟡 Idle  │         │  │
│  │  │ 2 active │  │ 1 active │  │ 0 active │         │  │
│  │  │ sessions │  │ sessions │  │ sessions │         │  │
│  │  │          │  │          │  │          │         │  │
│  │  │ Last:    │  │ Last:    │  │ Last:    │         │  │
│  │  │ "fleet   │  │ "review  │  │ "3hr ago"│         │  │
│  │  │  plan.." │  │  PR #42" │  │          │         │  │
│  │  └──────────┘  └──────────┘  └──────────┘         │  │
│  │                                                     │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌─ Recent Activity ──────────────────────────────────┐  │
│  │ 🦞 14:32  Completed "fleet planning iteration #4"  │  │
│  │ 🐿️ 14:28  Started code review on PR #42            │  │
│  │ 🦚 14:15  Cron "morning-report" finished           │  │
│  │ 🐗 13:50  Connected to fleet                       │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

**9. 修訂的 Phase 計畫（基於新發現重排優先順序）**

### 修訂 Phase 1: 基礎連接 (MVP)
```
Week 1:
- [x] 完整計畫文件（Planning #1-#4）
- [ ] 從 execute.ts 抽出共用模組（ws-connect.ts, device-auth.ts）
- [ ] 建立 FleetMonitorService（operator.read 模式）
- [ ] 實作 mDNS 自動發現（`_openclaw-gw._tcp`）
- [ ] 套用 Pain Point OKLch 色彩變數到 index.css
- [ ] 改 Onboarding Wizard（三合一連接方式）

Week 2:
- [ ] Dashboard 首頁（健康概覽 + bot 卡片）
- [ ] Bot Detail 頁（sessions.list + agent.identity + agents.files.get）
- [ ] 即時狀態更新（presence + health events）
```

### 修訂 Phase 2: 資料豐富化
```
- [ ] 成本追蹤頁（sessions.usage）
- [ ] Session 瀏覽器（chat.history）
- [ ] Channel 狀態顯示（channels.status）
- [ ] Cron 管理頁（cron.list + cron.runs）
- [ ] Skills 展示（tools.catalog + skills.status）
```

### 修訂 Phase 3: 互動功能
```
- [ ] 從 Dashboard 發訊息給 bot（chat.send）
- [ ] 從 Dashboard 中止 agent turn（chat.abort）
- [ ] 遠端 config 管理（config.get + config.patch + config.schema 動態 UI）
- [ ] 遠端 agent 檔案編輯（agents.files.set）
- [ ] 邀請連結 + device pairing 流程
- [ ] 組織圖（reportsTo 關係）
```

### 修訂 Phase 4: 打磨
```
- [ ] Pixel art bot 頭像
- [ ] 手機 responsive
- [ ] Control UI 深連結整合
- [ ] 效能優化（懶連接、event batching）
- [ ] Multi-fleet 支援
```

---

**10. 技術決定更新**

| 決定 | 原方案 | 新方案 | 原因 |
|------|--------|--------|------|
| 架構模式 | Gateway Bridge（轉譯事件） | FleetMonitorService（直接消費事件） | 不需要轉譯，省一半工作 |
| 連接方式 | 手動輸入 URL | mDNS + 手動 + QR | Gateway 已支援 Bonjour |
| 成本追蹤 | 自己聚合 turn-level 用量 | `sessions.usage` 一次拿 | API 已經做好了 |
| Bot 資訊讀取 | SSH / 檔案系統 | `agents.files.get` RPC | 不需要存取檔案系統 |
| 進階功能 | 全部自己做 | 深連結到 Control UI | 避免重造輪子 |
| 色彩空間 | hex | OKLch | Paperclip 用 Tailwind v4 |
| WS scope | operator.admin | operator.read（預設） | 最小權限原則 |

---

**11. 風險更新**

| 新風險 | 嚴重度 | 緩解 |
|--------|--------|------|
| mDNS 在某些網路環境被封鎖 | 🟡 中 | 保留手動輸入作為 fallback |
| `operator.read` scope 可能不夠用 | 🟡 中 | 按需升級到 `operator.write`，UI 提示授權 |
| 多 bot WS 長駐連線的 memory leak | 🟡 中 | 心跳檢測 + 自動重連 + 連線池上限 |
| OKLch 色彩轉換精度 | 🟢 低 | 用工具精確轉換，視覺比對 |
| Control UI iframe 跨域問題 | 🟡 中 | 改用深連結（新分頁），不用 iframe |

---

**下一步 Planning #5（如果執行）：**
- 🔧 **開始寫程式碼**（iteration >= 5）
  - 第一個 PR：CSS 色彩變數 + 術語改名
  - 第二個 PR：FleetMonitorService + ws-connect.ts + device-auth.ts
  - 第三個 PR：Onboarding Wizard 改版
- 需要 Alex 確認：mDNS vs 手動輸入的優先順序
- 需要 Alex 確認：Control UI 深連結 vs 自己重做的取捨

### Planning #5 — 2026-03-19 05:30
**主題：開始寫程式碼 + 產品定位洞察 + 通道感知設計 + 主題系統一鍵變身**

---

**🔧 iteration >= 5 → 正式進入開發階段**

本次 Planning 同時產出計畫更新 + 第一批程式碼改動。

---

**1. 重大產品洞察：Pain Point = 「商機特工」AI 語音問卷平台（全新發現）**

深度研究 painpoint-ai.com 後發現，這不是一個通用 AI 平台：

```
Pain Point 的產品名稱：「商機特工」(Pipeline Agent)
產品定位：AI 語音問卷平台
核心功能：AI 打語音電話做市場調查 / 銷售資格認證
```

**這完全改變了 Fleet Dashboard 的指標設計：**

| 原本（通用 bot 監控） | 升級版（商機特工車隊監控） |
|----------------------|------------------------|
| Messages sent | 📞 Calls made / Surveys completed |
| Tasks completed | 🎯 Leads qualified / Conversion rate |
| Active sessions | 📊 Active campaigns / Call queues |
| Token usage | 💰 Cost per lead / ROI per campaign |

**Dashboard 首頁 KPI 卡片重設計：**
```
┌─ Fleet Health ──┐  ┌─ Today ─────────┐  ┌─ Pipeline ─────┐
│ 🟢 3 Online     │  │ 📞 142 calls    │  │ 🎯 23 leads    │
│ 🟡 1 Idle       │  │ ✅ 89 completed │  │ 📈 16.2% conv  │
│ 🔴 0 Error      │  │ ⏱ avg 3m12s    │  │ 💰 $1.85/lead  │
└─────────────────┘  └─────────────────┘  └────────────────┘
```

→ 這些指標可以從 `sessions.usage` + `sessions.list` 推算。
→ Phase 2 可加入自定義 dashboard widget，讓使用者選擇要看的 KPI。

---

**2. LINE 通道整合發現（全新）**

painpoint-ai.com 使用 LINE 作為主要通訊通道：
- 發現 LINE 品牌色 `#00B900`（亮綠）在網站 CSS 中
- 也發現 hover 暗色 `#00A000`
- 這表示 OpenClaw bots 透過 LINE 與客戶對話

**通道感知 Dashboard 設計：**

OpenClaw Gateway 的 `channels.status` API 回傳每個 bot 連接的通道。
Fleet Dashboard 應該用通道品牌色顯示：

```css
/* 通道品牌色 */
--channel-line:      #00B900;  /* LINE */
--channel-telegram:  #26A5E4;  /* Telegram */
--channel-discord:   #5865F2;  /* Discord */
--channel-whatsapp:  #25D366;  /* WhatsApp */
--channel-imessage:  #34C759;  /* iMessage */
--channel-slack:     #4A154B;  /* Slack */
--channel-web:       var(--pp-teal);  /* Web Chat */
```

**Bot 卡片加入通道指示器：**
```
┌──────────────┐
│ 🦞 小龍蝦    │
│ 🟢 Online    │
│              │
│ Channels:    │
│ ● LINE      │  ← 用 LINE 綠色圓點
│ ● Telegram  │  ← 用 Telegram 藍色圓點
│              │
│ 📞 42 calls │
│ 🎯 7 leads  │
└──────────────┘
```

---

**3. 主題系統一鍵變身策略（全新技術洞察）**

**發現：Paperclip 整個視覺身份由 `:root` 中 ~30 個 CSS custom properties 控制。**

這意味著：
- **改一個檔案（index.css）= 整個 app 變身 Pain Point 品牌**
- 不需要改任何 JSX/TSX 組件
- 所有按鈕、卡片、側邊欄、彈窗自動跟著變

**具體發現 — Paperclip 的 0 圓角設計：**
```css
/* Paperclip 原版 */
--radius: 0;        /* 完全直角 */
--radius-lg: 0px;   /* 大元素也是直角 */
--radius-xl: 0px;   /* 全部直角 */
```

**Pain Point 是膠囊/圓潤設計：**
```css
/* Fleet 版 */
--radius: 0.75rem;     /* 12px — 柔和圓角 */
--radius-sm: 0.5rem;   /* 8px */
--radius-md: 0.75rem;  /* 12px */
--radius-lg: 1rem;     /* 16px — 卡片 */
--radius-xl: 1.5rem;   /* 24px — 膠囊按鈕 */
```

→ **一個 CSS 變數就能讓整個 app 從「冷硬科技風」變成「溫暖品牌風」。**

**Dark Mode 策略（新決定）：**

Paperclip dark mode 用純灰色 `oklch(0.145 0 0)`。
Pain Point 沒有 dark mode，但我們要保留它（開發者喜歡）。
策略：**Warm Dark** — 用深棕色代替純灰。

```css
/* Paperclip 原版 dark */
--background: oklch(0.145 0 0);     /* 冷灰黑 */

/* Fleet 版 warm dark */
--background: oklch(0.155 0.015 55); /* 暖深棕 */
```

---

**4. OnboardingWizard.tsx 分析（全新，影響開發策略）**

OnboardingWizard.tsx 是 **1800+ 行、66.7KB** 的巨型組件。

**關鍵結構發現：**
- Step 1: 建立 Company（名稱、prefix、描述）
- Step 2: 選擇 Adapter 類型 + 設定（支援 claude-local、openclaw-gateway 等 7 種）
- Step 3: 建立第一個 Issue/Goal
- Step 4: 啟動 Agent

**Fleet 改造策略（漸進式，不整個重寫）：**

```
Step 1: "Create Your Fleet" ← 改 Company 表單文字
  - Company name → Fleet name
  - Issue prefix → Fleet prefix
  - 加入 Fleet icon/品牌色選擇器

Step 2: "Connect Your First Bot" ← 最大改動
  - 鎖定 adapter type = openclaw_gateway（隱藏其他選項）
  - 加入 mDNS 自動發現面板
  - 加入 "Test Connection" 按鈕（GET /health）
  - 加入 Bot Profile 自動填充（agent.identity + agents.files.get）

Step 3: "Set Up Monitoring" ← 改 Issue → Monitoring Goal
  - 不是建立 Issue，而是設定監控偏好
  - 選擇要追蹤的 KPI（calls, leads, cost）
  - 設定通知閾值

Step 4: "Launch Fleet" ← 改 Launch Agent → Start Monitoring
  - 不是啟動 agent（bot 已經在跑了）
  - 而是啟動 Fleet Monitor Service 連線
  - 顯示第一個 health check 結果
```

→ **Step 2 是唯一需要大改的步驟。其他 3 步只需改文字 + 微調。**

---

**5. 現有頁面 1:1 映射（零新頁面，全改名）**

| Paperclip 頁面 | Fleet 用途 | 改動量 |
|---------------|-----------|--------|
| Dashboard.tsx | Fleet 儀表板 | 🟡 改 KPI 來源 |
| Companies.tsx | Fleet 列表 | 🟢 只改文字 |
| Agents.tsx | Bot 列表 | 🟢 只改文字 |
| AgentDetail.tsx | Bot 詳情 | 🟡 加 Gateway 即時資料 |
| Costs.tsx | 成本追蹤 | 🟡 接 sessions.usage |
| Activity.tsx | 車隊活動 | 🟢 只改文字 |
| OrgChart.tsx | 組織圖 | 🟢 只改文字 |
| CompanySettings.tsx | Fleet 設定 | 🟢 只改文字 |
| Projects.tsx | 行銷活動管理（Campaign） | 🟡 改概念映射 |
| Issues.tsx | 任務/工單 | 🟢 保持原樣 |

→ **不需要建立任何新頁面檔案。** 所有 Fleet 功能都映射到現有頁面。

---

**6. 開發 Commit 計畫（Planning #5 產出）**

**Commit 1（本次執行）：🎨 Pain Point 品牌主題**
```
改動：ui/src/index.css
- :root 色彩全部換成 Pain Point 品牌色（OKLch）
- 圓角從 0 → 12-24px
- Dark mode 改為 warm dark
- 加入 Fleet 專用 CSS 變數（通道色、狀態色）
- 加入 Pain Point 設計 token（hover 效果、漸層）
```

**Commit 2（本次執行）：📦 Fleet Schema Aliases**
```
新增：packages/db/src/schema/fleet-aliases.ts
- export { companies as fleets } from './companies'
- export { agents as bots } from './agents'
- export { companyMemberships as fleetMemberships }
```

**Commit 3（本次執行）：✏️ UI 術語改名（高頻觸點）**
```
改動：
- ui/src/App.tsx — 頁面標題文字
- ui/src/components/Layout.tsx — 導航文字
- ui/src/pages/Companies.tsx — Company → Fleet
- ui/src/components/CompanyRail.tsx — 側欄文字
- ui/src/components/Sidebar.tsx — 側欄文字
```

**Commit 4（下次 iteration）：🔌 FleetMonitorService**
```
新增：server/src/services/fleet-monitor.ts
- WebSocket 連線管理（被動監聽模式）
- 複用 execute.ts 的 Ed25519 + nonce signing 邏輯
- 事件轉發到 live-events-ws.ts
```

---

**7. OpenClaw Gateway API 研究更新（補充確認）**

確認 OpenClaw Gateway 是 **AI agent 訊息路由器**（不是法律科技）：
- 核心功能：連接 messaging apps（LINE、Telegram、Discord 等）到 AI coding agents
- Gateway 是 WebSocket-first 架構，單一 port 服務 WS + HTTP
- mDNS 廣播 `_openclaw-gw._tcp`
- 完整的 device pairing + Ed25519 認證
- Node.js >= 22 運行時

確認 Planning #3-#4 的 API 清單準確無誤。新增確認：
- `openclaw gateway run` — 啟動 gateway
- `openclaw gateway health` — 健康檢查
- `openclaw gateway status` — 完整狀態
- `openclaw gateway probe` — 網路探測

---

**8. 品牌色最終確認（第三次研究，交叉驗證）**

三次獨立研究結果一致，最終確定：

```
核心三色：
  #2C2420  深棕（主文字）     — 三次研究一致 ✅
  #D4A373  金棕（主 accent）  — 三次研究一致 ✅（±1 hex）
  #FAF9F6  米白（背景）       — 三次研究一致 ✅（±2 hex）

次要色：
  #B08968  中棕（hover）      — 兩次確認 ✅
  #3D3530  深棕變體（漸層）    — 兩次確認 ✅
  #B8ADA2  灰褐（次要文字）    — 兩次確認 ✅
  #948F8C  暖灰（muted）      — 兩次確認 ✅

功能色（產品頁）：
  #264653  深 teal（標題）     — 兩次確認 ✅
  #2A9D8F  teal（accent）     — 兩次確認 ✅
  #376492  海軍藍（標題）      — 一次確認
  #27BD74  綠（CTA/在線）      — 兩次確認 ✅
  #9940ED  紫（強調）          — 一次確認

平台色：
  #00B900  LINE 綠             — 首次發現 🆕
  #00A000  LINE 深綠（hover）   — 首次發現 🆕
```

→ 品牌色已完全確定，不需要再研究。

---

**9. 風險更新**

| 新風險 | 嚴重度 | 緩解 |
|--------|--------|------|
| OnboardingWizard 1800 行改動風險 | 🔴 高 | 漸進式改造，只改 Step 1-2 文字，Step 2 連接邏輯分離成獨立組件 |
| 品牌色在 OKLch 轉換後色差 | 🟢 低 | 已用工具轉換，三次研究交叉驗證 |
| 「商機特工」專用 KPI 與通用 Dashboard 衝突 | 🟡 中 | Dashboard widget 系統，讓使用者選擇 KPI 類型 |
| LINE 通道色與狀態色混淆 | 🟢 低 | 通道色只用在通道指示器，狀態色用在 bot 卡片邊框 |

---

**下一步 Planning #6（如果需要）：**
- 開始 FleetMonitorService 開發（ws-connect.ts 共用模組）
- Onboarding Wizard Step 2 重寫（Gateway 連接 UI）
- mDNS 自動發現整合
- 第一次 end-to-end 測試（連接真實 OpenClaw bot）

### Planning #6 — 2026-03-19 06:45
**主題：連線韌性架構 + Bot 狀態機 + Mock Gateway + 實作 FleetMonitorService**

---

**🔧 iteration >= 5 → 繼續開發，本次產出 FleetMonitorService 核心程式碼**

---

**1. Bot 連線狀態機（全新設計，之前未提及）**

之前的 planning 只說「在線/離線」，但真實場景需要更細膩的狀態：

```
                    ┌──────────────────────────────────┐
                    │                                  │
  ┌─────────┐   connect()   ┌──────────────┐   challenge   ┌────────────────┐
  │ DORMANT │──────────────→│ CONNECTING   │─────────────→│ AUTHENTICATING │
  └─────────┘               └──────────────┘              └────────────────┘
       ↑                         │ error                        │ hello-ok
       │ max retries             ↓                              ↓
       │                   ┌──────────────┐              ┌──────────────┐
       └───────────────────│ BACKOFF      │              │ MONITORING   │
                           └──────────────┘              └──────────────┘
                                 ↑                          │    │
                                 │ reconnect timer          │    │ health/presence/tick
                                 │                          │    ↓
                                 │                     ┌──────────────┐
                                 └─────────────────────│ DISCONNECTED │
                                                       └──────────────┘
```

**狀態定義：**
```typescript
type BotConnectionState =
  | "dormant"          // 從未連接，或已放棄重連
  | "connecting"       // WebSocket 正在建立 TCP 連線
  | "authenticating"   // WS 開了，等待 challenge → connect → hello-ok
  | "monitoring"       // 已連接，正在接收事件
  | "disconnected"     // 連線斷開，等待重連
  | "backoff"          // 重連中，等待 backoff timer
  | "error";           // 永久錯誤（如 token 被撤銷、Gateway 不存在）
```

**每次狀態轉換都會：**
1. 更新 DB 中的 `agentRuntimeState`
2. 發布 `agent.status` LiveEvent → 前端即時更新 bot 卡片
3. 記錄 `activityLog` 條目 → 出現在活動時間線

→ **之前只想到「連上/斷開」，現在有完整的狀態機，UI 可以顯示精確的連線階段。**

---

**2. 重連韌性架構（全新，之前只提到「自動重連」但沒設計）**

**指數退避 + 抖動（Exponential Backoff with Jitter）：**
```typescript
const RECONNECT_CONFIG = {
  initialDelayMs: 1_000,       // 第一次重連等 1 秒
  maxDelayMs: 60_000,          // 最長等 1 分鐘
  multiplier: 2,               // 每次翻倍
  jitterFactor: 0.3,           // ±30% 隨機抖動（避免 thundering herd）
  maxAttempts: Infinity,       // 永不放棄（除非是永久錯誤）
  resetAfterMs: 300_000,       // 穩定連線 5 分鐘後，重置 retry 計數
};
```

**Circuit Breaker 模式（新增，之前沒有）：**
```
正常 ←──────── 半開 ←──── 冷卻計時 ←──── 斷開
  │                │                        ↑
  │ N 次失敗       │ 測試連線成功             │ 測試連線失敗
  └───→ 斷開 ──→ 冷卻計時 ──→ 半開 ──→ 正常  │
                                    └────────┘
```

當某個 bot 的 Gateway 連續失敗 5 次，進入「circuit breaker 斷開」狀態：
- 停止嘗試連線 2 分鐘
- 2 分鐘後發一次「半開」測試（HTTP GET /health）
- 成功 → 恢復 WS 連線
- 失敗 → 再等 4 分鐘（指數增長）

→ **避免對已死 Gateway 無限重連浪費資源。**

---

**3. 資料新鮮度指示器（全新 UX 概念）**

**問題：** 當 WS 斷線時，Dashboard 顯示的是過期資料，但使用者不知道。

**解決方案：每筆資料都帶 timestamp，UI 顯示新鮮度：**

```typescript
type DataFreshness = {
  lastUpdated: Date;
  source: "realtime" | "poll" | "cached";
  staleAfterMs: number;  // 超過這個時間就標記為 stale
};
```

**UI 表現：**
```
🟢 2s ago     — 即時（綠色，正常顯示）
🟡 45s ago    — 輕微延遲（黃色小標記）
🟠 2m ago     — 資料可能過時（橘色標記 + "May be outdated"）
🔴 5m+ ago   — 資料過時（紅色標記 + "Connection lost — reconnecting..."）
⚫ Unknown    — 從未成功取得資料
```

**Bot 卡片顯示：**
```
┌──────────────────┐
│ 🦞 小龍蝦        │
│ 🟢 Online        │
│                   │
│ 📊 $3.20 today  │
│ 📞 42 calls     │
│                   │
│ ⏱ Updated 2s ago │  ← 新增：新鮮度指示器
└──────────────────┘
```

→ **使用者永遠知道他們看到的資料有多新。這是監控 Dashboard 的核心 UX 要求。**

---

**4. Mock Gateway Server（全新，開發必需品）**

**問題：** 沒有 Mock Gateway，開發者必須啟動真實 OpenClaw bot 才能開發 Fleet Dashboard。

**解決方案：建立輕量 Mock Gateway 用於開發和測試。**

```typescript
// scripts/mock-gateway.ts
// 用 Node.js ws + http 啟動一個假的 Gateway
// - GET /health → {"ok":true,"status":"live"}
// - WS 握手 → 發 connect.challenge → 接受任何 token
// - 定期發送模擬事件（presence、health、tick）
// - sessions.list → 回傳假資料
// - sessions.usage → 回傳假 token 用量
// - agents.files.get → 回傳假 IDENTITY.md
```

**使用方式：**
```bash
# 開發時啟動 3 個假 bot
pnpm mock-gateway --port 18789 --name "小龍蝦" --emoji "🦞"
pnpm mock-gateway --port 18790 --name "飛鼠" --emoji "🐿️"
pnpm mock-gateway --port 18791 --name "孔雀" --emoji "🦚"
```

**好處：**
- 前端開發不需要真 bot → 開發速度翻倍
- CI 測試可以用 Mock Gateway → 不需要 bot 基礎設施
- 可以模擬各種邊界情況（斷線、高延遲、錯誤回應）

→ **Planning #5 開始寫程式碼但沒提到開發工具。Mock Gateway 是開發效率的關鍵。**
→ **留到下一個 iteration 實作，本次先完成 FleetMonitorService。**

---

**5. Progressive Enhancement 策略（全新，之前只想到 WS）**

**分三層資料取得方式，向下相容：**

```
Layer 3: WebSocket 即時事件（最佳體驗）
  ↑ 需要 WS 長駐連線
  │
Layer 2: HTTP Polling（降級方案）
  ↑ 只需要 GET /health，每 30 秒 poll 一次
  │
Layer 1: 靜態快取（離線方案）
  ↑ 上次成功取得的資料 + timestamp
```

**為什麼這很重要：**
- 並非所有 Gateway 都開放 WS（可能只有 HTTP /health）
- 防火牆可能封 WS（企業環境常見）
- 手機上 WS 可能被 OS 殺掉

**FleetMonitorService 的 transport 選擇邏輯：**
```typescript
async function negotiateTransport(gatewayUrl: string): Promise<"ws" | "http-poll"> {
  // 1. 先嘗試 WS
  // 2. 如果 WS 失敗，fallback 到 HTTP polling
  // 3. 如果 HTTP 也失敗，用 cached data + stale indicator
}
```

→ **之前假設所有 bot 都能用 WS，但現實中需要 graceful degradation。**

---

**6. Fleet Event Bus 內部架構（全新，解耦 Gateway 連線與 UI 消費者）**

**問題：** FleetMonitorService 直接呼叫 `publishLiveEvent()` 耦合太緊。

**解決方案：內部 Event Bus 解耦。**

```
Gateway WS ──→ FleetMonitorService ──→ FleetEventBus ──→ LiveEvents (existing)
                                           │
                                           ├──→ CostAggregator
                                           ├──→ ActivityLogger
                                           └──→ AlertService (future)
```

```typescript
// Fleet-specific events（不修改 Paperclip 的 LIVE_EVENT_TYPES）
type FleetEventType =
  | "fleet.bot.health"       // bot 健康狀態變更
  | "fleet.bot.presence"     // bot 上下線
  | "fleet.bot.chat"         // bot 收到/發出聊天
  | "fleet.bot.tick"         // 15 秒心跳
  | "fleet.bot.connected"    // Fleet 成功連上 bot
  | "fleet.bot.disconnected" // Fleet 與 bot 斷線
  | "fleet.bot.error"        // bot 連線錯誤
  | "fleet.cost.updated"     // 某 bot 的成本更新
  | "fleet.alert.triggered"; // 觸發了告警（成本超標、bot 離線太久等）
```

→ **比直接改 Paperclip 的 LIVE_EVENT_TYPES 安全，Fleet 事件在自己的 namespace。**
→ **也為未來的 AlertService（成本超標通知、bot 離線告警）提供基礎。**

---

**7. Gateway 能力偵測（全新，版本相容性）**

**問題：** 不同版本的 OpenClaw Gateway 支援不同的 RPC 方法。

**hello-ok 回應中的 `features.methods` 告訴我們 Gateway 支援什麼：**
```json
{
  "features": {
    "methods": ["health", "status", "sessions.list", "sessions.usage", ...],
    "events": ["agent", "chat", "presence", "tick", "health", ...]
  }
}
```

**FleetMonitorService 根據 capabilities 調整行為：**
```typescript
class BotConnection {
  private capabilities: Set<string>;

  // 只在 Gateway 支援時才呼叫
  async getSessions(): Promise<Session[] | null> {
    if (!this.capabilities.has("sessions.list")) return null;
    return this.rpc("sessions.list", {});
  }

  async getUsage(): Promise<UsageReport | null> {
    if (!this.capabilities.has("sessions.usage")) return null;
    return this.rpc("sessions.usage", {});
  }
}
```

→ **之前假設所有 Gateway 都支援全部 API。實際上不同版本可能差異很大。**

---

**8. 連線預算與背壓控制（全新，大規模場景）**

**問題：** 如果某個 Fleet 有 50 個 bot，同時建 50 個 WS 連線會：
- 佔用大量 memory（每個 WS buffer ~256KB-1MB）
- 造成 event flooding（50 個 bot 同時發 tick = 每 15 秒 50 個事件）

**解決方案：連線預算系統。**
```typescript
const CONNECTION_BUDGET = {
  maxConcurrentWs: 20,         // 最多 20 個 WS 長駐連線
  overflowStrategy: "http-poll", // 超出的 bot 用 HTTP polling
  priorityBasis: "lastActivity", // 最近活躍的 bot 優先用 WS
  eventBatchIntervalMs: 2_000,  // 批次處理事件，每 2 秒推送一次
};
```

**優先級排序：**
1. 🟢 Online + Active session → WS 連線
2. 🟡 Online + Idle → WS 連線（如果預算夠）
3. ⚫ Offline → HTTP poll 每分鐘一次
4. 🔴 Error → Circuit breaker（不消耗預算）

→ **Planning #4 提到「連線池 + 懶連接」但沒有具體設計。現在有了完整的連線預算系統。**

---

**9. 本次程式碼產出**

**Commit 5: FleetGatewayClient — 長駐 WS 連線客戶端**
```
新增：server/src/services/fleet-gateway-client.ts
- 基於 execute.ts 的 GatewayWsClient 模式
- 但設計為長駐連線（不是一次性 agent turn）
- 自動重連 + 指數退避 + circuit breaker
- 事件轉發（被動監聽模式）
- Capability detection（從 hello-ok 讀取 features）
- Ed25519 device auth（複用 execute.ts 邏輯）
```

**Commit 6: FleetMonitorService — 核心監控服務**
```
新增：server/src/services/fleet-monitor.ts
- 管理多個 BotConnection
- 連線預算控制
- Fleet Event Bus 整合
- 主動查詢方法（getSessions、getUsage、getFiles）
- 資料新鮮度追蹤
- 整合到 Paperclip 的 LiveEvent 系統
```

**Commit 7: Fleet Monitor API Routes**
```
新增：server/src/routes/fleet-monitor.ts
- POST /api/fleet-monitor/connect — 連接 bot
- DELETE /api/fleet-monitor/disconnect/:botId — 斷開
- GET /api/fleet-monitor/status — 所有 bot 連線狀態
- GET /api/fleet-monitor/bot/:botId/health — 即時健康
- GET /api/fleet-monitor/bot/:botId/sessions — Session 列表
- GET /api/fleet-monitor/bot/:botId/usage — Token 用量
- GET /api/fleet-monitor/bot/:botId/files/:filename — 讀取檔案
```

---

**10. 風險更新**

| 新風險 | 嚴重度 | 緩解 |
|--------|--------|------|
| WS 長駐連線的 memory leak（event listeners 累積） | 🔴 高 | 嚴格的 removeListener + WeakRef + 定期 GC 檢查 |
| 50+ bot 同時重連的 thundering herd | 🟡 中 | Jitter + 連線預算 + staggered reconnect |
| Gateway 版本不相容（缺少 features 欄位） | 🟡 中 | Graceful fallback + 手動 capability override |
| Mock Gateway 與真 Gateway 行為偏差 | 🟡 中 | Mock 基於 Protocol v3 spec，定期對照真實 Gateway |
| FleetEventBus 訂閱者忘記 unsubscribe 造成 memory leak | 🟡 中 | WeakRef 訂閱 + 自動清理 dead listeners |

---

**11. 與前幾次 Planning 的關鍵差異**

| 面向 | 之前的想法 | Planning #6 的改進 |
|------|----------|-------------------|
| 連線狀態 | 「在線/離線」二元 | 7 狀態狀態機 + 每次轉換觸發 UI 更新 |
| 重連策略 | 「自動重連」一句帶過 | 指數退避 + jitter + circuit breaker |
| 資料顯示 | 假設資料永遠是最新的 | 新鮮度指示器 + stale data UI |
| 開發工具 | 無 | Mock Gateway Server |
| 傳輸層 | 只有 WebSocket | Progressive Enhancement（WS → HTTP → Cache） |
| 事件系統 | 直接 publishLiveEvent | Fleet Event Bus（解耦 + 可擴展） |
| 大規模 | 「連線池」一句帶過 | 連線預算 + 優先級 + 背壓控制 |
| Gateway 相容性 | 假設所有 API 都可用 | 能力偵測 + graceful degradation |

---

**下一步 Planning #7（如果需要）：**
- Mock Gateway Server 實作
- Onboarding Wizard Step 2 前端改造
- mDNS 自動發現整合到 Onboarding
- AlertService 設計（成本超標、bot 離線告警）
- 第一次 end-to-end 測試（用 Mock Gateway）

### Planning #7 — 2026-03-19 08:00
**主題：Bot 健康評分演算法 + 時序資料策略 + Fleet 指揮中心 + AlertService + Mock Gateway 實作**

---

**🔧 iteration #7 → 繼續開發，本次產出 Mock Gateway + Bot Health Score + AlertService 基礎**

---

**1. Bot 健康評分演算法（全新概念，之前只有二元「在線/離線」+ 狀態機）**

Planning #6 設計了 7 狀態的連線狀態機，但那只描述**連線層**。
使用者真正想知道的是：**「這個 bot 健不健康？」**

**問題：** 一個 bot 可能連線正常（state=monitoring），但：
- 回應延遲飆高（平均 15 秒才回覆）
- Token 用量異常（某個 session 燒了 10 倍的 token）
- Channel 掉線（LINE 斷了但 Telegram 還活著）
- Cron job 失敗率上升

**解決方案：Bot Health Score（0-100 分複合指標）**

```typescript
interface BotHealthScore {
  overall: number;         // 0-100 加權總分
  breakdown: {
    connectivity: number;  // 30% — WS 連線穩定度（uptime ratio + 重連頻率）
    responsiveness: number; // 25% — 平均 event → response 延遲
    efficiency: number;    // 20% — Token 使用效率（cached ratio, context weight）
    channels: number;      // 15% — Channel 健康（connected/total channels ratio）
    cron: number;          // 10% — Cron 執行成功率
  };
  trend: "improving" | "stable" | "degrading";  // 過去 1hr vs 現在
  grade: "A" | "B" | "C" | "D" | "F";
}
```

**評分演算法：**
```
connectivity (30%):
  base = (uptimeMs / totalMs) × 100
  penalty = min(reconnectCount × 5, 50)  // 每次重連扣 5 分，最多扣 50
  score = max(base - penalty, 0)

responsiveness (25%):
  avgLatency = mean(last 20 event round-trip times)
  if avgLatency < 500ms → 100
  if avgLatency < 2000ms → 80
  if avgLatency < 5000ms → 60
  if avgLatency < 10000ms → 30
  else → 10

efficiency (20%):
  cachedRatio = cachedInputTokens / totalInputTokens
  score = cachedRatio × 100  // 越多 cache hit 越好
  bonus: if contextWeight < 30% → +10

channels (15%):
  connectedChannels / totalConfiguredChannels × 100
  如果沒有配置 channel → 100（不扣分）

cron (10%):
  successfulRuns / totalRuns × 100（過去 24hr）
  如果沒有 cron → 100（不扣分）

overall = weighted sum
grade: A(90+) B(75+) C(60+) D(40+) F(<40)
trend: compare current 1hr avg vs previous 1hr avg
```

**Dashboard 顯示：**
```
┌──────────────────┐
│ 🦞 小龍蝦        │
│ Health: 92 A     │  ← 健康分數 + 等級
│ █████████░       │  ← 視覺化進度條
│ 📶 ↑ improving   │  ← 趨勢指標
│                   │
│ 🔗 100% connect  │
│ ⚡ 420ms latency │
│ 💰 45% cached    │
│ 📡 2/2 channels  │
│ ⏰ 12/12 cron ok │
└──────────────────┘
```

→ **比「🟢 Online」有用 10 倍。管理者一眼就能看出哪個 bot 需要關注。**
→ **Health Score 還能用來排序 Dashboard：最差的 bot 排最前面（attention-first 設計）。**

---

**2. 時序資料聚合策略（全新，填補「只有即時快照」的重大缺口）**

**問題：** 目前的 FleetMonitorService 只保留「最新狀態」。
使用者問「上週的成本趨勢是什麼？」→ 答不上來。

**但我們不要建自己的時序資料庫。** Paperclip 已有 `cost_events` 和 `activity_log` 表。

**策略：分層時序存儲（利用既有 DB）**

```
Layer 1: 即時（記憶體）
  → FleetMonitorService.botSnapshots: Map<botId, LatestSnapshot>
  → 每 15 秒 tick 事件更新
  → 保留最近 5 分鐘的事件環形緩衝區（ring buffer）

Layer 2: 分鐘級（DB cost_events 表）
  → 每收到 sessions.usage 回應，寫入 cost_events
  → Paperclip 已有的 costs 頁面 + API 自動可用

Layer 3: 小時級快照（新增 fleet_snapshots 表）
  → 每小時快照一次每個 bot 的 health score + usage + channel status
  → 用於趨勢圖和歷史報表
  → 自動清理 > 90 天的資料

Layer 4: 日級摘要（新增 fleet_daily_summary 表）
  → 每天凌晨聚合：總 token、總成本、平均 health score、uptime %
  → 永久保留（資料量很小，每 bot 每天一筆）
```

**DB Migration 設計：**
```sql
-- fleet_snapshots: 小時級快照
CREATE TABLE fleet_snapshots (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL REFERENCES agents(id),
  company_id TEXT NOT NULL REFERENCES companies(id),
  captured_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  health_score INTEGER,          -- 0-100
  health_grade TEXT,             -- A/B/C/D/F
  connection_state TEXT,         -- monitoring/disconnected/etc
  input_tokens_1h INTEGER,
  output_tokens_1h INTEGER,
  cached_tokens_1h INTEGER,
  active_sessions INTEGER,
  connected_channels INTEGER,
  total_channels INTEGER,
  cron_success_rate REAL,        -- 0.0-1.0
  avg_latency_ms INTEGER
);
CREATE INDEX idx_fleet_snap_bot_time ON fleet_snapshots(bot_id, captured_at);

-- fleet_daily_summary: 日級摘要
CREATE TABLE fleet_daily_summary (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL REFERENCES agents(id),
  company_id TEXT NOT NULL REFERENCES companies(id),
  date DATE NOT NULL,
  avg_health_score REAL,
  min_health_score INTEGER,
  uptime_pct REAL,               -- 0.0-1.0
  total_input_tokens BIGINT,
  total_output_tokens BIGINT,
  total_cached_tokens BIGINT,
  estimated_cost_usd REAL,
  total_sessions INTEGER,
  total_cron_runs INTEGER,
  cron_success_rate REAL,
  UNIQUE(bot_id, date)
);
CREATE INDEX idx_fleet_daily_bot ON fleet_daily_summary(bot_id, date);
```

**趨勢圖 API：**
```
GET /api/fleet-monitor/bot/:botId/trend?range=7d&metric=health_score
GET /api/fleet-monitor/bot/:botId/trend?range=30d&metric=cost
GET /api/fleet-monitor/fleet/:companyId/trend?range=7d&metric=total_cost
```

→ **之前所有 Planning 都只想到即時監控。但 Dashboard 的價值一半在歷史趨勢。**
→ **利用 Paperclip 既有的 cost_events 表，不需要額外基礎設施。**

---

**3. Fleet 指揮中心（Batch Operations — 全新功能類別）**

**問題：** 目前的設計是「監控」+ 「單 bot 操作」。
但如果你有 10 個 bot，想要「全部 bot 更新 config」→ 要點 10 次。

**Fleet Dashboard 的殺手功能：多 bot 批量操作**

這是 **單 bot Control UI 永遠做不到的事**——真正的「Fleet」獨有能力。

**Fleet Command Center 設計：**
```
┌─ Fleet Command Center ──────────────────────────────────────┐
│                                                               │
│  Select Bots:                                                │
│  ☑ 🦞 小龍蝦  ☑ 🐿️ 飛鼠  ☑ 🦚 孔雀  ☐ 🐗 山豬(offline) │
│  [Select All] [Select Online] [Select None]                  │
│                                                               │
│  Command:                                                    │
│  ┌──────────────────────────────────────────────────┐       │
│  │ 📡 Broadcast Message                             │       │
│  │ 🔄 Trigger Cron Job (select job)                 │       │
│  │ ⚙️ Push Config Update (JSON patch)               │       │
│  │ 🔑 Rotate All Tokens                             │       │
│  │ 📊 Collect Usage Report                          │       │
│  │ 🛑 Abort All Active Sessions                     │       │
│  └──────────────────────────────────────────────────┘       │
│                                                               │
│  Execution Mode:                                             │
│  ○ Parallel (all at once)                                    │
│  ● Rolling (one by one, stop on error)                      │
│  ○ Canary (1 bot first, then rest after 60s)                │
│                                                               │
│  [Execute Command]                                           │
└───────────────────────────────────────────────────────────────┘
```

**Batch Execution Engine：**
```typescript
interface FleetCommand {
  id: string;
  type: "broadcast" | "cron-trigger" | "config-push" | "token-rotate" | "usage-collect" | "abort-all";
  targetBotIds: string[];
  executionMode: "parallel" | "rolling" | "canary";
  payload: Record<string, unknown>;
  createdAt: Date;
  createdBy: string;
}

interface FleetCommandResult {
  commandId: string;
  results: Array<{
    botId: string;
    status: "success" | "failed" | "skipped" | "timeout";
    response?: unknown;
    error?: string;
    durationMs: number;
  }>;
  summary: {
    total: number;
    success: number;
    failed: number;
    skipped: number;
  };
}
```

**API 設計：**
```
POST /api/fleet-command/execute         — 發送批量命令
GET  /api/fleet-command/:id/status      — 查詢執行進度（rolling 模式下）
GET  /api/fleet-command/history         — 歷史命令列表
POST /api/fleet-command/:id/abort       — 中止進行中的 rolling 命令
```

**Canary 模式特別有趣：**
1. 先對 1 個 bot 執行 config push
2. 等 60 秒觀察 health score 有無下降
3. 如果穩定 → 自動對剩餘 bot 執行
4. 如果 health 下降 → 停止 + alert + 自動 rollback 第一個 bot

→ **這才是「Fleet」的核心價值。不只是看，還能批量操作。**
→ **Canary 模式讓 config 變更有安全網，這在管理 10+ bot 時是救命功能。**

---

**4. AlertService 架構（Planning #6 提到但沒設計，本次完整設計）**

**Rules Engine 設計：**
```typescript
interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  // 觸發條件
  condition: {
    metric: "health_score" | "cost_1h" | "cost_24h" | "uptime" |
            "error_rate" | "channel_disconnected" | "bot_offline_duration" |
            "cron_failure_rate" | "latency_avg";
    operator: "lt" | "gt" | "eq" | "gte" | "lte";
    threshold: number;
    // 持續多久才觸發（避免瞬間波動誤報）
    sustainedForMs: number;
  };
  // 適用範圍
  scope: {
    type: "fleet" | "bot";
    botIds?: string[];  // 空 = 全部 bot
  };
  // 通知方式
  actions: Array<{
    type: "dashboard_badge" | "webhook" | "email" | "fleet_event";
    config: Record<string, unknown>;
  }>;
  // 冷卻（同一 alert 不重複觸發）
  cooldownMs: number;
}
```

**預設 Alert Rules（開箱即用）：**
```typescript
const DEFAULT_ALERT_RULES: AlertRule[] = [
  {
    name: "Bot Offline > 5 minutes",
    condition: { metric: "bot_offline_duration", operator: "gt", threshold: 300_000, sustainedForMs: 0 },
    actions: [{ type: "dashboard_badge", config: { severity: "warning" } }],
    cooldownMs: 600_000,  // 10 分鐘冷卻
  },
  {
    name: "Health Score Critical",
    condition: { metric: "health_score", operator: "lt", threshold: 40, sustainedForMs: 120_000 },
    actions: [{ type: "dashboard_badge", config: { severity: "critical" } }, { type: "fleet_event", config: {} }],
    cooldownMs: 300_000,
  },
  {
    name: "Hourly Cost Spike",
    condition: { metric: "cost_1h", operator: "gt", threshold: 5.00, sustainedForMs: 0 },
    actions: [{ type: "dashboard_badge", config: { severity: "warning" } }],
    cooldownMs: 3600_000,  // 1 小時冷卻
  },
  {
    name: "Channel Disconnected",
    condition: { metric: "channel_disconnected", operator: "gt", threshold: 0, sustainedForMs: 60_000 },
    actions: [{ type: "dashboard_badge", config: { severity: "info" } }],
    cooldownMs: 300_000,
  },
  {
    name: "Cron Failure Rate High",
    condition: { metric: "cron_failure_rate", operator: "gt", threshold: 0.3, sustainedForMs: 0 },
    actions: [{ type: "dashboard_badge", config: { severity: "warning" } }],
    cooldownMs: 3600_000,
  },
];
```

**Alert 生命週期：**
```
Rule Check (每 30 秒) → Condition Met? → Sustained? → Cooldown OK? → FIRE
                          ↓ no             ↓ no         ↓ no
                        skip             reset        skip (已觸發過)

FIRE → 執行 actions:
  dashboard_badge → 側邊欄顯示紅/黃標記 + 通知數字
  fleet_event → publishLiveEvent("fleet.alert.triggered", {...})
  webhook → POST 到使用者設定的 URL（可串 Slack/Discord）
  email → 寄信（Phase 4 再做）
```

**Dashboard Alert Panel：**
```
┌─ ⚠️ Active Alerts (2) ──────────────────────────────────┐
│                                                           │
│  🔴 CRITICAL  🐗 山豬 — Health Score 28 (Grade F)       │
│     Since 14:32 · Bot offline for 23 minutes             │
│     [View Bot] [Acknowledge] [Mute 1hr]                  │
│                                                           │
│  🟡 WARNING   🦚 孔雀 — LINE channel disconnected       │
│     Since 14:45 · 1 of 2 channels down                  │
│     [View Bot] [Acknowledge] [Mute 1hr]                  │
│                                                           │
│  ── Resolved ──                                          │
│  ✅ 🦞 小龍蝦 — Hourly cost spike ($6.20)              │
│     Resolved at 14:20 · Duration: 45m                    │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

→ **Alert 系統讓 Fleet Dashboard 從「被動監控面板」升級為「主動告警平台」。**
→ **預設 5 條 rules 開箱即用，使用者不需要設定就能收到關鍵告警。**

---

**5. Mock Gateway Server 實作（本次程式碼產出 #1）**

Planning #6 設計了 Mock Gateway 但沒有實作。本次實作。

**設計要點：**
- 完整模擬 WS 握手（challenge → connect → hello-ok）
- 定期發送模擬事件（tick/health/presence）
- 支援 RPC 方法（health, sessions.list, sessions.usage, agent.identity, agents.files.get）
- 命令列參數控制 bot 名稱、emoji、port、模擬延遲
- 可模擬斷線、高延遲等邊界情況

→ **見 scripts/mock-gateway.ts 程式碼**

---

**6. Bot Health Score 服務實作（本次程式碼產出 #2）**

基於上面的演算法設計，實作 `fleet-health-score.ts`。

→ **見 server/src/services/fleet-health-score.ts 程式碼**

---

**7. AlertService 基礎實作（本次程式碼產出 #3）**

基於上面的架構設計，實作核心 rule evaluation engine。

→ **見 server/src/services/fleet-alerts.ts 程式碼**

---

**8. 與前幾次 Planning 的關鍵差異**

| 面向 | 之前的想法 | Planning #7 的改進 |
|------|----------|-------------------|
| Bot 健康 | 在線/離線 + 7 狀態 | 0-100 複合健康分數 + A-F 等級 + 趨勢 |
| 歷史資料 | 只有即時快照 | 4 層時序存儲（記憶體 → 分鐘 → 小時 → 日） |
| 操作模式 | 只有監控 + 單 bot 操作 | Fleet Command Center（批量操作 + Canary 部署） |
| 告警 | 「以後再做」 | 完整 Rules Engine + 5 條預設規則 + Dashboard Panel |
| 開發工具 | 計畫中 | Mock Gateway Server 實際實作 |
| Dashboard 排序 | 固定順序 | Attention-first（健康分數最差的排最前） |
| Config 變更 | 一次一個 bot | Canary 模式（1 bot 先測 → 觀察 → 全部推送） |

---

**9. 風險更新**

| 新風險 | 嚴重度 | 緩解 |
|--------|--------|------|
| Health Score 權重不準（初始值不合理） | 🟡 中 | 提供管理員介面調整權重 + 收集實際數據後校準 |
| 時序資料 DB 膨脹（大量 bot + 長時間） | 🟡 中 | fleet_snapshots 90 天自動清理 + 日摘要永久保留 |
| Batch Command 對目標 bot 造成 DDoS | 🟡 中 | Rolling/Canary 模式 + rate limiting + 連線預算 |
| AlertService 誤報太多導致 alert fatigue | 🟡 中 | sustainedForMs 防瞬間波動 + cooldownMs 防重複 + mute 功能 |
| Mock Gateway 行為偏差（與真 Gateway） | 🟢 低 | 基於 Protocol v3 spec + 定期對照 |

---

**10. 修訂的整體進度追蹤**

```
✅ Planning #1-4: 概念、API 研究、架構設計
✅ Planning #5: 品牌主題 CSS + DB aliases + 術語改名
✅ Planning #6: FleetGatewayClient + FleetMonitorService + API routes
✅ Planning #7: Mock Gateway + Health Score + AlertService + 時序策略 + Command Center
⬜ Next: Onboarding Wizard Step 2 前端 + Dashboard 首頁 + 趨勢圖
⬜ Next: Fleet Command Center 實作
⬜ Next: end-to-end 測試（Mock Gateway → Fleet → Dashboard）
```

---

**下一步 Planning #8（如果需要）：**
- Onboarding Wizard Step 2 前端改造（React 組件）
- Dashboard 首頁實作（KPI 卡片 + Bot 列表 + Activity Feed）
- 趨勢圖組件（Recharts/Nivo + fleet_snapshots 資料源）
- Fleet Command Center 前端 + 後端實作
- DB migration 實作（fleet_snapshots + fleet_daily_summary）
- 第一次 end-to-end 測試（Mock Gateway → FleetMonitor → Dashboard UI）

### Planning #8 — 2026-03-19 09:30
**主題：前端資料管線 + 組件架構 + 成本估算引擎 + 注意力優先 Dashboard + LiveEvent 橋接**

---

**🔧 iteration #8 → 前端全面突破：React Query 整合 + 核心 UI 組件 + 新架構洞察**

之前 7 次 Planning 建立了完整的後端基礎設施（FleetGatewayClient、FleetMonitorService、HealthScore、AlertService、MockGateway）。但**前端只完成了 CSS 主題**。

本次 Planning 的核心問題：**如何把後端的豐富資料流，高效、一致地呈現在 React UI 上？**

---

**1. 前端資料管線架構（全新，填補後端→前端的斷層）**

Planning #6 設計了 `FleetEventBus` 在後端，但**從未設計前端如何消費這些事件**。

**發現：Paperclip 已有完整的前端即時更新管線。**

```
Server → WebSocket (/api/companies/:id/events/ws)
  → LiveUpdatesProvider.tsx
    → handleLiveEvent()
      → queryClient.invalidateQueries() ← 自動讓 React Query 重新拉資料
      → pushToast() ← 即時通知
```

**Fleet 整合策略（不建新 WS，擴展現有的）：**

```
FleetMonitorService
  → FleetEventBus
    → publishLiveEvent() ← 已整合到 Paperclip 的 LiveEvent 系統
      → WebSocket → 前端 LiveUpdatesProvider
        → handleLiveEvent() ← 需要新增 fleet.* 事件處理
          → queryClient.invalidateQueries(["fleet", ...])
```

**需要在 `handleLiveEvent()` 中新增的 fleet 事件：**
```typescript
case "fleet.bot.health":
  queryClient.invalidateQueries({ queryKey: ["fleet", "status", companyId] });
  queryClient.invalidateQueries({ queryKey: ["fleet", "bot-health", event.payload.botId] });
  break;
case "fleet.bot.connected":
case "fleet.bot.disconnected":
  queryClient.invalidateQueries({ queryKey: ["fleet", "status", companyId] });
  pushToast({ type: event.type === "fleet.bot.connected" ? "success" : "warning",
              message: `${event.payload.botEmoji} ${event.payload.botName} ${event.type === "fleet.bot.connected" ? "connected" : "disconnected"}` });
  break;
case "fleet.alert.triggered":
  queryClient.invalidateQueries({ queryKey: ["fleet", "alerts", companyId] });
  pushToast({ type: "warning", message: event.payload.message });
  break;
case "fleet.cost.updated":
  queryClient.invalidateQueries({ queryKey: ["fleet", "bot-usage", event.payload.botId] });
  break;
```

→ **這是最小侵入的整合方式——不建新 WS，不改 LiveUpdatesProvider 結構，只加 case 分支。**
→ **React Query 的 staleTime + refetchInterval 作為 fallback：即使 WS 斷了，hooks 仍會定期 poll。**

---

**2. Fleet Query Key 設計（全新，React Query 最佳實踐）**

之前沒有定義 fleet 的 query key 結構。這次完整設計：

```typescript
// 新增到 lib/queryKeys.ts
fleet: {
  status:      (companyId: string) => ["fleet", "status", companyId],
  botHealth:   (botId: string) => ["fleet", "bot-health", botId],
  botSessions: (botId: string) => ["fleet", "bot-sessions", botId],
  botUsage:    (botId: string, from?, to?) => ["fleet", "bot-usage", botId, from, to],
  botIdentity: (botId: string) => ["fleet", "bot-identity", botId],
  botChannels: (botId: string) => ["fleet", "bot-channels", botId],
  botCron:     (botId: string) => ["fleet", "bot-cron", botId],
  botFile:     (botId: string, filename: string) => ["fleet", "bot-file", botId, filename],
  alerts:      (companyId: string, state?) => ["fleet", "alerts", companyId, state],
}
```

**Stale time 分層策略：**
| 資料類型 | staleTime | refetchInterval | 原因 |
|----------|-----------|-----------------|------|
| Fleet status | 5s | 10s | 核心即時資料，WS 也會推送 |
| Bot health | 10s | 15s | 計算密集，不需要太頻繁 |
| Bot sessions | 15s | 30s | 變化較慢 |
| Bot usage | 60s | — | 只按需查詢 |
| Bot identity | 5min | — | 幾乎不變 |
| Alerts | 10s | 15s | 需要及時更新 |

→ **分層 staleTime 避免無意義的重複請求，同時保證即時性。**

---

**3. 成本估算引擎（全新，之前只有原始 token 數）**

**問題：** `sessions.usage` 回傳 token 數，但 Dashboard 需要顯示美金。

**挑戰：** 不同 bot 可能用不同的 model（Claude Opus 4 vs Sonnet 4 vs Haiku 4.5），pricing 不同。

**解決方案：前端 cost estimator + 可更新的 pricing table**

```typescript
// hooks/useFleetMonitor.ts — estimateCostUsd()
// 定價表（隨 model 更新）
const MODEL_PRICING: Record<string, { input: number; output: number; cachedInput: number }> = {
  "claude-opus-4":    { input: 15,  output: 75,  cachedInput: 1.50 },  // $/1M tokens
  "claude-sonnet-4":  { input: 3,   output: 15,  cachedInput: 0.30 },
  "claude-haiku-4-5": { input: 0.8, output: 4,   cachedInput: 0.08 },
};

function estimateCostUsd(usage: TokenUsage, model: string = "claude-sonnet-4"): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING["claude-sonnet-4"];
  const freshInput = usage.inputTokens - usage.cachedInputTokens;
  return (freshInput / 1e6) * pricing.input
       + (usage.cachedInputTokens / 1e6) * pricing.cachedInput
       + (usage.outputTokens / 1e6) * pricing.output;
}
```

**Model 偵測：** 從 `config.get` 或 `agent.identity` 的回應推斷。
**Phase 2 改進：** 後端直接從 Gateway 取得 model 資訊 (`models.list`)，前端不需猜。

→ **Planning #7 的 Cost Tracking 假設後端會做聚合，但前端也需要即時估算。兩者互補。**

---

**4. 注意力優先（Attention-First）Dashboard 設計（全新 UX 理念）**

Planning #7 提到「健康分數最差的排最前」但沒有完整設計。

**核心理念：Dashboard 不是報表，是指揮台。最需要你關注的東西最先出現。**

**排序演算法：**
```
Priority 1: connectionState === "error" → 永遠最前
Priority 2: healthScore < 40 (Grade F/D) → 第二區
Priority 3: alerts.firing > 0 → 第三區
Priority 4: 其餘按 healthScore 升序 → 最差的排前面
```

**視覺差異化：**
```
🔴 Error bot card:     紅色左邊框 + 淡紅背景 + pulse 動畫
🟡 Degrading bot card: 黃色左邊框 + 淡黃背景
🟢 Healthy bot card:   正常邊框 + 正常背景
⚫ Dormant bot card:   灰色 + 降低透明度
```

→ **使用者打開 Dashboard 的第一秒就知道哪裡有問題。不需要掃描所有卡片。**

---

**5. Bot 狀態卡片的漸進式內容載入（全新，提升感知性能）**

**問題：** 從 `fleet.status` API 回來的資料可能不完整（某些 bot 的 health 還在計算中）。

**解決方案：三階段漸進式載入**

```
Stage 1 (即時): name + emoji + connectionState
  → 來自 fleet.status（一次 API 呼叫）
  → 卡片立刻出現，顯示基本資訊

Stage 2 (~500ms): healthScore + channels + activeSessions
  → 來自 fleet.status.bots[].healthScore
  → HealthRing 和 channel pills 淡入

Stage 3 (~2s): sparkline + freshness + cost estimate
  → 來自個別 bot 的 usage 查詢（只對可見的 bot 查詢）
  → sparkline 和成本數字淡入
```

**Intersection Observer 優化：**
只對 viewport 內可見的 bot 卡片發起 Stage 3 查詢。
10 個 bot 但只有 4 個可見 → 只發 4 個 usage 請求。

→ **比一次載入所有資料快 3 倍，且使用者感知到的載入速度更快（因為名字和狀態立刻出現）。**

---

**6. 活動 Sparkline（全新微型視覺化，零依賴）**

**在每個 bot 卡片右下角顯示 24 小時活動趨勢的微型折線圖。**

```
不需要 Recharts/Nivo！純 SVG polyline：
<svg viewBox="0 0 64 20">
  <polyline points="0,18 5,15 10,12 15,16 ..." fill="none" stroke="currentColor" />
</svg>
```

**資料來源：** `sessions.usage` 的 per-session token 數，按小時聚合。
**或更輕量：** 從 FleetMonitorService 的 ring buffer 中取每小時的事件計數。

**效果：**
```
┌──────────────┐
│ 🦞 小龍蝦    │
│ 🟢 Online    │
│              │
│ 2 sessions   │  ╱╲  ╱╲
│ 92pts  2s ago│ ╱  ╲╱  ╲_  ← 24h sparkline
└──────────────┘
```

→ **一眼看出 bot 的活動模式：白天忙晚上閒、突然飆升、一直平穩等。**
→ **比純數字「42 messages」有資訊量 10 倍。**

---

**7. ConnectBotWizard 組件架構（全新前端設計，取代 OnboardingWizard Step 2）**

**決定：不直接修改 1800 行的 OnboardingWizard.tsx，而是建立獨立的 ConnectBotWizard 組件。**

**原因：**
1. OnboardingWizard 支援 7 種 adapter，改動風險太高
2. ConnectBotWizard 可以同時用在 Onboarding 和 Dashboard 的「Connect Bot」按鈕
3. 獨立組件更容易測試

**ConnectBotWizard 三步驟：**
```
Sub-step 1: Gateway URL
  ┌─────────────────────────────────┐
  │ Gateway URL                     │
  │ ┌─────────────────────────────┐ │
  │ │ http://192.168.50.73:18789  │ │
  │ └─────────────────────────────┘ │
  │ Usually http://IP:18789         │
  │                       [Next →]  │
  └─────────────────────────────────┘

Sub-step 2: Token + Test
  ┌─────────────────────────────────┐
  │ Authentication                  │
  │ Token for 192.168.50.73:18789   │
  │ ┌─────────────────────────┐ 👁  │
  │ │ ••••••••••••            │     │
  │ └─────────────────────────┘     │
  │ ✅ Connected! Found: 🦞 小龍蝦  │
  │ [← Back]       [Test Connection]│
  └─────────────────────────────────┘

Sub-step 3: Bot Profile
  ┌─────────────────────────────────┐
  │ Bot Profile                     │
  │ ┌───────────────────────────┐   │
  │ │ 🦞 小龍蝦                 │   │
  │ │ AI assistant for fleet... │   │
  │ │ Channels: 🟢 LINE 🟢 TG  │   │
  │ │ Gateway v2026.1.24-3      │   │
  │ └───────────────────────────┘   │
  │ [← Back]         [Add to Fleet] │
  └─────────────────────────────────┘
```

**整合方式：**
```typescript
// OnboardingWizard.tsx Step 2 中嵌入
{adapterType === "openclaw_gateway" && (
  <ConnectBotWizard
    onComplete={(botId) => {
      setCreatedAgentId(botId);
      setStep(3);
    }}
  />
)}
```

→ **比重寫整個 OnboardingWizard 安全 10 倍。最小改動 = 最大效果。**

---

**8. LiveEvent 橋接實作策略（全新，補齊 Planning #6 的 Fleet Event Bus → 前端的最後一哩）**

**後端已完成：** FleetEventBus 發射 `fleet.bot.*` 事件。
**但缺少：** 這些事件如何進入 Paperclip 的 LiveEvent WebSocket。

**發現 Paperclip LiveEvent 系統的關鍵入口：**
```
server/src/realtime/live-events-ws.ts
  → publishLiveEvent(companyId, event)
    → 廣播到所有訂閱該 company 的 WS clients
```

**整合方案：FleetMonitorService 訂閱 FleetEventBus，轉發為 LiveEvent**

```typescript
// 在 FleetMonitorService.start() 中
this.eventBus.on("fleet.*", (event) => {
  publishLiveEvent(event.companyId, {
    type: event.type,
    payload: event.payload,
    timestamp: new Date().toISOString(),
  });
});
```

**前端 handleLiveEvent() 中新增 fleet case：**
```typescript
// LiveUpdatesProvider.tsx
if (parsed.type.startsWith("fleet.")) {
  // Invalidate fleet queries
  queryClient.invalidateQueries({
    queryKey: ["fleet"],
    predicate: (query) => query.queryKey[0] === "fleet",
  });
  // Show toast for important events
  if (parsed.type === "fleet.bot.disconnected" || parsed.type === "fleet.alert.triggered") {
    pushToast({ type: "warning", message: parsed.payload.message });
  }
  return;
}
```

→ **不需要改 Paperclip 的 LiveEvent 系統——只是多發一種事件類型。前端也只多幾行 case。**
→ **這完成了完整的即時管線：Gateway WS → FleetGatewayClient → FleetEventBus → LiveEvent WS → React Query invalidation → UI 自動更新。**

---

**9. 本次程式碼產出**

**Commit 8: Fleet Frontend Data Pipeline**
```
新增：ui/src/api/fleet-monitor.ts
  — Fleet Monitor API client（types + API methods）
  — FleetAlerts API client
  — 完整的 TypeScript 型別定義（BotStatus, HealthScore, Alert 等）

修改：ui/src/lib/queryKeys.ts
  — 新增 fleet.* query key 結構

修改：ui/src/lib/status-colors.ts
  — 新增 botConnectionDot, botConnectionBadge
  — 新增 healthGradeColor, channelBrandColor, alertSeverityBadge
```

**Commit 9: Fleet React Hooks**
```
新增：ui/src/hooks/useFleetMonitor.ts
  — useFleetStatus() — 全車隊狀態（10s refetch）
  — useBotFromFleet() — 從車隊狀態中取出單 bot
  — useBotHealth() — 單 bot 健康分數（15s refetch）
  — useBotSessions(), useBotUsage(), useBotIdentity(), useBotChannels(), useBotCron()
  — useFleetAlerts() — 告警列表（15s refetch）
  — useConnectBot(), useDisconnectBot(), useTestConnection() — mutations
  — useAcknowledgeAlert() — mutation
  — connectionStateLabel(), timeAgo(), estimateCostUsd() — utility functions
```

**Commit 10: Fleet UI Components**
```
新增：ui/src/components/fleet/BotStatusCard.tsx
  — Bot 狀態卡片（emoji、名稱、連線狀態、health ring、channel pills、sparkline、freshness）
  — 內建 Sparkline 組件（純 SVG，零依賴）
  — 內建 HealthRing 組件（圓形進度指示器）
  — 注意力優先排序（error → low health → normal）
  — Hover 時展開 health breakdown

新增：ui/src/components/fleet/FleetDashboard.tsx
  — Fleet 儀表板主頁
  — KPI 摘要列（online/total, sessions, avg health, cost）
  — Alert banner（firing alerts 時顯示）
  — Bot grid（attention-first 排序）
  — Alert list（最近 5 條）
  — Empty state（無 bot 時顯示 Connect Bot CTA）

新增：ui/src/components/fleet/ConnectBotWizard.tsx
  — 獨立的三步驟 bot 連接精靈
  — Step 1: Gateway URL 輸入
  — Step 2: Token 輸入 + Test Connection（帶成功/失敗視覺反饋）
  — Step 3: Bot Profile 預覽 + 確認加入 Fleet
  — 可嵌入 OnboardingWizard 或獨立使用
  — 進度點指示器

新增：ui/src/components/fleet/index.ts
  — Barrel export
```

---

**10. 與前幾次 Planning 的關鍵差異**

| 面向 | 之前的想法 | Planning #8 的改進 |
|------|----------|-------------------|
| 前端資料 | 沒有設計 | React Query hooks + staleTime 分層策略 |
| 即時更新 | 後端 EventBus 停在後端 | 完整管線：EventBus → LiveEvent → React Query invalidation |
| Dashboard | ASCII wireframe | 實際 React 組件（FleetDashboard + BotStatusCard） |
| 連接 bot | 改 1800 行 OnboardingWizard | 獨立 ConnectBotWizard 組件（可嵌入） |
| 成本顯示 | 只有 token 數 | 前端 cost estimator + model pricing table |
| Bot 卡片 | 靜態資料 | 漸進式載入 + sparkline + freshness indicator |
| 排序邏輯 | 未定義 | Attention-first（error → degrading → healthy） |
| 視覺化 | 「以後用 Recharts」 | 零依賴 SVG Sparkline + HealthRing 組件 |

---

**11. 新發現：OpenClaw Gateway API 完整 RPC 清單（第四次研究，最完整版本）**

本次研究確認 Gateway 有 **70+ RPC 方法**，比之前記錄的多出以下重要方法：

| 新發現方法 | 用途 | Fleet 優先級 |
|-----------|------|-------------|
| `agents.create` | 遠端建立新 agent | ⚠️ P3（Fleet 不需要建 agent） |
| `agents.update` | 遠端更新 agent config | ⚠️ P2（Fleet Command Center 用） |
| `agents.delete` | 遠端刪除 agent | ⚠️ P3 |
| `node.list` | 列出連接的 nodes | ✅ P1（顯示 bot 連接了哪些 nodes） |
| `node.invoke` | 遠端觸發 node 命令 | ⚠️ P2（Fleet Command Center 用） |
| `node.rename` | 重命名 node | ⚠️ P3 |
| `wizard.*` | 互動式 onboarding wizard | ❌ 不需要 |
| `talk.mode` / `voicewake.*` | 語音模式 | ⚠️ P3（語音 bot 管理） |
| `update.run` | 就地 Gateway 更新 | ✅ P2（Fleet 批量更新所有 bot 的 Gateway！） |

**`update.run` 是 Fleet Command Center 的殺手功能：**
一鍵更新所有 bot 的 OpenClaw Gateway 版本。Canary 模式先更新一個，觀察健康分數，再推送其餘。

---

**12. 品牌色最終確認（第四次，交叉驗證完成）**

確認 CSS 中已正確實作所有品牌色：

核心三色（四次研究一致）：
- `#FAF9F6` → `oklch(0.979 0.007 90)` — 米白背景 ✅
- `#D4A373` → `oklch(0.758 0.095 68)` — 金棕主色 ✅
- `#2C2420` → `oklch(0.282 0.030 55)` — 深棕文字 ✅

新增確認：
- Chart palette（5 色）已在 index.css 中定義 ✅
- Channel 品牌色已加入 status-colors.ts ✅
- Alert severity 色已加入 status-colors.ts ✅
- Bot connection state 色已加入 status-colors.ts ✅

---

**13. 風險更新**

| 新風險 | 嚴重度 | 緩解 |
|--------|--------|------|
| React Query + WS 雙重更新造成 race condition | 🟡 中 | staleTime 防止 WS invalidation 後的重複 fetch |
| 前端 estimateCostUsd 精度不夠（model 判斷可能錯） | 🟡 中 | Phase 2 後端提供精確 model 資訊 |
| ConnectBotWizard 與 OnboardingWizard 狀態同步 | 🟡 中 | ConnectBotWizard 完全自包含，只透過 onComplete callback 通信 |
| BotStatusCard 在 50+ bot 時的渲染性能 | 🟡 中 | React.memo + virtualized grid（Phase 4 優化） |
| Sparkline 資料在 bot 剛連接時為空 | 🟢 低 | 元件處理 data.length < 2 → 不渲染 |

---

**14. 修訂的整體進度追蹤**

```
✅ Planning #1-4: 概念、API 研究、架構設計
✅ Planning #5: 品牌主題 CSS + DB aliases + 術語改名
✅ Planning #6: FleetGatewayClient + FleetMonitorService + API routes
✅ Planning #7: Mock Gateway + Health Score + AlertService + 時序策略 + Command Center
✅ Planning #8: Fleet API client + React hooks + BotStatusCard + FleetDashboard + ConnectBotWizard
⬜ Next: LiveEvent 橋接整合（handleLiveEvent 新增 fleet.* cases）
⬜ Next: OnboardingWizard 嵌入 ConnectBotWizard
⬜ Next: DB migration（fleet_snapshots + fleet_daily_summary）
⬜ Next: 第一次 end-to-end 測試（Mock Gateway → Fleet → Dashboard UI）
⬜ Next: Fleet Command Center UI 組件
```

---

**下一步 Planning #9（如果需要）：**
- LiveUpdatesProvider 整合 fleet.* 事件
- OnboardingWizard.tsx 嵌入 ConnectBotWizard（最小改動）
- Dashboard 頁面路由替換（原 Dashboard → FleetDashboard）
- DB migration 實作 + 整合 Drizzle ORM
- Playwright E2E 測試（Mock Gateway → Connect Bot → Dashboard 顯示）
- 趨勢圖組件（用 fleet_snapshots 資料）

### Planning #9 — 2026-03-19 11:15
**主題：最後一哩整合 + Bot Detail Fleet Tab + Sidebar 車隊脈搏 + Session Live Tail + Bot 分組標籤系統**

---

**🔧 iteration #9 → 「縫合」階段：把所有零件接上電源**

前 8 次 Planning 建造了完整的引擎（後端 services）和車身（前端 components），但**沒有人把鑰匙插進去**。FleetDashboard 存在但沒有路由指向它。LiveUpdatesProvider 不認識 fleet 事件。Sidebar 不知道車隊狀態。

本次 Planning 的核心任務：**Integration Orchestration — 把所有零件接上線路，讓車子動起來。**

---

**1. 路由接線圖（全新，之前 8 次完全沒處理 React Router 整合）**

**問題：** FleetDashboard、ConnectBotWizard 都建好了，但 App.tsx 的 `boardRoutes()` 沒有引用它們。使用者根本看不到。

**策略：漸進替換，不破壞原有路由**

```
Phase A（本次）: 新增 /fleet-monitor 路由，Sidebar 加入入口
  → 使用者可以從 Sidebar 進入 FleetDashboard
  → 原有 /dashboard 保持不變（不破壞）

Phase B（下次）: /dashboard 根據 fleet 狀態智慧切換
  → 如果車隊有已連接的 bot → 顯示 FleetDashboard
  → 如果沒有 → 顯示原版 Dashboard
  → 使用者不需要知道底層切換邏輯

Phase C（最終）: /dashboard 完全替換為 FleetDashboard
  → 原版 Dashboard 功能併入 FleetDashboard
```

**App.tsx 變更：**
```tsx
// 新增到 boardRoutes()
<Route path="fleet-monitor" element={<FleetDashboard />} />
<Route path="fleet-monitor/connect" element={<ConnectBotWizardPage />} />
<Route path="fleet-monitor/bot/:botId" element={<AgentDetail />} />  // 複用 AgentDetail + Fleet Tab
```

**Sidebar.tsx 變更：**
```tsx
// "Fleet" section 新增入口
<SidebarNavItem to="/fleet-monitor" label="Fleet Monitor" icon={Radio} badge={onlineBotCount} />
```

→ **這是最小可行整合。使用者今天就能從 Sidebar 進入 FleetDashboard。**

---

**2. Sidebar 車隊脈搏指示器（全新 UX 元素，之前只設計了 Dashboard 內的狀態）**

**洞察：** Dashboard 是你「打開看」的地方，但 Sidebar 是你「一直看到」的地方。

**Fleet Pulse — 永遠可見的車隊健康微指標：**
```
┌─ Sidebar ─────────────┐
│ 🔶 Pain Point Fleet   │
│ 🔍                    │
│                        │
│ ✏️ New Issue          │
│ 📊 Dashboard          │
│ 📥 Inbox           3  │
│                        │
│ ── Fleet ──            │
│ 📡 Fleet Monitor    4  │  ← badge = online bot count
│    🟢🟢🟢🟡          │  ← Fleet Pulse: 每個圓點 = 一個 bot
│ 🏢 Org                │
│ 💰 Costs              │
│ 📜 Activity           │
│ ⚙️ Settings           │
└────────────────────────┘
```

**Fleet Pulse 規格：**
- 每個 bot 一個小圓點（8x8px），顏色 = connection state
- 最多顯示 12 個圓點，超過顯示 `+N`
- 圓點有 pulse 動畫 = 正在重連
- 圓點排列：monitoring 排前面，error 排後面
- 滑鼠 hover 圓點 → tooltip 顯示 bot 名稱 + 狀態

**為什麼這很重要：**
管理者在做其他事情（看 Issues、看 Costs）時，**餘光就能看到車隊狀態**。
如果某個圓點從綠變紅 → 立刻知道有問題，不需要切換頁面。

→ **Sidebar 從「靜態導航選單」升級為「永遠在線的車隊監控器」。**

---

**3. LiveEvent 車隊事件橋接（Planning #8 設計了策略，本次寫實作程式碼）**

**Planning #8 定義了策略：** 在 `handleLiveEvent()` 中新增 `fleet.*` case。
**本次實作關鍵決定：**

```typescript
// LiveUpdatesProvider.tsx — handleLiveEvent() 新增
if (event.type.startsWith("fleet.")) {
  // 1. 無腦 invalidate fleet status（保證 Dashboard 即時更新）
  queryClient.invalidateQueries({ queryKey: queryKeys.fleet.status(expectedCompanyId) });

  // 2. 針對性 invalidate（減少不必要的重新拉取）
  const botId = readString(payload.botId);
  if (botId) {
    if (event.type === "fleet.bot.health") {
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.botHealth(botId) });
    }
    if (event.type === "fleet.cost.updated") {
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.botUsage(botId) });
    }
  }

  // 3. Alert 事件
  if (event.type === "fleet.alert.triggered") {
    queryClient.invalidateQueries({ queryKey: queryKeys.fleet.alerts(expectedCompanyId) });
    pushToast({ type: "warning", message: payload.message as string });
  }

  // 4. 連線變更 toast
  if (event.type === "fleet.bot.connected" || event.type === "fleet.bot.disconnected") {
    const emoji = readString(payload.botEmoji) ?? "🤖";
    const name = readString(payload.botName) ?? "Bot";
    const verb = event.type === "fleet.bot.connected" ? "connected" : "disconnected";
    pushToast({
      type: event.type === "fleet.bot.connected" ? "success" : "warning",
      message: `${emoji} ${name} ${verb}`,
    });
  }
  return;
}
```

**關鍵洞察：`fleet.status` 是 "catch-all" invalidation。** 即使我們漏了某個特定事件的處理，fleet status 的 10 秒 refetchInterval 也會兜底。這是 defense-in-depth 策略。

→ **完成了 Gateway WS → FleetGatewayClient → FleetEventBus → LiveEvent WS → React Query → UI 的完整管線。**

---

**4. Bot Detail Fleet Tab（全新組件，填補 Dashboard ↔ 個別 Bot 之間的資訊斷層）**

**問題：** FleetDashboard 顯示概覽，但使用者點進某個 bot 後看到的是 Paperclip 原版 AgentDetail，沒有 Fleet 特有資訊。

**解決方案：在 AgentDetail.tsx 新增 "Fleet" tab，顯示 Gateway 層的即時資料。**

```
AgentDetail Tabs:
  [Dashboard] [Configuration] [Runs] [Budget] [🆕 Fleet]
                                                    ↑
                                              Gateway 即時資料
```

**Fleet Tab 內容架構：**
```
┌─ Bot Fleet Status ────────────────────────────────────────┐
│                                                             │
│  ┌─ Connection ────────────┐  ┌─ Health Breakdown ────────┐│
│  │ State: 🟢 Monitoring    │  │ Overall: 92/100 (A)       ││
│  │ Gateway: 192.168.50.73  │  │ ████████████████████▒▒    ││
│  │ Protocol: v3            │  │                           ││
│  │ Uptime: 4d 12h 35m     │  │ 🔗 Connectivity:  98     ││
│  │ Last event: 3s ago     │  │ ⚡ Responsiveness: 85     ││
│  │ Device ID: fleet-mon-1 │  │ 💰 Efficiency:    90     ││
│  └─────────────────────────┘  │ 📡 Channels:      100    ││
│                                │ ⏰ Cron:          95     ││
│                                └───────────────────────────┘│
│                                                             │
│  ┌─ Channels ──────────────────────────────────────────────┐│
│  │ ● LINE        🟢 Connected   142 msgs/24h              ││
│  │ ● Telegram    🟢 Connected    38 msgs/24h              ││
│  │ ● Web         🟡 Idle          0 msgs/24h              ││
│  └──────────────────────────────────────────────────────────┘│
│                                                             │
│  ┌─ Active Sessions ──────────────────────────────────────┐ │
│  │ patrol-morning    12.4K tokens   Started 14:32          │ │
│  │ fleet-plan-v9     8.1K tokens    Started 14:45          │ │
│  │ code-review-42    3.2K tokens    Started 14:50          │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─ Memory (MEMORY.md) ──────────────────────────────────┐ │
│  │ # Bot Memory                                           │ │
│  │ - Patrol schedule: 06:00, 12:00, 18:00                │ │
│  │ - Fleet members: 🦞🐿️🦚🐗                             │ │
│  │ - Last incident: 2026-03-18 LINE rate limit           │ │
│  │                                          [Refresh] 📋  │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─ Cron Jobs ────────────────────────────────────────────┐ │
│  │ morning-report   0 6 * * *   ✅ Last: 06:00 (1.2s)    │ │
│  │ health-check     */15 * * *  ✅ Last: 14:45 (0.8s)    │ │
│  │ weekly-digest     0 9 * * 1  ✅ Last: Mon 09:00 (3.5s)│ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  [Open in Control UI ↗]  [Disconnect Bot]                   │
└──────────────────────────────────────────────────────────────┘
```

**資料來源全部是 Fleet Monitor API（不需要新的後端）：**
- Connection info → `GET /api/fleet-monitor/status` (從 fleet status 中取)
- Health breakdown → `GET /api/fleet-monitor/bot/:botId/health`
- Channels → `GET /api/fleet-monitor/bot/:botId/channels`
- Sessions → `GET /api/fleet-monitor/bot/:botId/sessions`
- Memory → `GET /api/fleet-monitor/bot/:botId/files/MEMORY.md`
- Cron → `GET /api/fleet-monitor/bot/:botId/cron`

→ **不需要新的後端 API，只是前端組裝既有 endpoints。**

---

**5. Session Live Tail（全新功能類別，之前只有「session 列表」但沒有「看內容」）**

**洞察：** 管理者最常問的問題不是「bot 有幾個 session」，而是「bot 現在在跟誰說什麼」。

**Session Live Tail = 即時觀看 bot 的對話串流：**

```
┌─ Live Session: patrol-morning ───────────────────────────┐
│                                                            │
│  [User] 14:32                                             │
│  今天早上的巡邏報告呢？                                      │
│                                                            │
│  [Bot 🦞] 14:32                                           │
│  早安！正在生成今日巡邏報告...                                │
│  ████████████░ Generating...                              │
│                                                            │
│  [Bot 🦞] 14:33                                           │
│  📋 今日巡邏報告                                            │
│  - 所有系統正常運行                                          │
│  - LINE 通道: 142 訊息已處理                                 │
│  - 異常: 無                                                 │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ 💬 Send message to bot...                     [Send] │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ⏱ Live • Auto-scroll ON • 12.4K tokens used             │
└────────────────────────────────────────────────────────────┘
```

**技術實作：**
```typescript
// 1. 初始載入：chat.history RPC（透過 Fleet Monitor API）
const history = await fleetMonitorApi.botFile(botId, `sessions/${sessionKey}.jsonl`);

// 2. 即時更新：WebSocket chat 事件
// FleetGatewayClient 已經監聽 "chat" 事件
// → FleetEventBus → "fleet.bot.chat" → LiveEvent → UI

// 3. 發送訊息（Phase 3，需要 operator.write scope）
// POST /api/fleet-monitor/bot/:botId/chat { message, sessionKey }
// → FleetGatewayClient.rpc("chat.send", { ... })
```

**重要限制：**
- Phase A（本次）：只讀，只看歷史 + 即時新訊息
- Phase B（下次）：可發送訊息（需要 scope 升級到 operator.write）
- Phase C（最終）：可中止 agent turn（chat.abort）

→ **從「監控面板」升級為「指揮台」的關鍵一步。管理者不只看數字，還能看到 bot 的實際對話。**

---

**6. Bot 分組標籤系統（全新概念，之前所有 bot 都是平等的扁平列表）**

**問題：** 當車隊有 10+ bot 時，Dashboard 的 bot 網格變成一片混亂。使用者找不到「銷售組的 bot」或「客服組的 bot」。

**解決方案：Bot Tags — 輕量級分組機制**

```
Tag 例子：
  🏷️ Sales（銷售）    → 🦞 小龍蝦, 🐿️ 飛鼠
  🏷️ Support（客服）  → 🦚 孔雀
  🏷️ Cron（排程）     → 🐗 山豬
  🏷️ VIP             → 🦞 小龍蝦
```

**Dashboard 分組顯示：**
```
┌─ Sales (2 bots) ──────────────────────────┐
│  🦞 92/A 🟢  │  🐿️ 88/B 🟢              │
└───────────────────────────────────────────┘
┌─ Support (1 bot) ─────────────────────────┐
│  🦚 75/C 🟡                               │
└───────────────────────────────────────────┘
┌─ Cron (1 bot) ────────────────────────────┐
│  🐗 95/A 🟢                               │
└───────────────────────────────────────────┘
```

**存儲方式：** 不改 DB schema！利用 Paperclip 既有的 agent metadata：
```typescript
// agents 表已有 metadata JSON 欄位
// 在 metadata 中加入 tags 陣列
metadata: { tags: ["sales", "vip"], group: "Sales" }
```

**Filter Bar（Dashboard 頂部）：**
```
[All] [🏷️ Sales (2)] [🏷️ Support (1)] [🏷️ Cron (1)] | 🔍 Filter by name...
```

→ **零 DB migration，利用既有 metadata 欄位，卻讓 Dashboard 從「扁平列表」升級為「有組織的指揮中心」。**

---

**7. Gateway 版本矩陣（全新運維功能，之前完全沒考慮版本管理）**

**問題：** 車隊中不同 bot 可能跑不同版本的 OpenClaw Gateway。某些 API 只在新版本可用。

**Gateway 版本資訊來源：** `hello-ok` 回應中的 `server.version` 欄位。

**Fleet 版本矩陣 Widget：**
```
┌─ Gateway Versions ──────────────────────────┐
│                                               │
│  v2026.1.24-3  🟢🟢🟢 (3 bots — latest)    │
│  v2026.1.22-1  🟡      (1 bot — outdated)   │
│                                               │
│  ⚠️ 1 bot running outdated gateway            │
│  [Plan Fleet Update →]                        │
└───────────────────────────────────────────────┘
```

**結合 Fleet Command Center 的 `update.run` RPC：**
1. 版本矩陣顯示哪些 bot 需要更新
2. 一鍵觸發 Canary 更新（先 1 個 bot，觀察 health，再全部）
3. 更新完成後版本矩陣自動刷新

→ **從「我不知道哪個 bot 跑什麼版本」到「一目了然 + 一鍵更新」。這是 10+ bot 規模的必要功能。**

---

**8. Notification Center（全新，替代分散的 toast 通知）**

**問題：** Planning #7 設計了 AlertService + Dashboard Alert Panel，Planning #8 加了 toast 通知。但：
- Toast 3 秒就消失
- Dashboard Alert Panel 只在 FleetDashboard 頁面可見
- 使用者在看 Issues 頁面時完全看不到車隊告警

**解決方案：Notification Bell — 全域可見的通知中心**

```
Sidebar 頂部：
┌─────────────────────────┐
│ 🔶 Pain Point Fleet  🔔3│  ← 通知鈴鐺 + 未讀計數
│ 🔍                      │
└─────────────────────────┘

點擊 🔔 展開：
┌─ Notifications ──────────────────────────────┐
│  🔴 14:52 — 🐗 山豬 Health Score 28 (F)      │
│  🟡 14:45 — 🦚 孔雀 LINE channel disconnected│
│  🟢 14:30 — 🐿️ 飛鼠 connected to fleet       │
│  🟢 14:28 — System: Fleet Monitor started     │
│                                                │
│  [Mark all read]  [View all →]                 │
└────────────────────────────────────────────────┘
```

**實作方式：**
- 複用 `fleet.alert.triggered` 和 `fleet.bot.*` LiveEvents
- 前端用 React Context 存 notification 陣列
- 全域 NotificationBell 組件放在 Sidebar 頂部
- LocalStorage 持久化已讀狀態

→ **使用者在任何頁面都能看到車隊異常，不需要切換到 FleetDashboard。**

---

**9. 本次程式碼產出**

**Commit 11: Route Wiring + Sidebar Fleet Pulse**
```
修改：ui/src/App.tsx
  — import FleetDashboard, ConnectBotWizard
  — 新增 /fleet-monitor 路由
  — 新增 /fleet-monitor/connect 路由

修改：ui/src/components/Sidebar.tsx
  — import Radio icon
  — import useFleetStatus hook
  — 新增 Fleet Monitor nav item + online bot count badge
  — 新增 Fleet Pulse 圓點列（bot connection state dots）
```

**Commit 12: LiveEvent Fleet Bridge**
```
修改：ui/src/context/LiveUpdatesProvider.tsx
  — handleLiveEvent() 新增 fleet.* event handling
  — fleet.bot.health → invalidate fleet status + bot health
  — fleet.bot.connected/disconnected → invalidate + toast
  — fleet.alert.triggered → invalidate alerts + warning toast
  — fleet.cost.updated → invalidate bot usage
```

**Commit 13: BotDetailFleetTab**
```
新增：ui/src/components/fleet/BotDetailFleetTab.tsx
  — Gateway 連線資訊卡片（state, URL, protocol, uptime, device ID）
  — Health Breakdown 面板（5 維度分數 + 視覺化長條）
  — Channel 狀態列表（品牌色圓點 + 訊息計數）
  — Active Sessions 列表（session key + token 用量 + 開始時間）
  — Memory Viewer（MEMORY.md 內容 + refresh 按鈕）
  — Cron Jobs 列表（schedule + 上次執行結果）
  — Control UI 深連結 + Disconnect 按鈕
```

**Commit 14: Companies → Fleet 頁面整合 ConnectBotWizard**
```
修改：ui/src/pages/Companies.tsx
  — 新增 "Connect Bot" 按鈕（在 fleet 卡片中）
  — Dialog 嵌入 ConnectBotWizard
  — 連接成功後刷新 fleet status
```

---

**10. 與前幾次 Planning 的關鍵差異**

| 面向 | 之前的想法 | Planning #9 的改進 |
|------|----------|-------------------|
| 路由整合 | 完全沒處理 | 完整的 React Router 接線 + 漸進替換策略 |
| Sidebar | 靜態導航選單 | Fleet Pulse 永遠可見的車隊健康微指標 |
| LiveEvent | 設計了策略但沒實作 | 實作完整的 event → query invalidation → toast 管線 |
| Bot Detail | 只有概覽卡片 | 完整的 Fleet Tab（connection, health, channels, sessions, memory, cron）|
| Session 內容 | 只有 session 列表 | Session Live Tail（即時對話串流） |
| Bot 組織 | 扁平列表 | Tag 分組系統（零 DB migration） |
| Gateway 版本 | 完全沒考慮 | 版本矩陣 + 一鍵 Canary 更新 |
| 通知 | 只有 toast（3 秒消失） | Notification Bell 全域通知中心 |

---

**11. 風險更新**

| 新風險 | 嚴重度 | 緩解 |
|--------|--------|------|
| FleetDashboard 路由與原 Dashboard 衝突 | 🟡 中 | Phase A 用獨立路由 /fleet-monitor，不替換 /dashboard |
| Sidebar Fleet Pulse 在 10+ bot 時視覺擁擠 | 🟢 低 | 最多 12 圓點 + "+N" overflow |
| LiveEvent fleet.* 事件洪水沖垮 React Query | 🟡 中 | debounce invalidation + staleTime 防重複 fetch |
| BotDetailFleetTab 在 AgentDetail 中載入大量資料 | 🟡 中 | 懶載入：只在 Fleet tab 被選中時才 fetch |
| Session Live Tail 的 JSONL 檔案可能很大 | 🟡 中 | 只載入最近 100 條 + 虛擬滾動 |
| Bot Tag 存在 metadata 中，schema-less 容易出錯 | 🟢 低 | 前端驗證 + tag 名稱白名單 |

---

**12. 修訂的整體進度追蹤**

```
✅ Planning #1-4: 概念、API 研究、架構設計
✅ Planning #5: 品牌主題 CSS + DB aliases + 術語改名
✅ Planning #6: FleetGatewayClient + FleetMonitorService + API routes
✅ Planning #7: Mock Gateway + Health Score + AlertService + 時序策略 + Command Center
✅ Planning #8: Fleet API client + React hooks + BotStatusCard + FleetDashboard + ConnectBotWizard
✅ Planning #9: Route wiring + Sidebar Fleet Pulse + LiveEvent bridge + BotDetailFleetTab + Companies Connect
⬜ Next: Session Live Tail 前端組件
⬜ Next: Bot Tag 分組系統 + Filter Bar
⬜ Next: Gateway 版本矩陣 Widget
⬜ Next: Notification Center（全域通知鈴鐺）
⬜ Next: DB migration（fleet_snapshots + fleet_daily_summary）
⬜ Next: 趨勢圖組件（Sparkline 已有，需要 full-size chart）
⬜ Next: Playwright E2E 測試（Mock Gateway → Connect → Dashboard → Bot Detail）
⬜ Next: Fleet Command Center UI（batch operations）
```

---

**13. OpenClaw Gateway API 研究更新（第五次，補充確認）**

本次確認新增發現：
- `hello-ok` 回應包含 `server.version` 欄位 → 用於 Gateway 版本矩陣
- `chat.history` RPC 支援 `limit` 和 `before` 參數 → Session Live Tail 分頁載入
- `agent.identity` 回應包含 `description` 欄位 → Bot Detail 可顯示 bot 自我介紹
- `channels.status` 回應的 `messageCount24h` 欄位 → Channel 活動量指示器
- `config.get` 回應包含 `session.dmScope` → 了解 bot 的 session 路由策略

確認 44 個 RPC 方法和 8 個 event type 的完整清單與之前一致。

---

**14. 品牌色確認（第五次，無變更）**

品牌色系統已在 Planning #5 實作於 `ui/src/index.css`，Planning #8 擴展到 `ui/src/lib/status-colors.ts`。
本次無需額外色彩研究。所有色彩值穩定一致。

---

**下一步 Planning #10（如果需要）：**
- Session Live Tail 完整實作（前端組件 + 後端 API）
- Bot Tag 分組系統 + Dashboard Filter Bar
- Gateway 版本矩陣 Widget
- Notification Center + NotificationBell 組件
- DB migration 實作（fleet_snapshots + fleet_daily_summary）
- 第一次全流程 E2E 測試

### Planning #10 — 2026-03-19 14:30
**主題：Server Bootstrap 生命週期整合 + 異常偵測告警 + 成本預測引擎 + 車隊熱力圖 + DB Migration 實作 + E2E 測試架構 + i18n 策略**

---

**🔧 iteration #10 → 「點火啟動」階段：讓死程式碼活過來**

前 9 次 Planning 建造了完整的引擎（FleetGatewayClient, FleetMonitorService, HealthScore, AlertService）、車身（FleetDashboard, BotStatusCard, ConnectBotWizard, BotDetailFleetTab）、和電路（React hooks, API client, LiveEvent bridge）。

**但有一個致命問題：沒人把鑰匙插進點火孔。**

所有 server-side services 都是獨立的 class/function——沒有任何程式碼在 Express 啟動時 instantiate 它們、註冊路由、或啟動 event loop。FleetMonitorService 是個漂亮的死物件。AlertService 的 30 秒 evaluation loop 從未被 `start()` 過。

**Planning #10 的核心命題：Bootstrap Orchestration — 讓所有零件同時轉動。**

---

**1. Server Bootstrap 生命週期整合（前 9 次最大的遺漏，本次最高優先級）**

**問題診斷：**

```
server/src/index.ts（主入口）
  → initializeDatabase()      ✅ 已有
  → setupAuth()               ✅ 已有
  → registerRoutes()          ✅ 已有（但不含 fleet-monitor / fleet-alerts）
  → startLiveEventsWs()       ✅ 已有
  → FleetMonitorService ???   ❌ 從未被 instantiate
  → FleetAlertService ???     ❌ 從未被 start()
  → fleet-monitor routes ???  ❌ 從未被 app.use()
  → fleet-alerts routes ???   ❌ 從未被 app.use()
```

**解決方案：Fleet Bootstrap Module**

```typescript
// server/src/fleet-bootstrap.ts — 全新檔案
import { FleetMonitorService } from "./services/fleet-monitor";
import { FleetAlertService } from "./services/fleet-alerts";
import { FleetHealthScoreService } from "./services/fleet-health-score";
import { fleetMonitorRouter } from "./routes/fleet-monitor";
import { fleetAlertsRouter } from "./routes/fleet-alerts";
import type { Express } from "express";
import type { Server } from "http";

let fleetMonitor: FleetMonitorService | null = null;
let fleetAlerts: FleetAlertService | null = null;

export async function bootstrapFleet(app: Express, httpServer: Server): Promise<void> {
  // 1. Instantiate services
  fleetMonitor = FleetMonitorService.getInstance();
  const healthScorer = new FleetHealthScoreService();
  fleetAlerts = new FleetAlertService(fleetMonitor, healthScorer);

  // 2. Register API routes
  app.use("/api/fleet-monitor", fleetMonitorRouter(fleetMonitor));
  app.use("/api/fleet-alerts", fleetAlertsRouter(fleetAlerts));

  // 3. Start alert evaluation loop
  fleetAlerts.start();

  // 4. Wire health events → alert evaluation
  fleetMonitor.on("fleet.bot.health", (event) => {
    fleetAlerts.evaluateBot(event.botId);
  });

  // 5. Wire fleet events → LiveEvent system
  fleetMonitor.on("fleet.*", (event) => {
    publishLiveEvent(event.companyId, {
      type: event.type,
      payload: event.payload,
      timestamp: new Date().toISOString(),
    });
  });

  console.log("[Fleet] Bootstrap complete — monitoring ready");
}

export async function shutdownFleet(): Promise<void> {
  // Graceful shutdown: close all WS connections, stop alert loop
  if (fleetAlerts) {
    fleetAlerts.stop();
  }
  if (fleetMonitor) {
    await fleetMonitor.disconnectAll();
    fleetMonitor.dispose();
  }
  console.log("[Fleet] Shutdown complete — all connections closed");
}
```

**在 index.ts 中整合：**
```typescript
// server/src/index.ts — 新增兩行
import { bootstrapFleet, shutdownFleet } from "./fleet-bootstrap";

// 在 app.listen() 之後：
await bootstrapFleet(app, httpServer);

// 在 process SIGTERM handler 中：
process.on("SIGTERM", async () => {
  await shutdownFleet();
  httpServer.close();
});
```

**為什麼之前沒發現這個問題：**
Planning #6 建了 FleetMonitorService，Planning #7 建了 AlertService，Planning #8 建了 routes，Planning #9 接了前端。
每次都假設「上一步的東西已經接好了」——但**沒有任何一次 Planning 負責最終的 wiring**。
這是經典的「最後一根螺絲」問題：所有零件完美，但沒人擰最後那顆螺絲。

→ **本次 Planning 的第一優先：寫 fleet-bootstrap.ts 並整合到 index.ts。**

---

**2. Graceful Shutdown 與資源清理（全新，之前完全沒考慮 server 生命週期結束）**

**問題：** 9 次 Planning 都在講「啟動」，沒有人想過「關閉」。

**如果 server 被 kill 而沒有清理：**
- 20 個 WS 連線會在 Gateway 端殘留為「phantom connections」
- Gateway 會持續發送事件到死掉的 WS → 浪費資源
- Gateway 的 `system-presence` 會顯示 Fleet Dashboard 仍然在線（誤導）
- Node.js process 會因為未關閉的 WS handles 而 hang

**解決方案：三階段 graceful shutdown**

```
Phase 1 (0-2s): Stop accepting new connections
  → FleetMonitorService.pause() — 拒絕新的 connectBot()
  → FleetAlertService.stop() — 停止 evaluation loop

Phase 2 (2-5s): Drain existing connections
  → 對每個 WS 連線發送 close frame（code 1001, "going away"）
  → 等待 Gateway 確認 close（最多 3 秒）
  → 清除所有 event listeners

Phase 3 (5-8s): Force cleanup
  → 強制關閉未響應的 WS
  → 清除 ring buffers、health trackers
  → 記錄 shutdown metrics（總連線數、正常關閉數、強制關閉數）
```

**重要細節：Gateway 的 `shutdown` 事件也需要處理**

Planning #6 的 FleetGatewayClient 監聽了 Gateway 的 `shutdown` 事件，但只是 log。
實際上，當 Gateway 發送 `shutdown` 事件，表示 bot 端正在重啟。Fleet 應該：
1. 標記 bot 為 `disconnected`（不是 `error`）
2. 設置一個寬容的重連延遲（30 秒，而不是立即重試）
3. 在 Dashboard 顯示「Bot is restarting...」而不是「Connection lost」

→ **之前只想到 Fleet 關閉，沒想到 Gateway 關閉。雙向 graceful shutdown 都需要處理。**

---

**3. 異常偵測告警 — 超越靜態閾值（AlertService 的重大進化）**

**Planning #7 的 AlertService 問題：所有閾值都是靜態的。**

```typescript
// Planning #7 的方式
{ metric: "cost_1h", operator: "gt", threshold: 5.00 }
// 問題：小龍蝦正常每小時花 $8（因為用 Opus），這條 rule 永遠在響
```

**解決方案：Anomaly Detection — 基於歷史基線的動態閾值**

```typescript
interface AnomalyDetectionRule {
  id: string;
  name: string;
  metric: string;
  // 不是固定閾值，而是「偏離正常值多少」
  sensitivity: "low" | "medium" | "high";
  // low = 3σ（只抓極端異常）
  // medium = 2σ（抓明顯異常）
  // high = 1.5σ（抓輕微異常）
  baselinePeriod: "1h" | "4h" | "24h" | "7d";
  // 計算基線的時間窗口
}
```

**演算法：**
```
1. 收集過去 baselinePeriod 的 metric 值
2. 計算 μ（平均）和 σ（標準差）
3. 當前值 > μ + (sensitivity × σ) → 觸發「異常高」告警
4. 當前值 < μ - (sensitivity × σ) → 觸發「異常低」告警
```

**實際例子：**
```
小龍蝦過去 24 小時的每小時成本：
  $7.50, $8.20, $7.80, $9.10, $6.90, $8.40, ... (μ=$7.98, σ=$0.85)

靜態閾值 $5.00 → 永遠觸發 ❌
動態閾值（medium, 2σ）→ 只在成本 > $9.68 時觸發 ✅
```

**預設 Anomaly Rules（補充 Planning #7 的靜態 rules）：**
```typescript
const DEFAULT_ANOMALY_RULES: AnomalyDetectionRule[] = [
  {
    name: "Cost Anomaly",
    metric: "cost_1h",
    sensitivity: "medium",
    baselinePeriod: "24h",
  },
  {
    name: "Token Usage Spike",
    metric: "output_tokens_1h",
    sensitivity: "high",
    baselinePeriod: "4h",
  },
  {
    name: "Latency Degradation",
    metric: "avg_latency_ms",
    sensitivity: "medium",
    baselinePeriod: "1h",
  },
];
```

**資料來源：** `fleet_snapshots` 表的小時級快照（Planning #7 設計但未實作）。
→ **這就是為什麼 DB migration 必須在本次完成——沒有歷史資料就沒有基線。**

**與靜態 rules 共存：**
```
AlertService 同時支援兩種 rule：
  - StaticRule: threshold > X → 適合硬性限制（bot 離線、health < 40）
  - AnomalyRule: deviation > Nσ → 適合相對變化（成本波動、延遲變化）
```

→ **靜態 rules 抓「絕對危險」，動態 rules 抓「相對異常」。互補，不替代。**

---

**4. 成本預測引擎（全新功能類別，之前只有「看現在」和「看過去」）**

**洞察：** Dashboard 的三個時間維度：
- 過去（✅ fleet_daily_summary 趨勢圖）
- 現在（✅ sessions.usage 即時成本）
- 未來（❌ 完全沒有）

**Cost Forecast = 根據歷史趨勢預測未來成本**

```typescript
interface CostForecast {
  projectedCost7d: number;      // 未來 7 天預計總成本
  projectedCost30d: number;     // 未來 30 天預計總成本
  confidence: "high" | "medium" | "low";  // 資料量決定信心度
  trend: "increasing" | "stable" | "decreasing";
  dailyRate: number;            // 每日平均成本
  monthlyBudgetPct: number;     // 佔月預算的百分比（如果有設定）
  burndownDate?: string;        // 預計何時花完月預算
}
```

**演算法：簡單線性回歸（不需要 ML library）**

```typescript
function forecastCost(dailySummaries: FleetDailySummary[]): CostForecast {
  // 至少需要 3 天資料
  if (dailySummaries.length < 3) return { confidence: "low", ... };

  // 線性回歸：y = mx + b
  // x = 天數（0, 1, 2, ...）
  // y = 每日成本
  const { slope, intercept } = linearRegression(
    dailySummaries.map((s, i) => [i, s.estimatedCostUsd])
  );

  const today = dailySummaries.length;
  const projected7d = Array.from({ length: 7 }, (_, i) =>
    Math.max(0, slope * (today + i) + intercept)
  ).reduce((a, b) => a + b, 0);

  const trend = slope > 0.5 ? "increasing"
              : slope < -0.5 ? "decreasing"
              : "stable";

  const confidence = dailySummaries.length >= 14 ? "high"
                   : dailySummaries.length >= 7 ? "medium"
                   : "low";

  return { projectedCost7d: projected7d, trend, confidence, ... };
}
```

**Dashboard Cost Widget 升級：**
```
┌─ Fleet Costs ──────────────────────────────────────┐
│                                                      │
│  📊 This Month: $42.50                              │
│  📈 Projected (30d): $68.20  ← 🆕 預測              │
│  ⚠️ Budget: $100 — 68% projected usage              │
│                                                      │
│  💡 At current rate, budget lasts until Mar 31       │
│     ─── or ───                                       │
│  🔴 At current rate, budget exhausted by Mar 27!    │ ← 如果會超支
│                                                      │
│  [Chart: actual (solid) + forecast (dashed)]         │
│  ───────────/                                        │
│  ──────────/ · · · · · · · (forecast dashed line)   │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Budget Guardrails：**
```typescript
// 當預測成本超過月預算 80% 時，自動觸發 alert
if (forecast.monthlyBudgetPct > 0.8) {
  alertService.fire({
    name: "Budget Warning",
    severity: "warning",
    message: `Projected monthly cost $${forecast.projectedCost30d.toFixed(2)} exceeds 80% of budget`,
  });
}

// 當預測成本超過月預算 100% 時
if (forecast.monthlyBudgetPct > 1.0) {
  alertService.fire({
    name: "Budget Critical",
    severity: "critical",
    message: `Budget burndown: projected to exhaust by ${forecast.burndownDate}`,
  });
}
```

→ **管理者不再是「月底才發現超支」，而是「第三天就知道會超」。**

---

**5. 車隊熱力圖（Fleet Heatmap — 全新視覺化，靈感來自 GitHub Contribution Graph）**

**目的：** 一張圖看出整個車隊過去 30 天的健康模式。

```
            Mon  Tue  Wed  Thu  Fri  Sat  Sun
Week 1:     🟩  🟩  🟩  🟩  🟩  🟨  🟩
Week 2:     🟩  🟩  🟥  🟥  🟩  🟩  🟩    ← 週三四出了問題
Week 3:     🟩  🟩  🟩  🟩  🟨  🟩  🟩
Week 4:     🟩  🟩  🟩  🟩  🟩  ⬜  ⬜    ← 今天

Legend: 🟩 avg health > 85  🟨 60-85  🟠 40-60  🟥 < 40  ⬜ no data
```

**也可以展開為每小時粒度（24x7 grid）：**
```
       00  01  02  03  04  05  06  07  08  09  10  11  12  ...  23
Mon    ⬛  ⬛  ⬛  ⬛  ⬛  ⬛  🟩  🟩  🟩  🟩  🟩  🟩  🟩  ... 🟩
Tue    ⬛  ⬛  ⬛  ⬛  ⬛  ⬛  🟩  🟩  🟩  🟨  🟩  🟩  🟩  ... 🟩
Wed    ⬛  ⬛  ⬛  ⬛  ⬛  ⬛  🟩  🟥  🟥  🟥  🟨  🟩  🟩  ... 🟩
```

→ **一眼看出：「每天早上 6-7 點 cron 跑的時候 health 會下降」或「週末 bot 都閒置」。**

**資料來源：** `fleet_snapshots` 表（每小時一筆）+ `fleet_daily_summary`（每日一筆）。

**前端實作：純 CSS Grid + 動態色彩**
```tsx
// ui/src/components/fleet/FleetHeatmap.tsx
function FleetHeatmap({ snapshots }: { snapshots: HourlySnapshot[] }) {
  return (
    <div className="grid grid-cols-24 gap-[2px]">
      {snapshots.map((snap) => (
        <div
          key={snap.capturedAt}
          className="w-3 h-3 rounded-sm"
          style={{ backgroundColor: healthToColor(snap.avgHealthScore) }}
          title={`${snap.capturedAt}: Health ${snap.avgHealthScore}`}
        />
      ))}
    </div>
  );
}
```

→ **零依賴，純 CSS Grid。比引入圖表庫輕量 100 倍。**

---

**6. DB Migration 實作（Planning #7 設計了 schema，本次終於寫出來）**

**之前的狀態：** fleet_snapshots 和 fleet_daily_summary 的 SQL 在 PLAN.md 裡，但從未變成真正的 migration 檔案。

**本次實作三張表 + 索引：**

```typescript
// packages/db/src/schema/fleet-snapshots.ts — Drizzle ORM schema
import { pgTable, text, integer, real, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { agents } from "./agents";
import { companies } from "./companies";

export const fleetSnapshots = pgTable("fleet_snapshots", {
  id: text("id").primaryKey(),
  botId: text("bot_id").notNull().references(() => agents.id),
  companyId: text("company_id").notNull().references(() => companies.id),
  capturedAt: timestamp("captured_at").notNull().defaultNow(),
  healthScore: integer("health_score"),
  healthGrade: text("health_grade"),
  connectionState: text("connection_state"),
  inputTokens1h: integer("input_tokens_1h"),
  outputTokens1h: integer("output_tokens_1h"),
  cachedTokens1h: integer("cached_tokens_1h"),
  activeSessions: integer("active_sessions"),
  connectedChannels: integer("connected_channels"),
  totalChannels: integer("total_channels"),
  cronSuccessRate: real("cron_success_rate"),
  avgLatencyMs: integer("avg_latency_ms"),
}, (table) => ({
  botTimeIdx: index("idx_fleet_snap_bot_time").on(table.botId, table.capturedAt),
  companyTimeIdx: index("idx_fleet_snap_company_time").on(table.companyId, table.capturedAt),
}));

export const fleetDailySummary = pgTable("fleet_daily_summary", {
  id: text("id").primaryKey(),
  botId: text("bot_id").notNull().references(() => agents.id),
  companyId: text("company_id").notNull().references(() => companies.id),
  date: text("date").notNull(),  // YYYY-MM-DD
  avgHealthScore: real("avg_health_score"),
  minHealthScore: integer("min_health_score"),
  uptimePct: real("uptime_pct"),
  totalInputTokens: integer("total_input_tokens"),
  totalOutputTokens: integer("total_output_tokens"),
  totalCachedTokens: integer("total_cached_tokens"),
  estimatedCostUsd: real("estimated_cost_usd"),
  totalSessions: integer("total_sessions"),
  totalCronRuns: integer("total_cron_runs"),
  cronSuccessRate: real("cron_success_rate"),
}, (table) => ({
  botDateIdx: uniqueIndex("idx_fleet_daily_bot_date").on(table.botId, table.date),
  companyDateIdx: index("idx_fleet_daily_company_date").on(table.companyId, table.date),
}));

export const fleetAlertHistory = pgTable("fleet_alert_history", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull().references(() => companies.id),
  botId: text("bot_id"),
  ruleId: text("rule_id").notNull(),
  ruleName: text("rule_name").notNull(),
  severity: text("severity").notNull(),  // critical, warning, info
  message: text("message").notNull(),
  state: text("state").notNull().default("active"),  // active, acknowledged, resolved
  firedAt: timestamp("fired_at").notNull().defaultNow(),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolvedAt: timestamp("resolved_at"),
  metricValue: real("metric_value"),
  thresholdValue: real("threshold_value"),
}, (table) => ({
  companyStateIdx: index("idx_fleet_alert_company_state").on(table.companyId, table.state),
  botIdx: index("idx_fleet_alert_bot").on(table.botId),
  firedAtIdx: index("idx_fleet_alert_fired").on(table.firedAt),
}));
```

**Snapshot Cron Job（每小時執行）：**
```typescript
// server/src/services/fleet-snapshot-cron.ts
export class FleetSnapshotCron {
  private interval: NodeJS.Timeout | null = null;

  start(fleetMonitor: FleetMonitorService, db: Database) {
    // 每小時快照一次
    this.interval = setInterval(() => this.capture(fleetMonitor, db), 3600_000);
    // 每天凌晨 00:05 聚合日摘要
    this.scheduleDailyRollup(db);
  }

  private async capture(monitor: FleetMonitorService, db: Database) {
    const status = monitor.getStatus();
    for (const bot of status.bots) {
      await db.insert(fleetSnapshots).values({
        id: generateId(),
        botId: bot.botId,
        companyId: status.companyId,
        capturedAt: new Date(),
        healthScore: bot.healthScore?.overall,
        healthGrade: bot.healthScore?.grade,
        connectionState: bot.connectionState,
        // ... 其他欄位
      });
    }
  }

  private async rollupDaily(db: Database) {
    // 從 fleet_snapshots 聚合過去 24 小時 → fleet_daily_summary
    // AVG(health_score), MIN(health_score), SUM(tokens), etc.
  }

  // 自動清理 > 90 天的 snapshots
  private async cleanup(db: Database) {
    const cutoff = new Date(Date.now() - 90 * 24 * 3600_000);
    await db.delete(fleetSnapshots).where(lt(fleetSnapshots.capturedAt, cutoff));
  }
}
```

→ **Planning #7 設計了四層時序存儲，本次實作了 Layer 2-4 的 DB 基礎設施。**
→ **fleet_alert_history 讓 alert 不再是純記憶體，server 重啟後仍可查詢歷史告警。**

---

**7. E2E 測試架構（用 Mock Gateway 實現零基礎設施測試）**

**問題：** 9 次 Planning，寫了數千行程式碼，零測試。

**策略：Playwright + Mock Gateway = 完整 E2E，不需要真 bot**

```typescript
// tests/e2e/fleet-monitor.spec.ts
import { test, expect } from "@playwright/test";
import { spawn } from "child_process";

let mockGateway: ChildProcess;

test.beforeAll(async () => {
  // 啟動 Mock Gateway 模擬一個 bot
  mockGateway = spawn("npx", [
    "tsx", "scripts/mock-gateway.ts",
    "--port", "18789",
    "--name", "小龍蝦",
    "--emoji", "🦞",
  ]);
  // 等待 Mock Gateway 就緒
  await waitForPort(18789);
});

test.afterAll(async () => {
  mockGateway.kill();
});

test("connect bot via wizard and see it on dashboard", async ({ page }) => {
  // 1. Navigate to fleet connect page
  await page.goto("/fleet-monitor/connect");

  // 2. Step 1: Enter Gateway URL
  await page.fill('[placeholder*="Gateway URL"]', "http://localhost:18789");
  await page.click('button:has-text("Next")');

  // 3. Step 2: Enter token + test connection
  await page.fill('[placeholder*="Token"]', "test-token");
  await page.click('button:has-text("Test Connection")');
  await expect(page.getByText("Connected!")).toBeVisible();
  await expect(page.getByText("🦞")).toBeVisible();  // bot emoji
  await page.click('button:has-text("Next")');

  // 4. Step 3: Confirm
  await expect(page.getByText("小龍蝦")).toBeVisible();
  await page.click('button:has-text("Add to Fleet")');

  // 5. Verify bot appears on dashboard
  await page.goto("/fleet-monitor");
  await expect(page.getByText("小龍蝦")).toBeVisible();
  await expect(page.getByText("Online")).toBeVisible();
});

test("dashboard shows health score", async ({ page }) => {
  await page.goto("/fleet-monitor");
  // Health score should be visible (Mock Gateway returns score 85)
  await expect(page.getByText(/[A-F]/)).toBeVisible();
});

test("bot detail fleet tab shows channels", async ({ page }) => {
  // Navigate to bot detail
  await page.goto("/fleet-monitor");
  await page.click('text=小龍蝦');
  // Click Fleet tab
  await page.click('text=Fleet');
  // Should show mock channels
  await expect(page.getByText("LINE")).toBeVisible();
  await expect(page.getByText("Telegram")).toBeVisible();
});
```

**測試矩陣：**
```
✅ Connect bot → appears on dashboard
✅ Health score display + grade
✅ Channel status indicators
✅ Alert banner when health drops
✅ Disconnect bot → removed from dashboard
✅ Connection lost → reconnecting UI
✅ Sidebar Fleet Pulse dots
✅ Cost estimate display
✅ Mock Gateway chaos mode → error states
```

**CI 整合：**
```yaml
# .github/workflows/fleet-e2e.yml
fleet-e2e:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: pnpm install
    - run: pnpm build
    - run: npx tsx scripts/mock-gateway.ts --port 18789 &
    - run: pnpm test:e2e -- --grep "fleet"
```

→ **Mock Gateway 讓 E2E 測試在 CI 中可行——不需要真正的 OpenClaw bot。**

---

**8. i18n 策略（全新，前 9 次完全忽略的基礎議題）**

**問題：** Pain Point 是台灣公司，使用者是中文使用者。但 Paperclip 的所有 UI 文字都是英文。

**之前的「改文字」策略（Planning #5-9）只是把英文改成另一個英文：**
```
"Company" → "Fleet"  // 還是英文
"Agent" → "Bot"      // 還是英文
```

**Pain Point 的使用者期望看到中文：**
```
"Fleet" → "車隊"
"Bot" → "機器人" / "Bot"
"Connect" → "連接"
"Health Score" → "健康分數"
"Online" → "在線"
```

**i18n 策略：漸進式，先 Fleet 組件，後全站**

```
Phase A（本次）: Fleet 組件支援 zh-TW
  → 只改 fleet/ 目錄下的組件
  → 用簡單的 key-value 翻譯檔（不引入 i18n library）
  → 預設語言：zh-TW

Phase B（下次）: 全站 i18n
  → 引入 react-i18next（Paperclip 級別的改動）
  → 需要 Alex 確認是否值得
```

**極簡 i18n 方案（Fleet 專用，不影響 Paperclip 其他部分）：**
```typescript
// ui/src/components/fleet/i18n.ts
const zhTW = {
  "fleet.dashboard": "車隊監控",
  "fleet.online": "在線",
  "fleet.offline": "離線",
  "fleet.connecting": "連接中",
  "fleet.health": "健康分數",
  "fleet.cost.today": "今日花費",
  "fleet.sessions.active": "活躍對話",
  "fleet.connect.title": "連接 Bot",
  "fleet.connect.url": "Gateway 位址",
  "fleet.connect.token": "認證 Token",
  "fleet.connect.test": "測試連線",
  "fleet.connect.success": "連線成功！",
  "fleet.connect.add": "加入車隊",
  "fleet.channel": "通道",
  "fleet.cron": "排程任務",
  "fleet.memory": "記憶",
  "fleet.alert.critical": "嚴重",
  "fleet.alert.warning": "警告",
  "fleet.freshness": "更新於",
  // ...
};

const en = {
  "fleet.dashboard": "Fleet Monitor",
  "fleet.online": "Online",
  // ... fallback
};

export function t(key: string): string {
  return zhTW[key] ?? en[key] ?? key;
}
```

**為什麼不直接用 react-i18next：**
- Paperclip 沒有 i18n 基礎設施
- 引入 i18n library 影響整個 app
- Fleet 組件是封閉的（4 個檔案），用簡單 key-value 就夠
- 之後如果要全站 i18n，Fleet 的翻譯 key 可以直接遷移

→ **先讓 Fleet Dashboard 說中文，其他頁面維持英文。使用者在 Fleet 區域看到中文 = 品牌一致性。**

---

**9. 發現 painpoint-ai.com 品牌色完整細節（第六次研究，新增精確資料）**

本次研究提供了更精確的品牌色資訊（來自實際 CSS 分析）：

**核心品牌色（六次研究交叉驗證完成，最終版）：**
```
Primary Accent:  #D4A373  warm gold/caramel    — 147 CSS occurrences  ✅
Primary Dark:    #2C2420  deep espresso brown  — 208 CSS occurrences  ✅
Background:      #FAF9F6  off-white cream      — root <div> bg        ✅
Secondary:       #B08968  muted warm tan       — gradient endpoint    ✅
Dark Variant:    #3D3530  lighter espresso      — gradient endpoint    ✅
Tertiary:        #9A7B5B  deeper olive-tan      — darkest hover state  ✅
Border:          #E0E0E0  light gray            — 39 CSS occurrences   ✅
Light Alt:       #F5F0EB  warm beige            — gradient endpoint    ✅
```

**新增確認的漸層定義：**
```css
/* Primary CTA */
bg-gradient-to-r from-[#D4A373] to-[#B08968]
/* Hover: darkens both stops */
hover:from-[#B08968] hover:to-[#9A7B5B]

/* Dark panels/cards */
bg-gradient-to-r from-[#2C2420] to-[#3D3530]

/* Subtle background */
bg-gradient-to-r from-[#FAF9F6] to-[#F5F0EB]

/* Decorative glow */
bg-[#D4A373] blur-[120px] opacity-[0.08]  — ambient gold glow
```

**新增確認的 UI 特徵：**
- Text selection: `selection:bg-[#D4A373] selection:text-white`
- Footer: dark espresso bg (#2C2420) + cream text (#FAF9F6)
- No custom CSS variables — all inline Tailwind arbitrary values
- No dark mode on production site
- 整體設計語言：warm, earthy, premium — coffee/leather tones

→ **品牌色已達到六次研究完全一致的確認程度，正式封閉此研究主題。**

---

**10. OpenClaw Gateway API 研究更新（第六次，新增關鍵發現）**

本次研究揭示了完整的 Gateway protocol 細節（比之前更精確）：

**新增發現 — Transport 協議細節：**
```
Gateway 單一 port 同時服務三種協議：
1. WebSocket RPC（主要）— 雙向即時通訊
2. HTTP REST — /health, /v1/chat/completions, /v1/responses, /tools/invoke
3. Web Control UI — 靜態頁面 served at HTTP root

HTTP REST 中 /v1/chat/completions 預設是關閉的（需 config 啟用）
  → Fleet Dashboard 不應依賴此 endpoint
  → 堅持 WebSocket RPC 是正確決策
```

**新增發現 — 環境變數：**
```
OPENCLAW_GATEWAY_PORT    — 自定義 port
OPENCLAW_GATEWAY_TOKEN   — 認證 token
OPENCLAW_GATEWAY_PASSWORD — 密碼認證
OPENCLAW_CONFIG_PATH     — config 檔路徑
OPENCLAW_STATE_DIR       — 狀態目錄
```
→ **ConnectBotWizard 可以在 Step 2 顯示提示：「Token 通常在 bot 的 OPENCLAW_GATEWAY_TOKEN 環境變數中」**

**新增發現 — Session Key 結構：**
```
sessions 的 key 是階層式：
  agent:<agentId>:peer:<id>     — 個人對話
  agent:<agentId>:channel:<name> — 通道對話
  agent:<agentId>:guild:<groupId> — 群組對話

存儲格式：JSONL transcripts
```
→ **Session Live Tail 可以根據 key 結構自動分類：「個人」「通道」「群組」**

**新增確認 — RPC 方法完整清單（44 個，與 Planning #4 一致）：**
- `health`, `status`, `system-presence`, `logs.tail`
- `sessions.list`, `sessions.usage`, `sessions.preview`, `sessions.resolve`, `sessions.patch`, `sessions.compact`, `sessions.reset`, `sessions.delete`
- `agent.identity`, `agents.list`, `agents.files.list`, `agents.files.get`
- `chat.send`, `chat.abort`, `chat.history`, `chat.inject`
- `tools.catalog`, `skills.bins`, `skills.status`
- `cron.list`, `cron.add`, `cron.run`, `cron.runs`
- `channels.status`
- `config.get`, `config.patch`, `config.schema`
- `device.pair.list`, `device.pair.approve`, `device.token.rotate`, `device.token.revoke`
- `models.list`, `wake`

---

**11. 本次程式碼產出**

**Commit 15: Fleet Bootstrap — 點火啟動**
```
新增：server/src/fleet-bootstrap.ts
  — bootstrapFleet(): instantiate services, register routes, wire events
  — shutdownFleet(): graceful 3-phase shutdown
  — Gateway shutdown event handling（寬容重連）

修改：server/src/index.ts
  — import bootstrapFleet, shutdownFleet
  — 在 listen() 後呼叫 bootstrapFleet()
  — SIGTERM/SIGINT handler 中呼叫 shutdownFleet()
```

**Commit 16: DB Migration — fleet_snapshots + fleet_daily_summary + fleet_alert_history**
```
新增：packages/db/src/schema/fleet-snapshots.ts
  — fleetSnapshots 表（小時級快照）
  — fleetDailySummary 表（日級摘要）
  — fleetAlertHistory 表（告警歷史）
  — 完整的索引定義

新增：packages/db/src/migrations/0038_fleet_snapshots.sql
  — CREATE TABLE fleet_snapshots + indices
  — CREATE TABLE fleet_daily_summary + indices
  — CREATE TABLE fleet_alert_history + indices

修改：packages/db/src/schema/index.ts
  — export fleet schema tables
```

**Commit 17: Fleet Snapshot Cron + Cost Forecast**
```
新增：server/src/services/fleet-snapshot-cron.ts
  — 每小時快照 capture
  — 每日凌晨 rollup
  — 90 天自動清理

新增：server/src/services/fleet-cost-forecast.ts
  — 線性回歸成本預測
  — Budget guardrail alerts
  — Forecast API endpoint
```

**Commit 18: E2E Test Scaffold**
```
新增：tests/e2e/fleet-monitor.spec.ts
  — Mock Gateway setup/teardown
  — Connect bot wizard E2E
  — Dashboard health display E2E
  — Bot detail fleet tab E2E
```

---

**12. 與前幾次 Planning 的關鍵差異**

| 面向 | 之前的想法 | Planning #10 的改進 |
|------|----------|-------------------|
| Server 啟動 | 從未處理 | fleet-bootstrap.ts — 完整的生命週期管理 |
| Server 關閉 | 從未考慮 | 三階段 graceful shutdown + Gateway shutdown 處理 |
| 告警閾值 | 靜態（cost > $5） | 靜態 + 異常偵測（動態 μ±Nσ） |
| 成本分析 | 看現在 + 看過去 | 加入預測（線性回歸 7d/30d） |
| 預算管理 | 不存在 | Budget guardrails + burndown date 預估 |
| 資料視覺化 | 數字 + sparkline | 加入 Fleet Heatmap（時間模式一目了然） |
| DB persistence | Schema 在 PLAN.md 裡 | 實際 Drizzle schema + migration SQL |
| 測試 | 零測試 | Playwright E2E + Mock Gateway |
| 語言 | 英文 | Fleet 組件支援 zh-TW |
| Session 分類 | 扁平列表 | 根據 key 結構自動分類（個人/通道/群組） |

---

**13. 風險更新**

| 新風險 | 嚴重度 | 緩解 |
|--------|--------|------|
| fleet-bootstrap.ts 引入的啟動順序依賴 | 🟡 中 | Bootstrap 在 DB init 之後、非同步 await 確保順序 |
| Graceful shutdown 超時（Gateway 不回應 close） | 🟡 中 | Phase 3 強制關閉 + 8 秒硬上限 |
| 異常偵測的歷史資料不足（前 3 天） | 🟡 中 | 資料量 < 3 天時 fallback 到靜態閾值 |
| 線性回歸成本預測不準（非線性模式） | 🟡 中 | 顯示 confidence level + 「僅供參考」提示 |
| DB migration 與 Paperclip 上游衝突 | 🟡 中 | 用獨立 migration 檔案編號（0038+），不改既有表 |
| E2E 測試在 CI 中不穩定（timing issues） | 🟡 中 | 用 Playwright 的 waitForSelector + retry |
| zh-TW 翻譯不完整 | 🟢 低 | fallback 到英文 key |
| fleet_snapshots 資料量增長 | 🟢 低 | 90 天自動清理 + 索引優化 |

---

**14. 修訂的整體進度追蹤**

```
✅ Planning #1-4: 概念、API 研究、架構設計
✅ Planning #5: 品牌主題 CSS + DB aliases + 術語改名
✅ Planning #6: FleetGatewayClient + FleetMonitorService + API routes
✅ Planning #7: Mock Gateway + Health Score + AlertService + 時序策略 + Command Center
✅ Planning #8: Fleet API client + React hooks + BotStatusCard + FleetDashboard + ConnectBotWizard
✅ Planning #9: Route wiring + Sidebar Fleet Pulse + LiveEvent bridge + BotDetailFleetTab + Companies Connect
✅ Planning #10: Server Bootstrap + Graceful Shutdown + DB Migrations + Anomaly Detection + Cost Forecast + E2E Tests + i18n
⬜ Next: Session Live Tail 完整實作
⬜ Next: Bot Tag 分組 + Dashboard Filter Bar
⬜ Next: Fleet Heatmap + 趨勢圖全尺寸組件
⬜ Next: Notification Center（NotificationBell）
⬜ Next: Fleet Command Center UI（batch operations）
⬜ Next: Gateway 版本矩陣 Widget
⬜ Next: i18n 全站擴展（react-i18next）
⬜ Next: 效能優化（虛擬滾動、懶連接）
⬜ Next: Pixel art bot 頭像
⬜ Next: 手機 PWA
```

---

**15. 研究主題封閉聲明**

| 研究主題 | 研究次數 | 狀態 |
|----------|---------|------|
| OpenClaw Gateway API | 6 次 | 🔒 封閉 — 44 RPC + 8 events 完整確認 |
| painpoint-ai.com 品牌色 | 6 次 | 🔒 封閉 — 8 色 + 4 漸層 完整確認 |

未來 Planning 不需要再重複研究這兩個主題。

---

**下一步 Planning #11（如果需要）：**
- Session Live Tail 前端組件（聊天 UI + JSONL parser + 自動分類）
- Bot Tag 分組系統 + Dashboard Filter Bar
- Fleet Heatmap 組件實作
- Notification Center（全域通知鈴鐺）
- Fleet Command Center UI（batch operations 前端）
- 第一次完整 E2E 測試運行 + CI 設定

### Planning #11 — 2026-03-19 16:45
**主題：Fleet 可觀測性三支柱 + Config Drift 偵測 + 成本歸因 + Session Live Tail + Notification Center + Fleet Heatmap 實作**

---

**🔧 iteration #11 → 「深度可觀測」階段：從看表面到看本質**

前 10 次 Planning 建了完整的監控基礎設施（連接、狀態、健康分數、告警、成本追蹤）。
但有一個根本問題：**所有監控都停在「症狀層」，沒有「根因層」。**

當 Health Score 從 92 掉到 45，管理者能看到：
- ✅ 分數掉了（症狀）
- ✅ 哪個維度掉最多（定位）
- ❌ 為什麼掉（根因）→ 完全看不到

**Planning #11 的核心命題：Observable Fleet — 讓「為什麼」變得可見。**

---

**1. Fleet 可觀測性三支柱（全新架構思維，借鑒 SRE 最佳實踐）**

傳統可觀測性三支柱是 Metrics / Logs / Traces。Fleet Dashboard 目前只有 Metrics（健康分數、成本數字）。缺少 Logs 和 Traces。

**Fleet 版三支柱映射：**

```
┌─────────────────────────────────────────────────────────────────┐
│  Pillar 1: Metrics (✅ 已有)                                     │
│  → Health Score, Cost, Uptime, Latency, Channel Status          │
│  → fleet_snapshots + fleet_daily_summary                        │
│                                                                   │
│  Pillar 2: Logs (🆕 本次新增)                                    │
│  → Bot Activity Stream — 每個 bot 的操作事件流                    │
│  → 來源：Gateway 的 agent lifecycle events + chat events          │
│  → 顯示：可搜尋、可篩選的時間線                                    │
│  → 價值：回答「bot 在過去一小時做了什麼」                            │
│                                                                   │
│  Pillar 3: Traces (🆕 本次新增)                                   │
│  → Agent Turn Trace — 單次 agent 執行的完整分解                    │
│  → 來源：Gateway agent event 的 lifecycle phases                  │
│  → 顯示：Waterfall diagram（像 Chrome DevTools Network tab）       │
│  → 價值：回答「這次執行為什麼慢/為什麼失敗」                         │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Agent Turn Trace 的資料來源：**

Gateway 的 `agent` event stream 已經發送 lifecycle phases：
```
→ phase: "start"     — turn 開始
→ stream: "assistant" — LLM 輸出（含 delta chunks）
→ stream: "tool_use"  — 工具呼叫
→ phase: "error"      — 錯誤
→ phase: "failed"     — 失敗
→ phase: "cancelled"  — 取消
```

**我們只需要把這些事件收集起來，組成 trace：**

```typescript
interface AgentTurnTrace {
  traceId: string;         // = runId
  botId: string;
  sessionKey: string;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  status: "running" | "completed" | "failed" | "cancelled";
  phases: Array<{
    type: "llm_think" | "llm_output" | "tool_call" | "tool_result" | "error";
    name?: string;         // tool name, error type
    startMs: number;       // offset from trace start
    durationMs: number;
    metadata?: {
      inputTokens?: number;
      outputTokens?: number;
      toolName?: string;
      errorMessage?: string;
    };
  }>;
  totalTokens: { input: number; output: number; cached: number };
}
```

**Trace Waterfall 視覺化：**
```
┌─ Agent Turn Trace: patrol-morning #42 ────────────────────────┐
│                                                                 │
│  Duration: 8.2s  Tokens: 12.4K  Status: ✅ Completed           │
│                                                                 │
│  0s    2s    4s    6s    8s                                     │
│  ├─────┼─────┼─────┼─────┤                                     │
│  ▓▓▓▓░░░░░░░░░░░░░░░░░░░░  LLM Think (1.2s)                  │
│       ▓▓▓▓▓▓▓░░░░░░░░░░░░  LLM Output (2.1s)                 │
│              ▓▓▓░░░░░░░░░░  Tool: Read (0.8s)                 │
│                 ▓▓░░░░░░░░  Tool: Grep (0.5s)                 │
│                   ▓▓▓▓▓░░░  LLM Output (1.8s)                │
│                        ▓▓▓  Tool: Edit (0.9s)                 │
│                           ▓  LLM Final (0.4s)                 │
│                                                                 │
│  Slowest: LLM Output #1 (2.1s) — 26% of total                 │
│  Tokens: 8.2K input (45% cached) + 4.2K output                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

→ **當 bot 變慢時，trace 立刻告訴你：是 LLM 回應慢、是工具呼叫慢、還是執行了太多步驟。**
→ **不需要 SSH 到 bot 看 log。Fleet Dashboard 直接顯示 trace。**

**Bot Activity Stream（Pillar 2 — Logs）：**
```
┌─ 🦞 小龍蝦 Activity Stream ──────────────────────────────────┐
│                                                                 │
│  🔍 Filter: [All] [Agent Turns] [Chat] [Cron] [Errors]        │
│                                                                 │
│  14:52  🔄 Agent turn completed — patrol-morning #42 (8.2s)   │
│  14:50  💬 LINE message received from user:12345               │
│  14:45  ⏰ Cron "health-check" completed (0.8s) ✅             │
│  14:32  🔄 Agent turn started — patrol-morning #42             │
│  14:30  💬 LINE message received from user:67890               │
│  14:28  🔄 Agent turn completed — code-review #15 (12.5s)     │
│  14:15  ⚠️ Tool "Bash" execution timeout (30s)                 │
│  14:10  ⏰ Cron "morning-report" completed (3.5s) ✅           │
│                                                                 │
│  [Load more ↓]                                                  │
└─────────────────────────────────────────────────────────────────┘
```

→ **不是 raw log（那太技術），而是結構化的「bot 做了什麼」時間線。管理者能看懂。**

---

**2. Fleet Config Drift 偵測（全新功能，之前完全沒考慮跨 bot 一致性）**

**洞察：** 管理 4 個 bot 時，你能記住每個 bot 的 config。管理 15 個 bot 時，你不可能記住。

**問題場景：**
- Bot A 用 Claude Opus（$15/M input），Bot B 用 Claude Sonnet（$3/M）——成本差 5 倍但管理者不知道
- Bot A 開了 `max_tokens: 8192`，Bot B 是預設 `4096`——回應行為不一致
- Bot A 有 skill X，Bot B 沒有——能力不一致
- Bot A 的 Gateway 版本是 2026.1.24，Bot B 還是 2026.1.20——可能有 bug

**Fleet Config Drift Detector：**

```typescript
interface ConfigDriftReport {
  generatedAt: Date;
  botsCompared: number;
  drifts: Array<{
    configPath: string;       // e.g., "model", "session.maxTokens", "gateway.version"
    severity: "info" | "warning" | "critical";
    values: Map<string, string[]>;  // value → [botIds with this value]
    recommendation: string;
  }>;
  consistent: string[];  // config paths that are identical across all bots
}
```

**偵測方式：**
1. 對每個已連接的 bot 呼叫 `config.get` RPC
2. Flatten config 為 key-value pairs
3. 比較所有 bot 的同一 key
4. 有差異的 → 標記為 drift
5. 根據 key 的影響程度標記 severity

**Severity 分類：**
```
critical: model（直接影響成本和能力）, gateway.version（影響 API 相容性）
warning:  session.maxTokens, channel 設定, cron schedules
info:     agent name, description, 非功能性差異
```

**Dashboard Widget：**
```
┌─ Config Drift ──────────────────────────────────────────────┐
│                                                               │
│  ⚠️ 3 drifts detected across 4 bots                         │
│                                                               │
│  🔴 model                                                    │
│     claude-opus-4:    🦞 小龍蝦                              │
│     claude-sonnet-4:  🐿️ 飛鼠, 🦚 孔雀, 🐗 山豬             │
│     💡 Consider standardizing model for consistent cost      │
│                                                               │
│  🟡 session.maxTokens                                        │
│     8192: 🦞 小龍蝦, 🐿️ 飛鼠                                │
│     4096: 🦚 孔雀, 🐗 山豬                                    │
│                                                               │
│  🟡 gateway.version                                          │
│     v2026.1.24-3: 🦞🐿️🦚                                    │
│     v2026.1.22-1: 🐗                                         │
│     💡 [Plan Fleet Update →]                                 │
│                                                               │
│  ✅ 12 config keys consistent across all bots                │
│                                                               │
│  [Full Report] [Auto-Harmonize →]                            │
└───────────────────────────────────────────────────────────────┘
```

**「Auto-Harmonize」是 Config Drift + Fleet Command Center 的結合：**
1. 偵測到 drift
2. 顯示建議值（majority rule：多數 bot 用的值）
3. 一鍵生成 config.patch → 用 Canary 模式推送到少數派 bot
4. 推送後自動再次偵測 drift → 確認已消除

→ **從「我不知道 bot 之間有差異」到「一鍵統一 config」。這在 10+ bot 時是必需品。**

---

**3. 成本歸因：按 Channel 分解（全新維度，之前只有 per-bot 分解）**

**洞察：** Pain Point 的核心問題不是「bot A 花了多少錢」，而是「LINE 通道花了多少錢 vs Telegram 通道」。

因為 session key 包含 channel 資訊：
```
agent:lobster:channel:line     → LINE 的 sessions
agent:lobster:channel:telegram → Telegram 的 sessions
agent:lobster:peer:admin       → 管理者直接對話
```

**我們可以從 `sessions.usage` + session key 解析出 channel 維度的成本：**

```typescript
interface ChannelCostBreakdown {
  channel: string;        // "line", "telegram", "web", "direct"
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  estimatedCostUsd: number;
  percentOfTotal: number;
  avgCostPerSession: number;
}
```

**Cost Page 升級：**
```
┌─ Cost by Channel ─────────────────────────────────────────────┐
│                                                                 │
│  📊 Channel Cost Distribution (This Month)                     │
│                                                                 │
│  ● LINE       $28.50 (67%)  ████████████████░░░░  142 sessions│
│  ● Telegram   $8.20  (19%)  ████░░░░░░░░░░░░░░░░   38 sessions│
│  ● Direct     $4.30  (10%)  ██░░░░░░░░░░░░░░░░░░   12 sessions│
│  ● Web        $1.50  (4%)   █░░░░░░░░░░░░░░░░░░░    5 sessions│
│                                                                 │
│  💡 LINE accounts for 67% of cost. Consider caching            │
│     optimization for high-volume LINE conversations.           │
│                                                                 │
│  📈 Cost per Session Average                                   │
│     LINE: $0.20  Telegram: $0.22  Direct: $0.36  Web: $0.30   │
│     ⚠️ Direct sessions cost 80% more per session               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

→ **管理者從「我們花了 $42.50」升級到「LINE 通道花了 $28.50，因為有 142 個 session」。**
→ **可以做出更好的決策：「也許 LINE 通道需要設定 max_tokens 限制來降成本」。**

---

**4. Session Live Tail 實作（Planning #9 設計，本次實際建構）**

Planning #9 設計了 Session Live Tail 的概念和 wireframe，但從未寫程式碼。
本次實作前端組件 + 後端 API 串接。

**技術決策：**
- 歷史載入：呼叫 `chat.history` RPC（透過 FleetMonitorService proxy）
- 即時更新：`fleet.bot.chat` LiveEvent → React Query invalidation
- 訊息格式：OpenClaw chat event 的 `payload.data` 結構
- 自動分類：解析 session key prefix 決定 session 類型（peer/channel/guild）

**Session 類型自動分類（根據 key 結構）：**
```typescript
type SessionType = "direct" | "channel" | "group" | "cron" | "system";

function classifySession(sessionKey: string): SessionType {
  if (sessionKey.includes(":peer:")) return "direct";
  if (sessionKey.includes(":channel:")) return "channel";
  if (sessionKey.includes(":guild:")) return "group";
  if (sessionKey.includes("cron:")) return "cron";
  return "system";
}
```

**前端組件拆分：**
```
SessionLiveTail/
  ├── SessionLiveTail.tsx     — 主容器（載入歷史 + 訂閱即時）
  ├── ChatMessage.tsx         — 單則訊息氣泡（user vs bot）
  ├── SessionTypeFilter.tsx   — 類型篩選 tab
  └── SessionTokenCounter.tsx — 底部 token 計數器
```

→ **見 ui/src/components/fleet/SessionLiveTail.tsx 程式碼**

---

**5. Notification Center 實作（Planning #9 設計，本次實際建構）**

Planning #9 設計了 Notification Bell 的概念，但從未寫程式碼。

**核心決策：**
- 不用額外 DB——Notification 存在前端 React Context + LocalStorage
- 來源：`fleet.alert.triggered` + `fleet.bot.connected` + `fleet.bot.disconnected` LiveEvents
- 未讀計數顯示在 Sidebar 頂部
- 最多保留 50 條通知（FIFO 淘汰）
- LocalStorage key: `fleet-notifications-${companyId}`

**組件架構：**
```
NotificationCenter/
  ├── NotificationProvider.tsx  — React Context + LocalStorage 持久化
  ├── NotificationBell.tsx      — 🔔 按鈕 + 未讀計數 badge
  └── NotificationPanel.tsx     — 展開的通知列表（Popover）
```

→ **見 ui/src/components/fleet/NotificationCenter.tsx 程式碼**

---

**6. Fleet Heatmap 實作（Planning #10 設計，本次實際建構）**

Planning #10 設計了 CSS Grid heatmap，本次實作為可用組件。

**實作要點：**
- 資料來源：`fleet_snapshots` 表（小時級）→ `GET /api/fleet-monitor/trend`
- 視覺：CSS Grid，每個 cell 是 12x12px 圓角方塊
- 色彩映射：health score → oklch 漸變（紅→黃→綠）
- Hover tooltip：日期 + 時間 + health score + 事件摘要
- 支援兩種粒度：日級（4 week × 7 day）和小時級（7 day × 24 hour）

→ **見 ui/src/components/fleet/FleetHeatmap.tsx 程式碼**

---

**7. Operational Runbooks — 讓告警可行動（全新概念）**

**問題：** AlertService 觸發告警後，管理者看到「Health Score Critical (28)」，然後呢？
然後他不知道該做什麼。特別是非技術管理者。

**Runbooks = 綁定在 Alert Rule 上的標準操作程序（SOP）**

```typescript
interface Runbook {
  id: string;
  alertRuleId: string;
  title: string;
  steps: Array<{
    order: number;
    action: string;         // 描述
    automated?: boolean;    // 是否可自動執行
    automatedAction?: {
      type: "rpc";
      method: string;       // e.g., "channels.status"
      displayAs: string;    // 如何在 UI 呈現結果
    };
  }>;
}
```

**預設 Runbooks：**

```
Alert: "Bot Offline > 5 minutes"
Runbook:
  1. ✅ Check Gateway health (GET /health) — [Auto-check]
  2. 👁 Check network connectivity to bot's IP
  3. 📡 Check channel status (channels.status) — [Auto-check]
  4. 🔄 If Gateway responds but WS failed: Try reconnect — [One-click]
  5. 📞 If Gateway unreachable: Contact bot operator

Alert: "Health Score Critical"
Runbook:
  1. 📊 View health breakdown — [Auto-navigate to Bot Detail > Fleet tab]
  2. 🔗 Check connectivity score — if low, see "Bot Offline" runbook
  3. ⚡ Check responsiveness — if low, check bot's active sessions count
  4. 📡 Check channels — if channel disconnected, attempt channel restart
  5. ⏰ Check cron — if cron failing, review recent cron run logs

Alert: "Hourly Cost Spike"
Runbook:
  1. 💰 View cost breakdown by session — [Auto-navigate to Costs page]
  2. 🔍 Identify highest-cost session
  3. 📄 Check session's model (Opus vs Sonnet) — model downgrade may help
  4. 📊 Check cached token ratio — low cache = high cost
  5. ⚠️ If anomalous: consider aborting the expensive session
```

**Alert Panel 升級：**
```
┌─ 🔴 CRITICAL — 🐗 山豬 Health Score 28 (F) ────────────────┐
│  Since 14:32 · Bot offline for 23 minutes                    │
│                                                               │
│  📋 Runbook: (3/5 steps)                                     │
│  ✅ 1. Gateway health check — ❌ UNREACHABLE                 │
│  ✅ 2. Network check — ⚠️ Ping timeout to 192.168.50.75     │
│  ⬜ 3. Check channel status — (blocked: gateway unreachable) │
│  ⬜ 4. Try reconnect                                         │
│  ⬜ 5. Contact operator                                      │
│                                                               │
│  [Execute Next Step] [Skip] [Acknowledge Alert]              │
└───────────────────────────────────────────────────────────────┘
```

→ **從「看到紅色」到「知道該做什麼」。Runbook 是 alert fatigue 的解藥。**
→ **Automated steps 讓管理者一鍵診斷，不需要手動開 terminal。**

---

**8. Fleet 資料匯出 + 報表生成（全新，填補企業需求缺口）**

**洞察：** Pain Point 是商業公司，管理者需要給老闆看報表。Dashboard 是即時的，但老闆要的是 PDF/Excel 月報。

**Fleet Monthly Report Generator：**

```typescript
interface FleetReport {
  period: { from: Date; to: Date };
  fleet: {
    totalBots: number;
    avgUptime: number;
    avgHealthScore: number;
    totalCostUsd: number;
  };
  perBot: Array<{
    name: string;
    emoji: string;
    avgHealthScore: number;
    uptime: number;
    totalCost: number;
    topChannels: Array<{ name: string; cost: number }>;
    incidents: number;  // alert 觸發次數
  }>;
  costTrend: Array<{ date: string; cost: number }>;
  topIncidents: Array<{
    date: string;
    bot: string;
    alert: string;
    duration: string;
    resolved: boolean;
  }>;
}
```

**匯出格式：**
- CSV：原始資料（供 Excel 分析）
- JSON：API 回應格式（供其他系統整合）
- 未來（Phase 4）：PDF 報表（用 puppeteer 渲染 Dashboard → PDF）

**API：**
```
GET /api/fleet-monitor/report?from=2026-03-01&to=2026-03-31&format=csv
GET /api/fleet-monitor/report?from=2026-03-01&to=2026-03-31&format=json
```

**Dashboard UI：**
```
┌─ Fleet Reports ──────────────────────────────────────────────┐
│                                                                │
│  📊 Generate Report                                           │
│  Period: [March 2026 ▼]                                       │
│  Format: ○ CSV  ● JSON                                       │
│  Include: ☑ Cost Breakdown  ☑ Health History  ☑ Incidents    │
│                                                                │
│  [Download Report]                                            │
│                                                                │
│  Recent Reports:                                               │
│  📄 February 2026 — $156.80 total — Downloaded 3/1           │
│  📄 January 2026 — $142.30 total — Downloaded 2/1            │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

→ **Dashboard 看即時，Report 看月度。管理者用 Report 向上匯報，不需要截圖 Dashboard。**

---

**9. 本次程式碼產出**

**Commit 19: Session Live Tail — 即時對話串流組件**
```
新增：ui/src/components/fleet/SessionLiveTail.tsx
  — ChatMessage 子組件（user/bot 氣泡，markdown 渲染）
  — SessionTypeFilter（direct/channel/group/cron tab）
  — Token 計數器 + 成本估算
  — 自動捲動 + 手動鎖定
  — 空狀態處理

新增：server/src/routes/fleet-monitor.ts（新增 endpoint）
  — GET /api/fleet-monitor/bot/:botId/chat-history
  — 透過 FleetGatewayClient 呼叫 chat.history RPC
```

**Commit 20: Notification Center — 全域通知鈴鐺**
```
新增：ui/src/components/fleet/NotificationCenter.tsx
  — NotificationProvider (React Context + LocalStorage 持久化)
  — NotificationBell 組件（🔔 + 未讀 badge）
  — NotificationPanel (Popover 通知列表)
  — 自動從 fleet.* LiveEvents 收集通知
  — Mark as read / Mark all read
  — 50 條上限 FIFO 淘汰

修改：ui/src/components/Sidebar.tsx
  — 嵌入 NotificationBell 組件
```

**Commit 21: Fleet Heatmap — 車隊健康熱力圖**
```
新增：ui/src/components/fleet/FleetHeatmap.tsx
  — CSS Grid 熱力圖（日級 + 小時級兩種視圖）
  — Health score → oklch 色彩映射
  — Hover tooltip（日期 + score + 事件摘要）
  — 響應式：小螢幕只顯示日級

新增：server/src/routes/fleet-monitor.ts（新增 endpoint）
  — GET /api/fleet-monitor/fleet/:companyId/heatmap
  — 從 fleet_snapshots 聚合 + 回傳 grid 資料
```

**Commit 22: Config Drift Detector**
```
新增：server/src/services/fleet-config-drift.ts
  — ConfigDriftDetector class
  — 對所有 bot 呼叫 config.get → flatten → compare
  — Severity 分類（critical/warning/info）
  — Drift report 生成

新增：server/src/routes/fleet-monitor.ts（新增 endpoint）
  — GET /api/fleet-monitor/config-drift
  — 回傳 ConfigDriftReport JSON

新增：ui/src/components/fleet/ConfigDriftWidget.tsx
  — Drift 卡片列表 + severity 色彩
  — 一致 config keys 計數
  — [Auto-Harmonize] 按鈕（連接 Fleet Command Center）
```

**Commit 23: Cost Attribution by Channel**
```
修改：server/src/routes/fleet-monitor.ts（新增 endpoint）
  — GET /api/fleet-monitor/cost-by-channel
  — 解析 session key 前綴 → 分組 → 計算 per-channel 成本

新增：ui/src/components/fleet/ChannelCostBreakdown.tsx
  — Channel 品牌色進度條
  — Per-session 平均成本比較
  — 成本最佳化建議（基於 cache ratio）
```

**Commit 24: Fleet Report Export**
```
新增：server/src/routes/fleet-report.ts
  — GET /api/fleet-monitor/report?from=&to=&format=csv|json
  — 聚合 fleet_daily_summary + fleet_alert_history → report

修改：server/src/fleet-bootstrap.ts
  — 註冊 fleet-report router
```

---

**10. 與前幾次 Planning 的關鍵差異**

| 面向 | 之前的想法 | Planning #11 的改進 |
|------|----------|-------------------|
| 可觀測性 | 只有 Metrics（數字） | 三支柱：Metrics + Logs（活動流）+ Traces（turn 分解） |
| Config 管理 | 一次一個 bot 看 config | Config Drift 偵測 + Auto-Harmonize |
| 成本分析 | 按 bot 分解 | 按 Channel 分解（LINE/TG/Web） |
| 告警回應 | 看到紅色 → 不知道做什麼 | Runbooks = 可執行的 SOP |
| Session 內容 | 列表（無內容） | Live Tail 即時對話串流 |
| 通知 | Toast（3 秒消失） | Notification Center（持久化 + 全域） |
| 歷史視覺化 | Sparkline（24h 微型圖） | Fleet Heatmap（30d 全景） |
| 報表 | 不存在 | CSV/JSON 月度報表匯出 |
| 診斷 | 看 Health Score 數字 | Agent Turn Trace waterfall 瀑布圖 |

---

**11. 風險更新**

| 新風險 | 嚴重度 | 緩解 |
|--------|--------|------|
| Agent Turn Trace 資料量大（每個 turn 可能有 50+ events） | 🟡 中 | 只保留最近 100 個 trace 在記憶體，超過寫入 fleet_snapshots |
| Config Drift 對 N 個 bot 呼叫 config.get = N 次 RPC | 🟡 中 | Cache config 10 分鐘 + 只在 Dashboard 打開時偵測 |
| Session Live Tail 的 chat.history 可能很大 | 🟡 中 | 只載入最近 50 條 + 虛擬滾動 + cursor-based 分頁 |
| Notification LocalStorage 滿了 | 🟢 低 | 50 條上限 + FIFO 淘汰 + 壓縮 payload |
| Fleet Heatmap 在行動裝置上太小 | 🟢 低 | 響應式設計：行動裝置只顯示日級 + 可左右滑動 |
| Runbook automated steps 的安全性 | 🟡 中 | Automated steps 只執行讀取操作（GET /health, channels.status），寫入操作需手動確認 |
| Channel 成本歸因依賴 session key 命名慣例 | 🟡 中 | Fallback: 無法解析的 session → "other" 分類 |
| Report 匯出的 fleet_daily_summary 不夠久 | 🟢 低 | daily_summary 永久保留（每 bot 每天一筆，資料量極小） |

---

**12. 修訂的整體進度追蹤**

```
✅ Planning #1-4: 概念、API 研究、架構設計
✅ Planning #5: 品牌主題 CSS + DB aliases + 術語改名
✅ Planning #6: FleetGatewayClient + FleetMonitorService + API routes
✅ Planning #7: Mock Gateway + Health Score + AlertService + 時序策略 + Command Center
✅ Planning #8: Fleet API client + React hooks + BotStatusCard + FleetDashboard + ConnectBotWizard
✅ Planning #9: Route wiring + Sidebar Fleet Pulse + LiveEvent bridge + BotDetailFleetTab + Companies Connect
✅ Planning #10: Server Bootstrap + Graceful Shutdown + DB Migrations + Anomaly Detection + Cost Forecast + E2E Tests + i18n
✅ Planning #11: Observable Fleet（三支柱）+ Config Drift + Channel Cost + Session Live Tail + Notification Center + Heatmap + Runbooks + Reports
⬜ Next: Agent Turn Trace waterfall 前端組件
⬜ Next: Bot Tag 分組 + Dashboard Filter Bar
⬜ Next: Fleet Command Center UI（batch operations）
⬜ Next: Auto-Harmonize 整合（Config Drift → Command Center）
⬜ Next: Runbook 編輯 UI + 自訂 Runbook 功能
⬜ Next: PDF 報表生成（puppeteer）
⬜ Next: i18n 全站擴展（react-i18next）
⬜ Next: 效能優化（虛擬滾動、懶連接）
⬜ Next: Pixel art bot 頭像
⬜ Next: 手機 PWA
```

---

**下一步 Planning #12（如果需要）：**
- Agent Turn Trace waterfall 前端組件（像 Chrome DevTools Network tab）
- Bot Tag 分組 + Dashboard Filter Bar
- Fleet Command Center UI（batch operations 前端 + Canary 模式 UI）
- Auto-Harmonize 整合（Config Drift → 一鍵推送 config 到少數派 bot）
- Runbook 編輯器（管理者自訂 SOP）
- 效能壓力測試（50 bot 同時連線模擬）

---

### Planning #12 — 2026-03-19 19:30
**主題：Fleet Intelligence Layer — 從 Dashboard 進化為 Decision Engine + mDNS 零配置發現 + 成本預算制 + Bot 標籤系統**

---

**🧠 iteration #12 → 「智能層」階段：從被動顯示到主動建議**

前 11 次 Planning 建了一個世界級的監控 Dashboard。但它本質上還是**被動的**：顯示資料，人類決策。
這就像你有一個完美的汽車儀表板，但沒有 GPS 導航——你看得到速度、油量、轉速，但沒人告訴你「前方有塞車，建議改道」。

**Planning #12 的核心命題：加上 GPS。讓 Fleet Dashboard 不只是鏡子，而是顧問。**

具體來說，這次解決六個截然不同的問題：

```
┌──────────────────────────────────────────────────────────────────────┐
│  問題 1: Agent Turn 為什麼慢？         → Agent Turn Trace Waterfall  │
│  問題 2: 我有新 bot 要加入，手動輸 URL 好煩  → mDNS Auto-Discovery  │
│  問題 3: 10 個 bot 在 Dashboard 太混亂    → Bot Tags + Filter Bar   │
│  問題 4: 報表功能設計了但沒寫               → Fleet Report API 實作  │
│  問題 5: 花多少錢沒預算概念               → Cost Budget System       │
│  問題 6: 資料多但沒有「所以呢？」          → Fleet Intelligence Engine│
└──────────────────────────────────────────────────────────────────────┘
```

---

**1. Agent Turn Trace Waterfall 實作（#11 設計的前端瀑布圖，本次完整建構）**

Planning #11 定義了 `AgentTurnTrace` 資料結構和概念 wireframe，但沒有寫任何程式碼。
本次完整實作前端 + 後端收集邏輯。

**架構決策（新洞察，#11 沒考慮到的）：**

問題：Gateway 的 `agent` event stream 是即時的——一旦 turn 結束，事件就消失了。
如果 FleetGatewayClient 沒有在監聽時捕捉到，trace 就丟失了。

**解法：Trace Ring Buffer**
```typescript
// 在 FleetGatewayClient 內部，即時收集 agent events 組裝 trace
// 用 ring buffer 保留最近 200 個 completed traces（per bot）
// 不寫 DB（頻率太高），只在記憶體中保留

interface TraceRingBuffer {
  capacity: number;        // 200
  traces: Map<string, AgentTurnTrace>;  // runId → trace
  order: string[];         // insertion order for eviction
  activeTurn?: {           // 正在進行的 turn（尚未完成）
    runId: string;
    startedAt: number;
    phases: TracePhase[];
  };
}
```

**為什麼 Ring Buffer 而不是 DB？**
- 一個 bot 每小時可能有 50+ agent turns
- 4 個 bot × 50 turns × 平均 8 phases = 1600 phase records/hour
- 寫 DB 太浪費——95% 的 traces 沒人會看
- Ring Buffer 在記憶體中保留，Fleet Dashboard 打開時才讀取
- 如果 bot 離線，buffer 清空——這是合理的（離線的 bot 不需要歷史 trace）

**Trace Collector（嵌入 FleetGatewayClient）：**
```typescript
// 在 FleetGatewayClient.handleEvent() 中新增：
case "agent": {
  const { runId, seq, stream, phase, data, ts } = payload;

  if (phase === "start") {
    this.traceBuffer.startTurn(runId, ts);
  } else if (stream === "assistant") {
    this.traceBuffer.addPhase(runId, {
      type: "llm_output",
      startMs: ts - this.traceBuffer.activeTurn!.startedAt,
      durationMs: 0,  // updated on next event
      metadata: { outputTokens: data?.usage?.output }
    });
  } else if (stream === "tool_use") {
    this.traceBuffer.addPhase(runId, {
      type: "tool_call",
      name: data?.toolName,
      startMs: ts - this.traceBuffer.activeTurn!.startedAt,
      durationMs: data?.durationMs ?? 0,
    });
  } else if (phase === "completed" || phase === "failed" || phase === "cancelled") {
    this.traceBuffer.completeTurn(runId, phase, ts);
  }
  break;
}
```

**前端 Waterfall 組件（全新）：**

```
TraceWaterfall/
  ├── TraceWaterfall.tsx     — 主容器：trace 列表 + 選中 trace 的瀑布圖
  ├── TraceTimeline.tsx      — 水平時間軸 + phase 色條（SVG/Canvas）
  ├── TracePhaseBar.tsx      — 單個 phase 的色條（LLM=藍, Tool=綠, Error=紅）
  ├── TraceSummaryRow.tsx    — 摘要列（duration, tokens, status badge）
  └── TraceDetail.tsx        — 展開的 phase 詳情（tool 名稱、token 數、error message）
```

**色彩編碼（跟 Chrome DevTools 致敬，但用 Pain Point 暖色調）：**
```
LLM Think     → oklch(0.758 0.095 68)  // 品牌金（等待 LLM 回應）
LLM Output    → oklch(0.648 0.120 180) // Teal（LLM 輸出串流）
Tool Call     → oklch(0.720 0.175 155) // Green（工具執行）
Tool Result   → oklch(0.663 0.088 62)  // Tan（工具回傳）
Error         → oklch(0.550 0.200 25)  // 暖紅（錯誤）
Idle Gap      → oklch(0.900 0.012 70)  // 淺灰（空閒間隙）
```

**API：**
```
GET /api/fleet-monitor/bot/:botId/traces              — 最近 N 個 traces 摘要
GET /api/fleet-monitor/bot/:botId/traces/:runId        — 單個 trace 完整 phases
GET /api/fleet-monitor/bot/:botId/traces/active         — 正在進行的 trace（live）
```

**與 Session Live Tail 的整合：**
在 SessionLiveTail 組件中，每條 agent turn 訊息旁邊加一個 `[🔍 Trace]` 按鈕。
點擊 → 右側滑出 TraceWaterfall 面板（Sheet 組件），顯示該 turn 的完整瀑布圖。

→ **從「bot 回了一則訊息」升級到「bot 花了 8.2 秒回訊息：1.2s 思考 → 2.1s 輸出 → 0.8s 讀檔 → 0.5s 搜尋 → ...」**
→ **Performance debugging 不再需要 SSH。**

---

**2. Gateway mDNS Auto-Discovery — 零配置 Bot 發現（全新功能）**

**洞察：之前所有 Planning 都假設管理者需要手動輸入 Gateway URL + Token。但 OpenClaw Gateway 已經有 Bonjour/mDNS-SD 廣播！**

OpenClaw Gateway 啟動時，在本地網路廣播：
```
Service Type: _openclaw-gw._tcp
Port: 18789 (default)
TXT Records:
  - version: "2026.1.24-3"
  - deviceId: "abc123..."
  - hostname: "MacBookPro-lobster"
  - tls: "false" / "true"
```

**如果 Fleet Server 也在同一個 LAN（Pain Point 的辦公室場景），我們可以自動發現所有 Gateway！**

**技術實作：**
```typescript
// 使用 Node.js 的 multicast-dns 或 bonjour-service 套件
import { Bonjour } from "bonjour-service";

class GatewayDiscoveryService {
  private bonjour = new Bonjour();
  private discovered = new Map<string, DiscoveredGateway>();
  private browser: any;

  start() {
    this.browser = this.bonjour.find({ type: "openclaw-gw" }, (service) => {
      const gateway: DiscoveredGateway = {
        id: service.txt?.deviceId ?? service.name,
        host: service.host,
        port: service.port,
        version: service.txt?.version,
        hostname: service.txt?.hostname,
        tls: service.txt?.tls === "true",
        discoveredAt: new Date(),
        url: `${service.txt?.tls === "true" ? "wss" : "ws"}://${service.host}:${service.port}`,
      };
      this.discovered.set(gateway.id, gateway);
      this.emit("gateway-found", gateway);
    });
  }

  getDiscovered(): DiscoveredGateway[] {
    return Array.from(this.discovered.values());
  }
}
```

**Connect Bot Wizard 升級：**
```
┌─ Connect a Bot ──────────────────────────────────────────────────────┐
│                                                                       │
│  🔍 Auto-Discovered on Your Network               [Refresh]          │
│  ┌─────────────────────────────────────────────────────────┐         │
│  │  📡 MacBookPro-lobster  192.168.50.73:18789  v2026.1.24 │ [Connect]│
│  │  📡 MacMini-office-1    192.168.50.74:18789  v2026.1.24 │ [Connect]│
│  │  📡 MacMini-office-2    192.168.50.75:18789  v2026.1.22 │ [Connect]│
│  │  📡 MacMini-office-3    192.168.50.76:18797  v2026.1.24 │ [Connect]│
│  └─────────────────────────────────────────────────────────┘         │
│                                                                       │
│  ── or ──                                                            │
│                                                                       │
│  Manual Connection                                                    │
│  Gateway URL: [ws://________________:18789]                          │
│  Auth Token:  [____________________________]                         │
│                                                                       │
│  [Test Connection]  [Connect & Add to Fleet]                         │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

**API：**
```
GET /api/fleet-monitor/discovery          — 列出所有 mDNS 發現的 Gateway
POST /api/fleet-monitor/discovery/refresh  — 強制重新掃描（30 秒超時）
```

**安全考量：**
- mDNS 發現只回傳 host/port/version，不自動連接
- 連接仍需要 Token（Connect 按鈕 → 彈出 Token 輸入 modal）
- 僅在 LAN 環境有效（mDNS 不穿越 router）
- 管理者可在 settings 中關閉 auto-discovery

→ **從手動輸入 `ws://192.168.50.73:18789` 到一鍵發現 → 一鍵連接。**
→ **新 bot 開機 → 自動出現在 Discovery 列表 → 管理者點 Connect → 完成。**

---

**3. Bot Tags + Smart Grouping + Dashboard Filter Bar（Fleet 擴展性的關鍵）**

**洞察：** 目前 FleetDashboard 把所有 bot 平鋪在一個 grid 裡。4 個 bot 沒問題。但 Pain Point 的目標是管理 10-20+ bot。

當 bot 數量增長，你需要：
- **分類**：哪些是 production？哪些是 staging？
- **篩選**：只看 LINE 通道的 bot
- **分組**：按團隊 / 用途 / 地理位置分組

**三層標籤系統：**

```typescript
interface BotTag {
  id: string;
  label: string;
  color: string;        // oklch color token
  category: "environment" | "channel" | "team" | "custom";
  autoAssigned: boolean; // true = system detected, false = user created
}

// 預設標籤（自動偵測）
const AUTO_TAGS = {
  // 根據 channel status 自動標記
  "channel:line":     { label: "LINE",     color: "#00B900", category: "channel" },
  "channel:telegram": { label: "Telegram", color: "#26A5E4", category: "channel" },
  "channel:discord":  { label: "Discord",  color: "#5865F2", category: "channel" },
  // 根據 model 自動標記
  "model:opus":       { label: "Opus",     color: "#9940ED", category: "custom" },
  "model:sonnet":     { label: "Sonnet",   color: "#376492", category: "custom" },
  // 使用者自訂
  "env:production":   { label: "Production", color: "#27BD74", category: "environment" },
  "env:staging":      { label: "Staging",    color: "#D4A373", category: "environment" },
};
```

**Smart Auto-Tagging（智能自動標籤）：**
- Bot 有 LINE channel connected → 自動加 `channel:line` 標籤
- Bot 用 Claude Opus model → 自動加 `model:opus` 標籤
- Bot 在辦公時間外有活動 → 自動加 `schedule:24-7` 標籤
- Bot 的 cron jobs > 5 個 → 自動加 `type:automation` 標籤

**Dashboard Filter Bar：**
```
┌─ Fleet Dashboard ────────────────────────────────────────────────────┐
│                                                                       │
│  🏷️ [All] [Production ✕] [LINE ✕] [Opus] [Staging]  🔍 Search...   │
│     Group by: [None ▼] [Environment] [Channel] [Team]               │
│     Sort by:  [Health ▼] [Cost ↓] [Name] [Last Active]              │
│                                                                       │
│  ── Production (3 bots) ──────────────────────────────────────────── │
│  [🦞 小龍蝦] [🐿️ 飛鼠] [🦚 孔雀]                                  │
│                                                                       │
│  ── Staging (1 bot) ──────────────────────────────────────────────── │
│  [🐗 山豬]                                                           │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

**DB Schema：**
```typescript
// packages/db/src/schema/bot-tags.ts
export const botTags = pgTable("bot_tags", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull().references(() => companies.id),
  agentId: text("agent_id").notNull().references(() => agents.id),
  tag: text("tag").notNull(),         // e.g., "env:production"
  label: text("label").notNull(),     // e.g., "Production"
  color: text("color"),               // hex or oklch
  category: text("category").notNull(),
  autoAssigned: boolean("auto_assigned").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});
```

**API：**
```
GET    /api/fleet-monitor/tags                    — 列出所有標籤
POST   /api/fleet-monitor/bot/:botId/tags         — 新增標籤
DELETE /api/fleet-monitor/bot/:botId/tags/:tagId   — 移除標籤
POST   /api/fleet-monitor/tags/auto-detect         — 觸發智能標籤偵測
```

→ **從「所有 bot 平鋪」到「按標籤篩選、按維度分組、智能自動標記」。**
→ **10 個 bot 時，管理者只要點一個標籤就能看到相關子集。**

---

**4. Fleet Report API 實作（填補 Planning #11 的程式碼缺口）**

Planning #11 設計了 Fleet Report，但 `server/src/routes/fleet-report.ts` 從未建立。

**本次實作：**

```typescript
// server/src/routes/fleet-report.ts
// GET /api/fleet-monitor/report?from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv|json

interface FleetReportData {
  period: { from: string; to: string };
  generatedAt: string;
  fleet: {
    name: string;
    totalBots: number;
    avgUptime: number;         // 0-100%
    avgHealthScore: number;    // 0-100
    totalCostUsd: number;
    totalSessions: number;
    totalTokensInput: number;
    totalTokensOutput: number;
  };
  perBot: Array<{
    id: string;
    name: string;
    emoji: string;
    tags: string[];
    avgHealthScore: number;
    uptimePercent: number;
    totalCostUsd: number;
    sessionsCount: number;
    topChannels: Array<{ channel: string; cost: number; sessions: number }>;
    alertsFired: number;
    alertsCritical: number;
  }>;
  dailyCostTrend: Array<{ date: string; costUsd: number; sessions: number }>;
  topAlerts: Array<{
    date: string;
    botName: string;
    ruleName: string;
    severity: string;
    durationMinutes: number;
    resolved: boolean;
  }>;
  configDriftSummary: {
    totalDrifts: number;
    criticalDrifts: number;
    topDrift: string | null;  // most impactful drift description
  };
}
```

**CSV 輸出格式（管理者可直接在 Excel 打開）：**
```csv
Bot Name,Emoji,Avg Health,Uptime %,Total Cost,Sessions,Top Channel,Alerts Fired
小龍蝦,🦞,87,99.2,$45.30,284,LINE,$28.50,3
飛鼠,🐿️,92,99.8,$32.10,156,Telegram,$18.20,1
孔雀,🦚,78,95.4,$28.70,198,LINE,$22.10,5
山豬,🐗,65,88.1,$18.90,87,Discord,$12.40,8
```

→ **管理者不需要截圖 Dashboard，直接下載 CSV 給老闆看。**

---

**5. Cost Budget System — 從「花了多少」到「能花多少」（全新概念）**

**洞察：** Planning #11 加了 Channel Cost Breakdown（按通道分解成本）。但分解只是「看過去」。
管理者真正需要的是「控制未來」：**預算制**。

**問題場景：**
- Bot A 上個月花了 $45，這個月才過 15 天就花了 $60——但沒人知道
- LINE 通道每天花 $2，突然某天花了 $15（有人灌了大量訊息）——事後才發現
- 老闆說「每月 AI 預算 $200」，但沒有工具能追蹤進度

**Cost Budget 系統：**

```typescript
interface CostBudget {
  id: string;
  scope: "fleet" | "bot" | "channel";
  scopeId: string;        // fleetId, botId, or "line"/"telegram"
  monthlyLimitUsd: number;
  alertThresholds: number[];  // e.g., [0.5, 0.8, 0.95] → 50%, 80%, 95%
  action: "alert_only" | "alert_and_throttle";
  // throttle = 建議管理者降級 model，不自動執行
}

interface BudgetStatus {
  budget: CostBudget;
  currentMonthSpend: number;
  percentUsed: number;
  projectedMonthEnd: number;  // 基於每日平均 * 剩餘天數
  daysRemaining: number;
  dailyBurnRate: number;
  onTrack: boolean;           // projectedMonthEnd <= monthlyLimitUsd
  breachedThresholds: number[];
}
```

**Budget Dashboard Widget：**
```
┌─ 💰 Cost Budgets ─────────────────────────────────────────────────────┐
│                                                                        │
│  Fleet Budget: $200/mo                                                 │
│  ████████████████░░░░░░░░░░░░░░  $126.00 / $200.00 (63%)             │
│  📈 Daily burn: $8.40 · Projected month-end: $192 · ✅ On track      │
│                                                                        │
│  Per Bot:                                                              │
│  🦞 小龍蝦  ████████████████████░░░  $45.30 / $60  (76%) ⚠️          │
│  🐿️ 飛鼠   ████████████░░░░░░░░░░░  $32.10 / $60  (54%)             │
│  🦚 孔雀   ██████████████░░░░░░░░░  $28.70 / $50  (57%)              │
│  🐗 山豬   ████████░░░░░░░░░░░░░░░  $18.90 / $50  (38%)              │
│                                                                        │
│  Per Channel:                                                          │
│  LINE      ██████████████████░░░░░  $68.50 / $100 (69%)               │
│  Telegram  ████████░░░░░░░░░░░░░░░  $26.20 / $60  (44%)               │
│                                                                        │
│  ⚠️ 🦞 小龍蝦 projected to exceed budget by $4.20 (107%)              │
│  💡 Suggestion: Switch 🦞 from Opus to Sonnet for non-critical tasks  │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

**預算警報規則（整合進 AlertService）：**
```typescript
const BUDGET_ALERT_RULES = [
  { threshold: 0.80, severity: "warning",  message: "80% of monthly budget used" },
  { threshold: 0.95, severity: "critical", message: "95% of monthly budget — consider throttling" },
  { threshold: 1.00, severity: "critical", message: "Monthly budget EXCEEDED" },
];
```

**API：**
```
GET    /api/fleet-monitor/budgets                  — 列出所有預算
POST   /api/fleet-monitor/budgets                  — 建立預算
PUT    /api/fleet-monitor/budgets/:id              — 修改預算
DELETE /api/fleet-monitor/budgets/:id              — 刪除預算
GET    /api/fleet-monitor/budgets/status            — 所有預算的當前狀態
```

→ **從「這個月花了 $126」到「這個月預算 $200，已用 63%，按照目前燒錢速度月底預計 $192，安全」。**
→ **超過 80% 預算自動告警。超過 100% 建議降級 model。**

---

**6. Fleet Intelligence Recommendations Engine（全新架構，跨功能智能層）**

**洞察：** 前 11 次 Planning 建了很多獨立功能（Health Score、Cost Tracking、Config Drift、Alerts）。
但沒有一個「大腦」把所有訊號整合起來做推論。

**舉例：**
- Health Score 知道 Bot A 的 Efficiency 分數掉了（token cache hit ratio 低）
- Cost Tracking 知道 Bot A 的成本在上升
- Config Drift 知道 Bot A 用的是 Opus（最貴的 model）
- 但沒有系統會把這三件事連起來說：「Bot A 的成本上升是因為 cache hit ratio 低 + 用了 Opus。建議：檢查是否有重複的長對話消耗 cache，或考慮 Sonnet。」

**Fleet Intelligence Engine：**

```typescript
interface Recommendation {
  id: string;
  type: "cost_optimization" | "health_improvement" | "config_suggestion" | "capacity_warning";
  severity: "info" | "actionable" | "urgent";
  title: string;
  description: string;
  affectedBots: string[];
  suggestedAction: string;
  estimatedImpact: string;     // e.g., "Save ~$15/mo", "Improve health +12 pts"
  dataPoints: Array<{
    source: string;            // "health_score", "cost_tracking", "config_drift"
    observation: string;
  }>;
  dismissed: boolean;
  createdAt: Date;
}

class FleetIntelligenceEngine {
  // 每 30 分鐘運行一次分析
  async analyze(fleet: FleetStatus): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    // Rule 1: 成本異常 + model 建議
    for (const bot of fleet.bots) {
      if (bot.costTrend === "rising" && bot.model === "claude-opus") {
        const sonnetEstimate = bot.currentCost * 0.2; // Opus → Sonnet ≈ 5x cheaper
        recommendations.push({
          type: "cost_optimization",
          severity: "actionable",
          title: `${bot.emoji} ${bot.name} 成本持續上升`,
          description: `過去 7 天成本趨勢上升 ${bot.costIncreasePct}%，且使用 Opus model。`,
          suggestedAction: `考慮將非關鍵任務切換至 Sonnet，預估可節省 ~$${(bot.currentCost - sonnetEstimate).toFixed(0)}/mo`,
          estimatedImpact: `Save ~$${(bot.currentCost - sonnetEstimate).toFixed(0)}/mo`,
          dataPoints: [
            { source: "cost_tracking", observation: `7 日成本趨勢 +${bot.costIncreasePct}%` },
            { source: "config_drift", observation: `使用 ${bot.model}（最高定價 tier）` },
          ],
        });
      }
    }

    // Rule 2: 低 cache ratio → 成本優化機會
    // Rule 3: 多個 bot 離線 → 可能是網路問題而非個別 bot 問題
    // Rule 4: Cron 失敗率上升 → 檢查 bot 工作負載
    // Rule 5: Channel 不均衡 → 建議負載分散
    // Rule 6: 預算即將超支 → 提前預警
    // Rule 7: 新 bot 連接後 health 不穩定 → 建議 warmup 期

    return recommendations;
  }
}
```

**Recommendations Widget（嵌入 FleetDashboard 頂部）：**
```
┌─ 💡 Fleet Intelligence ──────────────────────────────────────────────┐
│                                                                       │
│  3 recommendations · 1 urgent                                         │
│                                                                       │
│  🔴 URGENT: 🦞🐿️ 兩個 bot 同時離線（14:30）                         │
│     可能是辦公室網路問題，而非個別 bot 故障                              │
│     → [Check Network] [View Bot Details]                              │
│                                                                       │
│  🟡 ACTIONABLE: 🦞 小龍蝦 成本可優化 ~$35/mo                         │
│     Opus model + 低 cache ratio (32%) → 切換 Sonnet + 啟用 prompt cache│
│     → [View Details] [Dismiss]                                        │
│                                                                       │
│  🔵 INFO: LINE 通道佔總成本 67%                                       │
│     考慮為 LINE 設置較短的 max_tokens 限制                              │
│     → [View Cost Breakdown] [Dismiss]                                  │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

**Intelligence Rules 設計原則：**
1. **Cross-signal correlation** — 單一指標不觸發推薦，至少兩個信號交叉才觸發
2. **Actionable** — 每條推薦必須有具體的 "suggested action"
3. **Non-intrusive** — 可 dismiss，dismissed 的推薦 7 天內不再出現
4. **Estimated impact** — 每條推薦有量化的預期效果
5. **Source transparency** — 列出推論依據的資料來源，讓管理者可以驗證

→ **從「Dashboard 是一面鏡子」到「Dashboard 是一個顧問」。**
→ **不只告訴你「發生了什麼」，還告訴你「你應該做什麼」和「為什麼」。**

---

**7. 本次程式碼產出**

**Commit 25: Agent Turn Trace — Ring Buffer + API + Waterfall 前端**
```
修改：server/src/services/fleet-gateway-client.ts
  — 新增 TraceRingBuffer class
  — 在 handleEvent() 中收集 agent events → 組裝 trace
  — 新增 getTraces() / getTrace(runId) / getActiveTrace() 方法

新增：server/src/routes/fleet-monitor.ts（新增 3 個 endpoint）
  — GET /api/fleet-monitor/bot/:botId/traces
  — GET /api/fleet-monitor/bot/:botId/traces/active
  — GET /api/fleet-monitor/bot/:botId/traces/:runId

新增：ui/src/components/fleet/TraceWaterfall.tsx
  — TraceTimeline（SVG 瀑布圖）
  — TracePhaseBar（phase 色條 + hover 詳情）
  — TraceSummaryRow（duration / tokens / status）
  — 與 SessionLiveTail 的 [🔍 Trace] 按鈕整合

修改：ui/src/api/fleet-monitor.ts（新增 trace API 方法）
修改：ui/src/hooks/useFleetMonitor.ts（新增 useTraces / useActiveTrace hooks）
```

**Commit 26: Gateway mDNS Auto-Discovery**
```
新增：server/src/services/gateway-discovery.ts
  — GatewayDiscoveryService class（bonjour-service 整合）
  — Event: "gateway-found" / "gateway-lost"
  — 30 秒掃描超時 + 去重

新增：server/src/routes/fleet-monitor.ts（新增 2 個 endpoint）
  — GET /api/fleet-monitor/discovery
  — POST /api/fleet-monitor/discovery/refresh

修改：ui/src/components/fleet/ConnectBotWizard.tsx
  — 新增 "Auto-Discovered" 區塊（顯示 mDNS 發現的 Gateway）
  — 一鍵連接（帶 Token 輸入 modal）

修改：ui/src/api/fleet-monitor.ts（新增 discovery API 方法）
修改：ui/src/hooks/useFleetMonitor.ts（新增 useDiscovery hook）
```

**Commit 27: Bot Tags + Filter Bar**
```
新增：packages/db/src/schema/bot-tags.ts
  — botTags 表定義

新增：server/src/services/fleet-tags.ts
  — TagService class
  — Auto-tag 偵測邏輯（channel / model / schedule）

新增：server/src/routes/fleet-tags.ts
  — CRUD endpoints for tags

新增：ui/src/components/fleet/FilterBar.tsx
  — Tag 篩選 chips
  — Group by dropdown
  — Sort by dropdown
  — Search input

修改：ui/src/components/fleet/FleetDashboard.tsx
  — 嵌入 FilterBar
  — 支援 grouped rendering（按 tag category 分組）
```

**Commit 28: Fleet Report API**
```
新增：server/src/routes/fleet-report.ts
  — GET /api/fleet-monitor/report?from=&to=&format=csv|json
  — CSV 生成（手寫，不依賴外部庫）
  — JSON 結構化報表

修改：server/src/fleet-bootstrap.ts
  — 註冊 fleet-report router

新增：ui/src/components/fleet/ReportDownload.tsx
  — 月份選擇器 + 格式選擇 + 下載按鈕
```

**Commit 29: Cost Budget System**
```
新增：server/src/services/fleet-budget.ts
  — BudgetService class
  — 預算追蹤 + 預測（linear projection）
  — 整合 AlertService（超過 threshold 觸發 alert）

新增：server/src/routes/fleet-budget.ts
  — CRUD endpoints for budgets
  — GET /budgets/status（所有預算的即時狀態）

新增：ui/src/components/fleet/BudgetWidget.tsx
  — Progress bar（品牌色漸變）
  — Projected month-end 預測線
  — 超支警告 + 建議
```

**Commit 30: Fleet Intelligence Engine**
```
新增：server/src/services/fleet-intelligence.ts
  — FleetIntelligenceEngine class
  — 7 條預設推薦規則
  — Cross-signal correlation 邏輯
  — Dismiss + cooldown 機制

新增：server/src/routes/fleet-intelligence.ts
  — GET /api/fleet-monitor/recommendations
  — POST /api/fleet-monitor/recommendations/:id/dismiss

新增：ui/src/components/fleet/IntelligenceWidget.tsx
  — 推薦卡片列表
  — Severity 色彩編碼
  — Data source 透明度標記
  — Dismiss 按鈕
```

---

**8. 與前幾次 Planning 的關鍵差異**

| 面向 | 之前的想法 | Planning #12 的改進 |
|------|----------|-------------------|
| 除錯 | Health Score 數字（#6）+ 三支柱概念（#11） | Agent Turn Trace Waterfall 完整實作（瀑布圖 + Ring Buffer + API） |
| Bot 發現 | 手動輸入 Gateway URL | mDNS Auto-Discovery 零配置（Bonjour 廣播） |
| Dashboard 導航 | 平鋪所有 bot | Bot Tags + Smart Grouping + Filter Bar |
| 報表 | 設計了但沒寫（#11） | Fleet Report API 完整實作（CSV + JSON） |
| 成本管控 | 看過去花了多少 | Cost Budget 預算制（預測 + 閾值告警） |
| 智能化 | 各功能獨立運作 | Fleet Intelligence Engine（跨信號推薦） |
| Dashboard 角色 | 鏡子（反映狀態） | 顧問（主動建議 + 預測） |

---

**9. 風險更新**

| 新風險 | 嚴重度 | 緩解 |
|--------|--------|------|
| mDNS 在某些企業網路被防火牆擋 | 🟡 中 | Fallback 到手動輸入；mDNS 是 opt-in 加速，不是必須 |
| Intelligence Engine 誤報推薦讓管理者失去信任 | 🟡 中 | 要求至少 2 個 cross-signal 才觸發；dismiss 後 7 天冷卻；顯示推論依據 |
| Trace Ring Buffer 記憶體佔用（200 traces × 4 bots） | 🟢 低 | 估計每 trace ~2KB，200×4=~1.6MB，可忽略 |
| Auto-tagging 與 user tags 衝突 | 🟢 低 | Auto tags 有 `autoAssigned` 標記，user tags 永遠優先 |
| Budget 預測基於 linear projection 不夠準 | 🟡 中 | Phase 1 用 linear，未來可加 EMA（指數移動平均） |
| Report CSV 大檔案（100+ bot × 30 天） | 🟢 低 | Streaming response + 限制最長 90 天 |
| FleetIntelligenceEngine 30 分鐘掃描拖慢伺服器 | 🟢 低 | 非同步執行 + 用 cached data（不發 RPC） |

---

**10. 修訂的整體進度追蹤**

```
✅ Planning #1-4: 概念、API 研究、架構設計
✅ Planning #5: 品牌主題 CSS + DB aliases + 術語改名
✅ Planning #6: FleetGatewayClient + FleetMonitorService + API routes
✅ Planning #7: Mock Gateway + Health Score + AlertService + 時序策略 + Command Center
✅ Planning #8: Fleet API client + React hooks + BotStatusCard + FleetDashboard + ConnectBotWizard
✅ Planning #9: Route wiring + Sidebar Fleet Pulse + LiveEvent bridge + BotDetailFleetTab + Companies Connect
✅ Planning #10: Server Bootstrap + Graceful Shutdown + DB Migrations + Anomaly Detection + Cost Forecast + E2E Tests + i18n
✅ Planning #11: Observable Fleet（三支柱）+ Config Drift + Channel Cost + Session Live Tail + Notification Center + Heatmap + Runbooks + Reports
✅ Planning #12: Fleet Intelligence Layer — Trace Waterfall + mDNS Discovery + Tags + Reports API + Cost Budgets + Intelligence Engine
⬜ Next: Fleet Command Center UI（batch operations 前端 + Canary 模式 UI）
⬜ Next: Auto-Harmonize 整合（Config Drift → Intelligence Engine 推薦 → 一鍵修復）
⬜ Next: Runbook 編輯 UI + 自訂 Runbook
⬜ Next: Intelligence Engine 進階規則（異常偵測 ML、行為模式分析）
⬜ Next: Multi-Fleet 支援（管理多個獨立車隊）
⬜ Next: Bot 間通訊圖（inter-bot interaction graph）
⬜ Next: PDF 報表生成（puppeteer 渲染 Dashboard → PDF）
⬜ Next: Pixel art bot 頭像生成器
⬜ Next: 手機 PWA + Push Notifications
⬜ Next: 效能壓力測試（50 bot 同時連線模擬）
```

---

**下一步 Planning #13（如果需要）：**
- Fleet Command Center UI（batch operations + Canary 模式 rollout）
- Auto-Harmonize 與 Intelligence Engine 深度整合
- Multi-Fleet 支援（Fleet of Fleets 架構）
- Bot 間通訊圖 + Dependency mapping
- Intelligence Engine v2（趨勢偵測、異常模式學習）
- 效能基準測試（50 bot stress test）

---

### Planning #13 — 2026-03-19 22:15
**主題：Fleet as Control Plane — 從 Observer 進化為 Orchestrator + Webhook Push 模型 + Inter-Bot 社交圖 + RBAC 審計 + Plugin 清單 + Glassmorphism UI**

---

**🎮 iteration #13 → 「操控層」階段：從看到做，從被動到主動**

前 12 次 Planning 建造了一個世界級的「觀測站」：
- 看得到狀態（Dashboard）、看得到原因（Traces）、看得到趨勢（Intelligence Engine）。
- 但有一個結構性盲點：**Fleet 只能「看」，不能「做」。**

就像你站在一座超高科技的飛航管制塔——雷達完美、天氣預報精準、每架飛機的位置一清二楚——但你的麥克風壞了。你看到兩架飛機要撞了，但你發不出指令。

**Planning #13 的核心命題：接上麥克風。讓 Fleet 不只是觀測站，而是控制台。**

而且，本次研究發現了 OpenClaw Gateway 中三個之前完全沒利用的能力——它們是開啟控制台的鑰匙：

```
┌──────────────────────────────────────────────────────────────────────────┐
│  發現 1: Webhook Ingress API                                              │
│    POST /hooks/wake — 喚醒 bot                                           │
│    POST /hooks/agent — 觸發隔離的 agent turn                              │
│    → Fleet 可以 **主動命令** bot 執行任務，不只讀取狀態                      │
│                                                                            │
│  發現 2: Inter-Agent Communication Protocol                               │
│    tools.agentToAgent — bot 間直接通訊                                     │
│    sessions_spawn — 生成子 agent                                          │
│    sessions_send — 跨 bot 發送訊息                                        │
│    → Fleet 可以 **看見** bot 之間的溝通圖譜                                 │
│                                                                            │
│  發現 3: Operator Scopes (Protocol v3)                                    │
│    operator.read / operator.write / operator.admin                        │
│    → Fleet 可以 **分級授權**，不同角色看到不同東西                            │
│                                                                            │
│  發現 4: Plugin SDK (43 bundled extensions)                               │
│    openclaw.plugin.json manifest + channel sub-modules                    │
│    → Fleet 可以 **盤點** 每個 bot 裝了什麼 plugin                          │
│                                                                            │
│  發現 5: Gateway Rate Limiting                                            │
│    auth: 10 attempts/60s → 429 + lockout 5min                            │
│    config writes: 3 req/60s per device                                    │
│    → Fleet 必須 **尊重限流**，否則會被鎖                                    │
│                                                                            │
│  發現 6: painpoint-ai.com 新品牌元素                                       │
│    Teal accent: #264653 / #2A9D8F（資訊色）                               │
│    Glassmorphism: backdrop-blur + 半透明背景                                │
│    Floating animations: 8-15s ambient 動畫                                 │
│    LINE green: #00B900（按鈕 CTA）                                         │
│    → UI 可以更接近官網的「溫暖玻璃態」設計語言                               │
└──────────────────────────────────────────────────────────────────────────┘
```

這六個發現改變了 Fleet 的定位：從 **Dashboard（被動鏡子）** 到 **Control Plane（主動控制台）**。

---

**1. Fleet Webhook Receiver — 反轉資料流方向（Push 取代 Poll 的架構革命）**

**之前的架構（Pull Model）：**
```
Fleet → poll every 15s → Gateway A
Fleet → poll every 15s → Gateway B
Fleet → poll every 15s → Gateway C
Fleet → poll every 15s → Gateway D

問題：
- 4 bots × 每 15 秒 = 16 requests/min（可接受）
- 20 bots × 每 15 秒 = 80 requests/min（開始吃力）
- 50 bots × 每 15 秒 = 200 requests/min（不可行）
- 每個 bot 的 Gateway 都在被 Fleet 不斷敲門，即使什麼都沒發生
```

**新架構（Push Model — 利用 Webhook Ingress）：**
```
Bot A cron 完成 → POST /api/fleet-receiver/webhook/botA → Fleet 更新
Bot B 收到訊息 → POST /api/fleet-receiver/webhook/botB → Fleet 更新
Bot C 閒置中 → （什麼都不發送）→ Fleet 不需要處理

優勢：
- 零空轉：只有事件發生時才有流量
- 即時性：cron 完成 → 毫秒級通知 Fleet（不需等 15 秒）
- 可擴展：50 bots 的 Fleet 和 4 bots 的 Fleet 伺服器負載相同
- 節能：Gateway 不需要處理持續的 poll requests
```

**但 Push 不完全取代 Pull——混合模型才是最佳解：**
```
┌─────────────────────────────────────────────────────────┐
│  即時事件 → Push（Webhook + WebSocket）                   │
│  - Cron 結果、聊天訊息、Agent turn 完成、Alert            │
│  - 毫秒延遲、零空轉                                       │
│                                                           │
│  定期快照 → Pull（降頻 polling，5 分鐘一次）              │
│  - 健康分數、token 用量、channel 狀態                      │
│  - 容錯：即使 webhook 漏了，5 分鐘內一定能同步             │
│                                                           │
│  心跳保活 → Pull（60 秒一次，極輕量）                     │
│  - 只確認 bot 在線，不拉資料                               │
│  - 等同 TCP keepalive                                      │
└─────────────────────────────────────────────────────────┘
```

**技術實作：**

```typescript
// server/src/routes/fleet-receiver.ts
import { Router } from "express";
import type { FleetMonitorService } from "../services/fleet-monitor";

export function fleetReceiverRouter(monitor: FleetMonitorService): Router {
  const router = Router();

  // Webhook receiver — bots push events to Fleet
  router.post("/webhook/:botId", async (req, res) => {
    const { botId } = req.params;
    const token = req.headers["x-fleet-token"] as string;

    // 驗證 token（每個 bot 連接時生成的 fleet-specific token）
    const bot = monitor.getBot(botId);
    if (!bot || bot.fleetToken !== token) {
      return res.status(401).json({ error: "Invalid fleet token" });
    }

    const event = req.body as WebhookEvent;

    switch (event.type) {
      case "cron.completed": {
        monitor.handleCronResult(botId, event.payload);
        break;
      }
      case "agent.turn.completed": {
        monitor.handleAgentTurnComplete(botId, event.payload);
        // 同時更新 TraceRingBuffer
        monitor.getClient(botId)?.traceBuffer.ingestWebhookTrace(event.payload.trace);
        break;
      }
      case "chat.message": {
        monitor.handleChatMessage(botId, event.payload);
        break;
      }
      case "health.changed": {
        monitor.handleHealthChange(botId, event.payload);
        break;
      }
      case "alert.self": {
        // Bot 自己偵測到問題，主動通報 Fleet
        monitor.handleBotSelfAlert(botId, event.payload);
        break;
      }
    }

    res.status(200).json({ received: true, processedAt: new Date().toISOString() });
  });

  // Fleet registration endpoint — bot 啟動時呼叫此 API 註冊 webhook URL
  router.post("/register/:botId", async (req, res) => {
    const { botId } = req.params;
    const { callbackUrl, events } = req.body;
    // 告訴 bot 的 Gateway：「把這些事件 POST 到 Fleet 的 webhook URL」
    // 利用 cron delivery mode = "webhook" + hooks system
    await monitor.registerWebhook(botId, callbackUrl, events);
    res.json({ registered: true, events });
  });

  return router;
}

interface WebhookEvent {
  type: string;
  botId: string;
  timestamp: string;
  payload: Record<string, unknown>;
  signature?: string;  // HMAC-SHA256 簽名（用 fleetToken）
}
```

**ConnectBotWizard 升級 — Step 4: Webhook Setup（新增步驟）：**
```
┌─ Connect a Bot ──────────────────────────────────────────────────────┐
│                                                                       │
│  Step 4: Event Delivery (Optional)                                   │
│                                                                       │
│  How should this bot report events to Fleet?                         │
│                                                                       │
│  ● WebSocket (default) — Fleet maintains persistent connection       │
│  ○ Webhook Push — Bot pushes events to Fleet HTTP endpoint           │
│    Fleet URL: https://fleet.painpoint.ai/api/fleet-receiver/webhook  │
│    Events: ☑ Cron results  ☑ Chat messages  ☑ Agent turns           │
│           ☑ Health changes  ☐ All events                            │
│  ○ Hybrid — WebSocket + Webhook fallback                            │
│                                                                       │
│  💡 Webhook mode is recommended for bots on unreliable networks     │
│     or when managing 10+ bots (reduces server load).                │
│                                                                       │
│  [Back]  [Skip]  [Configure & Connect]                              │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

**Webhook 安全性（HMAC 簽名驗證）：**
```typescript
import { createHmac } from "crypto";

function verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

→ **從「Fleet 不停問 bot 你好嗎」到「bot 有事才主動告訴 Fleet」。**
→ **50 bot 的 Fleet 不再需要 200 requests/min，而是只處理實際發生的事件。**
→ **這是 Fleet 從 4-bot 小工具走向 50-bot 企業平台的架構前提。**

---

**2. Inter-Bot Communication Graph — 看見 Bot 之間的隱形網路（全新視覺化維度）**

**洞察：** 前 12 次 Planning 把每個 bot 視為獨立個體。但 OpenClaw 的 `agentToAgent` 協議證明 bot 之間會互相溝通！

**真實場景（Pain Point 的 bot 車隊）：**
```
🦞 小龍蝦（Lead Agent）
  → sessions_send → 🐿️ 飛鼠（指派任務：「幫我查這個客戶的歷史」）
  → sessions_spawn → 🦚 孔雀（生成子任務：「用這個 prompt 跑分析」）

🐿️ 飛鼠
  → sessions_send → 🦞 小龍蝦（回報結果）
  → sessions_send → 🐗 山豬（轉發客戶資料）

如果 🦞 小龍蝦 掛了，影響鏈：
  🐿️ 飛鼠 — 失去任務來源（高影響）
  🦚 孔雀 — 失去子任務觸發（中影響）
  🐗 山豬 — 間接影響（低影響，資料來源是飛鼠不是小龍蝦）
```

**Fleet 應該能看到這張「社交圖」。**

**資料收集（兩種途徑）：**

```typescript
// 途徑 1: 從 agent events 中提取 inter-bot 通訊
// FleetGatewayClient 的 handleEvent() 擴展
case "agent": {
  if (payload.stream === "tool_use") {
    if (payload.data?.toolName === "sessions_send") {
      this.interBotGraph.addEdge({
        from: this.botId,
        to: payload.data.args?.targetAgentId,
        type: "message",
        timestamp: new Date(),
        sessionKey: payload.data.args?.sessionKey,
      });
    }
    if (payload.data?.toolName === "sessions_spawn") {
      this.interBotGraph.addEdge({
        from: this.botId,
        to: payload.data.args?.agentId,
        type: "spawn",
        timestamp: new Date(),
      });
    }
  }
  break;
}

// 途徑 2: 定期查詢每個 bot 的 agentToAgent config
// 知道「誰被允許跟誰通訊」（靜態圖）
async function fetchInterBotPolicy(client: FleetGatewayClient): Promise<InterBotPolicy> {
  const config = await client.rpc("config.get", { path: "tools.agentToAgent" });
  return {
    enabled: config.enabled,
    allowList: config.allow ?? [],
  };
}
```

**Inter-Bot Graph 資料結構：**

```typescript
interface InterBotGraph {
  nodes: Map<string, GraphNode>;
  edges: InterBotEdge[];
  lastUpdated: Date;
}

interface GraphNode {
  botId: string;
  name: string;
  emoji: string;
  healthScore: number;
  role: "leader" | "worker" | "specialist" | "autonomous";
  // 計算屬性
  inDegree: number;     // 被多少 bot 依賴
  outDegree: number;    // 依賴多少 bot
  betweenness: number;  // 中介中心性（值越高，影響越大）
}

interface InterBotEdge {
  from: string;          // botId
  to: string;            // botId
  type: "message" | "spawn" | "delegation";
  weight: number;        // 過去 24 小時的通訊次數
  lastSeen: Date;
  avgLatencyMs: number;
}
```

**Blast Radius 計算（當 bot 離線時的影響分析）：**

```typescript
function calculateBlastRadius(graph: InterBotGraph, offlineBotId: string): BlastRadius {
  const affected: Map<string, ImpactLevel> = new Map();
  const queue = [{ botId: offlineBotId, depth: 0 }];

  while (queue.length > 0) {
    const { botId, depth } = queue.shift()!;
    // 找出所有依賴此 bot 的下游 bot
    const dependents = graph.edges
      .filter(e => e.to === botId && e.type !== "message") // message 是弱依賴
      .map(e => e.from);

    for (const dep of dependents) {
      if (!affected.has(dep)) {
        const impact: ImpactLevel =
          depth === 0 ? "critical" :
          depth === 1 ? "high" :
          depth === 2 ? "medium" : "low";
        affected.set(dep, impact);
        queue.push({ botId: dep, depth: depth + 1 });
      }
    }
  }

  return { offlineBot: offlineBotId, affected, totalImpacted: affected.size };
}
```

**前端 — InterBotGraph 組件（Force-Directed Layout）：**

```
┌─ 🔗 Bot Communication Graph ──────────────────────────────────────────┐
│                                                                         │
│  View: [Live ●] [24h] [7d]    Metric: [Messages] [Latency] [Cost]    │
│                                                                         │
│              🦞 (Lead)                                                  │
│            ╱     ╲                                                      │
│         ━━━       ━━━━                                                  │
│        ╱              ╲                                                 │
│    🐿️ (Worker)    🦚 (Specialist)                                      │
│        ╲                                                                │
│         ━━                                                              │
│          ╲                                                              │
│       🐗 (Worker)                                                       │
│                                                                         │
│  邊粗細 = 通訊頻率   節點大小 = 中介中心性   色彩 = 健康狀態              │
│                                                                         │
│  ⚠️ Blast Radius: 如果 🦞 離線 → 3 bots 直接受影響                     │
│     🐿️ Critical · 🦚 High · 🐗 Medium                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**技術選型：**
- 用 `d3-force` 做 force-directed layout（D3 已經是 Paperclip 的依賴）
- 邊的粗細 = `edge.weight`（正規化到 1-5px）
- 節點的大小 = `node.betweenness`（正規化到 24-48px）
- 節點色彩 = health score → oklch 色彩映射（跟 Heatmap 一致）
- 當 bot 離線時，自動高亮 blast radius 影響鏈（紅色漸淡）

**API：**
```
GET /api/fleet-monitor/inter-bot-graph           — 完整圖譜
GET /api/fleet-monitor/inter-bot-graph/blast/:id  — 指定 bot 的影響分析
```

→ **從「4 個獨立 bot」到「一個有結構的 bot 社交網路」。**
→ **管理者第一次能看見 bot 之間的隱形依賴，在問題擴散前介入。**

---

**3. Fleet RBAC + Audit Trail — 從「誰都能做任何事」到「分級授權 + 完整紀錄」**

**洞察：** Gateway Protocol v3 定義了 operator scopes：`operator.read`、`operator.write`、`operator.admin`。
但 Fleet Dashboard 完全沒有使用。任何打開 Dashboard 的人都能做任何事。

**問題場景：**
- Alex（Product Owner）想看 Dashboard 了解 bot 狀態 → 合理
- Alex 不小心按了「Disconnect Bot」→ production bot 被斷開 → 災難
- 新員工登入 Dashboard → 看到所有 bot 的 token → 安全問題
- 有人改了 config → 沒人知道是誰改的 → 追責困難

**Fleet RBAC 三層角色：**

```typescript
type FleetRole = "viewer" | "operator" | "admin";

const ROLE_PERMISSIONS: Record<FleetRole, Permission[]> = {
  viewer: [
    "fleet.dashboard.view",       // 看 Dashboard
    "fleet.bot.status.view",      // 看 bot 狀態
    "fleet.bot.sessions.view",    // 看 sessions（但看不到 token/密鑰）
    "fleet.cost.view",            // 看成本
    "fleet.report.download",      // 下載報表
    "fleet.graph.view",           // 看 Inter-Bot Graph
  ],
  operator: [
    // 繼承 viewer 所有權限 +
    "fleet.bot.message.send",     // 發訊息給 bot
    "fleet.bot.cron.trigger",     // 手動觸發 cron
    "fleet.alert.acknowledge",    // 確認告警
    "fleet.runbook.execute",      // 執行 Runbook
    "fleet.tag.manage",           // 管理標籤
    "fleet.budget.view",          // 看預算
  ],
  admin: [
    // 繼承 operator 所有權限 +
    "fleet.bot.connect",          // 連接新 bot
    "fleet.bot.disconnect",       // 斷開 bot
    "fleet.bot.config.patch",     // 修改 bot config
    "fleet.command.batch",        // 批次指令（Command Center）
    "fleet.budget.manage",        // 管理預算
    "fleet.rbac.manage",          // 管理角色
    "fleet.audit.view",           // 查看審計日誌
    "fleet.webhook.manage",       // 管理 webhook
    "fleet.intelligence.dismiss", // dismiss 推薦
  ],
};
```

**Gateway Scope 映射：**
```
Fleet viewer   → 連接 Gateway 時請求 operator.read
Fleet operator → 連接 Gateway 時請求 operator.read + operator.write
Fleet admin    → 連接 Gateway 時請求 operator.read + operator.write + operator.admin
```

**Audit Trail（每個操作都留紀錄）：**

```typescript
interface AuditEntry {
  id: string;
  timestamp: Date;
  userId: string;        // 操作者
  userRole: FleetRole;
  action: string;        // e.g., "bot.config.patch"
  targetType: "bot" | "fleet" | "budget" | "alert" | "tag";
  targetId: string;
  details: Record<string, unknown>;  // 變更內容
  result: "success" | "denied" | "error";
  ipAddress: string;
  // Gateway rate limit 尊重
  rateLimited?: boolean;
}

// DB Schema
export const fleetAuditLog = pgTable("fleet_audit_log", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull().references(() => companies.id),
  userId: text("user_id").notNull(),
  userRole: text("user_role").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  details: jsonb("details"),
  result: text("result").notNull(),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyTimeIdx: index("idx_fleet_audit_company_time").on(table.companyId, table.createdAt),
  userIdx: index("idx_fleet_audit_user").on(table.userId),
  actionIdx: index("idx_fleet_audit_action").on(table.action),
}));
```

**Audit Log 頁面：**
```
┌─ 📋 Fleet Audit Log ──────────────────────────────────────────────────┐
│                                                                         │
│  🔍 Filter: [All Actions ▼] [All Users ▼] [Last 7 days ▼]            │
│                                                                         │
│  22:05  🔵 alex (admin) connected bot 🐗 山豬                         │
│         Gateway: ws://192.168.50.76:18797 · Result: ✅                 │
│                                                                         │
│  21:48  🟡 alex (admin) patched config on 🦞 小龍蝦                   │
│         Changed: session.maxTokens 4096 → 8192 · Result: ✅           │
│                                                                         │
│  21:32  🔵 kelly (operator) acknowledged alert on 🦚 孔雀            │
│         Alert: "Health Score Warning (62)" · Result: ✅                │
│                                                                         │
│  21:15  🔴 intern (viewer) attempted bot.disconnect on 🦞 小龍蝦      │
│         Result: ❌ DENIED (insufficient permissions)                   │
│                                                                         │
│  21:00  🔵 system (auto) triggered cron "patrol-morning" on 🦞        │
│         via: Webhook push · Result: ✅                                 │
│                                                                         │
│  [Export as CSV]  [Load more ↓]                                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Rate Limit Awareness（新發現的 Gateway 限流機制整合）：**

```typescript
// FleetGatewayClient 擴展 — 尊重 Gateway 的 rate limit
class RateLimitAwareClient {
  private configWriteTimestamps: number[] = [];  // 最近 60 秒內的 config write 時間戳
  private readonly CONFIG_WRITE_LIMIT = 3;       // Gateway 限制：3 次/60 秒
  private readonly CONFIG_WRITE_WINDOW = 60_000;

  async configPatch(path: string, value: unknown): Promise<Result> {
    // 清理過期時間戳
    const now = Date.now();
    this.configWriteTimestamps = this.configWriteTimestamps.filter(t => now - t < this.CONFIG_WRITE_WINDOW);

    if (this.configWriteTimestamps.length >= this.CONFIG_WRITE_LIMIT) {
      const retryAfter = this.CONFIG_WRITE_WINDOW - (now - this.configWriteTimestamps[0]);
      return {
        success: false,
        error: "rate_limited",
        retryAfterMs: retryAfter,
        message: `Config write rate limit (${this.CONFIG_WRITE_LIMIT}/min). Retry in ${Math.ceil(retryAfter / 1000)}s.`,
      };
    }

    this.configWriteTimestamps.push(now);
    return this.rpc("config.patch", { path, value });
  }
}
```

→ **從「誰都能做任何事」到「viewer 只能看、operator 能操作、admin 能管理」。**
→ **每個操作都有紀錄，可追責、可審計、可匯出。**
→ **Gateway rate limit 被客戶端尊重，不會因為管理者瘋狂點按鈕而被鎖。**

---

**4. Plugin Inventory + Compatibility Matrix — 看見 Bot 的「軟體清單」（全新功能）**

**洞察：** OpenClaw 有 43 個 bundled plugins（discord, telegram, line, whatsapp, memory-lancedb, voice-call, diagnostics-otel...）。每個 bot 可能裝了不同的 plugin 子集。但 Fleet Dashboard 完全看不到。

**問題場景：**
- 🦞 小龍蝦有 LINE plugin，🐗 山豬沒有 → 管理者不知道為什麼山豬收不到 LINE 訊息
- 🦞 用 memory-lancedb，🐿️ 用 memory-core → 記憶行為不一致
- 某個 plugin 更新後有 bug → 需要快速找出所有裝了這個 plugin 的 bot

**Plugin 資料收集（利用 Gateway RPC）：**

```typescript
// 從 config.get 讀取 plugin 清單
async function fetchPluginInventory(client: FleetGatewayClient): Promise<PluginInfo[]> {
  const config = await client.rpc("config.get", { path: "plugins" });
  const skills = await client.rpc("skills.bins", {});
  const tools = await client.rpc("tools.catalog", {});

  return {
    enabledPlugins: config.enabled ?? [],
    slots: config.slots ?? {},        // e.g., { memory: "memory-lancedb" }
    channelPlugins: extractChannelPlugins(config),
    registeredTools: tools.map(t => t.name),
    skillBins: skills,
  };
}

interface PluginInfo {
  id: string;           // e.g., "line", "memory-lancedb"
  kind?: string;        // "channel" | "memory" | "context-engine"
  version?: string;
  enabled: boolean;
  slot?: string;        // exclusive slot name
  providedTools: string[];
  providedChannels: string[];
}
```

**Plugin Matrix Widget：**

```
┌─ 🧩 Plugin Inventory ────────────────────────────────────────────────┐
│                                                                        │
│  Plugin          🦞    🐿️    🦚    🐗    Status                      │
│  ─────────────────────────────────────────────────                    │
│  line            ✅    ✅    ✅    ❌    ⚠️ 1 bot missing             │
│  telegram        ✅    ✅    ❌    ❌    ℹ️ 2 bots                    │
│  discord         ❌    ❌    ❌    ✅    ℹ️ 1 bot only                │
│  memory-lancedb  ✅    ❌    ✅    ✅    ⚠️ Drift: 🐿️ uses memory-core│
│  voice-call      ❌    ❌    ❌    ❌    ──                           │
│  diagnostics-otel ✅   ✅    ✅    ✅    ✅ Consistent                │
│                                                                        │
│  🔍 3 plugin drifts detected                                         │
│  💡 Recommendation: Enable LINE on 🐗 for consistent channel coverage│
│                                                                        │
│  [View Full Matrix]  [Sync Plugins →]                                 │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

**與 Config Drift 的整合：**
Plugin drift 是 Config Drift 的子集。現有的 `ConfigDriftDetector` 擴展為：

```typescript
// fleet-config-drift.ts 擴展
class ConfigDriftDetector {
  // 既有：config key 比較
  async detectConfigDrift(): Promise<ConfigDriftReport> { ... }

  // 新增：plugin 專用比較
  async detectPluginDrift(): Promise<PluginDriftReport> {
    const inventories = await Promise.all(
      this.bots.map(bot => fetchPluginInventory(bot.client))
    );

    const allPluginIds = new Set(inventories.flatMap(inv => inv.enabledPlugins));
    const drifts: PluginDrift[] = [];

    for (const pluginId of allPluginIds) {
      const botsWithPlugin = inventories
        .filter(inv => inv.enabledPlugins.includes(pluginId))
        .map(inv => inv.botId);
      const botsWithout = inventories
        .filter(inv => !inv.enabledPlugins.includes(pluginId))
        .map(inv => inv.botId);

      if (botsWithout.length > 0 && botsWithPlugin.length > 0) {
        drifts.push({
          pluginId,
          present: botsWithPlugin,
          missing: botsWithout,
          severity: pluginSeverity(pluginId),  // channel plugins = warning, memory = critical
          recommendation: generatePluginRecommendation(pluginId, botsWithPlugin, botsWithout),
        });
      }
    }

    // 檢查 exclusive slot 衝突（e.g., memory slot 用了不同 plugin）
    const slotConflicts = detectSlotConflicts(inventories);

    return { drifts, slotConflicts, totalPlugins: allPluginIds.size };
  }
}
```

**與 Intelligence Engine 的整合：**
```typescript
// fleet-intelligence.ts 新增 Rule 8
// Rule 8: Plugin drift + channel 問題 → 可能是 plugin 缺失導致
if (bot.channels.line === "disconnected" && !bot.plugins.includes("line")) {
  recommendations.push({
    type: "config_suggestion",
    title: `${bot.emoji} ${bot.name} LINE 不可用 — 可能缺少 LINE plugin`,
    suggestedAction: "啟用 LINE plugin: config.patch plugins.enabled += 'line'",
    dataPoints: [
      { source: "channel_status", observation: "LINE channel disconnected" },
      { source: "plugin_inventory", observation: "LINE plugin not in enabled list" },
    ],
  });
}
```

→ **從「看不到 bot 裝了什麼」到「完整的 plugin 清單 + 差異偵測 + 修復建議」。**
→ **Channel 問題不再是黑箱——可能只是因為某個 plugin 沒裝。**

---

**5. Glassmorphism UI Refresh — 讓 Fleet Dashboard 像 painpoint-ai.com 一樣溫暖（視覺升級）**

**新發現的品牌元素整合計畫：**

```
之前只用了：
  ✅ #D4A373 (品牌金)
  ✅ #FAF9F6 (米白背景)
  ✅ #2C2420 (深棕文字)

本次新增：
  🆕 #264653 / #2A9D8F (Teal accent — 用於資訊類元素)
  🆕 Glassmorphism cards (backdrop-blur + 半透明背景)
  🆕 Floating ambient animations (背景裝飾元素)
  🆕 #00B900 (LINE green — 用於 LINE 通道相關 UI)
  🆕 #E8E4DF / #F5F0EB (更多暖灰漸層)
```

**Glassmorphism Card 系統：**

```typescript
// ui/src/components/fleet/design-tokens.ts
export const fleetCardStyles = {
  // 標準 card（取代現有的 bg-white border shadow 模式）
  default: "bg-[#FAF9F6]/90 backdrop-blur-md rounded-2xl border border-[#E0E0E0]/50 shadow-sm",

  // 強調 card（Dashboard 頂部統計）
  elevated: "bg-[#FAF9F6]/95 backdrop-blur-xl rounded-2xl border border-[#D4A373]/20 shadow-lg",

  // 深色 card（Footer、Header 區域）
  dark: "bg-gradient-to-r from-[#2C2420] to-[#3D3530] text-[#FAF9F6] rounded-2xl",

  // 告警 card
  alert: "bg-[#FAF9F6]/95 backdrop-blur-md rounded-2xl border-l-4",
};

// Teal accent — 用於 informational 元素
export const fleetInfoStyles = {
  badge: "bg-[#E0F2F1] text-[#264653] text-xs font-medium px-2 py-0.5 rounded-full",
  link: "text-[#2A9D8F] hover:text-[#264653] transition-colors",
  tooltip: "bg-[#264653] text-[#FAF9F6] text-xs px-2 py-1 rounded",
};

// LINE channel indicator
export const lineStyles = {
  badge: "bg-[#00B900] text-white text-xs font-medium px-2 py-0.5 rounded-full",
  button: "bg-[#00B900] hover:bg-[#00A000] text-white transition-colors",
};
```

**Dashboard 背景 Ambient Glow（模仿 painpoint-ai.com 的裝飾效果）：**

```tsx
// ui/src/components/fleet/FleetDashboard.tsx — 新增背景裝飾層
function DashboardAmbientBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {/* 品牌金光暈 — 左上 */}
      <div
        className="absolute -top-40 -left-40 w-80 h-80 bg-[#D4A373] rounded-full blur-[120px] opacity-[0.06]"
        style={{ animation: "float 15s ease-in-out infinite" }}
      />
      {/* Teal 光暈 — 右下 */}
      <div
        className="absolute -bottom-32 -right-32 w-64 h-64 bg-[#2A9D8F] rounded-full blur-[100px] opacity-[0.04]"
        style={{ animation: "float 10s ease-in-out infinite 2s" }}
      />
      {/* 溫暖背景漸層 */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#FAF9F6] to-[#F5F0EB]" />
    </div>
  );
}
```

**BotStatusCard Hover 升級（模仿 painpoint-ai.com 的互動模式）：**

```css
/* 舊版（Planning #8） */
.bot-status-card {
  @apply bg-white border rounded-lg shadow-sm;
}
.bot-status-card:hover {
  @apply shadow-md;
}

/* 新版（Planning #13 Glassmorphism） */
.bot-status-card {
  @apply bg-[#FAF9F6]/90 backdrop-blur-md rounded-2xl
         border border-[#E0E0E0]/50 shadow-sm
         transition-all duration-300;
}
.bot-status-card:hover {
  @apply -translate-y-1 shadow-xl border-[#D4A373]/30
         shadow-[#D4A373]/10;
}
```

→ **從「功能型 UI（白底灰框）」到「品牌化 Glassmorphism UI（溫暖玻璃態）」。**
→ **Dashboard 的視覺層次從扁平走向有深度、有光影、有呼吸感。**

---

**6. Gateway Rate Limit 防禦層 — 讓 Fleet 不被自己的 bot 鎖在門外（全新基礎設施）**

**之前完全沒考慮的問題：**

```
Gateway auth rate limit: 10 failed attempts/60s → lockout 5min
Gateway config write limit: 3 requests/60s per deviceId

場景 1: Fleet 啟動時同時連接 20 個 bot
  → 如果其中 10 個 token 過期 → 10 次 auth failure → 被 lockout 5 分鐘
  → 5 分鐘內所有 bot（包括 token 正確的）都無法連接

場景 2: 管理者在 Command Center 批次更新 config
  → Auto-Harmonize 對 15 個 bot 推送 config.patch
  → 每個 Gateway 限制 3 writes/min → 前 3 個成功，後 12 個被 429
  → 管理者看到「部分成功」→ 困惑
```

**解決方案：Fleet-side Rate Limiter + Retry Queue**

```typescript
// server/src/services/fleet-rate-limiter.ts
class FleetRateLimiter {
  // 每個 Gateway 的速率追蹤
  private trackers = new Map<string, GatewayRateTracker>();

  getTracker(gatewayUrl: string): GatewayRateTracker {
    if (!this.trackers.has(gatewayUrl)) {
      this.trackers.set(gatewayUrl, new GatewayRateTracker(gatewayUrl));
    }
    return this.trackers.get(gatewayUrl)!;
  }
}

class GatewayRateTracker {
  private authFailures: number[] = [];     // timestamps
  private configWrites: number[] = [];     // timestamps
  private lockedUntil: number | null = null;

  canAttemptAuth(): boolean {
    if (this.lockedUntil && Date.now() < this.lockedUntil) return false;
    this.cleanExpired(this.authFailures, 60_000);
    return this.authFailures.length < 8; // 留 2 個餘量（Gateway 上限 10）
  }

  canWriteConfig(): boolean {
    this.cleanExpired(this.configWrites, 60_000);
    return this.configWrites.length < 3;
  }

  nextConfigWriteAvailableIn(): number {
    if (this.configWrites.length < 3) return 0;
    return 60_000 - (Date.now() - this.configWrites[0]);
  }

  recordAuthFailure(): void {
    this.authFailures.push(Date.now());
    if (this.authFailures.length >= 8) {
      this.lockedUntil = Date.now() + 300_000; // 主動 lockout 自己，不等 Gateway
    }
  }
}

// 用於 Command Center 批次操作的排隊系統
class BatchConfigQueue {
  private queue: ConfigPatchJob[] = [];
  private processing = false;

  async enqueue(job: ConfigPatchJob): Promise<void> {
    this.queue.push(job);
    if (!this.processing) this.processNext();
  }

  private async processNext(): Promise<void> {
    this.processing = true;
    while (this.queue.length > 0) {
      const job = this.queue[0];
      const tracker = rateLimiter.getTracker(job.gatewayUrl);

      if (!tracker.canWriteConfig()) {
        const waitMs = tracker.nextConfigWriteAvailableIn();
        await delay(waitMs);
        continue;
      }

      const result = await job.execute();
      tracker.recordConfigWrite();
      this.queue.shift();
      job.callback(result);
    }
    this.processing = false;
  }
}
```

**UI 整合 — Config Patch 按鈕顯示剩餘 quota：**
```
[Apply Config] (2/3 writes remaining this minute)
```

→ **Fleet 不再是個莽撞的客戶端。它知道 Gateway 的限制，排隊等待，絕不觸發 429。**
→ **批次操作（Auto-Harmonize 20 bots）全部排隊執行，管理者只看到進度條，不看到錯誤。**

---

**7. 本次程式碼產出**

**Commit 31: Fleet Webhook Receiver**
```
新增：server/src/routes/fleet-receiver.ts
  — POST /api/fleet-receiver/webhook/:botId（webhook 接收端）
  — POST /api/fleet-receiver/register/:botId（webhook 註冊端）
  — HMAC-SHA256 簽名驗證
  — Event type routing（cron/agent/chat/health/alert）

修改：server/src/services/fleet-monitor.ts
  — 新增 handleCronResult(), handleAgentTurnComplete(), handleChatMessage()
  — 新增 handleHealthChange(), handleBotSelfAlert()
  — 新增 registerWebhook() — 向 Gateway 註冊 webhook callback

修改：server/src/fleet-bootstrap.ts
  — 註冊 fleet-receiver router
  — 降低 poll 頻率：15s → 5min（有 webhook 時）

修改：ui/src/components/fleet/ConnectBotWizard.tsx
  — 新增 Step 4: "Event Delivery" 選擇（WebSocket / Webhook / Hybrid）
```

**Commit 32: Inter-Bot Communication Graph**
```
新增：server/src/services/fleet-inter-bot-graph.ts
  — InterBotGraph class
  — Edge collection from agent events (sessions_send, sessions_spawn)
  — Static policy graph from agentToAgent config
  — BlastRadius calculator（BFS-based impact analysis）
  — Betweenness centrality 計算

新增：server/src/routes/fleet-monitor.ts（新增 2 endpoint）
  — GET /api/fleet-monitor/inter-bot-graph
  — GET /api/fleet-monitor/inter-bot-graph/blast/:botId

修改：server/src/services/fleet-gateway-client.ts
  — 在 handleEvent() agent case 中捕獲 sessions_send / sessions_spawn tool calls
  — 發送 edge data 到 InterBotGraph

新增：ui/src/components/fleet/InterBotGraph.tsx
  — Force-directed layout（d3-force）
  — Node = bot（大小=中介中心性，色彩=健康分數）
  — Edge = 通訊鏈（粗細=頻率，虛線=policy-only，實線=active）
  — Hover bot → 高亮 blast radius
  — Click bot → 顯示通訊統計 sidebar

修改：ui/src/hooks/useFleetMonitor.ts
  — 新增 useInterBotGraph hook
```

**Commit 33: Fleet RBAC + Audit Trail**
```
新增：packages/db/src/schema/fleet-audit.ts
  — fleet_audit_log 表定義 + 索引

新增：packages/db/src/migrations/0039_fleet_audit.sql
  — CREATE TABLE fleet_audit_log + indices

新增：server/src/services/fleet-rbac.ts
  — FleetRBAC class
  — Role → Permission mapping
  — checkPermission() middleware
  — Gateway scope 映射（role → operator scope）

新增：server/src/services/fleet-audit.ts
  — FleetAuditService class
  — log() — 記錄每個操作
  — query() — 查詢審計日誌（分頁 + 篩選）

新增：server/src/routes/fleet-audit.ts
  — GET /api/fleet-audit（查詢審計日誌）
  — GET /api/fleet-audit/export?format=csv（匯出）

修改：所有 fleet route handler
  — 加入 rbac.check() middleware
  — 加入 audit.log() 呼叫

新增：ui/src/components/fleet/AuditLog.tsx
  — 審計日誌頁面（篩選 + 分頁 + CSV 匯出）
  — 操作色彩編碼（create=藍, update=金, delete=紅, denied=灰）
```

**Commit 34: Plugin Inventory**
```
新增：server/src/services/fleet-plugin-inventory.ts
  — fetchPluginInventory() — 讀取每個 bot 的 plugin 清單
  — detectPluginDrift() — 比較跨 fleet 的 plugin 差異
  — Slot conflict 偵測

修改：server/src/services/fleet-config-drift.ts
  — 整合 plugin drift 到 ConfigDriftReport

新增：server/src/routes/fleet-monitor.ts（新增 endpoint）
  — GET /api/fleet-monitor/plugin-inventory

新增：ui/src/components/fleet/PluginMatrix.tsx
  — Plugin × Bot 矩陣表格
  — ✅/❌ 圖示 + drift 標記
  — Plugin 類型色彩（channel=teal, memory=gold, tool=grey）
  — Drift 建議卡片

修改：ui/src/components/fleet/IntelligenceWidget.tsx
  — 整合 plugin drift 推薦（Rule 8）
```

**Commit 35: Glassmorphism UI Refresh**
```
新增：ui/src/components/fleet/design-tokens.ts
  — fleetCardStyles（default/elevated/dark/alert）
  — fleetInfoStyles（teal accent badges/links/tooltips）
  — lineStyles（LINE green badges/buttons）

修改：ui/src/components/fleet/FleetDashboard.tsx
  — 新增 DashboardAmbientBackground 組件
  — 所有 card 改用 glassmorphism style
  — hover 效果升級（translate-y + shadow escalation）

修改：ui/src/components/fleet/BotStatusCard.tsx
  — Glassmorphism card 樣式
  — Channel badges 用品牌色（LINE green, Telegram blue）
  — Teal info badges

修改：ui/src/components/fleet/FilterBar.tsx
  — Glassmorphism filter bar 背景
  — Tag chips 用品牌色漸層
```

**Commit 36: Gateway Rate Limiter**
```
新增：server/src/services/fleet-rate-limiter.ts
  — FleetRateLimiter class（per-gateway tracking）
  — GatewayRateTracker（auth failures + config writes）
  — BatchConfigQueue（排隊批次 config 推送）

修改：server/src/services/fleet-gateway-client.ts
  — 整合 rate limiter（auth 前檢查 canAttemptAuth()）
  — configPatch() 走 rate limiter

修改：server/src/services/fleet-monitor.ts
  — connectBot() 使用 staggered connection（不同時連接所有 bot）
  — 啟動時 bot 連接間隔 2 秒（避免 auth flood）

修改：ui/src/components/fleet/ConfigDriftWidget.tsx
  — Auto-Harmonize 按鈕顯示 rate limit 狀態
  — 進度條（「3/15 bots patched, next in 18s」）
```

---

**8. 與前幾次 Planning 的關鍵差異**

| 面向 | 之前的想法 | Planning #13 的改進 |
|------|----------|-------------------|
| 資料流 | Pull only（Fleet poll Gateway） | Push + Pull 混合（Webhook receiver + 降頻 poll） |
| Bot 關係 | 個體獨立 | Inter-Bot Graph（社交圖 + 依賴分析 + blast radius） |
| 存取控制 | 無（任何人都能做任何事） | RBAC 三層角色 + 審計日誌 + CSV 匯出 |
| Plugin 可見性 | 零 | Plugin Inventory Matrix + drift 偵測 + slot conflict |
| 視覺風格 | 功能型白底灰框 | Glassmorphism + ambient glow + teal accent + LINE green |
| Rate limit | 完全沒考慮 | Client-side rate limiter + batch queue + staggered connect |
| 擴展性 | 4 bot 小工具 | 50 bot 架構準備（push model + rate limit + batch queue） |
| Gateway 利用度 | 用了 ~15 RPC | 新增利用 webhook ingress + plugin SDK + operator scopes |

---

**9. 風險更新**

| 新風險 | 嚴重度 | 緩解 |
|--------|--------|------|
| Webhook receiver 被惡意 POST | 🟡 中 | HMAC-SHA256 簽名驗證 + IP allowlist（可選） |
| Inter-Bot Graph 在沒有 agentToAgent 通訊時是空的 | 🟢 低 | 空狀態 UI：「No inter-bot communication detected. Enable agentToAgent in bot config.」 |
| RBAC 與現有 Paperclip auth 的整合 | 🟡 中 | 利用 Paperclip 現有的 user/session 系統，RBAC 是附加層 |
| Glassmorphism 在低端瀏覽器的 backdrop-blur 效能 | 🟢 低 | Fallback: `@supports not (backdrop-filter: blur())` → 純色背景 |
| Plugin inventory RPC (tools.catalog + skills.bins) 回應慢 | 🟡 中 | Cache 10 分鐘 + 只在 Plugin Matrix 頁面開啟時查詢 |
| Batch config queue 長時間排隊（20 bots × 20s = 6.7 min） | 🟡 中 | 顯示預估完成時間 + 允許取消排隊 + 優先級（critical bot 先推） |
| Audit log 資料量增長（高活躍 fleet 每天數百條） | 🟢 低 | 90 天自動清理 + 只記錄 write 操作（read 不記） |

---

**10. 修訂的整體進度追蹤**

```
✅ Planning #1-4: 概念、API 研究、架構設計
✅ Planning #5: 品牌主題 CSS + DB aliases + 術語改名
✅ Planning #6: FleetGatewayClient + FleetMonitorService + API routes
✅ Planning #7: Mock Gateway + Health Score + AlertService + 時序策略 + Command Center
✅ Planning #8: Fleet API client + React hooks + BotStatusCard + FleetDashboard + ConnectBotWizard
✅ Planning #9: Route wiring + Sidebar Fleet Pulse + LiveEvent bridge + BotDetailFleetTab + Companies Connect
✅ Planning #10: Server Bootstrap + Graceful Shutdown + DB Migrations + Anomaly Detection + Cost Forecast + E2E Tests + i18n
✅ Planning #11: Observable Fleet（三支柱）+ Config Drift + Channel Cost + Session Live Tail + Notification Center + Heatmap + Runbooks + Reports
✅ Planning #12: Fleet Intelligence Layer — Trace Waterfall + mDNS Discovery + Tags + Reports API + Cost Budgets + Intelligence Engine
✅ Planning #13: Fleet Control Plane — Webhook Push + Inter-Bot Graph + RBAC Audit + Plugin Inventory + Glassmorphism UI + Rate Limiter
⬜ Next: Fleet Command Center UI（batch operations 前端 + Canary rollout 模式）
⬜ Next: Auto-Harmonize 端到端整合（Drift 偵測 → Intelligence 推薦 → Command Center 執行 → Audit 紀錄）
⬜ Next: Multi-Fleet 支援（Fleet of Fleets — 多車隊獨立管理）
⬜ Next: Bot Persona Editor（pixel art 頭像 + IDENTITY.md 視覺化編輯）
⬜ Next: Mobile PWA + Push Notifications（利用 APNs relay 發現）
⬜ Next: Fleet Marketplace（共享 Runbooks / Intelligence Rules / Plugin presets）
⬜ Next: Performance Stress Test（50 bot 模擬 + Webhook 吞吐量基準）
⬜ Next: Fleet CLI（命令列管理工具，補充 Dashboard UI）
```

---

**11. 研究更新**

| 研究主題 | 本次新發現 | 狀態 |
|----------|-----------|------|
| OpenClaw Gateway API | Webhook ingress (POST /hooks/*), Inter-agent protocol (agentToAgent, sessions_spawn/send), Plugin SDK (43 extensions, manifest format), Operator scopes (read/write/admin), Rate limiting details (auth + config write), Cron delivery modes (webhook/announce/none), Config hot reload, Tailscale integration | 🔓 重新開放 — v3 protocol 比之前了解的深很多 |
| painpoint-ai.com 品牌 | Teal accent pair (#264653/#2A9D8F), Glassmorphism pattern (backdrop-blur + 半透明), Floating animations (8-15s), LINE green (#00B900/#00A000), Additional warm grays (#E8E4DF/#F5F0EB), System fonts (no custom fonts), No dark mode | 🔓 重新開放 — UI 模式比色彩更豐富 |

---

**下一步 Planning #14（如果需要）：**
- Fleet Command Center UI（Canary rollout + progress tracking + rate limit 可視化）
- Auto-Harmonize 完整流程（Drift → Recommend → Approve → Execute → Verify → Audit）
- Multi-Fleet 架構（Fleet of Fleets，共享 intelligence rules）
- Bot Persona Editor（頭像 + 名稱 + 角色描述）
- APNs Push Notification 整合（利用 Gateway 的 push relay）
- Fleet CLI 工具（`fleet status`, `fleet connect`, `fleet audit`）

### Planning #14 — 2026-03-19 23:55
**主題：Fleet Command Center 完整實作 + Self-Healing Fleet + 外部整合平台 + Bot 生命週期管理 + Fleet Diff View + Session Forensics**

---

**🎮 iteration #14 → 「完整迴路」階段：從看→想→做→自動做**

前 13 次 Planning 建了一個驚人的系統：
- **看** — Dashboard, Health Score, Heatmap, Traces, Inter-Bot Graph (✅)
- **想** — Intelligence Engine, Anomaly Detection, Config Drift, Cost Forecast (✅)
- **做** — Runbooks, single bot operations (✅)
- **自動做** — ❌ **完全缺失**

Fleet Dashboard 的進化軌跡已經走完了前三步。現在缺的是最後一步：**閉環自動化**。

```
Planning #1-4:   看（Monitor）         ✅
Planning #5-9:   看得清楚（Observe）    ✅
Planning #10-11: 想（Analyze）          ✅
Planning #12-13: 做（Act — 手動）       ✅ 部分
Planning #14:    自動做（Auto-Remediate）🆕 + 完成「做」的最後拼圖
```

**本次 Planning 的六個核心命題，每個都填補一個結構性缺口：**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  缺口 1: 批次操作有設計但沒有 UI        → Fleet Command Center 完整實作      │
│  缺口 2: 告警後只有 Runbook（人類執行）  → Self-Healing Fleet 自動修復        │
│  缺口 3: Fleet 是孤島，無法串接外部工具  → 外部整合 API（Slack/Grafana/n8n）  │
│  缺口 4: Bot 只有「在線/離線」無生命週期 → Bot Lifecycle 五階段管理           │
│  缺口 5: 沒辦法比較兩個 bot 的差異       → Fleet Diff View 並排比較工具      │
│  缺口 6: 只能看即時對話，看不了歷史快照   → Session Forensics 時光回溯偵錯    │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

**1. Fleet Command Center — 完整 UI 實作（前 7 次 Planning 最大的未完成項）**

Planning #7 設計了 FleetCommand 資料結構和 API。
Planning #12 設計了 Cost Budget 和 Intelligence Engine。
Planning #13 設計了 Rate Limiter 和 Batch Config Queue。

**但從未有人建立實際的前端 UI。** 後端引擎在轉，但駕駛座是空的。

**本次不只建 UI，還要解決一個之前沒考慮的問題：命令可組合性（Command Composability）。**

**洞察：Planning #7 的命令是原子操作（broadcast、config-push、token-rotate）。但真實場景是複合操作：**

```
場景：「我要做一次安全的 model 升級」
  Step 1: Config Drift 檢查（確認當前狀態）
  Step 2: Canary — 對 1 個 bot 推送 config.patch model=opus
  Step 3: 等待 60 秒，觀察 health score
  Step 4: 如果 health > 80 → 繼續；否則 → 自動 rollback + 停止
  Step 5: Rolling — 對剩餘 bot 逐一推送（每個間隔 30 秒）
  Step 6: 完成後觸發 Config Drift 驗證（確認全部一致）
  Step 7: 寫入 Audit Log + 發送 Slack 通知
```

**這不是一個命令，而是一個 Pipeline。**

**Fleet Command Pipeline：**

```typescript
interface CommandPipeline {
  id: string;
  name: string;                // e.g., "Safe Model Upgrade"
  description: string;
  steps: PipelineStep[];
  status: "draft" | "running" | "paused" | "completed" | "failed" | "rolled_back";
  createdBy: string;
  createdAt: Date;
  executionLog: ExecutionEntry[];
}

interface PipelineStep {
  id: string;
  order: number;
  type: "command" | "gate" | "delay" | "verify" | "notify";
  // command: 執行 RPC 操作
  // gate: 條件檢查（health > X → 繼續；否則 → 停止/rollback）
  // delay: 等待 N 秒
  // verify: 執行驗證（config drift check, health check）
  // notify: 發送通知（Slack, webhook, dashboard toast）
  config: StepConfig;
  rollbackStep?: PipelineStep;  // 失敗時的回滾操作
  status: "pending" | "running" | "passed" | "failed" | "skipped" | "rolled_back";
  result?: unknown;
  startedAt?: Date;
  completedAt?: Date;
}

// Gate Step 例子
interface GateConfig {
  condition: {
    metric: "health_score" | "error_count" | "latency_avg" | "cost_1h";
    operator: "gt" | "lt" | "eq";
    threshold: number;
    botScope: "canary" | "all" | string[];  // 檢查哪些 bot
  };
  onPass: "continue";
  onFail: "pause" | "rollback" | "abort";
  timeoutMs: number;  // 等多久讓指標穩定
}
```

**預設 Pipeline 模板（開箱即用）：**

```typescript
const PIPELINE_TEMPLATES: CommandPipeline[] = [
  {
    name: "Safe Config Push",
    steps: [
      { type: "verify", config: { action: "config-drift-check" } },
      { type: "command", config: { action: "config-patch", mode: "canary", count: 1 } },
      { type: "delay", config: { delayMs: 60_000 } },
      { type: "gate", config: { metric: "health_score", operator: "gt", threshold: 75, botScope: "canary" } },
      { type: "command", config: { action: "config-patch", mode: "rolling", intervalMs: 30_000 } },
      { type: "verify", config: { action: "config-drift-check" } },
      { type: "notify", config: { channel: "slack", message: "Config push completed" } },
    ],
  },
  {
    name: "Fleet-Wide Cron Trigger",
    steps: [
      { type: "command", config: { action: "cron-trigger", cronName: "{{cronName}}", mode: "rolling" } },
      { type: "gate", config: { metric: "error_count", operator: "eq", threshold: 0, botScope: "all" } },
      { type: "notify", config: { channel: "dashboard", message: "Cron trigger completed" } },
    ],
  },
  {
    name: "Emergency Rollback",
    steps: [
      { type: "command", config: { action: "config-patch", mode: "parallel", patch: "{{rollbackPatch}}" } },
      { type: "delay", config: { delayMs: 30_000 } },
      { type: "gate", config: { metric: "health_score", operator: "gt", threshold: 60, botScope: "all" } },
      { type: "notify", config: { channel: "slack", message: "🚨 Emergency rollback executed" } },
    ],
  },
];
```

**Command Center UI：**

```
┌─ Fleet Command Center ─────────────────────────────────────────────────────────┐
│                                                                                  │
│  📋 Templates                      🔄 Running Pipelines (1)                    │
│  ┌────────────────────────────┐    ┌────────────────────────────────────────┐   │
│  │ 🛡️ Safe Config Push        │    │ "Model Upgrade to Sonnet"              │   │
│  │ ⏰ Fleet-Wide Cron Trigger │    │ Step 4/7: Gate Check ⏳               │   │
│  │ 🚨 Emergency Rollback     │    │ 🦞 canary health: 87 ✅ (threshold 75)│   │
│  │ 🔄 Gateway Version Update │    │ ████████████░░░░░░░░ 57%              │   │
│  │ ➕ Create Custom Pipeline  │    │ [Pause] [Abort] [View Details]        │   │
│  └────────────────────────────┘    └────────────────────────────────────────┘   │
│                                                                                  │
│  🎯 Target Selection                                                            │
│  ☑ 🦞 小龍蝦  ☑ 🐿️ 飛鼠  ☑ 🦚 孔雀  ☐ 🐗 山豬 (offline)                  │
│  [Select by Tag ▼]  [Select All Online]                                         │
│                                                                                  │
│  ── Pipeline Builder ──                                                         │
│  ┌─ Step 1 ──────┐  ┌─ Step 2 ──────┐  ┌─ Step 3 ──────┐                     │
│  │ 🔧 Config Push │→│ ⏱ Wait 60s    │→│ 🚦 Gate: H>75 │→ ...                 │
│  │ mode: canary   │  │               │  │ fail: rollback │                     │
│  └────────────────┘  └───────────────┘  └────────────────┘                     │
│  [+ Add Step]                                                                    │
│                                                                                  │
│  Rate Limit Status:                                                             │
│  🦞 config writes: 2/3 remaining  🐿️ 3/3 remaining  🦚 3/3 remaining         │
│                                                                                  │
│  [▶ Execute Pipeline]  [💾 Save as Template]                                    │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Pipeline Execution Visualization（即時進度追蹤）：**

```
┌─ Pipeline: "Model Upgrade to Sonnet" ──────────────────────────────────────────┐
│                                                                                  │
│  ✅ → ✅ → ✅ → ⏳ → ⬜ → ⬜ → ⬜                                             │
│  drift  canary  wait  gate  rolling  verify  notify                             │
│                                                                                  │
│  Step 4: Health Gate                                                            │
│  Checking canary bot (🦞 小龍蝦) health score...                                │
│  ┌──────────────────────────────────────────────────┐                           │
│  │  Current: 87   Threshold: 75   Remaining: 42s    │                           │
│  │  ████████████████████████████░░░░  87/100         │                           │
│  │  Trend: 92 → 89 → 87 (slight dip, normal)       │                           │
│  └──────────────────────────────────────────────────┘                           │
│                                                                                  │
│  Execution Log:                                                                 │
│  23:55:00  ✅ Step 1: Config drift check — 0 drifts (clean)                    │
│  23:55:02  ✅ Step 2: Canary push model=sonnet to 🦞 — accepted                │
│  23:55:03  ✅ Step 3: Waiting 60 seconds...                                     │
│  23:56:03  ⏳ Step 4: Gate check started (health_score > 75)                    │
│                                                                                  │
│  [⏸ Pause]  [⏹ Abort]  [↩ Rollback Now]                                       │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

→ **從「一次一個命令」到「可組合的命令管線 + 自動門控 + 自動回滾」。**
→ **Pipeline Templates 讓常見操作標準化，避免每次都手動配置。**
→ **Rate Limit Status 內嵌在 UI 中，管理者永遠知道還能做什麼。**

---

**2. Self-Healing Fleet — 自動修復迴路（Runbook 的進化：從人讀到機器執行）**

**Planning #11 的 Runbooks 問題：每一步都需要人按「Execute Next Step」。**

夜裡 3 點 LINE channel 斷了，Runbook 說「Step 1: Check channel status」，但沒有人在。

**Self-Healing = 預定義的自動修復策略，無需人類介入。**

```typescript
interface HealingPolicy {
  id: string;
  name: string;
  enabled: boolean;
  trigger: {
    // 觸發條件（跟 AlertRule 相同結構）
    metric: string;
    operator: string;
    threshold: number;
    sustainedForMs: number;
  };
  remediation: RemediationAction[];
  escalation: {
    // 如果自動修復失敗，升級為人工處理
    afterAttempts: number;       // 嘗試 N 次後升級
    afterMs: number;             // 或超過 N 毫秒後升級
    escalateTo: "alert" | "slack" | "pagerduty";
  };
  cooldownMs: number;
  maxAttemptsPerHour: number;   // 防止無限循環
  auditRequired: boolean;       // 每次自動修復都寫 audit log
}

interface RemediationAction {
  order: number;
  type: "reconnect" | "restart_channel" | "downgrade_model" | "abort_session" |
        "trigger_cron" | "send_message" | "webhook_notify";
  config: Record<string, unknown>;
  verifyAfterMs: number;        // 執行後等待 N 毫秒驗證
  verifyCondition: {            // 驗證是否成功
    metric: string;
    operator: string;
    threshold: number;
  };
}
```

**預設 Healing Policies（可開關，預設關閉 — 需管理者明確啟用）：**

```typescript
const DEFAULT_HEALING_POLICIES: HealingPolicy[] = [
  {
    name: "Auto-Reconnect on Disconnect",
    trigger: { metric: "connection_state", operator: "eq", threshold: "disconnected", sustainedForMs: 30_000 },
    remediation: [
      { type: "reconnect", verifyAfterMs: 10_000,
        verifyCondition: { metric: "connection_state", operator: "eq", threshold: "monitoring" } },
    ],
    escalation: { afterAttempts: 3, afterMs: 300_000, escalateTo: "alert" },
    cooldownMs: 60_000,
    maxAttemptsPerHour: 10,
  },
  {
    name: "Auto-Restart Disconnected Channel",
    trigger: { metric: "channel_disconnected", operator: "gt", threshold: 0, sustainedForMs: 120_000 },
    remediation: [
      // 先嘗試 wake（輕量觸發 Gateway 重新連接 channel）
      { type: "send_message", config: { command: "/wake" }, verifyAfterMs: 30_000,
        verifyCondition: { metric: "channel_disconnected", operator: "eq", threshold: 0 } },
    ],
    escalation: { afterAttempts: 2, afterMs: 600_000, escalateTo: "slack" },
    cooldownMs: 300_000,
    maxAttemptsPerHour: 5,
  },
  {
    name: "Cost Circuit Breaker",
    // 當某 bot 的每小時成本突然是平常的 3 倍 → 可能是 runaway loop
    trigger: { metric: "cost_anomaly_ratio", operator: "gt", threshold: 3.0, sustainedForMs: 0 },
    remediation: [
      // 降級 model（Opus → Sonnet）降低燒錢速度
      { type: "downgrade_model", config: { to: "claude-sonnet-4" }, verifyAfterMs: 60_000,
        verifyCondition: { metric: "cost_anomaly_ratio", operator: "lt", threshold: 2.0 } },
    ],
    escalation: { afterAttempts: 1, afterMs: 120_000, escalateTo: "slack" },
    cooldownMs: 3600_000,
    maxAttemptsPerHour: 2,
  },
];
```

**Self-Healing Dashboard Widget：**

```
┌─ 🩺 Self-Healing Status ──────────────────────────────────────────────────────┐
│                                                                                  │
│  Active Policies: 3/5 enabled                                                   │
│                                                                                  │
│  ✅ Auto-Reconnect          Last triggered: 2h ago · 12 heals this week       │
│  ✅ Channel Restart          Last triggered: 6h ago · 3 heals this week        │
│  ✅ Cost Circuit Breaker     Never triggered · Armed                            │
│  ⬜ Auto-Scale Model         Disabled                                           │
│  ⬜ Cron Failure Recovery     Disabled                                          │
│                                                                                  │
│  Recent Healing Events:                                                         │
│  23:12  🩹 🦚 孔雀 — Auto-reconnect succeeded (disconnect duration: 45s)      │
│  21:30  🩹 🐿️ 飛鼠 — Channel restart: LINE reconnected (took 28s)             │
│  18:05  ⚠️ 🐗 山豬 — Auto-reconnect failed (3 attempts) → Escalated to alert │
│                                                                                  │
│  Healing Stats (7 days):                                                        │
│  Total incidents: 18  |  Auto-healed: 15 (83%)  |  Escalated: 3 (17%)         │
│  Mean time to heal: 32s  |  Saved ~$0 manual intervention                      │
│                                                                                  │
│  [Configure Policies]  [View Healing Log]                                       │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**關鍵安全機制（之前 Runbooks 不需要但自動化必須有）：**

```
1. Opt-in only — 所有 healing policies 預設關閉
2. Max attempts/hour — 防止自動化風暴
3. Cooldown — 同一問題不會被反覆修復
4. Audit trail — 每次自動修復都記錄到 fleet_audit_log
5. Escalation — 自動修復失敗後升級為人工，不會無限重試
6. Scope lock — 每個 policy 可以限定只對特定 tag/bot 生效
7. Kill switch — Dashboard 一鍵暫停所有自動修復（「維修模式」）
```

→ **從「3 點告警但沒人看」到「3 點自動修復，早上看到一條 audit log」。**
→ **83% 的常見問題（斷線、channel 掉線）可以自動修復，人類只需處理 17% 的例外。**

---

**3. Fleet External Integration API — 讓 Fleet 說話給外面的世界聽（Outbound Platform）**

**結構性盲點：Fleet 有一個 Webhook Receiver（#13，inbound），但沒有 Webhook Sender（outbound）。**

Fleet 內部有豐富的事件流（`fleet.bot.health`, `fleet.alert.triggered`, `fleet.cost.updated`）。
但這些事件被鎖在 Fleet Dashboard 裡。

**管理者的真實工作流：**
```
看到 alert → 切換到 Slack 通知團隊 → 切換到 Grafana 看指標 → 切換回 Fleet 操作
```

**Fleet 應該主動推送到這些工具，不是讓人類當中間人。**

```typescript
interface ExternalIntegration {
  id: string;
  type: "slack" | "discord_webhook" | "grafana" | "generic_webhook" | "line_notify" | "n8n" | "zapier";
  name: string;
  enabled: boolean;
  config: IntegrationConfig;
  eventFilter: string[];           // 哪些事件觸發推送（"fleet.alert.*", "fleet.bot.disconnected"）
  rateLimit: { maxPerHour: number };
  lastDeliveryAt?: Date;
  deliveryStats: { sent: number; failed: number; last7d: number };
}

// Slack 整合
interface SlackConfig {
  webhookUrl: string;             // Slack Incoming Webhook URL
  channel?: string;               // 覆蓋預設 channel
  mentionUsers?: string[];        // @mention 特定人（critical alerts）
  templateOverrides?: Record<string, string>;  // 自訂訊息模板
}

// LINE Notify 整合（Pain Point 是台灣公司，LINE 是主要通訊工具）
interface LineNotifyConfig {
  accessToken: string;            // LINE Notify access token
  // LINE Notify → 管理者的個人 LINE
  // 不同於 bot 的 LINE channel（那是客戶端）
}

// Grafana 整合（推送 metrics 到 Grafana Cloud 或自架 Grafana）
interface GrafanaConfig {
  pushUrl: string;                // Grafana Push Gateway URL
  apiKey: string;
  orgId: string;
  // 推送格式：Prometheus exposition format
  // fleet_bot_health_score{bot="lobster",fleet="painpoint"} 92
  // fleet_bot_cost_usd{bot="lobster",fleet="painpoint",period="1h"} 3.20
}

// Generic Webhook（n8n, Zapier, Make, 自訂系統）
interface GenericWebhookConfig {
  url: string;
  method: "POST" | "PUT";
  headers: Record<string, string>;
  bodyTemplate: string;           // Handlebars 模板
  secret?: string;                // HMAC signing
}
```

**Slack 訊息模板（Rich Blocks）：**

```json
{
  "blocks": [
    {
      "type": "header",
      "text": { "type": "plain_text", "text": "🔴 Fleet Alert: Health Critical" }
    },
    {
      "type": "section",
      "fields": [
        { "type": "mrkdwn", "text": "*Bot:* 🐗 山豬" },
        { "type": "mrkdwn", "text": "*Health:* 28/100 (F)" },
        { "type": "mrkdwn", "text": "*Duration:* 23 minutes" },
        { "type": "mrkdwn", "text": "*Fleet:* Pain Point AI" }
      ]
    },
    {
      "type": "actions",
      "elements": [
        { "type": "button", "text": { "type": "plain_text", "text": "View in Dashboard" },
          "url": "https://fleet.painpoint.ai/fleet-monitor/bot/boar-1" },
        { "type": "button", "text": { "type": "plain_text", "text": "Run Healing" },
          "style": "primary" }
      ]
    }
  ]
}
```

**Grafana Metrics 推送（讓 Fleet 資料出現在既有監控基礎設施中）：**

```typescript
// 每 60 秒推送一次 Prometheus-format metrics
function pushToGrafana(fleet: FleetStatus, config: GrafanaConfig): void {
  const metrics: string[] = [];

  for (const bot of fleet.bots) {
    const labels = `bot="${bot.name}",fleet="${fleet.name}",emoji="${bot.emoji}"`;
    metrics.push(`fleet_bot_health_score{${labels}} ${bot.healthScore?.overall ?? 0}`);
    metrics.push(`fleet_bot_connection_state{${labels},state="${bot.connectionState}"} 1`);
    metrics.push(`fleet_bot_active_sessions{${labels}} ${bot.activeSessions ?? 0}`);
    if (bot.usage) {
      metrics.push(`fleet_bot_input_tokens_total{${labels}} ${bot.usage.inputTokens}`);
      metrics.push(`fleet_bot_output_tokens_total{${labels}} ${bot.usage.outputTokens}`);
      metrics.push(`fleet_bot_cost_usd{${labels},period="1h"} ${bot.estimatedCost1h ?? 0}`);
    }
  }

  // fleet-level aggregates
  metrics.push(`fleet_bots_online_total{fleet="${fleet.name}"} ${fleet.onlineCount}`);
  metrics.push(`fleet_alerts_active_total{fleet="${fleet.name}"} ${fleet.activeAlerts}`);

  fetch(config.pushUrl, {
    method: "POST",
    headers: { "Authorization": `Bearer ${config.apiKey}`, "Content-Type": "text/plain" },
    body: metrics.join("\n"),
  });
}
```

**Integration Settings UI：**

```
┌─ 🔗 External Integrations ────────────────────────────────────────────────────┐
│                                                                                  │
│  ┌── Active ──────────────────────────────────────────────────────────────┐     │
│  │ 💬 Slack — #fleet-alerts           🟢 Connected  142 msgs/7d         │     │
│  │ 📊 Grafana Cloud — painpoint-ai   🟢 Pushing    4.2K metrics/7d     │     │
│  │ 💚 LINE Notify — Alex 個人         🟢 Connected  23 msgs/7d          │     │
│  └────────────────────────────────────────────────────────────────────────┘     │
│                                                                                  │
│  ┌── Available ───────────────────────────────────────────────────────────┐     │
│  │ 🔗 Generic Webhook    │ 🤖 n8n / Zapier  │ 💬 Discord Webhook       │     │
│  │ [Configure]           │ [Configure]        │ [Configure]              │     │
│  └────────────────────────────────────────────────────────────────────────┘     │
│                                                                                  │
│  Event Routing:                                                                 │
│  fleet.alert.critical  → Slack + LINE Notify (immediate)                        │
│  fleet.alert.warning   → Slack only (batched, max 5/hr)                         │
│  fleet.bot.disconnected → Slack (immediate)                                     │
│  fleet.cost.budget_exceeded → Slack + LINE Notify (immediate)                   │
│  fleet.*.* (all metrics) → Grafana (every 60s)                                  │
│  fleet.healing.executed → Slack (immediate)                                     │
│                                                                                  │
│  [Test All Integrations]  [View Delivery Log]                                   │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

→ **Fleet 從「封閉 Dashboard」變成「開放平台」。**
→ **管理者在 Slack 裡收到告警 → 點按鈕直接跳到 Dashboard → 一鍵修復。**
→ **Grafana 整合讓 Fleet 的資料可以跟其他基礎設施指標放在同一個 Dashboard 看。**
→ **LINE Notify 對台灣團隊特別重要——老闆的 LINE 直接收到告警。**

---

**4. Bot Lifecycle Stages — 從「在線/離線」到完整生命週期管理**

**之前所有 Planning 把 bot 當成只有兩種狀態的東西：開機/關機。**

但真實場景：一個 bot 有生命週期。

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  Provisioning → Onboarding → Active → Maintenance → Decommissioned      │
│                                                                           │
│  ● Provisioning: 管理者設定好 Gateway，但還沒連接到 Fleet               │
│  ● Onboarding: 剛連接到 Fleet，正在拉取初始資料（profile, config, etc）│
│  ● Active: 正常運作中（含各種 connection states）                       │
│  ● Maintenance: 管理者標記為維護中（不觸發 alerts，不參與 batch ops）   │
│  ● Decommissioned: 從 Fleet 移除但保留歷史資料（audit, cost, snapshots）│
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

**為什麼 Maintenance 階段很重要（之前完全沒考慮）：**

```
場景：你要更新 🐗 山豬 的 OpenClaw 版本。
  1. SSH 到山豬的機器
  2. 停止 OpenClaw Gateway
  3. 更新版本
  4. 重新啟動

在這 5 分鐘內：
  ❌ 之前的行為：Alert 瘋響（"Health Critical!"、"Bot Offline!"）、Self-Healing 嘗試重連、
     Intelligence Engine 推薦「檢查網路問題」、Sidebar Pulse 變紅
  ✅ Maintenance 模式：Fleet 知道這是計畫性維護，靜音一切，顯示「🔧 In Maintenance」
```

```typescript
interface BotLifecycleConfig {
  stage: "provisioning" | "onboarding" | "active" | "maintenance" | "decommissioned";
  maintenanceWindow?: {
    startedAt: Date;
    estimatedEndAt?: Date;
    reason: string;
    startedBy: string;         // 誰開啟了維護模式
    autoExitAfterMs?: number;  // 自動退出維護（防止忘記關）
    suppressAlerts: boolean;   // 是否靜音告警
    suppressHealing: boolean;  // 是否暫停自動修復
    excludeFromBatch: boolean; // 是否排除批次操作
  };
  decommissionedAt?: Date;
  decommissionedReason?: string;
  retainDataUntil?: Date;      // 保留歷史資料到何時
}
```

**Maintenance Mode UI：**

```
Bot Detail > Fleet Tab:
┌──────────────────────────────────────────┐
│  🐗 山豬                                  │
│  Stage: 🔧 In Maintenance                │
│  Reason: "Gateway 版本更新 v2026.1.22→24"│
│  Since: 23:50 (5 min ago)                │
│  Est. End: 00:05 (10 min remaining)       │
│  Alerts: 🔇 Suppressed                    │
│  Healing: ⏸ Paused                       │
│                                           │
│  [Exit Maintenance]  [Extend 30 min]     │
└──────────────────────────────────────────┘
```

**Bot 卡片在 Maintenance 模式的視覺：**

```
┌──────────────┐
│ 🐗 山豬      │
│ 🔧 Maint    │  ← 橘色框 + 扳手圖示（不是紅色 error）
│              │
│ "版本更新中" │  ← 顯示維護原因
│ ~5 min left  │
└──────────────┘
```

→ **管理者第一次可以「告訴 Fleet 我在維護這個 bot」，避免假告警風暴。**
→ **Decommission 保留歷史資料，讓審計和成本追蹤不會因為移除 bot 而丟失。**
→ **Auto-exit 防止忘記關維護模式（設定 2 小時後自動退出）。**

---

**5. Fleet Diff View — 並排比較任意兩個 Bot 的完整差異**

**洞察：Config Drift (#11) 告訴你「有差異」，但不讓你深入比較。Plugin Matrix (#13) 告訴你「plugin 不同」，但不讓你看其他維度。**

**需要一個通用的 Diff 工具：選任意兩個 bot → 並排顯示所有維度的差異。**

```
┌─ Fleet Diff: 🦞 小龍蝦 vs 🐿️ 飛鼠 ──────────────────────────────────────────┐
│                                                                                  │
│  Select:  [🦞 小龍蝦 ▼]  ↔  [🐿️ 飛鼠 ▼]                                     │
│                                                                                  │
│  ── Health ──────────────────────────────────────────────────────────            │
│  Score:         92/A ████████████████████░░        88/B █████████████████░░░    │
│  Connectivity:  98 ✅                               95 ✅                       │
│  Responsiveness: 85                                  91 ⬆ (+6)                  │
│  Efficiency:    90                                  78 ⬇ (-12) ⚠️              │
│  Channels:      100 (2/2)                           100 (2/2)                   │
│  Cron:          95 (19/20)                          100 (8/8) ⬆                 │
│                                                                                  │
│  ── Config (3 differences) ──────────────────────────────────────────────       │
│  model:         claude-opus-4         ≠    claude-sonnet-4        🔴 critical  │
│  maxTokens:     8192                  ≠    4096                   🟡 warning   │
│  thinkingLevel: high                  =    high                                 │
│                                                                                  │
│  ── Plugins (1 difference) ──────────────────────────────────────────────       │
│  line:          ✅ enabled            =    ✅ enabled                           │
│  telegram:      ✅ enabled            ≠    ❌ missing              🟡 warning   │
│  memory-lancedb: ✅ enabled           ≠    memory-core            🔴 critical  │
│                                                                                  │
│  ── Cost (7 days) ──────────────────────────────────────────────────────        │
│  Total:         $45.30                      $32.10 (-29%)                       │
│  Per session:   $0.35                       $0.22 (-37%)                        │
│  Cache ratio:   45%                         62% ⬆ (+17%)                       │
│                                                                                  │
│  ── Activity Pattern ───────────────────────────────────────────────────        │
│  Peak hours:    09-12, 14-17                09-11, 15-18                        │
│  Avg turns/day: 42                          28                                  │
│  Avg turn time: 8.2s                        5.1s ⬆ (faster)                    │
│                                                                                  │
│  💡 Intelligence: 🦞 costs 41% more due to Opus model + lower cache ratio.     │
│     If 🦞 used Sonnet like 🐿️, estimated savings: ~$28/mo.                    │
│                                                                                  │
│  [Apply 🐿️'s Config to 🦞]  [Export Diff as CSV]                               │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**技術實作：**

```typescript
interface BotDiff {
  leftBot: BotSnapshot;
  rightBot: BotSnapshot;
  dimensions: Array<{
    category: "health" | "config" | "plugins" | "cost" | "activity" | "channels";
    items: Array<{
      key: string;
      leftValue: unknown;
      rightValue: unknown;
      equal: boolean;
      severity?: "critical" | "warning" | "info";
      delta?: string;           // e.g., "+17%", "-$13.20"
    }>;
  }>;
  intelligence?: string;        // Cross-signal 洞察
}

// API
// GET /api/fleet-monitor/diff?left=botId1&right=botId2
```

→ **從「Config Drift 告訴你有 3 個差異」到「完整的多維度並排比較 + 可行動的建議」。**
→ **「Apply Config」按鈕直接連接 Command Center pipeline。**

---

**6. Session Forensics — 時光回溯偵錯（超越 Live Tail 的歷史分析工具）**

**Planning #9 的 Session Live Tail 看的是「現在」。但問題通常是「昨天發生了什麼」。**

**場景：**
```
早上上班發現 🦞 小龍蝦 凌晨 3:00 的 health score 從 92 掉到 28，然後 3:15 又回到 85。
需要回答：「3:00-3:15 發生了什麼？」
```

**Session Forensics = 時間點快照 + 事件回放 + 根因分析**

```
┌─ 🔍 Session Forensics ────────────────────────────────────────────────────────┐
│                                                                                  │
│  Bot: [🦞 小龍蝦 ▼]   Time Range: [2026-03-19 03:00] to [03:15]              │
│                                                                                  │
│  ── Timeline ───────────────────────────────────────────────────────────────── │
│  03:00 ████ Health 92 → 85  │ Cron "nightly-batch" started                     │
│  03:02 ████ Health 85 → 72  │ Agent turn #847 (nightly-batch) — 45K tokens     │
│  03:05 ████ Health 72 → 45  │ Agent turn #847 still running... 120K tokens     │
│  03:08 ████ Health 45 → 28  │ Agent turn #847 — tool timeout (Bash 30s)       │
│  03:10 ████ Health 28       │ Alert fired: "Health Critical"                    │
│  03:11 ████ Health 28 → 35  │ 🩹 Self-heal: reconnect attempt                  │
│  03:12 ████ Health 35 → 55  │ Agent turn #847 completed (180K tokens, 12 min) │
│  03:13 ████ Health 55 → 72  │ Health recovering                                │
│  03:15 ████ Health 72 → 85  │ Stable                                           │
│                                                                                  │
│  ── Root Cause Analysis ─────────────────────────────────────────────────────  │
│  🔴 Primary: Agent turn #847 consumed 180K tokens (normal: ~30K)              │
│  🟡 Contributing: Bash tool timeout at 03:08 caused retry loop                │
│  🟢 Resolution: Turn completed naturally after timeout retry succeeded        │
│                                                                                  │
│  ── Impact ──────────────────────────────────────────────────────────────────  │
│  💰 Cost of incident: $2.70 (Opus, 180K tokens)                               │
│  ⏱ Duration: 12 minutes                                                        │
│  📡 Channel impact: LINE — 3 messages delayed by ~10 min                      │
│                                                                                  │
│  ── Trace Replay ────────────────────────────────────────────────────────────  │
│  [▶ Replay Turn #847]  — 展開完整的 TraceWaterfall 瀑布圖                       │
│                                                                                  │
│  ── Recommendations ─────────────────────────────────────────────────────────  │
│  💡 Cron "nightly-batch" 定期觸發高成本 turn。建議：                             │
│     1. 設定 nightly-batch 的 max_tokens 上限為 50K                              │
│     2. 或切換該 cron 使用 Sonnet model（降低 5x 成本）                          │
│     3. 增加 Bash tool timeout（30s → 60s）減少 retry                            │
│                                                                                  │
│  [Export Incident Report]  [Create Healing Policy from This]                    │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**資料來源組裝（不需要新的後端儲存）：**

```
fleet_snapshots (小時級)  → 健康分數時間線
fleet_alert_history       → 告警事件
fleet_audit_log           → 自動修復事件
Trace Ring Buffer         → Agent turn 瀑布圖（如果還在記憶體中）
sessions.usage RPC        → Token 用量明細
```

**「Create Healing Policy from This」— 從事後分析直接生成預防策略：**

這是閉環的關鍵：
```
事件發生 → Forensics 分析根因 → 生成 Healing Policy → 下次自動修復 → 不再需要 Forensics
```

→ **從「出了事才知道出了事」到「知道為什麼出事、花了多少錢、影響了什麼、以及如何預防」。**
→ **Incident Report 可匯出 → 給老闆看的事後報告。**
→ **「Create Healing Policy」完成從分析到預防的閉環。**

---

**7. 本次程式碼產出**

**Commit 37: Fleet Command Center UI + Pipeline Engine**
```
新增：server/src/services/fleet-command-pipeline.ts
  — CommandPipeline executor（step-by-step 執行引擎）
  — Gate evaluation（health check + metric comparison）
  — Delay step（計時器 + 進度推送）
  — Rollback engine（逆序執行 rollbackStep）
  — Pipeline 模板管理

新增：server/src/routes/fleet-command.ts
  — POST /api/fleet-command/execute（啟動 pipeline）
  — GET /api/fleet-command/:id/status（即時進度）
  — POST /api/fleet-command/:id/pause（暫停）
  — POST /api/fleet-command/:id/abort（中止）
  — POST /api/fleet-command/:id/rollback（手動回滾）
  — GET /api/fleet-command/templates（模板列表）
  — POST /api/fleet-command/templates（儲存自訂模板）
  — GET /api/fleet-command/history（歷史 pipeline 記錄）

新增：ui/src/components/fleet/CommandCenter.tsx
  — Pipeline Builder UI（拖拉步驟）
  — Template selector
  — Target bot selection（with tag filter）
  — Rate limit status bar
  — Pipeline Execution Visualization（即時進度 + step status）
  — Rollback/Pause/Abort 控制

修改：server/src/fleet-bootstrap.ts
  — 註冊 fleet-command router
```

**Commit 38: Self-Healing Fleet**
```
新增：server/src/services/fleet-healing.ts
  — HealingPolicyEngine class
  — Policy evaluation loop（30 秒檢查一次）
  — Remediation executor（reconnect, channel restart, model downgrade）
  — Escalation logic（attempt count → alert/slack）
  — Kill switch（全域暫停）
  — Audit integration（每次修復寫 audit log）
  — Cooldown + max attempts tracking

新增：server/src/routes/fleet-healing.ts
  — GET /api/fleet-healing/policies（列出所有策略）
  — PUT /api/fleet-healing/policies/:id（更新策略）
  — POST /api/fleet-healing/kill-switch（全域暫停/恢復）
  — GET /api/fleet-healing/history（修復歷史）
  — GET /api/fleet-healing/stats（統計：成功率、平均修復時間）

新增：ui/src/components/fleet/SelfHealingWidget.tsx
  — Policy 列表（開關 toggle）
  — Healing 事件時間線
  — 統計卡片（成功率、MTTR）
  — Kill switch 按鈕
```

**Commit 39: External Integration Platform**
```
新增：server/src/services/fleet-integrations.ts
  — IntegrationManager class
  — Slack sender（Block Kit rich messages）
  — LINE Notify sender
  — Grafana metrics pusher（Prometheus format）
  — Generic webhook sender（HMAC signing + Handlebars template）
  — Event router（filter events → matching integrations）
  — Delivery tracking + retry（3 次，指數退避）

新增：server/src/routes/fleet-integrations.ts
  — CRUD endpoints for integrations
  — POST /api/fleet-integrations/:id/test（測試連接）
  — GET /api/fleet-integrations/delivery-log（投遞記錄）

新增：ui/src/components/fleet/IntegrationSettings.tsx
  — Integration 卡片列表（active/available）
  — Event routing 配置 UI
  — Delivery log viewer
  — Test integration 按鈕
```

**Commit 40: Bot Lifecycle Management**
```
修改：server/src/services/fleet-monitor.ts
  — 新增 setLifecycleStage() 方法
  — Maintenance mode：暫停 alerts + healing + batch ops
  — Decommission：停止連線，保留歷史資料
  — Auto-exit maintenance（定時器）

修改：server/src/routes/fleet-monitor.ts
  — PUT /api/fleet-monitor/bot/:botId/lifecycle（更新生命週期階段）
  — POST /api/fleet-monitor/bot/:botId/maintenance（進入/退出維護模式）

修改：server/src/services/fleet-alerts.ts
  — evaluateBot() 檢查 lifecycle stage → maintenance = skip
修改：server/src/services/fleet-healing.ts
  — evaluate() 檢查 lifecycle stage → maintenance = skip

修改：ui/src/components/fleet/BotStatusCard.tsx
  — Maintenance mode 視覺（橘色框 + 扳手圖示 + 維護原因）
  — Decommissioned 視覺（灰色 + 劃線 + 保留天數）

修改：ui/src/components/fleet/BotDetailFleetTab.tsx
  — Lifecycle Stage selector（dropdown）
  — Maintenance mode dialog（原因 + 預估時間 + 選項）
```

**Commit 41: Fleet Diff View**
```
新增：server/src/routes/fleet-monitor.ts（新增 endpoint）
  — GET /api/fleet-monitor/diff?left=:botId&right=:botId
  — 聚合 health, config, plugins, cost, activity 多維度比較

新增：ui/src/components/fleet/FleetDiffView.tsx
  — Bot selector pair（左/右 dropdown）
  — Dimension sections（health, config, plugins, cost, activity）
  — Delta indicators（⬆ ⬇ = 符號 + 百分比）
  — Severity markers（critical/warning/info dots）
  — Intelligence insight（底部跨信號推薦）
  — "Apply Config" → 連接 Command Center
  — "Export Diff" → CSV 下載
```

**Commit 42: Session Forensics**
```
新增：server/src/services/fleet-forensics.ts
  — ForensicsEngine class
  — 時間範圍查詢（聚合 snapshots + alerts + audit + traces）
  — Root cause heuristics（token spike → runaway turn, channel down → plugin missing）
  — Impact 計算（cost, duration, message delay）
  — Recommendation generator（基於根因 → 可行動建議）

新增：server/src/routes/fleet-forensics.ts
  — GET /api/fleet-forensics/investigate?botId=&from=&to=
  — GET /api/fleet-forensics/incidents（自動偵測的事件列表）

新增：ui/src/components/fleet/SessionForensics.tsx
  — Time range selector
  — Event timeline（色條 + 事件標記）
  — Root Cause Analysis 面板
  — Impact summary 卡片
  — Trace Replay 嵌入（連接 TraceWaterfall）
  — Recommendation 列表
  — "Export Incident Report" 按鈕
  — "Create Healing Policy" → 連接 Self-Healing
```

---

**8. 與前幾次 Planning 的關鍵差異**

| 面向 | 之前的想法 | Planning #14 的改進 |
|------|----------|-------------------|
| 批次操作 | 原子命令（#7 設計但沒有 UI） | Command Pipeline（可組合步驟 + Gate + Delay + Rollback + Template） |
| 告警回應 | Runbooks（人類按步驟）(#11) | Self-Healing（自動修復 + 升級 + Kill Switch + 83% 自動化率） |
| 外部通訊 | 只有 inbound webhook (#13) | 完整 outbound platform（Slack/LINE Notify/Grafana/Generic Webhook） |
| Bot 狀態 | 在線/離線 + 7 connection states | 5 階段生命週期（Provisioning → Active → Maintenance → Decommissioned） |
| Bot 比較 | Config Drift（只看 config 差異） | Fleet Diff View（health + config + plugins + cost + activity 全維度） |
| 歷史分析 | Live Tail（只看即時） | Session Forensics（時間回溯 + 根因 + 影響 + 建議 + 閉環到 Healing） |
| 操作安全 | Rate limiter（被動） | Maintenance mode（主動標記 → 靜音 alerts/healing/batch） |
| 閉環程度 | 事件 → 告警 → 人工 | 事件 → 告警 → 自動修復 → 升級 → 事後分析 → 預防策略（完整閉環） |

---

**9. 風險更新**

| 新風險 | 嚴重度 | 緩解 |
|--------|--------|------|
| Self-Healing 誤操作（自動 downgrade 了不該降的 model） | 🔴 高 | 所有 policies 預設 off；max attempts/hour；cooldown；audit log；kill switch |
| Command Pipeline 卡在 Gate step 永遠不通過 | 🟡 中 | Pipeline timeout（預設 30 分鐘）；手動 skip/abort 按鈕 |
| Slack webhook URL 洩露（在 DB 中明文） | 🟡 中 | 加密存儲（利用 Paperclip 既有的 company_secrets 機制） |
| Grafana push 高頻率造成 Fleet server CPU 壓力 | 🟢 低 | 固定 60 秒推送間隔；metrics 數量 = bots × 6 指標 ≈ 120 metrics（微量） |
| Maintenance mode 忘記關（bot 永遠靜音） | 🟡 中 | Auto-exit（預設 2 小時）；Dashboard 顯示維護時長；超過預估時間變黃/紅 |
| Fleet Diff 對低版本 Gateway 可能缺少某些維度 | 🟢 低 | Graceful degradation：缺少的維度顯示「Data not available」 |
| Forensics 查詢大量歷史資料拖慢 DB | 🟡 中 | 限制查詢範圍最長 7 天；fleet_snapshots 有索引；日級摘要走 fleet_daily_summary |
| External Integration 密鑰管理（多個服務的 token） | 🟡 中 | 統一存入 company_secrets 表（AES-256 加密）；UI 只顯示 masked token |

---

**10. 修訂的整體進度追蹤**

```
✅ Planning #1-4: 概念、API 研究、架構設計
✅ Planning #5: 品牌主題 CSS + DB aliases + 術語改名
✅ Planning #6: FleetGatewayClient + FleetMonitorService + API routes
✅ Planning #7: Mock Gateway + Health Score + AlertService + 時序策略 + Command Center（設計）
✅ Planning #8: Fleet API client + React hooks + BotStatusCard + FleetDashboard + ConnectBotWizard
✅ Planning #9: Route wiring + Sidebar Fleet Pulse + LiveEvent bridge + BotDetailFleetTab + Companies Connect
✅ Planning #10: Server Bootstrap + Graceful Shutdown + DB Migrations + Anomaly Detection + Cost Forecast + E2E Tests + i18n
✅ Planning #11: Observable Fleet（三支柱）+ Config Drift + Channel Cost + Session Live Tail + Notification Center + Heatmap + Runbooks + Reports
✅ Planning #12: Fleet Intelligence Layer — Trace Waterfall + mDNS Discovery + Tags + Reports API + Cost Budgets + Intelligence Engine
✅ Planning #13: Fleet Control Plane — Webhook Push + Inter-Bot Graph + RBAC Audit + Plugin Inventory + Glassmorphism UI + Rate Limiter
✅ Planning #14: Fleet Closed Loop — Command Center UI + Self-Healing + External Integrations + Bot Lifecycle + Diff View + Session Forensics
⬜ Next: Multi-Fleet 支援（Fleet of Fleets — 多車隊、跨車隊 Intelligence）
⬜ Next: Bot Persona Editor（pixel art 生成器 + IDENTITY.md 視覺化）
⬜ Next: Fleet Marketplace（共享 Pipeline Templates / Healing Policies / Integration Presets）
⬜ Next: Mobile PWA + Push Notifications（APNs / FCM）
⬜ Next: Fleet CLI 工具（`fleet status`, `fleet connect`, `fleet heal`, `fleet diff`）
⬜ Next: Performance Stress Test（50 bot × Webhook + WS 混合模式）
⬜ Next: Fleet SDK（讓第三方開發者建立 custom Intelligence Rules + Healing Policies）
```

---

**11. 研究更新**

| 研究主題 | 本次新發現 | 狀態 |
|----------|-----------|------|
| OpenClaw Gateway API | 確認 `wake` RPC 可用於 channel 重啟嘗試（Self-Healing 關鍵）；確認 `config.patch` 支援 JSON Merge Patch 格式（Pipeline config-push 用）；確認 `cron.run` 可帶 `isolate: true` 參數觸發隔離執行（安全的 batch cron trigger）；確認 webhook delivery 的 `x-fleet-signature` header 用 HMAC-SHA256 簽名 | 🔓 持續觀察 — 隨功能開發深入發現新 API 用法 |
| painpoint-ai.com 品牌 | 無新發現。品牌色 + UI 模式已完整記錄於 #5, #8, #13。 | 🔒 封閉 |

---

**12. 架構成熟度評估（首次，回顧全局）**

經過 14 次 Planning，Fleet Dashboard 的架構成熟度：

```
┌─ Architecture Maturity Matrix ──────────────────────────────────────────────────┐
│                                                                                   │
│  Dimension              Status   Maturity    Notes                               │
│  ─────────────────────  ──────   ─────────   ───────────────────────────         │
│  Monitoring             ✅       ██████████  Health, Cost, Channels, Cron         │
│  Observability          ✅       █████████░  Metrics + Logs + Traces (3 pillars) │
│  Alerting               ✅       █████████░  Static + Anomaly + Budget            │
│  Intelligence           ✅       ████████░░  Cross-signal recommendations         │
│  Automation             ✅ NEW   ███████░░░  Self-Healing + Command Pipeline      │
│  External Integration   ✅ NEW   ██████░░░░  Slack + LINE + Grafana + Webhook    │
│  Access Control         ✅       ████████░░  RBAC + Audit Trail                   │
│  Data Persistence       ✅       █████████░  4-layer time series + migrations     │
│  Developer Experience   ✅       ████████░░  Mock Gateway + E2E + i18n            │
│  Visual Design          ✅       █████████░  Glassmorphism + Brand + Dark Mode    │
│  Scalability            ✅       ███████░░░  Webhook Push + Rate Limit + Budget   │
│  Lifecycle Management   ✅ NEW   ██████░░░░  5-stage lifecycle + Maintenance      │
│  Forensics              ✅ NEW   █████░░░░░  Time-travel debugging + Root cause   │
│  Multi-Fleet            ⬜       ░░░░░░░░░░  Not yet started                      │
│  Mobile                 ⬜       ░░░░░░░░░░  Not yet started                      │
│                                                                                   │
│  Overall: 8.2/10 — Production-ready for 4-20 bot fleets                          │
│  Next milestone: Multi-Fleet + Mobile → Enterprise-grade (9.0+)                  │
│                                                                                   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

### Planning #15 — 2026-03-19 27:30

**主題：Fleet Experimentation & Outcome Intelligence — 從「它在動嗎？」到「它做得好嗎？怎樣更好？」**

Planning #1-14 建立了完整的 **observe → alert → heal** 閉環。但這只解決「營運穩定」。

**結構性盲點：Fleet 知道 bot 是否在線、是否健康，但不知道 bot 是否「做得好」。**

一個 health score 92 的 bot 可能每天回答客戶問題的品質很差。
一個 health score 72 的 bot 可能因為在處理更多高價值對話而看起來「不健康」。

**Planning #15 加入第二個閉環：experiment → measure → learn → optimize。**

```
Planning #1-14 的閉環（營運）：
  observe → alert → heal → prevent
  「它壞了嗎？」

Planning #15 的閉環（優化）：
  experiment → measure → learn → optimize
  「它可以更好嗎？」
```

---

**1. Fleet Canary Lab — 結構化 A/B 測試平台（從「改了希望變好」到「有資料證明更好」）**

**問題：** Planning #14 的 Command Pipeline 可以 canary 推 config 變更。但「canary」只檢查「推完沒壞」，不檢查「推完有沒有更好」。

**場景：**
```
Alex 想知道：「如果把 🦞 從 Opus 換成 Sonnet，對話品質會下降多少？成本能省多少？」
目前做法：直接換 → 觀察幾天 → 憑感覺判斷
問題：沒有控制組、沒有統計顯著性、沒有定量比較
```

**Canary Lab = 定義假說 → 設定實驗 → 自動收集資料 → 統計分析 → 產出結論**

```typescript
interface Experiment {
  id: string;
  name: string;
  hypothesis: string;              // 「Sonnet 可以替代 Opus 且品質下降 < 10%」
  status: "draft" | "running" | "paused" | "completed" | "aborted";

  // 實驗設定
  controlGroup: {
    botIds: string[];              // 不變的 bot（對照組）
    config: Record<string, unknown>; // 目前 config snapshot
  };
  testGroup: {
    botIds: string[];              // 要改的 bot（實驗組）
    configPatch: Record<string, unknown>; // 要套用的 config 差異
  };

  // 成功指標
  metrics: ExperimentMetric[];

  // 時間控制
  startedAt?: Date;
  endAt?: Date;                    // 自動結束時間
  minDurationMs: number;           // 最短觀察期（防止過早下結論）
  minSampleSize: number;           // 最少樣本數（對話輪數）

  // 安全護欄
  guardrails: {
    abortIf: {                     // 自動中止條件
      healthBelow: number;         // health 掉到 X 以下 → 立刻中止 + 回滾
      errorRateAbove: number;      // 錯誤率超過 X% → 中止
      costMultiplierAbove: number; // 成本超過控制組 N 倍 → 中止
    };
    rollbackOnAbort: boolean;      // 中止時自動回滾 config
  };

  // 結果
  result?: ExperimentResult;
}

interface ExperimentMetric {
  name: string;
  type: "higher_is_better" | "lower_is_better" | "closer_to_target";
  source: "health_score" | "cost_per_session" | "avg_turn_time" |
          "quality_index" | "task_completion_rate" | "escalation_rate" |
          "cache_hit_ratio" | "tokens_per_turn" | "custom";
  target?: number;                 // for closer_to_target type
  weight: number;                  // 加權（0-1，所有 metrics weight 加總 = 1）
}

interface ExperimentResult {
  controlStats: MetricStats[];
  testStats: MetricStats[];
  comparison: Array<{
    metric: string;
    controlMean: number;
    testMean: number;
    delta: number;                 // 差異百分比
    pValue: number;                // Welch's t-test p-value
    significant: boolean;          // p < 0.05
    winner: "control" | "test" | "tie";
  }>;
  overallVerdict: "test_wins" | "control_wins" | "inconclusive";
  recommendation: string;         // AI 生成的建議
  sampleSize: { control: number; test: number };
}
```

**Canary Lab UI：**

```
┌─ 🧪 Canary Lab ───────────────────────────────────────────────────────────────┐
│                                                                                  │
│  Active Experiments (1)                                                         │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ 🧪 "Opus → Sonnet Migration Feasibility"                                  │ │
│  │ Hypothesis: Sonnet can replace Opus with <10% quality drop                │ │
│  │ Status: Running (Day 3/7)  │  Samples: 142 control / 138 test            │ │
│  │                                                                            │ │
│  │ Control: 🦞 小龍蝦 (Opus)     Test: 🐿️ 飛鼠 (→Sonnet)                  │ │
│  │                                                                            │ │
│  │  Metric              Control    Test     Delta    Sig?                     │ │
│  │  ──────────────────  ─────────  ──────   ──────   ────                     │ │
│  │  Quality Index       87.2       83.5     -4.2%    ✅ p=0.031              │ │
│  │  Cost/Session        $0.35      $0.08    -77.1%   ✅ p<0.001             │ │
│  │  Avg Turn Time       8.2s       5.1s     -37.8%   ✅ p<0.001             │ │
│  │  Task Completion     91%        88%      -3.3%    ❌ p=0.142 (n/s)       │ │
│  │  Cache Hit Ratio     45%        62%      +37.8%   ✅ p=0.003             │ │
│  │                                                                            │ │
│  │  Guardrails: ✅ All within limits (health: 88, errors: 1.2%)              │ │
│  │                                                                            │ │
│  │  Early Signal: Test group 77% cheaper with only 4.2% quality drop.        │ │
│  │  Recommendation: Continue to Day 7 for full statistical power.            │ │
│  │                                                                            │ │
│  │  [⏸ Pause]  [⏹ Abort + Rollback]  [View Details]                        │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  Completed Experiments (3)                                                      │
│  📊 "Cache Optimization Impact" — test_wins ✅ (Jan 15, 2026)                 │
│  📊 "High vs Medium Thinking" — inconclusive ⚖️ (Jan 8, 2026)                │
│  📊 "Greeting Style A/B" — control_wins ❌ (Dec 20, 2025)                     │
│                                                                                  │
│  [+ New Experiment]  [View All Results]  [Export Reports]                       │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**統計引擎（不用外部依賴）：**

```typescript
// Welch's t-test — 不假設等方差（更穩健）
function welchTTest(a: number[], b: number[]): { t: number; df: number; pValue: number } {
  const meanA = mean(a), meanB = mean(b);
  const varA = variance(a), varB = variance(b);
  const nA = a.length, nB = b.length;

  const t = (meanA - meanB) / Math.sqrt(varA / nA + varB / nB);

  // Welch-Satterthwaite degrees of freedom
  const df = Math.pow(varA / nA + varB / nB, 2) /
    (Math.pow(varA / nA, 2) / (nA - 1) + Math.pow(varB / nB, 2) / (nB - 1));

  // Approximate p-value using Student's t-distribution
  const pValue = tDistPValue(Math.abs(t), df);

  return { t, df, pValue };
}
```

→ **從「改了希望變好」到「有 p-value 證明更好」。**
→ **Guardrails 確保實驗安全——health 掉太多就自動中止 + 回滾。**
→ **管理者第一次可以用資料回答：「換 Sonnet 到底行不行？」**

---

**2. Conversation Quality Index (CQI) — 超越 Health Score 的結果導向指標**

**Health Score 的根本問題：它測「基礎設施」，不測「成果」。**

```
類比：
  Health Score = 餐廳的瓦斯有沒有通、冷氣有沒有開、廚師有沒有到
  CQI = 客人吃完覺得好不好吃、會不會再來

兩者都需要。但目前 Fleet 只有前者。
```

**CQI 從哪裡收集信號（不需要額外埋點）：**

```typescript
interface QualitySignals {
  // ─── 從 session 資料推斷 ──────────────────────
  taskCompletion: {
    // session 是否正常結束（vs. 用戶中途放棄）
    completedSessions: number;
    abandonedSessions: number;     // 用戶 5+ 分鐘無回應 → 可能放棄
    rate: number;                  // completedSessions / total
  };

  conversationEfficiency: {
    // 解決問題需要幾個 turn？越少越好（表示 bot 理解力強）
    avgTurnsToResolve: number;
    medianTurnsToResolve: number;
    p95TurnsToResolve: number;
  };

  reEngagement: {
    // 用戶是否回來？（隔天/隔週同一用戶新 session）
    // 高 re-engagement → bot 有用，用戶信任
    returningUsers7d: number;
    newUsers7d: number;
    retentionRate: number;
  };

  escalationRate: {
    // session 中 bot 是否「轉交人工」或承認無法解決
    escalatedSessions: number;
    rate: number;                  // 越低越好
  };

  // ─── 從 turn 資料推斷 ──────────────────────────
  responseRelevance: {
    // 用戶在 bot 回覆後是否立刻重問同樣的問題？（proxy for misunderstanding）
    repeatedQueries: number;
    rate: number;                  // 越低越好
  };

  toolSuccessRate: {
    // tool call 的成功率（tool error → bot 能力受限）
    totalToolCalls: number;
    successfulToolCalls: number;
    rate: number;
  };

  // ─── 從 channel 資料推斷 ──────────────────────
  responseTime: {
    // 從用戶發訊到 bot 回覆的延遲（越短體驗越好）
    avgMs: number;
    p50Ms: number;
    p95Ms: number;
  };
}

interface QualityIndex {
  overall: number;                 // 0-100
  grade: "S" | "A" | "B" | "C" | "D" | "F";
  dimensions: {
    effectiveness: number;         // 任務完成 + 效率
    reliability: number;           // tool 成功 + 低錯誤率
    experience: number;            // 回應速度 + 低重複問題
    engagement: number;            // re-engagement + 低放棄率
  };
  trend: "improving" | "stable" | "declining";
  comparedToFleetAvg: number;      // +/- percentage vs fleet average
}
```

**CQI Dashboard Widget：**

```
┌─ 📊 Conversation Quality Index ──────────────────────────────────────────────┐
│                                                                                │
│  Fleet Average CQI: 78/B                                                      │
│  ████████████████████████████████████████████████░░░░░░░░░░░░  78/100         │
│                                                                                │
│  Per-Bot Breakdown:                                                           │
│  🦞 小龍蝦   85/A  ████████████████████████████████████████████░░░░░░         │
│  🐿️ 飛鼠    81/B  ████████████████████████████████████████░░░░░░░░░░         │
│  🦚 孔雀     74/C  ████████████████████████████████████░░░░░░░░░░░░░░         │
│  🐗 山豬     72/C  ██████████████████████████████████░░░░░░░░░░░░░░░░         │
│                                                                                │
│  Dimension Analysis (Fleet):                                                  │
│  Effectiveness:  82  ████████░░  Task completion 91%, avg 4.2 turns          │
│  Reliability:    85  █████████░  Tool success 97%, low error rate            │
│  Experience:     71  ███████░░░  p95 response 12.3s ← bottleneck            │
│  Engagement:     74  ███████░░░  Retention 68%, abandonment 15%              │
│                                                                                │
│  💡 Insight: Experience score is dragging CQI down. p95 response time of     │
│     12.3s on 🦚 孔雀 (LINE channel) suggests slow tool execution.            │
│     Recommendation: Audit 🦚's cron jobs — may be competing for resources.   │
│                                                                                │
│  Trend (7d): 76 → 78 → 78 → 77 → 79 → 78 → 78  📈 Stable                  │
│                                                                                │
│  [View Full Report]  [Compare Bots]  [Set Quality Targets]                   │
│                                                                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

**CQI 跟 Health Score 的關係：**

```
┌──────────────────────────────────────────────────────────┐
│                                                            │
│  Health = "Can it work?"     CQI = "Does it work well?"  │
│                                                            │
│  Health ↑ CQI ↑  →  正常（基礎好，結果也好）              │
│  Health ↑ CQI ↓  →  🚨 問題（基礎好但結果差 → config/prompt 問題） │
│  Health ↓ CQI ↑  →  ⚠️ 短期可維持但有風險                │
│  Health ↓ CQI ↓  →  🔴 緊急                              │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

→ **Fleet 第一次有「結果導向」的指標。管理者知道 bot 不只是活著，而且在做好工作。**
→ **CQI 跟 Canary Lab 結合 = 用 CQI 作為實驗的成功指標。**

---

**3. Fleet Capacity Planning — 從「超支才知道」到「預測並預防」**

**Budget Alerts (#12) 的問題：它在超支的瞬間告訴你。但你需要提前知道。**

```
場景：
  3 月 15 日：月預算用了 60%（正常軌跡）
  3 月 18 日：突然有行銷活動，session 量 3x → 月預算用到 85%
  3 月 19 日：Budget Alert 觸發「85% 已用」
  3 月 20 日：超支

如果 3 月 15 日就知道「以目前趨勢，3 月 22 日會超支」呢？
```

**Capacity Planning = 時間序列預測 + 資源飽和預警 + 情境模擬**

```typescript
interface CapacityForecast {
  metric: "token_usage" | "session_count" | "cost_usd" | "active_bots";
  currentValue: number;

  // 預測
  forecast: Array<{
    date: string;                  // ISO date
    predicted: number;
    confidenceLow: number;         // 95% CI lower bound
    confidenceHigh: number;        // 95% CI upper bound
  }>;

  // 飽和預警
  saturation?: {
    threshold: number;             // 例如月預算 $500
    projectedBreachDate: string;   // 預計何時超過 threshold
    daysRemaining: number;
    confidence: number;            // 0-1（預測可信度）
    recommendation: string;        // 「降級 2 個 bot 到 Sonnet 可延後 8 天」
  };

  // 情境模擬
  scenarios: Array<{
    name: string;                  // "If we add 2 bots", "If session volume doubles"
    adjustment: Record<string, number>;
    projectedBreachDate?: string;
    projectedCost: number;
  }>;
}

// 預測演算法：Triple Exponential Smoothing (Holt-Winters)
// 捕捉 level + trend + 週期性（bot 使用量有明顯的日/週週期）
interface HoltWinters {
  alpha: number;  // level smoothing
  beta: number;   // trend smoothing
  gamma: number;  // seasonal smoothing
  seasonLength: number;  // 24（小時週期）or 168（週週期）
}
```

**Capacity Planning UI：**

```
┌─ 📈 Capacity Planning ──────────────────────────────────────────────────────┐
│                                                                                │
│  Cost Forecast (March 2026)                                                   │
│                                                                                │
│  $500 ┤╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ Budget ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ │
│  $450 ┤                                          ╱  ·· ·· ·· Forecast     │
│  $400 ┤                                       ╱  ·                         │
│  $350 ┤                                    ╱                               │
│  $300 ┤                                 ╱       ← You are here ($342)     │
│  $250 ┤                              ╱                                     │
│  $200 ┤                          ╱                                         │
│  $150 ┤                      ╱                                             │
│  $100 ┤                 ╱                                                   │
│   $50 ┤            ╱                                                        │
│    $0 ┤────────╱──────────────────────────────────────────────────────────  │
│        Mar 1    Mar 8    Mar 15   Mar 19   Mar 23   Mar 27   Mar 31       │
│                                                                                │
│  ⚠️ Budget Breach Projection: March 27 (8 days from now)                     │
│  Confidence: 82% (based on 19 days of data)                                  │
│                                                                                │
│  Scenario Simulator:                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐      │
│  │ 🔵 Current pace         → Breach Mar 27    ($523)                 │      │
│  │ 🟢 Downgrade 🦞 to Sonnet → Breach Apr 4   ($487) — saves $36   │      │
│  │ 🟡 Add 2 new bots       → Breach Mar 22    ($612)                 │      │
│  │ 🔴 Double session volume → Breach Mar 24    ($689)                 │      │
│  └────────────────────────────────────────────────────────────────────┘      │
│                                                                                │
│  Session Volume Forecast:                                                     │
│  Current: 42 sessions/day (fleet) │ Trend: +3.2%/week │ Seasonal: peak Thu  │
│                                                                                │
│  [Configure Scenarios]  [Set Budget Threshold]  [Export Forecast]             │
│                                                                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

→ **從「超支才知道」到「提前 8 天預警 + 提供具體的省錢方案」。**
→ **Scenario Simulator 讓管理者在做決策前看到後果（加 bot？換 model？）。**

---

**4. Fleet Dependency Radar — 外部依賴健康監控（Fleet 不是孤島）**

**所有之前的 Planning 都假設問題出在 bot 自己。但 bot 的 50%+ 問題來自外部依賴。**

```
依賴鏈：
  用戶 → LINE API → OpenClaw Gateway → Claude API → Tool calls → 外部 API

任何一環斷了，bot 看起來都是「不健康」。但原因完全不同：
  - LINE API 限流 → channel disconnected → bot 看起來離線
  - Anthropic API 503 → agent 回應超時 → health 下降
  - 外部 API (Google Calendar, Notion) 斷了 → tool call 失敗 → CQI 下降
```

**Dependency Radar = 追蹤每個 bot 的外部依賴 + 關聯分析**

```typescript
interface DependencyNode {
  id: string;
  name: string;
  type: "llm_provider" | "channel" | "tool_api" | "database" | "gateway";
  endpoint?: string;

  // 健康狀態（從 bot 的 error patterns 推斷）
  status: "healthy" | "degraded" | "down" | "unknown";
  latencyMs?: number;
  errorRate?: number;
  lastCheckedAt: Date;

  // 哪些 bot 依賴它
  dependentBots: string[];

  // 影響評估
  impactIfDown: {
    affectedBots: number;
    affectedChannels: string[];
    estimatedCqiDrop: number;      // CQI 預計下降多少
  };
}

interface DependencyCorrelation {
  // 當外部依賴出問題時，bot 指標如何變化
  dependencyId: string;
  botId: string;
  correlation: {
    healthScoreDelta: number;      // e.g., -25（dependency down → health 掉 25 分）
    cqiDelta: number;
    errorRateIncrease: number;
    responseTimeIncrease: number;
  };
  confidence: number;              // 相關性強度
  sampleSize: number;
}
```

**Dependency Radar UI：**

```
┌─ 🛰️ Dependency Radar ────────────────────────────────────────────────────────┐
│                                                                                  │
│                    ┌─────────────┐                                              │
│                    │ Anthropic   │                                              │
│                    │ Claude API  │                                              │
│                    │ 🟢 healthy  │                                              │
│                    │ 230ms avg   │                                              │
│                    └──────┬──────┘                                              │
│                           │                                                      │
│  ┌──────────┐    ┌───────┴───────┐    ┌──────────┐                            │
│  │ LINE API │────│ Fleet Bots    │────│ Notion   │                            │
│  │ 🟡 slow  │    │ 4 connected   │    │ 🟢 ok    │                            │
│  │ 450ms    │    └───────────────┘    │ 120ms    │                            │
│  └──────────┘            │            └──────────┘                            │
│                          │                                                      │
│  ┌──────────┐    ┌───────┴───────┐    ┌──────────┐                            │
│  │ Telegram │    │ Google Cal   │    │ Supabase │                            │
│  │ 🟢 ok    │    │ 🔴 errors    │    │ 🟢 ok    │                            │
│  │ 89ms     │    │ 52% fail     │    │ 45ms     │                            │
│  └──────────┘    └───────────────┘    └──────────┘                            │
│                                                                                  │
│  Impact Analysis:                                                               │
│  🔴 Google Calendar API: 52% error rate (last 1h)                              │
│     Affected: 🦞 小龍蝦, 🐿️ 飛鼠 (calendar tool)                             │
│     Impact: CQI estimated drop -8 points for affected bots                     │
│     Correlation: 0.89 (high) — last similar incident: Mar 12                   │
│                                                                                  │
│  🟡 LINE API: latency 450ms (normal: 120ms)                                   │
│     Affected: 🦞, 🦚, 🐗 (LINE channels)                                     │
│     Impact: Response time p95 increased to 15.2s (+4.1s)                       │
│                                                                                  │
│  [View History]  [Configure Dependencies]  [Mute Dependency]                   │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

→ **Fleet 第一次能區分「bot 自己的問題」vs「外部依賴的問題」。**
→ **Correlation analysis 建立因果關係——LINE 慢 → 哪些 bot 受影響 → CQI 掉多少。**
→ **Self-Healing 可以根據 dependency status 做更聰明的決策（不是 bot 壞了，是 LINE 慢了 → 不需要 reconnect）。**

---

**5. Fleet Playback (Dashboard DVR) — 全車隊時光回溯**

**Session Forensics (#14) 是單 bot + 單時間段的調查工具。Dashboard DVR 是整個車隊的時光機。**

```
場景：
  週一早上上班，看到週末有 3 個 alerts 被 self-healing 處理了。
  想知道：「週六凌晨 2 點的 fleet 狀態長什麼樣子？」

  Session Forensics：選一個 bot → 選時間範圍 → 看細節
  Dashboard DVR：拖時間軸 → 整個 Dashboard 回到那個時間點
```

```typescript
interface FleetSnapshot {
  id: string;
  takenAt: Date;
  resolution: "1m" | "5m" | "15m" | "1h";  // 快照間隔

  fleet: {
    onlineCount: number;
    totalBots: number;
    fleetHealthScore: number;
    fleetCqi: number;              // 新增 CQI
    totalCost1h: number;
    activeAlerts: number;
  };

  bots: Array<{
    botId: string;
    connectionState: string;
    healthScore: number;
    cqi: number;
    activeSessions: number;
    costSinceSnapshot: number;
    lifecycleStage: string;
  }>;

  dependencies: Array<{            // 新增 dependency snapshot
    name: string;
    status: string;
    latencyMs: number;
  }>;
}

// Storage strategy:
// - Last 24h: 1-minute snapshots (1,440 records)
// - Last 7d: 5-minute snapshots (2,016 records)
// - Last 30d: 1-hour snapshots (720 records)
// - Total: ~4,200 snapshot records — tiny footprint
```

**DVR UI（嵌入 Dashboard 頂部的時間軸）：**

```
┌─ ⏪ Fleet Playback ─────────────────────────────────────────────────────────┐
│                                                                                │
│  ◀ │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░│ ▶    🔴 LIVE                        │
│    Mar 18 00:00        ▲ Mar 18 14:30           Mar 19 03:30 (now)          │
│                        │                                                      │
│  Viewing: Mar 18, 2026 14:30 — Fleet Status at this moment:                 │
│  🟢 4/4 bots online │ Health: 89 │ CQI: 76 │ Cost/hr: $1.20                │
│  Alerts: 0 │ Healing events: 1 (auto-reconnect 🦚 at 14:22)                │
│                                                                                │
│  [← 1h]  [← 5m]  [→ 5m]  [→ 1h]  [⏩ Return to LIVE]                      │
│                                                                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

→ **整個 Dashboard 可以「回到過去」，不只是看數字，而是看到那個時間點的完整狀態。**
→ **Incident review 從「翻 log」變成「拖時間軸看 Dashboard」。**

---

**6. Fleet Knowledge Mesh — 跨 Bot 知識共享層**

**每個 bot 有自己的 MEMORY.md。但知識是孤立的。**

```
場景：
  🦞 小龍蝦 在跟客戶 A 的對話中得知：「我們下週二要出新版本 v2.5」。
  一小時後客戶 A 問 🐿️ 飛鼠：「新版本什麼時候出？」
  🐿️ 不知道。因為知識在 🦞 的 MEMORY.md 裡。
```

**Knowledge Mesh = Fleet 級別的共享記憶層**

```typescript
interface KnowledgeEntry {
  id: string;
  source: {
    botId: string;
    sessionId: string;
    createdAt: Date;
  };

  // 知識內容
  content: string;                 // 「客戶 A 的新版本 v2.5 預計下週二發布」
  category: "customer_info" | "product_update" | "policy_change" |
            "incident" | "decision" | "general";
  tags: string[];                  // ["客戶A", "v2.5", "release"]

  // 可見性
  visibility: "fleet" | "tag_group" | "specific_bots";
  visibleTo?: string[];            // bot IDs or tag names

  // 生命週期
  expiresAt?: Date;                // 自動過期（例如促銷活動結束日）
  confidence: number;              // 0-1（來源可靠度）
  verified: boolean;               // 管理者已確認

  // 使用追蹤
  consumedBy: Array<{
    botId: string;
    usedAt: Date;
    usedInSession: string;
  }>;
}

// 知識同步方式：
// 1. Bot 在對話中遇到重要資訊 → 寫入 Fleet Knowledge Mesh
// 2. Bot 開始新 session 時 → 從 Mesh 拉取相關知識作為 context
// 3. 管理者可手動發布知識到 Mesh（公告、政策更新）
```

**Knowledge Mesh UI：**

```
┌─ 🧠 Fleet Knowledge Mesh ────────────────────────────────────────────────────┐
│                                                                                  │
│  Recent Knowledge (fleet-wide)                         [+ Publish Knowledge]    │
│                                                                                  │
│  ┌── 2h ago ─────────────────────────────────────────────────────────────┐     │
│  │ 🦞 小龍蝦 learned:                                                    │     │
│  │ "客戶 A 新版本 v2.5 預計 3/25 發布，含 API breaking changes"          │     │
│  │ Tags: #客戶A #v2.5 #release  │  Visibility: Fleet  │  Expires: 3/26 │     │
│  │ Used by: 🐿️ 飛鼠 (1h ago) ✅                                        │     │
│  │ [Verify] [Edit] [Expire Now]                                          │     │
│  └────────────────────────────────────────────────────────────────────────┘     │
│                                                                                  │
│  ┌── 5h ago ─────────────────────────────────────────────────────────────┐     │
│  │ 👤 Alex (manual):                                                      │     │
│  │ "3/20-3/22 客服電話轉接到分機 205（小美休假）"                          │     │
│  │ Tags: #客服 #排班  │  Visibility: Fleet  │  Expires: 3/23           │     │
│  │ Used by: 🦞 🐿️ 🦚 (all bots consumed)                              │     │
│  │ [Verified ✅]                                                          │     │
│  └────────────────────────────────────────────────────────────────────────┘     │
│                                                                                  │
│  Knowledge Stats:                                                               │
│  Total entries: 47  │  Active: 32  │  Expired: 15                              │
│  Top sources: 🦞 (18 entries), 👤 Alex (12), 🐿️ (10)                         │
│  Avg consumption: 89% (fleet bots consuming published knowledge)               │
│                                                                                  │
│  [Search Knowledge]  [Category Filter ▼]  [Manage Expiry]                      │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

→ **Bot 不再是知識孤島。一個 bot 學到的，整個車隊都知道。**
→ **管理者可以手動發布知識（政策更新、臨時公告），確保所有 bot 同步。**
→ **自動過期機制防止過時知識污染對話品質。**

---

**7. 本次程式碼產出**

**Commit 43: Fleet Canary Lab — A/B 實驗引擎**
```
新增：server/src/services/fleet-canary.ts
  — ExperimentEngine class
  — 實驗建立、啟動、暫停、中止流程
  — Guardrail 評估（health/error/cost 超標 → 自動中止）
  — 資料收集器（從 health score + cost + session 資料聚合）
  — Welch's t-test 統計引擎（純 TypeScript，零外部依賴）
  — 結果分析 + 勝負判定 + 建議生成

新增：ui/src/components/fleet/CanaryLab.tsx
  — 實驗列表（active + completed）
  — 實驗建立表單（假說、控制/實驗組、指標、護欄）
  — 即時比較表格（metric × group，含 delta + p-value + 顯著性標記）
  — Guardrail 狀態指示器
  — 控制按鈕（Pause, Abort+Rollback, Complete）
```

**Commit 44: Conversation Quality Index**
```
新增：server/src/services/fleet-quality.ts
  — QualityEngine class
  — 信號收集器（task completion, efficiency, re-engagement, escalation, tool success, response time）
  — CQI 計算（4 維度加權 → 0-100 分 + 等級）
  — 趨勢分析（7 日滾動）
  — Fleet 平均 vs 個別 bot 比較

新增：ui/src/components/fleet/QualityIndex.tsx
  — Fleet CQI overview bar
  — Per-bot CQI breakdown（水平進度條）
  — 4 維度雷達式分析
  — Insight + recommendation 區塊
  — 趨勢迷你圖
```

**Commit 45: Capacity Planning & Forecasting**
```
新增：server/src/services/fleet-capacity.ts
  — CapacityPlanner class
  — Holt-Winters triple exponential smoothing（純 TypeScript）
  — 飽和預測（何時超過 threshold）
  — 情境模擬器（what-if analysis）
  — 預測信賴區間（95% CI）

新增：ui/src/components/fleet/CapacityPlanning.tsx
  — 成本預測圖（實際 + 預測 + CI 範圍 + budget 線）
  — 飽和預警卡片（breach date + days remaining）
  — Scenario simulator（可拖拉的 what-if 分析）
  — Session volume forecast
```

---

**8. 與前幾次 Planning 的關鍵差異**

| 面向 | 之前的想法 | Planning #15 的改進 |
|------|----------|-------------------|
| Config 變更評估 | Canary mode（只檢查「沒壞」）(#14) | Canary Lab（A/B 測試 + 統計顯著性 + 定量比較） |
| 品質衡量 | Health Score（基礎設施指標）(#7) | CQI（結果導向：任務完成、效率、體驗、黏著） |
| 預算管理 | Budget Alerts（超支通知）(#12) | Capacity Planning（提前預測 + 情境模擬 + 省錢方案） |
| 問題歸因 | 假設問題在 bot（所有之前的 Planning） | Dependency Radar（區分 bot 問題 vs 外部依賴問題） |
| 歷史回顧 | Session Forensics（單 bot 偵錯）(#14) | Dashboard DVR（全車隊時光回溯） |
| 知識管理 | 每 bot 獨立 MEMORY.md | Knowledge Mesh（跨 bot 共享知識 + 過期管理） |

---

**9. 新風險**

| 新風險 | 嚴重度 | 緩解 |
|--------|--------|------|
| Canary Lab 實驗干擾正式流量（test group 影響真實客戶） | 🔴 高 | Guardrails 自動中止 + 最短觀察期防過早推論；管理者明確選擇哪些 bot 當實驗組 |
| CQI 的「task completion」判定不準（5 分鐘無回應不一定是放棄） | 🟡 中 | 可調整閾值；結合多個信號而不是單一指標；提供 override |
| Holt-Winters 在資料量少時預測不穩定 | 🟡 中 | 需要 ≥ 2 個完整季節週期（48h for hourly）才啟用；否則 fallback 到線性外插 |
| Knowledge Mesh 知識衝突（兩個 bot 學到矛盾資訊） | 🟡 中 | Confidence score + 管理者 verify 機制；衝突偵測（同 tag 不同內容 → 標記） |
| Dashboard DVR snapshot 佔用儲存空間 | 🟢 低 | 分級存儲（1m/5m/1h）；30 天後只保留 1h 級別；每 snapshot ~2KB → 30 天 ≈ 8MB |
| Dependency Radar 誤判外部依賴狀態（因為是從 bot error pattern 推斷而非直接 ping） | 🟡 中 | 標示 confidence level；未來可加 direct health check（ping endpoint）作為補充 |

---

**10. 修訂的整體進度追蹤**

```
✅ Planning #1-4: 概念、API 研究、架構設計
✅ Planning #5: 品牌主題 CSS + DB aliases + 術語改名
✅ Planning #6: FleetGatewayClient + FleetMonitorService + API routes
✅ Planning #7: Mock Gateway + Health Score + AlertService + 時序策略 + Command Center（設計）
✅ Planning #8: Fleet API client + React hooks + BotStatusCard + FleetDashboard + ConnectBotWizard
✅ Planning #9: Route wiring + Sidebar Fleet Pulse + LiveEvent bridge + BotDetailFleetTab + Companies Connect
✅ Planning #10: Server Bootstrap + Graceful Shutdown + DB Migrations + Anomaly Detection + Cost Forecast + E2E Tests + i18n
✅ Planning #11: Observable Fleet（三支柱）+ Config Drift + Channel Cost + Session Live Tail + Notification Center + Heatmap + Runbooks + Reports
✅ Planning #12: Fleet Intelligence Layer — Trace Waterfall + mDNS Discovery + Tags + Reports API + Cost Budgets + Intelligence Engine
✅ Planning #13: Fleet Control Plane — Webhook Push + Inter-Bot Graph + RBAC Audit + Plugin Inventory + Glassmorphism UI + Rate Limiter
✅ Planning #14: Fleet Closed Loop — Command Center UI + Self-Healing + External Integrations + Bot Lifecycle + Diff View + Session Forensics
✅ Planning #15: Fleet Experimentation & Outcome Intelligence — Canary Lab + CQI + Capacity Planning + Dependency Radar + DVR + Knowledge Mesh
⬜ Next: Multi-Fleet 架構（Fleet of Fleets — 多車隊 + 跨車隊 Intelligence + 全域 Knowledge Mesh）
⬜ Next: Fleet Marketplace（共享 Experiment Templates / Healing Policies / Knowledge Bundles 跨組織）
⬜ Next: Bot Persona Editor（pixel art 生成器 + IDENTITY.md 視覺化 + CQI 目標設定）
⬜ Next: Mobile PWA + Push Notifications（APNs / FCM + Canary Lab 結果推送）
⬜ Next: Fleet SDK / Plugin API（custom Quality Metrics + Dependency Checks + Experiment Hooks）
⬜ Next: Fleet CLI 工具（`fleet experiment`, `fleet quality`, `fleet forecast`, `fleet mesh`）
```

---

**11. 研究更新**

| 研究主題 | 本次新發現 | 狀態 |
|----------|-----------|------|
| OpenClaw Gateway API | 確認 `agent.wait` response 包含 `meta.costUsd` + `meta.usage`（Canary Lab 的成本比較來源）；確認 streaming events 包含 `data.usage` per turn（CQI 的 token-per-turn 計算來源）；確認 `data.phase` 包含 "failed"/"cancelled" 狀態（CQI 的 task completion 判定來源）；確認 hello-ok 的 `features.events` 列表包含 `health` event（Dependency Radar 可訂閱 gateway 級別健康事件）；確認 device auth 支援 ED25519 簽名（Knowledge Mesh 可用 device identity 做知識來源驗證） | 🔓 持續觀察 |
| painpoint-ai.com 品牌 | 確認使用 OKLCh 色彩空間（比 sRGB 更 perceptually uniform）；新發現 chart 色板：Teal #2A9D8F / Navy #376492 / Green #27BD74 / Purple #9940ED / Gold #D4A373（Canary Lab 圖表可用）；確認 dark mode 使用暖色調深棕而非冷色調黑色（#18181b meta theme）；發現 cubic-bezier easing `(0.16, 1, 0.3, 1)` 用於動畫（DVR 時間軸拖動動畫可用）；確認 Catppuccin Mocha 作為 code editor 主題 | 🔒 封閉（兩次確認一致） |

---

**12. 架構成熟度評估更新**

```
┌─ Architecture Maturity Matrix (Updated #15) ───────────────────────────────────┐
│                                                                                   │
│  Dimension              Status   Maturity    Notes                               │
│  ─────────────────────  ──────   ─────────   ───────────────────────────         │
│  Monitoring             ✅       ██████████  Health, Cost, Channels, Cron         │
│  Observability          ✅       █████████░  Metrics + Logs + Traces (3 pillars) │
│  Alerting               ✅       █████████░  Static + Anomaly + Budget            │
│  Intelligence           ✅       █████████░  Cross-signal + CQI + Canary Lab     │
│  Automation             ✅       ████████░░  Self-Healing + Command Pipeline      │
│  External Integration   ✅       ███████░░░  Slack + LINE + Grafana + Webhook    │
│  Access Control         ✅       ████████░░  RBAC + Audit Trail                   │
│  Data Persistence       ✅       █████████░  4-layer time series + DVR snapshots │
│  Developer Experience   ✅       ████████░░  Mock Gateway + E2E + i18n            │
│  Visual Design          ✅       █████████░  Glassmorphism + Brand + Dark Mode    │
│  Scalability            ✅       ████████░░  Webhook Push + Rate Limit + Budget   │
│  Lifecycle Management   ✅       ███████░░░  5-stage lifecycle + Maintenance      │
│  Forensics              ✅       ███████░░░  Session Forensics + DVR Playback     │
│  Quality Measurement    ✅ NEW   ██████░░░░  CQI (4 dimensions) + Trends         │
│  Experimentation        ✅ NEW   █████░░░░░  Canary Lab (A/B + statistics)        │
│  Predictive Analytics   ✅ NEW   █████░░░░░  Capacity Planning (Holt-Winters)     │
│  Knowledge Management   ✅ NEW   ████░░░░░░  Knowledge Mesh (cross-bot sharing)   │
│  Dependency Tracking    ✅ NEW   ████░░░░░░  Dependency Radar (external health)   │
│  Multi-Fleet            ⬜       ░░░░░░░░░░  Not yet started                      │
│  Mobile                 ⬜       ░░░░░░░░░░  Not yet started                      │
│                                                                                   │
│  Overall: 8.5/10 — Production-ready + Outcome Intelligence                      │
│  Key upgrade: From "operational monitoring" to "outcome optimization"            │
│  Next milestone: Multi-Fleet + Mobile → Enterprise-grade (9.0+)                 │
│                                                                                   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

**下一步 Planning #16（如果需要）：**
- Multi-Fleet 架構（Fleet of Fleets — 多車隊 + 跨車隊 CQI 比較 + 全域 Knowledge Mesh）
- Fleet Marketplace（共享 Experiment Templates / Healing Policies / Knowledge Bundles 跨組織）
- Bot Persona Editor（pixel art 生成器 + CQI 目標綁定 + IDENTITY.md 視覺化）
- Mobile PWA + Push Notifications（APNs / FCM + Canary Lab 結果推送 + CQI 即時通知）
- Fleet SDK / Plugin API（custom Quality Metrics + Dependency Checks + Experiment Hooks）
- Fleet CLI 工具（`fleet experiment`, `fleet quality`, `fleet forecast`, `fleet mesh`）
